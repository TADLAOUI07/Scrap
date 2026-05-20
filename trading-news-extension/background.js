importScripts("utils.js", "scoring.js", "cockpit.js", "storage.js", "ai.js");

const AUTO_REFRESH_ALARM = "tnf_auto_refresh";
const MIN_REFRESH_MINUTES = 1;
const CONTENT_SCRIPT_FILES = ["utils.js", "scoring.js", "cockpit.js", "storage.js", "content.js"];
const SIDEBAR_TARGET_PATTERNS = [
  "https://x.com/*",
  "https://twitter.com/*",
  "https://*.tradingview.com/*"
];

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

  if (message.type === "TNF_SCAN_WATCHED_TAB") {
    scanWatchedTwitterTab().then(sendResponse);
    return true;
  }

  if (message.type === "TNF_SHOW_SIDEBAR_ON_TAB") {
    showSidebarOnTargetTab(message.payload || {}).then(sendResponse);
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

  if (message.type === "TNF_ANALYZE_ASSETS") {
    analyzeAssets(message.payload || {}).then(sendResponse);
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
  if (changeInfo.status !== "complete") return;

  await maybeAutoShowSidebar(tabId, tab);

  if (!TNFUtils.isTwitterUrl(tab.url || "")) return;

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
        await wait(250);
        await chrome.tabs.sendMessage(tabId, { type: "TNF_AUTO_SCAN_AFTER_REFRESH" });
      } catch (injectionError) {
        // The next manual scan remains available if X delayed or blocked content script execution.
      }
    }
  }, 1200);
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
      await wait(250);
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

async function scanWatchedTwitterTab() {
  const settings = await TNFStorage.getSettings();
  const targetTab = await getRefreshTargetTab(settings);
  if (!targetTab || !targetTab.id || !TNFUtils.isTwitterUrl(targetTab.url || "")) {
    return {
      ok: false,
      error: "No watched X/Twitter tab found. Open X/Twitter and click Watch This Tab first."
    };
  }

  await TNFStorage.saveSettings({
    autoRefreshTargetTabId: targetTab.id,
    autoRefreshTargetUrl: targetTab.url || "",
    autoRefreshTargetTitle: targetTab.title || ""
  });

  const scan = await sendScanMessageToTab(targetTab.id);
  if (!scan || !scan.ok) {
    return scan || { ok: false, error: "Watched tab scan failed." };
  }

  const initialSync = await syncSidebarWithStoredContext(scan);
  const syncResult = await analyzeAndSyncSidebarAfterAutoScan(scan);
  const finalSync = syncResult.syncedCount > 0 ? syncResult : initialSync;
  await TNFStorage.saveSettings({
    lastRefreshStatus: [
      `Manual sidebar scan complete. ${scan.scannedCount || 0} tweets checked, ${scan.savedCount || 0} new relevant tweets added.`,
      finalSync.syncedCount > 0 ? `Sidebar synced on ${finalSync.syncedCount} target tab(s).` : finalSync.reason
    ].filter(Boolean).join(" ")
  });

  return { ok: true, scan, ...finalSync };
}

async function sendScanMessageToTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: "TNF_MANUAL_SCAN" });
    return response || { ok: false, error: "No response from the watched X/Twitter tab." };
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES
      });
      await wait(250);
      const response = await chrome.tabs.sendMessage(tabId, { type: "TNF_MANUAL_SCAN" });
      return response || { ok: false, error: "No response from the watched X/Twitter tab after script injection." };
    } catch (injectionError) {
      return {
        ok: false,
        error: "Could not scan the watched X/Twitter tab. Reload it once, then try again."
      };
    }
  }
}

async function showSidebarOnTargetTab(payload) {
  const targetTab = await findSidebarTargetTab(payload.targetTabId);
  if (!targetTab || !targetTab.id || !isSidebarAllowedUrl(targetTab.url || "")) {
    return {
      ok: false,
      error: "No supported sidebar target tab found. Open the configured X/Twitter or TradingView page first."
    };
  }

  const storedPayload = await buildStoredSidebarPayload();
  const settings = await TNFStorage.getSettings();
  const tweets = Array.isArray(payload.tweets) && payload.tweets.length
    ? payload.tweets
    : storedPayload.tweets;
  const allTweets = Array.isArray(payload.allTweets) && payload.allTweets.length
    ? payload.allTweets
    : storedPayload.allTweets || tweets;
  if (!tweets.length && !allTweets.length) {
    return {
      ok: false,
      error: "No synchronized scan data yet. Run Scan Latest 10 Tweets once, then open the sidebar."
    };
  }

  const response = await sendSidebarMessage(targetTab.id, {
    type: "TNF_SHOW_SIDEBAR",
    tweets,
    allTweets,
    rawCount: Number(payload.rawCount || storedPayload.rawCount || tweets.length),
    sessionBrief: payload.sessionBrief || storedPayload.sessionBrief || null,
    assetBiases: payload.assetBiases || storedPayload.assetBiases || null,
    scannedAt: payload.scannedAt || storedPayload.scannedAt || "",
    settings
  });

  if (response.ok) {
    await TNFStorage.saveSettings({
      sidebarTargetUrl: settings.sidebarTargetUrl || targetTab.url || "",
      sidebarLastTargetTabId: targetTab.id,
      sidebarLastTargetUrl: targetTab.url || "",
      sidebarLastTargetTitle: targetTab.title || ""
    });
  }

  return response;
}

