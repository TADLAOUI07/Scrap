(function () {
  "use strict";

  if (globalThis.__TNF_CONTENT_LOADED__) return;
  globalThis.__TNF_CONTENT_LOADED__ = true;

  const SIDEBAR_ID = "tnf-sidebar";
  const LATEST_TWEET_LIMIT = 10;
  const SLOW_SCROLL_DELAY_MS = 1800;
  const MAX_SCROLL_STEPS = 6;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "TNF_MANUAL_SCAN") {
      scanLatestTweets("manual").then(sendResponse);
      return true;
    }

    if (message.type === "TNF_AUTO_SCAN_AFTER_REFRESH") {
      waitForTweetsThenScan().then((result) => {
        chrome.runtime.sendMessage({ type: "TNF_AUTO_SCAN_COMPLETE", payload: result }).catch(() => {});
        sendResponse(result);
      });
      return true;
    }

    if (message.type === "TNF_SHOW_SIDEBAR") {
      showSidebar(message.tweets || [], message.rawCount || 0, message.sessionBrief || null).then(sendResponse);
      return true;
    }

    return false;
  });

  async function waitForTweetsThenScan() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12000) {
      if (document.querySelectorAll("article").length > 0) break;
      await delay(500);
    }
    return scanLatestTweets("auto-refresh");
  }

  async function scanLatestTweets(source) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    await delay(1200);

    const rawTweets = [];
    const seen = new Set();

    collectTweets(rawTweets, seen);

    let step = 0;
    while (rawTweets.length < LATEST_TWEET_LIMIT && step < MAX_SCROLL_STEPS) {
      window.scrollBy({ top: Math.round(window.innerHeight * 0.75), behavior: "smooth" });
      await delay(SLOW_SCROLL_DELAY_MS);
      collectTweets(rawTweets, seen);
      step += 1;
    }

    return processTweets(rawTweets.slice(0, LATEST_TWEET_LIMIT), source, "latest-10-slow-scroll");
  }

  async function scanVisibleTweets(source) {
    return processTweets(extractVisibleTweets(), source, "visible-only");
  }

  async function processTweets(rawTweets, source, scanMode) {
    const settings = await TNFStorage.getSettings();
    const classified = rawTweets
      .map((tweet) => {
        const classifiedTweet = TNFScoring.classifyTweet(tweet, settings);
        if (!classifiedTweet) return null;
        return TNFCockpit.enrichTweet(classifiedTweet, tweet, settings, rawTweets);
      })
      .filter(Boolean);

    const deduped = TNFStorage.deduplicateTweets(classified);
    const saved = await TNFStorage.saveTweets(deduped);

    const result = {
      ok: true,
      source,
      scannedCount: rawTweets.length,
      relevantCount: deduped.length,
      savedCount: saved.savedCount,
      duplicateCount: saved.duplicateCount,
      scanMode,
      limit: LATEST_TWEET_LIMIT,
      rawTweets: rawTweets.map(normalizeRawTweetForAnalysis),
      tweets: deduped.sort((a, b) => b.impactScore - a.impactScore),
      message: rawTweets.length === 0
        ? "No visible tweets found on this page."
        : `Latest scan complete. ${rawTweets.length} tweets checked, ${saved.savedCount} new relevant tweets added.`,
      scannedAt: new Date().toISOString()
    };

    await TNFStorage.setLastScan(result);
    return result;
  }

  function extractVisibleTweets() {
    const articles = Array.from(document.querySelectorAll("article"));
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    return articles
      .filter((article) => {
        const rect = article.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < viewportHeight && rect.width > 0 && rect.height > 0;
      })
      .map(extractTweetFromArticle)
      .filter((tweet) => tweet && tweet.text && tweet.text.length > 10);
  }

  function collectTweets(target, seen) {
    extractVisibleTweets().forEach((tweet) => {
      const id = tweet.url || TNFUtils.simpleHash(`${tweet.author || ""}:${tweet.text || ""}`);
      if (seen.has(id) || target.length >= LATEST_TWEET_LIMIT) return;
      seen.add(id);
      target.push(tweet);
    });
  }

  function extractTweetFromArticle(article) {
    const textNode = article.querySelector('[data-testid="tweetText"]');
    const text = TNFUtils.normalizeText(textNode ? textNode.innerText : buildFallbackTweetText(article));
    const timeElement = article.querySelector("time");
    const anchor = timeElement ? timeElement.closest("a") : article.querySelector('a[href*="/status/"]');
    const href = anchor ? anchor.getAttribute("href") : "";
    const url = href ? new URL(href, window.location.origin).toString() : "";
    const author = extractAuthor(article);

    return {
      text,
      author,
      time: timeElement ? timeElement.getAttribute("datetime") || timeElement.textContent : "",
      url
    };
  }

  function normalizeRawTweetForAnalysis(tweet) {
    const id = tweet.url || TNFUtils.simpleHash(`${tweet.author || ""}:${tweet.text || ""}`);
    return {
      id,
      text: tweet.text || "",
      author: tweet.author || "Unknown",
      time: tweet.time || "",
      url: tweet.url || "",
      categories: ["Visible X/Twitter News"],
      impactScore: 1,
      importanceLabel: "Unfiltered",
      scoreBadge: "Unfiltered",
      reason: "Visible tweet captured for optional AI analysis.",
      detectedKeywords: [],
      direction: "neutral",
      selectedPair: "",
      pairRelevant: false,
      pairKeywords: [],
      summary: tweet.text && tweet.text.length > 170 ? `${tweet.text.slice(0, 167).trim()}...` : tweet.text,
      createdAt: new Date().toISOString()
    };
  }

  function buildFallbackTweetText(article) {
    const ignoredSelectors = [
      '[data-testid="User-Name"]',
      '[data-testid="socialContext"]',
      '[role="group"]',
      'time',
      'svg',
      'img'
    ];
    const clone = article.cloneNode(true);
    ignoredSelectors.forEach((selector) => {
      clone.querySelectorAll(selector).forEach((node) => node.remove());
    });
    return clone.innerText || article.innerText || "";
  }

  function extractAuthor(article) {
    const userName = article.querySelector('[data-testid="User-Name"]');
    if (userName) {
      const parts = TNFUtils.normalizeText(userName.innerText).split(" ");
      return parts.slice(0, 2).join(" ") || "Unknown";
    }

    const link = article.querySelector('a[href^="/"][role="link"]');
    return link ? TNFUtils.normalizeText(link.textContent) : "Unknown";
  }

  async function showSidebar(tweets, rawCount, sessionBrief) {
    const existing = document.getElementById(SIDEBAR_ID);
    if (existing) existing.remove();

    const sortedTweets = [...tweets].sort((a, b) => (b.contextScoreValue || b.impactScore) - (a.contextScoreValue || a.impactScore));
    const journal = await TNFStorage.getJournal();
    const dashboard = buildSidebarDashboard(sortedTweets, rawCount, sessionBrief, journal);
    const sidebar = document.createElement("aside");
    sidebar.id = SIDEBAR_ID;
    sidebar.innerHTML = `
      <div class="tnf-sidebar-head">
        <div>
          <strong>AI Trading Context Cockpit</strong>
          <small>${escapeHtml(String(tweets.length))} shown / ${escapeHtml(String(rawCount || tweets.length))} scanned</small>
        </div>
        <button type="button" class="tnf-close" aria-label="Close">x</button>
      </div>
      <nav class="tnf-tabs" aria-label="Cockpit tabs">
        ${dashboard.tabs.map((tab) => `<button type="button" class="tnf-tab ${tab.id === "today" ? "active" : ""}" data-tab="${tab.id}">${tab.label}</button>`).join("")}
      </nav>
      <div class="tnf-panels">
        ${dashboard.tabs.map((tab) => `<section class="tnf-panel ${tab.id === "today" ? "active" : ""}" data-panel="${tab.id}">${tab.html}</section>`).join("")}
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #${SIDEBAR_ID} {
        position: fixed;
        right: 20px;
        top: 80px;
        width: 410px;
        max-height: 80vh;
        overflow: auto;
        z-index: 2147483647;
        background: #090c10;
        color: #f4f7fb;
        border: 1px solid #2b3746;
        border-radius: 8px;
        box-shadow: 0 20px 70px rgba(0,0,0,.45);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${SIDEBAR_ID} .tnf-sidebar-head {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 13px 14px;
        background: #10161e;
        border-bottom: 1px solid #2b3746;
      }
      #${SIDEBAR_ID} .tnf-sidebar-head strong {
        display: block;
        font-size: 14px;
        line-height: 1.2;
      }
      #${SIDEBAR_ID} .tnf-tabs {
        position: sticky;
        top: 58px;
        z-index: 2;
        display: flex;
        gap: 6px;
        overflow-x: auto;
        padding: 9px 10px;
        background: #090c10;
        border-bottom: 1px solid #2b3746;
      }
      #${SIDEBAR_ID} .tnf-tab {
        flex: 0 0 auto;
        min-height: 28px;
        padding: 0 9px;
        border: 1px solid #2b3746;
        border-radius: 8px;
        background: #151d27;
        color: #aeb9c8;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
      }
      #${SIDEBAR_ID} .tnf-tab.active {
        background: #f4d35e;
        border-color: #f4d35e;
        color: #111;
      }
      #${SIDEBAR_ID} .tnf-panel {
        display: none;
        padding: 10px;
      }
      #${SIDEBAR_ID} .tnf-panel.active {
        display: block;
      }
      #${SIDEBAR_ID} .tnf-sidebar-head small {
        display: block;
        margin-top: 3px;
        color: #9facbd;
        font-size: 11px;
      }
      #${SIDEBAR_ID} .tnf-close {
        width: 28px;
        height: 28px;
        border: 1px solid #2b3746;
        border-radius: 8px;
        background: #1b2531;
        color: #fff;
        cursor: pointer;
      }
      #${SIDEBAR_ID} .tnf-card {
        margin: 0 0 10px;
        padding: 12px;
        background: #10161e;
        border: 1px solid #2b3746;
        border-radius: 8px;
      }
      #${SIDEBAR_ID} .tnf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      #${SIDEBAR_ID} .tnf-stat {
        padding: 10px;
        background: #10161e;
        border: 1px solid #2b3746;
        border-radius: 8px;
      }
      #${SIDEBAR_ID} .tnf-stat span {
        display: block;
        font-size: 16px;
        font-weight: 900;
      }
      #${SIDEBAR_ID} .tnf-stat small {
        display: block;
        margin-top: 3px;
        color: #9facbd;
        font-size: 11px;
      }
      #${SIDEBAR_ID} .tnf-section-title {
        margin: 12px 0 8px;
        color: #f4f7fb;
        font-size: 13px;
        font-weight: 900;
      }
      #${SIDEBAR_ID} .tnf-pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 8px;
      }
      #${SIDEBAR_ID} .tnf-pill {
        display: inline-flex;
        padding: 4px 8px;
        border-radius: 999px;
        background: #202a36;
        color: #cbd6e2;
        font-size: 11px;
        font-weight: 800;
      }
      #${SIDEBAR_ID} .tnf-pill.high,
      #${SIDEBAR_ID} .tnf-pill.bullish {
        background: #14c784;
        color: #071018;
      }
      #${SIDEBAR_ID} .tnf-pill.medium,
      #${SIDEBAR_ID} .tnf-pill.mixed,
      #${SIDEBAR_ID} .tnf-pill.cautious {
        background: #f4d35e;
        color: #171000;
      }
      #${SIDEBAR_ID} .tnf-pill.low,
      #${SIDEBAR_ID} .tnf-pill.bearish,
      #${SIDEBAR_ID} .tnf-pill.risk-off {
        background: #ff5f6d;
        color: #fff;
      }
      #${SIDEBAR_ID} .tnf-score {
        display: inline-flex;
        margin-bottom: 8px;
        padding: 3px 8px;
        border-radius: 999px;
        background: #ffcc00;
        color: #111;
        font-weight: 700;
        font-size: 11px;
      }
      #${SIDEBAR_ID} .tnf-text {
        font-size: 13px;
        line-height: 1.45;
        color: #e7edf5;
      }
      #${SIDEBAR_ID} .tnf-meta {
        margin: 8px 0;
        color: #9facbd;
        font-size: 12px;
      }
      #${SIDEBAR_ID} .tnf-empty {
        padding: 14px;
        color: #9facbd;
        background: #171d25;
        border: 1px dashed #344154;
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.45;
      }
      #${SIDEBAR_ID} a {
        color: #69a7ff;
        font-size: 12px;
        text-decoration: none;
      }
      #${SIDEBAR_ID} .tnf-card-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
      }
      #${SIDEBAR_ID} .tnf-action {
        min-height: 28px;
        padding: 0 9px;
        border: 1px solid #2b3746;
        border-radius: 8px;
        background: #1b2531;
        color: #f4f7fb;
        cursor: pointer;
        font-size: 12px;
        font-weight: 800;
      }
      #${SIDEBAR_ID} .tnf-action.danger {
        background: rgba(255,95,109,.13);
        color: #ffc3c8;
        border-color: rgba(255,95,109,.36);
      }
      #${SIDEBAR_ID} .tnf-mini-filter {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 10px;
      }
      #${SIDEBAR_ID} .tnf-mini-filter select {
        width: 100%;
        min-height: 32px;
        border: 1px solid #2b3746;
        border-radius: 8px;
        background: #0c1118;
        color: #f4f7fb;
        padding: 0 8px;
        font: inherit;
        font-size: 12px;
      }
    `;

    sidebar.querySelector(".tnf-close").addEventListener("click", () => sidebar.remove());
    sidebar.querySelectorAll(".tnf-tab").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = button.dataset.tab;
        sidebar.querySelectorAll(".tnf-tab").forEach((item) => item.classList.toggle("active", item === button));
        sidebar.querySelectorAll(".tnf-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
      });
    });
    sidebar.querySelectorAll("[data-journal-tweet]").forEach((button) => {
      button.addEventListener("click", async () => {
        const tweet = sortedTweets.find((item) => item.id === button.dataset.journalTweet);
        if (!tweet) return;
        await TNFStorage.saveJournalEntry(buildJournalEntry(tweet));
        button.textContent = "Saved";
        button.disabled = true;
      });
    });
    sidebar.querySelectorAll("[data-delete-journal]").forEach((button) => {
      button.addEventListener("click", async () => {
        await TNFStorage.deleteJournalEntry(button.dataset.deleteJournal);
        button.closest(".tnf-card").remove();
      });
    });
    sidebar.querySelectorAll("[data-journal-filter]").forEach((select) => {
      select.addEventListener("change", () => applyJournalFilters(sidebar));
    });
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(sidebar);
    return { ok: true };
  }

  function buildSidebarDashboard(tweets, rawCount, sessionBrief, journal) {
    const today = buildTodayPanel(tweets, rawCount, sessionBrief);
    return {
      tabs: [
        { id: "today", label: "Today", html: today },
        { id: "macro", label: "Macro Desk", html: buildMacroPanel(tweets) },
        { id: "assets", label: "Assets", html: buildAssetsPanel(tweets) },
        { id: "calendar", label: "Calendar Risk", html: buildCalendarPanel(tweets) },
        { id: "journal", label: "Journal", html: buildJournalPanel(journal) },
        { id: "coach", label: "Coach", html: buildPlaceholderPanel("Coach", "Coaching Review will use saved journal entries once the journal sprint is implemented.") },
        { id: "settings", label: "Settings", html: buildPlaceholderPanel("Settings", "Use the extension options page for API key, prompt, watchlist, interval, and keyword settings.") }
      ]
    };
  }

  function buildTodayPanel(tweets, rawCount, sessionBrief) {
    const averageScore = tweets.length
      ? Math.round(tweets.reduce((sum, tweet) => sum + Number(tweet.contextScoreValue || 0), 0) / tweets.length)
      : 0;
    const highRisk = tweets.filter((tweet) => tweet.contextRiskLevel === "high").length;
    const topAssets = getTopItems(tweets.flatMap((tweet) => tweet.affectedAssets || []), 5);
    const mainTheme = getTopItems(tweets.map((tweet) => tweet.macroTheme || "Other"), 1)[0] || "None";
    const riskTone = highRisk > 0 ? "cautious" : averageScore >= 60 ? "risk-on" : "neutral";
    const topTweetsHtml = tweets.length
      ? tweets.slice(0, 5).map(renderSidebarTweetCard).join("")
      : '<div class="tnf-empty">No relevant trading news yet. Run Scan Latest 10 Tweets from the popup.</div>';

    return `
      <div class="tnf-grid">
        <div class="tnf-stat"><span>${escapeHtml(String(rawCount || tweets.length))}</span><small>tweets scanned</small></div>
        <div class="tnf-stat"><span>${escapeHtml(String(averageScore))}/100</span><small>average context</small></div>
        <div class="tnf-stat"><span>${escapeHtml(riskTone)}</span><small>risk tone</small></div>
        <div class="tnf-stat"><span>${escapeHtml(mainTheme)}</span><small>main driver</small></div>
      </div>
      ${renderSidebarBrief(sessionBrief, riskTone, mainTheme, topAssets)}
      <div class="tnf-section-title">Top Important Tweets</div>
      ${topTweetsHtml}
    `;
  }

  function renderSidebarBrief(sessionBrief, riskTone, mainTheme, topAssets) {
    if (!sessionBrief) {
      return `
        <div class="tnf-card">
          <div class="tnf-section-title">Session Brief</div>
          <div class="tnf-text">Current context is ${escapeHtml(riskTone)} with ${escapeHtml(mainTheme)} as the dominant theme. Treat this as market context, not a trade signal.</div>
          <div class="tnf-pill-row">
            ${topAssets.length ? topAssets.map((asset) => `<span class="tnf-pill">${escapeHtml(asset)}</span>`).join("") : '<span class="tnf-pill">No assets detected</span>'}
          </div>
        </div>
      `;
    }

    return `
      <div class="tnf-card">
        <div class="tnf-section-title">${escapeHtml(sessionBrief.session || "Unknown")} Session Brief</div>
        <div class="tnf-pill-row">
          <span class="tnf-pill ${escapeAttribute(sessionBrief.riskTone || "neutral")}">${escapeHtml(sessionBrief.riskTone || "neutral")}</span>
          <span class="tnf-pill">Context ${escapeHtml(String(sessionBrief.averageContextScore || 0))}/100</span>
          ${sessionBrief.fallback ? '<span class="tnf-pill">fallback</span>' : ""}
        </div>
        <div class="tnf-text">${escapeHtml(sessionBrief.sessionPlan || "")}</div>
        <div class="tnf-meta">Key driver: ${escapeHtml(sessionBrief.keyDriver || "None")}</div>
      </div>
    `;
  }

  function buildMacroPanel(tweets) {
    const groups = groupBy(tweets, (tweet) => tweet.macroTheme || "Other");
    const themes = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    if (themes.length === 0) return '<div class="tnf-empty">No macro themes detected yet.</div>';
    return themes.map(([theme, items]) => {
      const avg = Math.round(items.reduce((sum, tweet) => sum + Number(tweet.contextScoreValue || 0), 0) / items.length);
      const assets = getTopItems(items.flatMap((tweet) => tweet.affectedAssets || []), 4);
      return `
        <div class="tnf-card">
          <span class="tnf-score">Context ${avg}/100</span>
          <div class="tnf-section-title">${escapeHtml(theme)}</div>
          <div class="tnf-text">${escapeHtml(items.length)} supporting tweet(s). Main local narrative based on matched categories and context score.</div>
          <div class="tnf-pill-row">${assets.map((asset) => `<span class="tnf-pill">${escapeHtml(asset)}</span>`).join("") || '<span class="tnf-pill">No asset match</span>'}</div>
        </div>
      `;
    }).join("");
  }

  function buildAssetsPanel(tweets) {
    const groups = groupBy(tweets.flatMap((tweet) => (tweet.affectedAssets || []).map((asset) => ({ asset, tweet }))), (item) => item.asset);
    const assets = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    if (assets.length === 0) return '<div class="tnf-empty">No watched assets detected in filtered tweets.</div>';
    return assets.map(([asset, items]) => {
      const avg = Math.round(items.reduce((sum, item) => sum + Number(item.tweet.contextScoreValue || 0), 0) / items.length);
      const bias = inferAssetBias(items.map((item) => item.tweet));
      return `
        <div class="tnf-card">
          <div class="tnf-section-title">${escapeHtml(asset)}</div>
          <div class="tnf-pill-row">
            <span class="tnf-pill ${escapeAttribute(bias)}">${escapeHtml(bias)}</span>
            <span class="tnf-pill">Context ${avg}/100</span>
            <span class="tnf-pill">${items.length} tweet(s)</span>
          </div>
          <div class="tnf-text">News-based context only. No buy/sell signal.</div>
        </div>
      `;
    }).join("");
  }

  function buildCalendarPanel(tweets) {
    const events = {};
    tweets.forEach((tweet) => {
      const terms = TNFCockpit.detectCalendarTerms(`${tweet.text || ""} ${(tweet.detectedKeywords || []).join(" ")}`.toLowerCase());
      terms.forEach((term) => {
        if (!events[term]) events[term] = { term, tweets: [] };
        events[term].tweets.push(tweet);
      });
    });
    const rows = Object.values(events).sort((a, b) => b.tweets.length - a.tweets.length);
    if (rows.length === 0) return '<div class="tnf-empty">No calendar risk terms detected in the latest filtered tweets.</div>';
    return rows.map((event) => {
      const assets = getTopItems(event.tweets.flatMap((tweet) => tweet.affectedAssets || []), 4);
      const risk = event.tweets.some((tweet) => tweet.contextRiskLevel === "high") || event.tweets.length > 1 ? "high" : "medium";
      return `
        <div class="tnf-card">
          <div class="tnf-section-title">${escapeHtml(event.term.toUpperCase())}</div>
          <div class="tnf-pill-row">
            <span class="tnf-pill ${risk}">${escapeHtml(risk)} risk</span>
            <span class="tnf-pill">${event.tweets.length} mention(s)</span>
          </div>
          <div class="tnf-meta">Assets: ${escapeHtml(assets.join(", ") || "No direct asset match")}</div>
          <div class="tnf-text">Event-risk context detected. Avoid treating headlines as trade instructions.</div>
        </div>
      `;
    }).join("");
  }

  function buildJournalPanel(journal) {
    const entries = Array.isArray(journal) ? journal.slice(0, 8) : [];
    if (entries.length === 0) {
      return '<div class="tnf-empty">No journal entries yet. Use Save to Journal on a tweet card to store watch-only context.</div>';
    }

    const instruments = Array.from(new Set(entries.map((entry) => entry.instrument).filter(Boolean))).sort();
    const results = Array.from(new Set(entries.map((entry) => entry.result).filter(Boolean))).sort();

    return `
      <div class="tnf-mini-filter">
        <select data-journal-filter="instrument" aria-label="Filter journal by instrument">
          <option value="">All instruments</option>
          ${instruments.map((instrument) => `<option value="${escapeAttribute(instrument)}">${escapeHtml(instrument)}</option>`).join("")}
        </select>
        <select data-journal-filter="result" aria-label="Filter journal by result">
          <option value="">All results</option>
          ${results.map((result) => `<option value="${escapeAttribute(result)}">${escapeHtml(result)}</option>`).join("")}
        </select>
      </div>
      ${entries.map((entry) => `
      <div class="tnf-card" data-journal-entry data-instrument="${escapeAttribute(entry.instrument || "")}" data-result="${escapeAttribute(entry.result || "")}">
        <div class="tnf-section-title">${escapeHtml(entry.instrument || "Unknown instrument")}</div>
        <div class="tnf-pill-row">
          <span class="tnf-pill">${escapeHtml(entry.tradeIdea || "watch_only")}</span>
          <span class="tnf-pill">${escapeHtml(entry.result || "pending")}</span>
          <span class="tnf-pill">confidence ${escapeHtml(String(entry.confidence || 0))}/5</span>
        </div>
        <div class="tnf-text">${escapeHtml(entry.notes || "")}</div>
        <div class="tnf-meta">${escapeHtml(formatDate(entry.createdAt))} | ${escapeHtml(entry.setup || "news_reaction")} | ${escapeHtml(entry.emotion || "calm")}</div>
        <div class="tnf-card-actions">
          <button type="button" class="tnf-action danger" data-delete-journal="${escapeAttribute(entry.id)}">Delete</button>
        </div>
      </div>
      `).join("")}
    `;
  }

  function buildPlaceholderPanel(title, message) {
    return `
      <div class="tnf-empty">
        <strong>${escapeHtml(title)}</strong><br>
        ${escapeHtml(message)}
      </div>
    `;
  }

  function renderSidebarTweetCard(tweet) {
    return `
      <div class="tnf-card">
        <div class="tnf-score">${tweet.impactScore}/5 ${escapeHtml(tweet.scoreBadge || tweet.importanceLabel || "")}</div>
        <div class="tnf-pill-row">
          <span class="tnf-pill">Context ${escapeHtml(String(tweet.contextScoreValue || 0))}/100</span>
          <span class="tnf-pill ${escapeAttribute(tweet.contextRiskLevel || "low")}">${escapeHtml(tweet.contextRiskLevel || "low")} risk</span>
        </div>
        <div class="tnf-text">${escapeHtml(tweet.summary || tweet.text || "")}</div>
        <div class="tnf-meta">${escapeHtml(tweet.direction || "neutral")} | ${escapeHtml((tweet.categories || []).join(" / "))}</div>
        <div class="tnf-card-actions">
          ${tweet.url ? `<a href="${escapeAttribute(tweet.url)}" target="_blank" rel="noreferrer">Open Tweet</a>` : ""}
          <button type="button" class="tnf-action" data-journal-tweet="${escapeAttribute(tweet.id)}">Save to Journal</button>
        </div>
      </div>
    `;
  }

  function buildJournalEntry(tweet) {
    const instrument = (tweet.affectedAssets && tweet.affectedAssets[0]) || "XAUUSD";
    return {
      id: TNFUtils.simpleHash(`journal:${tweet.id}:${Date.now()}`),
      createdAt: new Date().toISOString(),
      linkedTweetIds: [tweet.id],
      instrument,
      tradeIdea: "watch_only",
      setup: "news_reaction",
      confidence: 3,
      emotion: "calm",
      followedPlan: true,
      result: "pending",
      notes: tweet.summary || tweet.text || "",
      marketContextSnapshot: {
        riskTone: tweet.contextRiskLevel || "unknown",
        mainDriver: tweet.macroTheme || "",
        contextScore: tweet.contextScoreValue || 0,
        affectedAssets: tweet.affectedAssets || []
      }
    };
  }

  function groupBy(items, getKey) {
    return items.reduce((acc, item) => {
      const key = getKey(item) || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  function getTopItems(items, limit) {
    const counts = items.filter(Boolean).reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  }

  function inferAssetBias(tweets) {
    const counts = tweets.reduce((acc, tweet) => {
      const direction = tweet.direction || "neutral";
      acc[direction] = (acc[direction] || 0) + 1;
      return acc;
    }, {});
    if ((counts.bullish || 0) > (counts.bearish || 0)) return "bullish";
    if ((counts.bearish || 0) > (counts.bullish || 0)) return "bearish";
    if ((counts.bullish || 0) > 0 && (counts.bearish || 0) > 0) return "mixed";
    return "neutral";
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

  function formatDate(value) {
    if (!value) return "Unknown date";
    try {
      return new Date(value).toLocaleString();
    } catch (error) {
      return value;
    }
  }

  function applyJournalFilters(sidebar) {
    const instrument = sidebar.querySelector('[data-journal-filter="instrument"]')?.value || "";
    const result = sidebar.querySelector('[data-journal-filter="result"]')?.value || "";
    sidebar.querySelectorAll("[data-journal-entry]").forEach((entry) => {
      const matchesInstrument = !instrument || entry.dataset.instrument === instrument;
      const matchesResult = !result || entry.dataset.result === result;
      entry.hidden = !(matchesInstrument && matchesResult);
    });
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
})();
