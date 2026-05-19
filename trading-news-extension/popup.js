(function () {
  "use strict";

  const state = {
    tweets: [],
    rawTweets: [],
    history: [],
    journal: [],
    filter: "all",
    settings: null,
    sessionBrief: null
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    state.settings = await TNFStorage.getSettings();
    state.settings = await migrateAiFirstSettings(state.settings);
    state.history = await TNFStorage.getHistory();
    state.journal = await TNFStorage.getJournal();
    state.sessionBrief = await TNFStorage.getSessionBrief();
    const lastScan = await TNFStorage.getLastScan();
    state.tweets = lastScan && Array.isArray(lastScan.tweets) ? lastScan.tweets : state.history;
    state.rawTweets = lastScan && Array.isArray(lastScan.rawTweets) ? lastScan.rawTweets : [];
    renderSettings();
    renderSessionBrief();
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
      "watchedTabStatus",
      "watchTabButton",
      "clearWatchTabButton",
      "disableAutoRefresh",
      "pairSelect",
      "aiAnalyzeButton",
      "sessionBriefButton",
      "briefPanel",
      "aiPanel",
      "scannedCount",
      "relevantCount",
      "lastScan",
      "nextRefresh",
      "tweetList",
      "message",
      "exportCsv",
      "exportRawCsv",
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
    els.watchTabButton.addEventListener("click", watchCurrentTab);
    els.clearWatchTabButton.addEventListener("click", clearWatchedTab);
    els.pairSelect.addEventListener("change", savePopupSettings);
    els.aiAnalyzeButton.addEventListener("click", analyzeWithAi);
    els.sessionBriefButton.addEventListener("click", generateSessionBrief);
    els.disableAutoRefresh.addEventListener("click", () => setAutoRefresh(false));
    els.exportCsv.addEventListener("click", exportCsv);
    els.exportRawCsv.addEventListener("click", exportRawCsv);
    if (els.clearHistory) els.clearHistory.addEventListener("click", clearHistory);
    els.filters.forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        els.filters.forEach((item) => item.classList.toggle("active", item === button));
        renderTweets();
      });
    });
  }

  async function migrateAiFirstSettings(settings) {
    const next = {};
    if (settings.aiAutoAnalyze !== true) next.aiAutoAnalyze = true;
    if (settings.aiKeywordGateEnabled !== true) next.aiKeywordGateEnabled = true;
    if (!Array.isArray(settings.aiKeywords) || settings.aiKeywords.length === 0) {
      next.aiKeywords = TNFStorage.DEFAULT_AI_KEYWORDS;
    }
    if (!settings.openAiModel || settings.openAiModel === "gpt-4.1-mini") {
      next.openAiModel = "gpt-5.4-mini";
    }

    if (Object.keys(next).length === 0) return settings;
    return TNFStorage.saveSettings(next);
  }

  async function checkActivePage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    els.pageStatus.textContent = tab && TNFUtils.isTwitterUrl(tab.url)
      ? "Ready to slow-scan this X/Twitter page. You can also watch this tab for background refresh."
      : "Open x.com or twitter.com to scan or attach a watched tab.";
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
        await runFullAiPipeline(response);
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
      autoRefreshMinutes: TNFUtils.clampNumber(els.refreshMinutes.value, 1, 1440),
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

  async function watchCurrentTab() {
    const response = await chrome.runtime.sendMessage({ type: "TNF_WATCH_CURRENT_TAB" });
    if (!response || !response.ok) {
      showMessage(response && response.error ? response.error : "Could not watch this tab.");
      return;
    }

    state.settings = response.settings;
    renderSettings();
    showMessage("This X/Twitter tab is now watched. Auto-refresh can continue when you move to another tab.");
  }

  async function clearWatchedTab() {
    const response = await chrome.runtime.sendMessage({ type: "TNF_CLEAR_WATCHED_TAB" });
    if (!response || !response.ok) {
      showMessage("Could not clear watched tab.");
      return;
    }

    state.settings = response.settings;
    renderSettings();
    showMessage("Watched tab cleared.");
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
        tweets: getFilteredTweets(),
        rawCount: state.rawTweets.length,
        sessionBrief: state.sessionBrief
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

  async function askAiForTweet(tweetId) {
    const tweet = state.tweets.find((item) => item.id === tweetId);
    if (!tweet) return;

    setTweetAiState(tweetId, '<div class="ai-loading">Asking AI...</div>');
    try {
      const response = await chrome.runtime.sendMessage({
        type: "TNF_ANALYZE_TWEET",
        payload: { tweet }
      });

      if (!response || !response.ok) {
        setTweetAiState(tweetId, `<div class="ai-error">${escapeHtml(response && response.error ? response.error : "Tweet AI analysis failed.")}</div>`);
        return;
      }

      tweet.aiTweetAnalysis = response.analysis;
      tweet.aiAnalyzedAt = response.analyzedAt;
      state.history = await TNFStorage.upsertTweets([tweet]);
      await persistCurrentScanState();
      renderTweets();
    } catch (error) {
      setTweetAiState(tweetId, '<div class="ai-error">Tweet AI analysis failed.</div>');
    }
  }

  async function runFullAiPipeline(scanResponse) {
    const tweets = getAiInputTweets(scanResponse).slice(0, 10);
    if (tweets.length === 0) return;

    if (!state.settings.openAiApiKey) {
      showMessage("OpenAI API key missing. Add it in Options to analyze all tweets with gpt-5.4-mini.");
      return;
    }

    const aiTweets = filterTweetsForAi(tweets);
    if (aiTweets.length === 0) {
      ensureTweetsVisibleForAi(tweets);
      renderTweets();
      showMessage("AI skipped: no scanned tweet contains your AI keyword filter.");
      return;
    }

    ensureTweetsVisibleForAi(aiTweets);
    renderTweets();
    showMessage(`AI pipeline started with ${state.settings.openAiModel || "gpt-5.4-mini"} for ${aiTweets.length}/${tweets.length} keyword-matched tweets.`);

    await analyzeWithAi(aiTweets);
    await generateSessionBrief(aiTweets);
    await analyzeTweetsWithAi(aiTweets);

    await persistCurrentScanState();
    renderTweets();
    showMessage(`AI analysis complete for ${aiTweets.length} keyword-matched tweets.`);
  }

  function filterTweetsForAi(tweets) {
    return (Array.isArray(tweets) ? tweets : []).filter((tweet) => tweetMatchesAiKeywords(tweet));
  }

  function tweetMatchesAiKeywords(tweet) {
    if (state.settings.aiKeywordGateEnabled === false) return true;
    const keywords = Array.isArray(state.settings.aiKeywords) && state.settings.aiKeywords.length
      ? state.settings.aiKeywords
      : TNFStorage.DEFAULT_AI_KEYWORDS;
    const haystack = [
      tweet.text || "",
      (tweet.categories || []).join(" "),
      (tweet.detectedKeywords || []).join(" "),
      (tweet.affectedAssets || []).join(" "),
      tweet.macroTheme || ""
    ].join(" ").toLowerCase();
    return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
  }

  function ensureTweetsVisibleForAi(tweets) {
    const byId = new Map(state.tweets.map((tweet) => [tweet.id, tweet]));
    tweets.forEach((tweet) => {
      if (!tweet || !tweet.id || byId.has(tweet.id)) return;
      const visibleTweet = {
        ...tweet,
        categories: tweet.categories && tweet.categories.length ? tweet.categories : ["AI Scanned"],
        detectedKeywords: tweet.detectedKeywords || [],
        impactScore: Number(tweet.impactScore || 1),
        importanceLabel: tweet.importanceLabel || "AI Scanned",
        scoreBadge: tweet.scoreBadge || "AI Scanned",
        direction: tweet.direction || "neutral",
        reason: tweet.reason || "Included because OpenAI auto-analysis is enabled.",
        summary: tweet.summary || tweet.text,
        createdAt: tweet.createdAt || new Date().toISOString()
      };
      byId.set(visibleTweet.id, visibleTweet);
    });
    state.tweets = Array.from(byId.values());
  }

  async function analyzeTweetsWithAi(tweets) {
    for (const tweet of tweets) {
      const targetTweet = state.tweets.find((item) => item.id === tweet.id) || tweet;
      const response = await chrome.runtime.sendMessage({
        type: "TNF_ANALYZE_TWEET",
        payload: { tweet: targetTweet }
      });

      if (response && response.ok) {
        const storedTweet = state.tweets.find((item) => item.id === tweet.id);
        if (storedTweet) {
          storedTweet.aiTweetAnalysis = response.analysis;
          storedTweet.aiAnalyzedAt = response.analyzedAt;
        }
      }
    }
    state.history = await TNFStorage.upsertTweets(state.tweets);
  }

  async function clearHistory() {
    await TNFStorage.clearHistory();
    state.history = [];
    state.tweets = [];
    renderTweets();
    renderStats(null);
    showMessage("History cleared.");
  }

  function exportCsv() {
    TNFUtils.downloadText(`trading-news-filtered-${Date.now()}.csv`, TNFUtils.toCsv(getFilteredTweets()), "text/csv");
  }

  function exportRawCsv() {
    TNFUtils.downloadText(`trading-news-scan-${Date.now()}.csv`, TNFUtils.toCsv(state.rawTweets || []), "text/csv");
  }

  async function persistCurrentScanState() {
    const lastScan = await TNFStorage.getLastScan();
    if (!lastScan) return;
    await TNFStorage.setLastScan({
      ...lastScan,
      tweets: state.tweets,
      rawTweets: state.rawTweets
    });
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

  async function generateSessionBrief(sourceTweets) {
    const tweets = Array.isArray(sourceTweets) ? sourceTweets : getAiInputTweets();
    els.briefPanel.hidden = false;
    els.briefPanel.innerHTML = '<div class="ai-loading">Generating session brief...</div>';
    els.sessionBriefButton.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "TNF_GENERATE_SESSION_BRIEF",
        payload: { tweets }
      });

      if (!response || !response.ok) {
        els.briefPanel.innerHTML = `<div class="ai-error">${escapeHtml(response && response.error ? response.error : "Session brief failed.")}</div>`;
        return;
      }

      state.sessionBrief = response.brief;
      renderSessionBrief();
    } finally {
      els.sessionBriefButton.disabled = false;
    }
  }

  function getAiInputTweets(scanResponse) {
    const filtered = scanResponse && Array.isArray(scanResponse.tweets)
      ? scanResponse.tweets
      : getFilteredTweets();
    const raw = scanResponse && Array.isArray(scanResponse.rawTweets)
      ? scanResponse.rawTweets
      : state.rawTweets;
    const byId = new Map();

    if (Array.isArray(raw)) {
      raw.forEach((tweet) => {
        if (tweet && tweet.id) byId.set(tweet.id, tweet);
      });
    }

    if (Array.isArray(filtered)) {
      filtered.forEach((tweet) => {
        if (tweet && tweet.id) byId.set(tweet.id, { ...(byId.get(tweet.id) || {}), ...tweet });
      });
    }

    return Array.from(byId.values());
  }

  function renderSettings() {
    const enabled = Boolean(state.settings && state.settings.autoRefreshEnabled);
    renderPairOptions();
    els.autoRefreshToggle.checked = enabled;
    els.refreshMinutes.value = state.settings.autoRefreshMinutes || 5;
    els.autoStatus.textContent = `Auto-refresh: ${enabled ? "ON" : "OFF"} | every ${state.settings.autoRefreshMinutes || 5} min`;
    els.watchedTabStatus.textContent = state.settings.autoRefreshTargetUrl
      ? formatWatchedTab(state.settings.autoRefreshTargetTitle, state.settings.autoRefreshTargetUrl)
      : "No watched tab selected.";
    els.nextRefresh.textContent = enabled && state.settings.nextRefreshAt
      ? TNFUtils.formatDateTime(state.settings.nextRefreshAt)
      : "Not scheduled";
  }

  function formatWatchedTab(title, url) {
    const cleanTitle = String(title || "").replace(/\s+/g, " ").trim();
    if (cleanTitle) return cleanTitle.length > 58 ? `${cleanTitle.slice(0, 55)}...` : cleanTitle;
    try {
      const parsed = new URL(url);
      return `${parsed.hostname}${parsed.pathname}`;
    } catch (error) {
      return url || "Watched X/Twitter tab";
    }
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

  function renderSessionBrief() {
    const brief = state.sessionBrief;
    if (!brief) {
      els.briefPanel.hidden = true;
      els.briefPanel.innerHTML = "";
      return;
    }

    els.briefPanel.hidden = false;
    els.briefPanel.innerHTML = `
      <div class="brief-head">
        <span class="ai-bias ${escapeAttribute(String(brief.riskTone || "neutral").toLowerCase())}">${escapeHtml(brief.riskTone || "neutral")}</span>
        <strong>${escapeHtml(brief.session || "Unknown")} Session Brief</strong>
      </div>
      <div class="ai-grid">
        <div><small>Avg Context</small><span>${escapeHtml(String(brief.averageContextScore || 0))}/100</span></div>
        <div><small>Key Driver</small><span>${escapeHtml(brief.keyDriver || "None")}</span></div>
      </div>
      ${renderList("Assets to watch", brief.assetsToWatch)}
      ${renderList("Avoid", brief.avoid)}
      ${renderBriefNews(brief.topNews)}
      <p>${escapeHtml(brief.sessionPlan || "")}</p>
      ${brief.fallback ? '<small class="ai-time">Local fallback brief</small>' : `<small class="ai-time">Generated ${escapeHtml(TNFUtils.formatDateTime(brief.generatedAt))}</small>`}
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

  function renderBriefNews(items) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return `
      <div class="ai-section">
        <strong>Top News</strong>
        <ul>${items.map((item) => `<li>${escapeHtml(item.summary || "")}: ${escapeHtml(item.whyItMatters || "")}</li>`).join("")}</ul>
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
        ${renderContextScore(tweet)}
        <div class="tweet-reason">Keywords: ${escapeHtml(tweet.detectedKeywords.join(", "))}</div>
        <div class="tweet-reason">Reason: ${escapeHtml(tweet.reason)}</div>
        <p class="tweet-text"></p>
        <div class="tweet-buttons">
          ${tweet.url ? `<a href="${escapeAttribute(tweet.url)}" target="_blank" rel="noreferrer">Open Tweet</a>` : ""}
          <button type="button" data-save="${escapeAttribute(tweet.id)}">Save</button>
          <button type="button" data-ask-ai="${escapeAttribute(tweet.id)}">Ask AI</button>
        </div>
        <div class="tweet-ai" data-ai-result="${escapeAttribute(tweet.id)}">${renderTweetAiAnalysis(tweet)}</div>
      `;
      card.querySelector(".tweet-text").textContent = tweet.text;
      const saveButton = card.querySelector("[data-save]");
      if (saveButton) saveButton.addEventListener("click", () => saveTweet(tweet.id));
      const askAiButton = card.querySelector("[data-ask-ai]");
      if (askAiButton) askAiButton.addEventListener("click", () => askAiForTweet(tweet.id));
      els.tweetList.appendChild(card);
    });
  }

  function setTweetAiState(tweetId, html) {
    const target = document.querySelector(`[data-ai-result="${cssEscape(tweetId)}"]`);
    if (target) target.innerHTML = html;
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

  function renderContextScore(tweet) {
    if (!tweet.contextScore) return "";
    const reasons = Array.isArray(tweet.contextScore.reasons) ? tweet.contextScore.reasons.slice(0, 3) : [];
    const penalties = Array.isArray(tweet.contextScore.penalties) ? tweet.contextScore.penalties.slice(0, 2) : [];
    return `
      <div class="context-box">
        <div class="context-line">
          <span class="${contextBadgeClass(tweet.contextScore.score)}">Context ${tweet.contextScore.score}/100</span>
          <span class="risk-pill">${escapeHtml(tweet.contextScore.riskLevel)} risk</span>
          <span class="risk-pill">${escapeHtml(tweet.contextScore.clarity)} clarity</span>
        </div>
        ${tweet.affectedAssets && tweet.affectedAssets.length ? `<div class="tweet-reason">Assets: ${escapeHtml(tweet.affectedAssets.join(", "))}</div>` : ""}
        ${tweet.macroTheme ? `<div class="tweet-reason">Macro theme: ${escapeHtml(tweet.macroTheme)}</div>` : ""}
        ${reasons.length ? `<div class="tweet-reason">Context reasons: ${escapeHtml(reasons.join(" | "))}</div>` : ""}
        ${penalties.length ? `<div class="tweet-reason">Penalties: ${escapeHtml(penalties.join(" | "))}</div>` : ""}
      </div>
    `;
  }

  function renderTweetAiAnalysis(tweet) {
    const analysis = tweet.aiTweetAnalysis;
    if (!analysis) return "";
    return `
      <div class="tweet-ai-box">
        <div class="context-line">
          <span class="ai-bias ${escapeAttribute(String(analysis.marketBias || "unclear").toLowerCase())}">${escapeHtml(analysis.marketBias || "unclear")}</span>
          <span class="risk-pill">${escapeHtml(analysis.importance || "low")} importance</span>
          <span class="risk-pill">${escapeHtml(analysis.riskTone || "unclear")}</span>
          ${analysis.fallback ? '<span class="risk-pill">fallback</span>' : ""}
        </div>
        <div class="tweet-reason">AI summary: ${escapeHtml(analysis.summary || "")}</div>
        <div class="tweet-reason">Why it matters: ${escapeHtml(analysis.whyItMatters || "")}</div>
        <div class="tweet-reason">Main driver: ${escapeHtml(analysis.mainDriver || "")}</div>
        <div class="tweet-reason">Warning: ${escapeHtml(analysis.tradingWarning || "")}</div>
        ${analysis.affectedAssets && analysis.affectedAssets.length ? `<div class="tweet-reason">AI assets: ${escapeHtml(analysis.affectedAssets.join(", "))}</div>` : ""}
      </div>
    `;
  }

  function contextBadgeClass(score) {
    if (score >= 70) return "context-badge high-context";
    if (score >= 40) return "context-badge medium-context";
    return "context-badge low-context";
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

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }
})();