async function maybeAutoShowSidebar(tabId, tab) {
  try {
    if (!isSidebarAllowedUrl(tab.url || "")) return;
    const settings = await TNFStorage.getSettings();
    if (!settings.autoShowSidebarEnabled || !settings.sidebarTargetUrl) return;
    if (!urlMatchesSidebarTarget(tab.url || "", settings.sidebarTargetUrl)) return;

    const payload = await buildStoredSidebarPayload();
    if (!payload.tweets.length) return;

    await wait(150);
    await sendSidebarMessage(tabId, {
      type: "TNF_SHOW_SIDEBAR",
      tweets: payload.tweets,
      allTweets: payload.allTweets,
      rawCount: payload.rawCount,
      sessionBrief: payload.sessionBrief,
      assetBiases: payload.assetBiases,
      scannedAt: payload.scannedAt,
      settings
    });
  } catch (error) {
    // Auto sidebar is best-effort; manual Show Sidebar remains available.
  }
}

async function buildStoredSidebarPayload() {
  const lastScan = await TNFStorage.getLastScan();
  const history = await TNFStorage.getHistory();
  const sessionBrief = await TNFStorage.getSessionBrief();
  const assetBiases = await TNFStorage.getAssetBiases();
  const scanTweets = lastScan && Array.isArray(lastScan.tweets) ? lastScan.tweets : [];
  const rawTweets = lastScan && Array.isArray(lastScan.rawTweets) ? lastScan.rawTweets : [];
  const tweets = scanTweets.length ? scanTweets : history;
  const rawCount = lastScan && Array.isArray(lastScan.rawTweets)
    ? lastScan.rawTweets.length
    : Number(lastScan && lastScan.scannedCount ? lastScan.scannedCount : tweets.length);

  return {
    tweets,
    allTweets: rawTweets.length ? mergeTweetsForSidebar(rawTweets, scanTweets) : tweets,
    rawCount,
    sessionBrief,
    assetBiases,
    scannedAt: lastScan && lastScan.scannedAt ? lastScan.scannedAt : ""
  };
}

async function sendSidebarMessage(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return { ok: true };
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: CONTENT_SCRIPT_FILES
      });
      await wait(250);
      await chrome.tabs.sendMessage(tabId, payload);
      return { ok: true };
    } catch (injectionError) {
      return {
        ok: false,
        error: "Could not show the sidebar on this target tab. Reload the tab once, then try again."
      };
    }
  }
}

async function handleAutoScanComplete(payload) {
  const scan = payload && typeof payload === "object" ? payload : {};
  await TNFStorage.setLastScan(scan);
  const initialSync = await syncSidebarWithStoredContext(scan);
  const syncResult = await analyzeAndSyncSidebarAfterAutoScan(scan);
  const finalSync = syncResult.syncedCount > 0 ? syncResult : initialSync;
  await TNFStorage.saveSettings({
    lastRefreshStatus: [
      `Auto scan complete. ${scan.scannedCount || 0} tweets checked, ${scan.savedCount || 0} new relevant tweets added.`,
      finalSync.syncedCount > 0 ? `Sidebar synced on ${finalSync.syncedCount} target tab(s).` : finalSync.reason
    ].filter(Boolean).join(" ")
  });
  return { ok: true, ...finalSync };
}

async function syncSidebarWithStoredContext(scan) {
  const settings = await TNFStorage.getSettings();
  const sessionBrief = await TNFStorage.getSessionBrief();
  const assetBiases = await TNFStorage.getAssetBiases();
  return syncSidebarTargetsWithLatestScan(scan, sessionBrief, assetBiases, settings);
}

