importScripts("utils.js", "scoring.js", "cockpit.js", "storage.js", "ai.js");

const AUTO_REFRESH_ALARM = "tnf_auto_refresh";
const MIN_REFRESH_MINUTES = 1;
const CONTENT_SCRIPT_FILES = ["utils.js", "scoring.js", "cockpit.js", "storage.js", "content.js"];

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

  if (message.type === "TNF_GET_AUTO_REFRESH_STATUS") {
    getAutoRefreshStatus().then(sendResponse);
    return true;
  }

  if (message.type === "TNF_WATCH_CURRENT_TAB") {
    watchCurrentTwitterTab().then(sendResponse);
    return true;
  }

  if (message.type === "TNF_CLEAR_WATCHED_TAB") {
    clearWatchedTab().then(sendResponse);
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

  if (message.type === "TNF_ANALYZE_TWEET") {
    analyzeSingleTweet(message.payload || {}).then(sendResponse);
    return true;
  }

  if (message.type === "TNF_GENERATE_SESSION_BRIEF") {
    generateSessionBrief(message.payload || {}).then(sendResponse);
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

  const targetTab = await getRefreshTargetTab(settings);
  if (!targetTab || !targetTab.id || !TNFUtils.isTwitterUrl(targetTab.url || "")) {
    await TNFStorage.saveSettings({
      lastRefreshStatus: "Skipped refresh: watched X/Twitter tab is not available.",
      nextRefreshAt: nextRefreshIso(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES)
    });
    scheduleAutoRefresh(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES);
    return;
  }

  await chrome.storage.local.set({
    tnf_pending_auto_scan: {
      tabId: targetTab.id,
      requestedAt: new Date().toISOString()
    }
  });

  chrome.tabs.reload(targetTab.id);
  await TNFStorage.saveSettings({
    lastRefreshAt: new Date().toISOString(),
    lastRefreshStatus: `Refreshed watched tab: ${targetTab.url || "X/Twitter tab"}.`,
    autoRefreshTargetTabId: targetTab.id,
    autoRefreshTargetUrl: targetTab.url || "",
    autoRefreshTargetTitle: targetTab.title || ""
  });
  scheduleAutoRefresh(settings.autoRefreshMinutes || MIN_REFRESH_MINUTES);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !TNFUtils.isTwitterUrl(tab.url || "")) return;

  const data = await chrome.storage.local.get(["tnf_pending_auto_scan"]);
  const pending = data.tnf_pending_auto_scan;
  if (!pending || pending.tabId !== tabId) return;

  await chrome.storage.local.remove("tnf_pending_auto_scan");

  setTimeout(async () => {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "TNF_AUTO_SCAN_AFTER_REFRESH" });
    } catch (error) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: CONTENT_SCRIPT_FILES
        });
        await wait(700);
        await chrome.tabs.sendMessage(tabId, { type: "TNF_AUTO_SCAN_AFTER_REFRESH" });
      } catch (injectionError) {
        // The next manual scan remains available if X delayed or blocked content script execution.
      }
    }
  }, 3500);
});

