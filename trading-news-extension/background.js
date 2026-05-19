importScripts("utils.js", "scoring.js", "storage.js", "ai.js");

const AUTO_REFRESH_ALARM = "tnf_auto_refresh";
const MIN_REFRESH_MINUTES = 5;
const CONTENT_SCRIPT_FILES = ["utils.js", "scoring.js", "storage.js", "content.js"];

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await TNFStorage.getSettings();
  if (settings.autoRefreshEnabled) {
    scheduleAutoRefresh(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES);
  } else {
    chrome.alarms.clear(AUTO_REFRESH_ALARM);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await TNFStorage.getSettings();
  if (settings.autoRefreshEnabled) {
    scheduleAutoRefresh(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === "TNF_SET_AUTO_REFRESH") {
    handleAutoRefreshToggle(Boolean(message.enabled), message.minutes).then(sendResponse);
    return true;
  }

  if (message.type === "TNF_SCAN_ACTIVE_TAB") {
    scanActiveTab().then(sendResponse);
    return true;
  }

  if (message.type === "TNF_ANALYZE_NEWS") {
    analyzeMarketNews(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message.type === "TNF_AUTO_SCAN_COMPLETE") {
    handleAutoScanComplete(message.payload).then(sendResponse);
    return true;
  }

  return false;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_REFRESH_ALARM) return;

  const settings = await TNFStorage.getSettings();
  if (!settings.autoRefreshEnabled) {
    chrome.alarms.clear(AUTO_REFRESH_ALARM);
    return;
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id || !TNFUtils.isTwitterUrl(activeTab.url)) {
    scheduleAutoRefresh(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES);
    return;
  }

  await chrome.storage.local.set({
    tnf_pending_auto_scan: {
      tabId: activeTab.id,
      requestedAt: new Date().toISOString()
    }
  });

  chrome.tabs.reload(activeTab.id);
  scheduleAutoRefresh(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !TNFUtils.isTwitterUrl(tab.url || "")) return;

  const data = await chrome.storage.local.get(["tnf_pending_auto_scan"]);
  const pending = data.tnf_pending_auto_scan;
  if (!pending || pending.tabId !== tabId) return;

  await chrome.storage.local.remove("tnf_pending_auto_scan");

  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, { type: "TNF_AUTO_SCAN_AFTER_REFRESH" }).catch(() => {
      // The content script may not be ready if X delayed rendering. The next manual scan remains available.
    });
  }, 3500);
});

async function handleAutoRefreshToggle(enabled, minutes) {
  const safeMinutes = normalizeRefreshMinutes(minutes);
  const settings = await TNFStorage.saveSettings({
    autoRefreshEnabled: enabled,
    autoRefreshMinutes: safeMinutes,
    nextRefreshAt: enabled ? nextRefreshIso(safeMinutes) : ""
  });

  if (enabled) {
    scheduleAutoRefresh(safeMinutes);
  } else {
    chrome.alarms.clear(AUTO_REFRESH_ALARM);
  }

  return { ok: true, settings };
}

function scheduleAutoRefresh(minutes) {
  const safeMinutes = normalizeRefreshMinutes(minutes);
  chrome.alarms.clear(AUTO_REFRESH_ALARM, () => {
    chrome.alarms.create(AUTO_REFRESH_ALARM, {
      delayInMinutes: safeMinutes,
      periodInMinutes: safeMinutes
    });
  });
  TNFStorage.saveSettings({ nextRefreshAt: nextRefreshIso(safeMinutes) });
}

function normalizeRefreshMinutes(minutes) {
  return Math.max(MIN_REFRESH_MINUTES, Number(minutes) || MIN_REFRESH_MINUTES);
}

function nextRefreshIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

async function scanActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab || !activeTab.id) {
    return { ok: false, error: "No active tab found." };
  }

  if (!TNFUtils.isTwitterUrl(activeTab.url || "")) {
    return { ok: false, error: "Open x.com or twitter.com before scanning." };
  }

  try {
    const response = await chrome.tabs.sendMessage(activeTab.id, { type: "TNF_MANUAL_SCAN" });
    return response || { ok: false, error: "No response from the page." };
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: CONTENT_SCRIPT_FILES
      });
      await wait(500);
      const response = await chrome.tabs.sendMessage(activeTab.id, { type: "TNF_MANUAL_SCAN" });
      return response || { ok: false, error: "No response from the page after script injection." };
    } catch (injectionError) {
      return {
        ok: false,
        error: "Could not scan this X/Twitter tab. Reload the tab once, then try again."
      };
    }
  }
}

async function handleAutoScanComplete(payload) {
  await TNFStorage.setLastScan(payload);
  return { ok: true };
}

async function analyzeMarketNews(payload) {
  const settings = await TNFStorage.getSettings();
  const tweets = Array.isArray(payload.tweets) ? payload.tweets.slice(0, 20) : [];
  const pair = payload.pair || settings.selectedPair || "XAUUSD";

  if (!settings.openAiApiKey) {
    return {
      ok: false,
      error: "Add your OpenAI API key in Options before running AI analysis."
    };
  }

  if (tweets.length === 0) {
    return { ok: false, error: "No filtered news available for AI analysis." };
  }

  try {
    const analysis = await TNFAI.analyzeMarketNews({ ...settings, selectedPair: pair }, tweets);
    return {
      ok: true,
      analysis,
      analyzedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "OpenAI analysis failed. Check your API key and connection."
    };
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