async function analyzeAndSyncSidebarAfterAutoScan(scan) {
  const settings = await TNFStorage.getSettings();
  const tweets = getFreshTweetsForAssetAnalysis(getAutoScanAnalysisTweets(scan), scan.scannedAt);
  let sessionBrief = await TNFStorage.getSessionBrief();
  let assetBiases = await TNFStorage.getAssetBiases();

  if (settings.aiAutoAnalyze !== false && tweets.length) {
    const aiTweets = TNFAI.filterTweetsForAiKeywords(tweets, settings);
    const shouldUseOpenAI = Boolean(settings.openAiApiKey)
      && (settings.aiKeywordGateEnabled === false || aiTweets.length > 0);
    const analysisTweets = settings.aiKeywordGateEnabled === false
      ? tweets
      : aiTweets.length
        ? aiTweets
        : tweets;
    const analysisSettings = shouldUseOpenAI ? settings : { ...settings, openAiApiKey: "" };

    try {
      sessionBrief = await TNFAI.generateSessionBrief(analysisSettings, analysisTweets);
      await TNFStorage.setSessionBrief(sessionBrief);
    } catch (error) {
      // Keep the previous brief if both OpenAI and local fallback fail unexpectedly.
    }

    try {
      assetBiases = await TNFAI.generateInstrumentBiases(analysisSettings, analysisTweets);
      await TNFStorage.setAssetBiases(assetBiases);
    } catch (error) {
      // Sidebar can still render local tweet context without asset-bias details.
    }
  } else if (!tweets.length) {
    assetBiases = {
      generatedAt: new Date().toISOString(),
      fallback: true,
      instrumentBiases: []
    };
    await TNFStorage.setAssetBiases(assetBiases);
  }

  return syncSidebarTargetsWithLatestScan(scan, sessionBrief, assetBiases, settings);
}

function getAutoScanAnalysisTweets(scan) {
  const byId = new Map();
  const rawTweets = Array.isArray(scan.rawTweets) ? scan.rawTweets : [];
  const filteredTweets = Array.isArray(scan.tweets) ? scan.tweets : [];

  rawTweets.forEach((tweet) => {
    if (tweet && tweet.id) byId.set(tweet.id, tweet);
  });
  filteredTweets.forEach((tweet) => {
    if (!tweet || !tweet.id) return;
    byId.set(tweet.id, { ...(byId.get(tweet.id) || {}), ...tweet });
  });

  return Array.from(byId.values()).slice(0, 20);
}

function mergeTweetsForSidebar(rawTweets, filteredTweets) {
  const byId = new Map();
  (Array.isArray(rawTweets) ? rawTweets : []).forEach((tweet) => {
    if (tweet && tweet.id) byId.set(tweet.id, tweet);
  });
  (Array.isArray(filteredTweets) ? filteredTweets : []).forEach((tweet) => {
    if (!tweet || !tweet.id) return;
    byId.set(tweet.id, { ...(byId.get(tweet.id) || {}), ...tweet });
  });
  return Array.from(byId.values());
}

function getFreshTweetsForAssetAnalysis(tweets, scannedAt) {
  const cutoff = Date.now() - 5 * 60 * 60 * 1000;
  const scanTimestamp = Date.parse(scannedAt || "");
  return (Array.isArray(tweets) ? tweets : []).filter((tweet) => {
    const timestamp = Date.parse(tweet.time || tweet.createdAt || tweet.scannedAt || "");
    if (Number.isFinite(timestamp)) return timestamp >= cutoff;
    if (Number.isFinite(scanTimestamp)) return scanTimestamp >= cutoff;
    return true;
  });
}

async function syncSidebarTargetsWithLatestScan(scan, sessionBrief, assetBiases, settings) {
  const tweets = Array.isArray(scan.tweets) && scan.tweets.length
    ? scan.tweets
    : getAutoScanAnalysisTweets(scan);
  const allTweets = Array.isArray(scan.rawTweets) && scan.rawTweets.length
    ? mergeTweetsForSidebar(scan.rawTweets, scan.tweets || [])
    : tweets;
  if (!tweets.length && !allTweets.length) {
    return { syncedCount: 0, reason: "No latest scan data available for sidebar sync." };
  }

  const matchingTabs = await findSidebarSyncTargets(settings);
  if (!matchingTabs.length) {
    return { syncedCount: 0, reason: "No open sidebar target tab found." };
  }

  let syncedCount = 0;
  for (const tab of matchingTabs) {
    const response = await sendSidebarMessage(tab.id, {
      type: "TNF_SHOW_SIDEBAR",
      tweets,
      allTweets,
      rawCount: Array.isArray(scan.rawTweets) ? scan.rawTweets.length : Number(scan.scannedCount || tweets.length),
      sessionBrief,
      assetBiases,
      scannedAt: scan.scannedAt || new Date().toISOString(),
      settings
    });
    if (response.ok) syncedCount += 1;
  }

  return {
    syncedCount,
    reason: syncedCount > 0 ? "" : "Sidebar target was found but could not be updated."
  };
}