async function handleAutoRefreshToggle(enabled, minutes) {
  const safeMinutes = normalizeRefreshMinutes(minutes);
  const currentSettings = await TNFStorage.getSettings();
  const activeTab = enabled ? await findActiveTwitterTab() : null;
  const existingTarget = enabled ? await getStoredTargetTab(currentSettings) : null;
  const targetTab = activeTab || existingTarget;
  const settings = await TNFStorage.saveSettings({
    autoRefreshEnabled: enabled,
    autoRefreshMinutes: safeMinutes,
    autoRefreshTargetTabId: targetTab && targetTab.id ? targetTab.id : null,
    autoRefreshTargetUrl: targetTab && targetTab.url ? targetTab.url : "",
    autoRefreshTargetTitle: targetTab && targetTab.title ? targetTab.title : "",
    nextRefreshAt: enabled ? nextRefreshIso(safeMinutes) : "",
    lastRefreshStatus: enabled
      ? targetTab && targetTab.id
        ? `Auto-refresh armed for watched tab: ${targetTab.url || "X/Twitter tab"}.`
        : "Auto-refresh is on, but no X/Twitter tab is watched yet."
      : "Auto-refresh is off."
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

  const settings = await TNFStorage.getSettings();
  if (settings.autoRefreshEnabled) {
    await TNFStorage.saveSettings({
      autoRefreshTargetTabId: activeTab.id,
      autoRefreshTargetUrl: activeTab.url || "",
      autoRefreshTargetTitle: activeTab.title || ""
    });
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
  await TNFStorage.saveSettings({
    lastRefreshStatus: `Auto scan complete. ${payload.scannedCount || 0} tweets checked, ${payload.savedCount || 0} new relevant tweets added.`
  });
  return { ok: true };
}

async function getAutoRefreshStatus() {
  const settings = await TNFStorage.getSettings();
  const alarm = await chrome.alarms.get(AUTO_REFRESH_ALARM);
  return {
    ok: true,
    enabled: settings.autoRefreshEnabled,
    minutes: settings.autoRefreshMinutes,
    nextRefreshAt: alarm && alarm.scheduledTime ? new Date(alarm.scheduledTime).toISOString() : settings.nextRefreshAt,
    lastRefreshAt: settings.lastRefreshAt,
    lastRefreshStatus: settings.lastRefreshStatus,
    targetTabId: settings.autoRefreshTargetTabId,
    targetUrl: settings.autoRefreshTargetUrl,
    targetTitle: settings.autoRefreshTargetTitle
  };
}

async function getRefreshTargetTab(settings) {
  const storedTarget = await getStoredTargetTab(settings);
  if (storedTarget) {
    return storedTarget;
  }

  const activeTab = await findActiveTwitterTab();
  if (activeTab) {
    await TNFStorage.saveSettings({
      autoRefreshTargetTabId: activeTab.id,
      autoRefreshTargetUrl: activeTab.url || "",
      autoRefreshTargetTitle: activeTab.title || ""
    });
    return activeTab;
  }

  return null;
}

async function getStoredTargetTab(settings) {
  if (settings.autoRefreshTargetTabId) {
    try {
      const target = await chrome.tabs.get(settings.autoRefreshTargetTabId);
      if (target && TNFUtils.isTwitterUrl(target.url || "")) return target;
    } catch (error) {
      return null;
    }
  }

  return null;
}

async function findActiveTwitterTab() {
  const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeTwitter = activeTabs.find((tab) => tab && tab.id && TNFUtils.isTwitterUrl(tab.url || ""));
  return activeTwitter || null;
}

async function watchCurrentTwitterTab() {
  const targetTab = await findActiveTwitterTab();
  if (!targetTab || !targetTab.id || !TNFUtils.isTwitterUrl(targetTab.url || "")) {
    return { ok: false, error: "Open the X/Twitter tab you want to watch, then click Watch This Tab." };
  }

  const settings = await TNFStorage.saveSettings({
    autoRefreshTargetTabId: targetTab.id,
    autoRefreshTargetUrl: targetTab.url || "",
    autoRefreshTargetTitle: targetTab.title || "",
    lastRefreshStatus: `Watching ${targetTab.url || "current X/Twitter tab"}.`
  });

  return { ok: true, settings };
}

async function clearWatchedTab() {
  const settings = await TNFStorage.saveSettings({
    autoRefreshTargetTabId: null,
    autoRefreshTargetUrl: "",
    autoRefreshTargetTitle: "",
    lastRefreshStatus: "Watched X/Twitter tab cleared."
  });

  return { ok: true, settings };
}

async function analyzeMarketNews(payload) {
  const settings = await TNFStorage.getSettings();
  const tweets = Array.isArray(payload.tweets) ? payload.tweets.slice(0, 20) : [];
  const aiTweets = TNFAI.filterTweetsForAiKeywords(tweets, settings);
  const pair = payload.pair || settings.selectedPair || "XAUUSD";

  if (!settings.openAiApiKey) {
    return {
      ok: false,
      error: "Add your OpenAI API key in Options before running AI analysis."
    };
  }

  if (tweets.length === 0) {
    return { ok: false, error: "No visible news available for AI analysis. Run Scan Market News first." };
  }

  if (aiTweets.length === 0) {
    return { ok: false, error: "AI skipped: no tweet contains your configured AI keywords." };
  }

  try {
    const analysis = await TNFAI.analyzeMarketNews({ ...settings, selectedPair: pair }, aiTweets);
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

async function analyzeSingleTweet(payload) {
  const settings = await TNFStorage.getSettings();
  const tweet = payload.tweet;

  if (!tweet || !tweet.id || !tweet.text) {
    return { ok: false, error: "No tweet selected for AI analysis." };
  }

  if (!TNFAI.tweetMatchesAiKeywords(tweet, settings)) {
    return {
      ok: false,
      error: "AI skipped: this tweet does not contain any configured AI keyword."
    };
  }

  const analysis = await TNFAI.analyzeTweet(settings, tweet);
  return {
    ok: true,
    analysis,
    analyzedAt: new Date().toISOString()
  };
}

async function generateSessionBrief(payload) {
  const settings = await TNFStorage.getSettings();
  const tweets = Array.isArray(payload.tweets) ? payload.tweets.slice(0, 20) : [];
  const aiTweets = TNFAI.filterTweetsForAiKeywords(tweets, settings);

  if (tweets.length === 0) {
    return { ok: false, error: "No tweets available for session brief. Run Scan Latest 10 Tweets first." };
  }

  if (aiTweets.length === 0) {
    return { ok: false, error: "Session brief skipped: no tweet contains your configured AI keywords." };
  }

  try {
    const brief = await TNFAI.generateSessionBrief(settings, aiTweets);
    await TNFStorage.setSessionBrief(brief);
    return { ok: true, brief };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Session brief generation failed."
    };
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
