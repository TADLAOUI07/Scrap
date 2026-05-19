(function () {
  "use strict";

  const state = {
    tweets: [],
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
      "autoStatus",
      "disableAutoRefresh",
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
      ? "Ready to scan visible tweets on this X/Twitter page."
      : "Open x.com or twitter.com to scan visible tweets.";
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
      state.history = await TNFStorage.getHistory();
      renderStats(response);
      renderTweets();
      showMessage(response.message || `Scan complete. ${response.relevantCount} relevant tweets found.`);
    } finally {
      setLoading(false);
    }
  }

  async function setAutoRefresh(enabled) {
    els.autoRefreshToggle.checked = enabled;
    const response = await chrome.runtime.sendMessage({
      type: "TNF_SET_AUTO_REFRESH",
      enabled
    });

    if (response && response.ok) {
      state.settings = response.settings;
      renderSettings();
    } else {
      showMessage("Could not update auto-refresh setting.");
    }
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

  function renderSettings() {
    const enabled = Boolean(state.settings && state.settings.autoRefreshEnabled);
    els.autoRefreshToggle.checked = enabled;
    els.autoStatus.textContent = `Auto-refresh: ${enabled ? "ON" : "OFF"}`;
    els.nextRefresh.textContent = enabled && state.settings.nextRefreshAt
      ? TNFUtils.formatDateTime(state.settings.nextRefreshAt)
      : "Not scheduled";
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
    const filterMap = {
      xauusd: "Gold / XAUUSD",
      usd: "USD / DXY / Yields",
      fed: "Fed / Rates",
      inflation: "Inflation",
      geopolitics: "Geopolitics"
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
    els.scanButton.textContent = isLoading ? "Scanning..." : "Scan Trading News";
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