async function findSidebarSyncTargets(settings) {
  const targetTabs = await chrome.tabs.query({ url: SIDEBAR_TARGET_PATTERNS });
  const byId = new Map();

  targetTabs.forEach((tab) => {
    if (!tab || !tab.id || !isSidebarAllowedUrl(tab.url || "")) return;
    if (settings.autoShowSidebarEnabled && settings.sidebarTargetUrl && urlMatchesSidebarTarget(tab.url || "", settings.sidebarTargetUrl)) {
      byId.set(tab.id, tab);
    }
    if (settings.sidebarLastTargetTabId && tab.id === settings.sidebarLastTargetTabId) {
      byId.set(tab.id, tab);
    }
    if (settings.sidebarLastTargetUrl && urlMatchesSidebarTarget(tab.url || "", settings.sidebarLastTargetUrl)) {
      byId.set(tab.id, tab);
    }
  });

  return Array.from(byId.values());
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

async function findSidebarTargetTab(preferredTabId) {
  if (preferredTabId) {
    try {
      const preferred = await chrome.tabs.get(preferredTabId);
      if (preferred && isSidebarAllowedUrl(preferred.url || "")) return preferred;
    } catch (error) {
      // Continue with saved target lookup below.
    }
  }

  const settings = await TNFStorage.getSettings();
  if (settings.sidebarTargetUrl) {
    const matchingTabs = await chrome.tabs.query({ url: SIDEBAR_TARGET_PATTERNS });
    const matched = matchingTabs.find((tab) => urlMatchesSidebarTarget(tab.url || "", settings.sidebarTargetUrl));
    if (matched) return matched;
  }

  const lastSidebarTarget = await getLastSidebarTargetTab(settings);
  if (lastSidebarTarget) return lastSidebarTarget;

  const storedTarget = await getStoredTargetTab(settings);
  if (storedTarget) return storedTarget;

  const activeTab = await findActiveTwitterTab();
  if (activeTab) return activeTab;

  const targetTabs = await chrome.tabs.query({ url: SIDEBAR_TARGET_PATTERNS });
  return targetTabs.find((tab) => tab && tab.id && isSidebarAllowedUrl(tab.url || "")) || null;
}

async function getLastSidebarTargetTab(settings) {
  if (settings.sidebarLastTargetTabId) {
    try {
      const target = await chrome.tabs.get(settings.sidebarLastTargetTabId);
      if (target && isSidebarAllowedUrl(target.url || "")) return target;
    } catch (error) {
      // Continue with URL lookup below.
    }
  }

  if (settings.sidebarLastTargetUrl) {
    const tabs = await chrome.tabs.query({ url: SIDEBAR_TARGET_PATTERNS });
    return tabs.find((tab) => tab && tab.id && urlMatchesSidebarTarget(tab.url || "", settings.sidebarLastTargetUrl)) || null;
  }

  return null;
}

function urlMatchesSidebarTarget(currentUrl, targetUrl) {
  const current = normalizeUrlForMatch(currentUrl);
  const target = normalizeUrlForMatch(targetUrl);
  if (!current || !target) return false;
  return current === target || current.startsWith(`${target}/`);
}

function normalizeUrlForMatch(value) {
  try {
    const url = new URL(value);
    if (!isSidebarAllowedUrl(url.href)) return "";
    const isTwitter = TNFUtils.isTwitterUrl(url.href);
    let host = url.hostname
      .replace(/^www\./, "")
      .replace(/^twitter\.com$/, "x.com");
    if (host.endsWith(".tradingview.com")) host = "tradingview.com";
    const path = url.pathname.replace(/\/+$/, "");
    const search = isTwitter ? "" : url.search;
    return `${host}${path || "/"}${search}`.toLowerCase();
  } catch (error) {
    return "";
  }
}

function isSidebarAllowedUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return TNFUtils.isTwitterUrl(url.href) || host === "tradingview.com" || host.endsWith(".tradingview.com");
  } catch (error) {
    return false;
  }
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

async function analyzeAssets(payload) {
  const settings = await TNFStorage.getSettings();
  const tweets = Array.isArray(payload.tweets) ? payload.tweets.slice(0, 20) : [];
  const aiTweets = TNFAI.filterTweetsForAiKeywords(tweets, settings);

  if (tweets.length === 0) {
    return { ok: false, error: "No tweets available for asset analysis." };
  }

  try {
    const analysis = await TNFAI.generateInstrumentBiases(settings, aiTweets.length ? aiTweets : tweets);
    return { ok: true, analysis };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Asset analysis failed."
    };
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
