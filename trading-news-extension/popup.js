(function () {
  "use strict";

  const state = {
    tweets: [],
    rawTweets: [],
    history: [],
    filter: "all",
    settings: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    state.settings = await TNFStorage.getSettings();
    state.history = await TNFStorage.getHistory();
    const lastScan = await TNFStorage.getLastScan();
    state.tweets = lastScan && Array.isArray(lastScan.tweets) ? lastScan.tweets : state.history;
    state.rawTweets = lastScan && Array.isArray(lastScan.rawTweets) ? lastScan.rawTweets : [];
    renderSettings();
    renderStats(lastScan);
    renderTweets();
    checkActivePage();
  }

  function bindElements() {
    [
      "pageStatus",
      "scanButton",
      "sidebarButton",
      "autoRefreshToggle",
      "refreshMinutes",
      "autoStatus",
      "disableAutoRefresh",
      "pairSelect",
      "aiAnalyzeButton",
      "aiPanel",
      "scannedCount",
      "relevantCount",
      "lastScan",
      "nextRefresh",
      "tweetList",
      "message",
      "exportJson",
      "exportCsv",
      "clearHistory"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
    els.filters = Array.from(document.querySelectorAll(".filter"));
  }

  function bindEvents() {
    els.scanButton.addEventListener("click", runManualScan);
    els.sidebarButton.addEventListener("click", showSidebar);
    els.autoRefreshToggle.addEventListener("change", () => setAutoRefresh(els.autoRefreshToggle.checked));
    els.refreshMinutes.addEventListener("change", savePopupSettings);
    els.pairSelect.addEventListener("change", savePopupSettings);
    els.aiAnalyzeButton.addEventListener("click", analyzeWithAi);
    els.disableAutoRefresh.addEventListener("click", () => setAutoRefresh(false));
    els.exportJson.addEventListener("click", exportJson);
    els.exportCsv.addEventListener("click", exportCsv);
    els.clearHistory.addEventListener("click", clearHistory);
    els.filters.forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        els.filters.forEach((item) => item.classList.toggle("active", item === button));
        renderTweets();
      });
    });
  }

  async function checkActivePage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    els.pageStatus.textContent = tab && TNFUtils.isTwitterUrl(tab.url)
      ? "Ready to slow-scan the latest 10 tweets on this X/Twitter page."
      : "Open x.com or twitter.com to scan the latest 10 tweets.";
  }

  async function runManualScan() {
    setLoading(true);
    showMessage("");
    try {
      const response = await chrome.runtime.sendMessage({ type: "TNF_SCAN_ACTIVE_TAB" });
      if (!response || !response.ok) {
        showMessage(response && response.error ? response.error : "Scan failed.");
        return;
      }
      state.tweets = response.tweets || [];
      state.rawTweets = response.rawTweets || [];
      state.history = await TNFStorage.getHistory();
      if (state.settings.aiAutoAnalyze && getAiInputTweets(response).length > 0) {
        await analyzeWithAi(getAiInputTweets(response));
      }
      renderStats(response);
      renderTweets();
      showMessage(response.message || `Scan complete. ${response.scannedCount} latest tweets checked, ${response.savedCount || 0} new relevant tweets added.`);
    } finally {
      setLoading(false);
    }
  }

  async function setAutoRefresh(enabled) {
    els.autoRefreshToggle.checked = enabled;
    const response = await chrome.runtime.sendMessage({
      type: "TNF_SET_AUTO_REFRESH",
      enabled,
      minutes: Number(els.refreshMinutes.value)
    });

    if (response && response.ok) {
      state.settings = response.settings;
      renderSettings();
    } else {
      showMessage("Could not update auto-refresh setting.");
    }
  }

  async function savePopupSettings() {
    state.settings = await TNFStorage.saveSettings({
      autoRefreshMinutes: TNFUtils.clampNumber(els.refreshMinutes.value, 5, 1440),
      selectedPair: els.pairSelect.value
    });

    if (state.settings.autoRefreshEnabled) {
      await chrome.runtime.sendMessage({
        type: "TNF_SET_AUTO_REFRESH",
        enabled: true,
        minutes: state.settings.autoRefreshMinutes
      });
    }

    renderSettings();
    renderTweets();
  }

  async function showSidebar() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id || !TNFUtils.isTwitterUrl(tab.url)) {
      showMessage("Open an X/Twitter tab before showing the sidebar.");
      return;
    }

    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: "TNF_SHOW_SIDEBAR",
        tweets: getFilteredTweets()
      });
      window.close();
    } catch (error) {
      showMessage("Could not show sidebar. Reload the X/Twitter tab and try again.");
    }
  }

  async function saveTweet(tweetId) {
    const tweet = state.tweets.find((item) => item.id === tweetId);
    if (!tweet) return;
    const result = await TNFStorage.saveTweet(tweet);
    state.history = result.history;
    showMessage(result.saved ? "Tweet saved." : "Tweet already exists in history.");
  }

  async function clearHistory() {
    await TNFStorage.clearHistory();
    state.history = [];
    state.tweets = [];
    renderTweets();
    renderStats(null);
    showMessage("History cleared.");
  }

  function exportJson() {
    const payload = JSON.stringify(getFilteredTweets(), null, 2);
    TNFUtils.downloadText(`trading-news-${Date.now()}.json`, payload, "application/json");
  }

  function exportCsv() {
    TNFUtils.downloadText(`trading-news-${Date.now()}.csv`, TNFUtils.toCsv(getFilteredTweets()), "text/csv");
  }

  async function analyzeWithAi(sourceTweets) {
    const tweets = Array.isArray(sourceTweets) ? sourceTweets : getAiInputTweets();
    els.aiPanel.hidden = false;
    els.aiPanel.innerHTML = '<div class="ai-loading">Analyzing market drivers...</div>';
    els.aiAnalyzeButton.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TNF_ANALYZE_NEWS",
        payload: {
          tweets,
          pair: els.pairSelect.value
        }
      });

      if (!response || !response.ok) {
        els.aiPanel.innerHTML = `<div class="ai-error">${escapeHtml(response && response.error ? response.error : "AI analysis failed.")}</div>`;
        return;
      }

      renderAiAnalysis(response.analysis, response.analyzedAt);
    } finally {
      els.aiAnalyzeButton.disabled = false;
    }
  }

  function getAiInputTweets(scanResponse) {
    const filtered = scanResponse && Array.isArray(scanResponse.tweets)
      ? scanResponse.tweets
      : getFilteredTweets();
    if (filtered.length > 0) return filtered;

    const raw = scanResponse && Array.isArray(scanResponse.rawTweets)
      ? scanResponse.rawTweets
      : state.rawTweets;
    return Array.isArray(raw) ? raw : [];
  }

  function renderSettings() {
    const enabled = Boolean(state.settings && state.settings.autoRefreshEnabled);
    renderPairOptions();
    els.autoRefreshToggle.checked = enabled;
    els.refreshMinutes.value = state.settings.autoRefreshMinutes || 5;
    els.autoStatus.textContent = `Auto-refresh: ${enabled ? "ON" : "OFF"} | every ${state.settings.autoRefreshMinutes || 5} min`;
    els.nextRefresh.textContent = enabled && state.settings.nextRefreshAt
      ? TNFUtils.formatDateTime(state.settings.nextRefreshAt)
      : "Not scheduled";
  }

  function renderPairOptions() {
    const pairs = state.settings.watchedPairs || TNFStorage.DEFAULT_SETTINGS.watchedPairs;
    els.pairSelect.innerHTML = pairs
      .map((pair) => `<option value="${escapeAttribute(pair)}">${escapeHtml(pair)}</option>`)
      .join("");
    els.pairSelect.value = state.settings.selectedPair || pairs[0];
  }

  function renderAiAnalysis(analysis, analyzedAt) {
    const keyNews = Array.isArray(analysis.keyNews) ? analysis.keyNews : [];
    els.aiPanel.hidden = false;
    els.aiPanel.innerHTML = `
      <div class="ai-head">
        <span class="ai-bias ${escapeAttribute(String(analysis.bias || "neutral").toLowerCase())}">${escapeHtml(analysis.bias || "neutral")}</span>
        <strong>${escapeHtml(analysis.headline || "Market read")}</strong>
      </div>
      <p>${escapeHtml(analysis.macroSummary || "")}</p>
      <div class="ai-grid">
        <div><small>Pair</small><span>${escapeHtml(analysis.pair || els.pairSelect.value)}</span></div>
        <div><small>Confidence</small><span>${escapeHtml(analysis.confidence || "low")}</span></div>
      </div>
      ${renderList("Drivers", analysis.marketDrivers)}
      ${renderList("Bullish", analysis.bullishFactors)}
      ${renderList("Bearish", analysis.bearishFactors)}
      ${renderKeyNews(keyNews)}
      ${renderList("Risk notes", analysis.riskNotes)}
      <small class="ai-time">Analyzed ${escapeHtml(TNFUtils.formatDateTime(analyzedAt))}</small>
    `;
  }

  function renderList(title, items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return `
      <div class="ai-section">
        <strong>${escapeHtml(title)}</strong>
        <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>
    `;
  }

  function renderKeyNews(items) {
    if (!items.length) return "";
    return `
      <div class="ai-section">
        <strong>News that moved the read</strong>
        <ul>${items.map((item) => `<li>${escapeHtml(item.title || "")}: ${escapeHtml(item.impact || "")}</li>`).join("")}</ul>
      </div>
    `;
  }

  function renderStats(scan) {
    els.scannedCount.textContent = scan && Number.isFinite(scan.scannedCount) ? scan.scannedCount : 0;
    els.relevantCount.textContent = scan && Number.isFinite(scan.relevantCount) ? scan.relevantCount : state.tweets.length;
    els.lastScan.textContent = scan && scan.scannedAt ? TNFUtils.formatDateTime(scan.scannedAt) : "Never";
  }

  function renderTweets() {
    const tweets = getFilteredTweets();
    els.tweetList.innerHTML = "";

    if (tweets.length === 0) {
      els.tweetList.innerHTML = '<div class="message">No matching trading news yet.</div>';
      return;
    }

    tweets.forEach((tweet) => {
      const card = document.createElement("article");
      card.className = "tweet-card";
      card.innerHTML = `
        <div class="tweet-top">
          <span class="${badgeClass(tweet.impactScore)}">${tweet.impactScore}/5 ${scoreText(tweet.impactScore)}</span>
          <span class="category">${escapeHtml(tweet.categories.join(" / "))}</span>
        </div>
        <div class="tweet-meta">Direction: ${escapeHtml(tweet.direction)} | ${escapeHtml(tweet.author)} ${tweet.time ? "| " + escapeHtml(tweet.time) : ""}</div>
        <div class="tweet-reason">Keywords: ${escapeHtml(tweet.detectedKeywords.join(", "))}</div>
        <div class="tweet-reason">Reason: ${escapeHtml(tweet.reason)}</div>
        <p class="tweet-text"></p>
        <div class="tweet-buttons">
          ${tweet.url ? `<a href="${escapeAttribute(tweet.url)}" target="_blank" rel="noreferrer">Open Tweet</a>` : ""}
          <button type="button" data-save="${escapeAttribute(tweet.id)}">Save</button>
        </div>
      `;
      card.querySelector(".tweet-text").textContent = tweet.text;
      const saveButton = card.querySelector("[data-save]");
      if (saveButton) saveButton.addEventListener("click", () => saveTweet(tweet.id));
      els.tweetList.appendChild(card);
    });
  }

  function getFilteredTweets() {
    const tweets = [...state.tweets].sort((a, b) => b.impactScore - a.impactScore);
    if (state.filter === "all") return tweets;
    if (state.filter === "high") return tweets.filter((tweet) => tweet.impactScore >= 5);
    if (state.filter === "pair") return tweets.filter((tweet) => tweet.pairRelevant);
    const filterMap = {
      xauusd: "Gold / XAUUSD",
      usd: "USD / DXY / Yields",
      fed: "Fed / Rates",
      inflation: "Inflation",
      geopolitics: "Geopolitics",
      crypto: "Crypto",
      indices: "Stocks / Indices"
    };
    return tweets.filter((tweet) => tweet.categories.includes(filterMap[state.filter]));
  }

  function badgeClass(score) {
    if (score >= 5) return "badge score-5";
    if (score === 4) return "badge score-4";
    if (score === 3) return "badge score-3";
    return "badge score-low";
  }

  function scoreText(score) {
    if (score >= 5) return "🚨 High Impact";
    if (score === 4) return "🔥 Important";
    if (score === 3) return "🟡 Medium";
    return "⚪ Low";
  }

  function showMessage(text) {
    els.message.hidden = !text;
    els.message.textContent = text || "";
  }

  function setLoading(isLoading) {
    els.scanButton.disabled = isLoading;
    els.scanButton.textContent = isLoading ? "Slow scanning..." : "Scan Latest 10 Tweets";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }
})();
