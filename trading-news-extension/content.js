(function () {
  "use strict";

  if (globalThis.__TNF_CONTENT_LOADED__) return;
  globalThis.__TNF_CONTENT_LOADED__ = true;

  const SIDEBAR_ID = "tnf-sidebar";
  const SIDEBAR_STYLE_ID = "tnf-sidebar-style";
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
      showSidebar(message.tweets || [], message.rawCount || 0, message.sessionBrief || null, message.assetBiases || null, message.settings || null).then(sendResponse);
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

  async function showSidebar(tweets, rawCount, sessionBrief, assetBiases, suppliedSettings) {
    const existing = document.getElementById(SIDEBAR_ID);
    if (existing) existing.remove();
    const existingStyle = document.getElementById(SIDEBAR_STYLE_ID);
    if (existingStyle) existingStyle.remove();

    const settings = suppliedSettings || await TNFStorage.getSettings();
    const sidebarLayout = getSidebarLayout(settings);
    const sortedTweets = [...tweets].sort((a, b) => (b.contextScoreValue || b.impactScore) - (a.contextScoreValue || a.impactScore));
    const dashboard = buildSidebarDashboard(sortedTweets, rawCount, sessionBrief, assetBiases);
    const sidebar = document.createElement("aside");
    const activeTabId = dashboard.tabs[0] ? dashboard.tabs[0].id : "assets";
    sidebar.id = SIDEBAR_ID;
    applySidebarLayout(sidebar, sidebarLayout);
    sidebar.innerHTML = `
      <div class="tnf-sidebar-head">
        <div>
          <strong>AI Trading Context Cockpit</strong>
          <small>${escapeHtml(String(tweets.length))} shown / ${escapeHtml(String(rawCount || tweets.length))} scanned</small>
        </div>
        <button type="button" class="tnf-close" aria-label="Close">x</button>
      </div>
      <nav class="tnf-tabs" aria-label="Cockpit tabs">
        ${dashboard.tabs.map((tab) => `<button type="button" class="tnf-tab ${tab.id === activeTabId ? "active" : ""}" data-tab="${tab.id}">${tab.label}</button>`).join("")}
      </nav>
      <div class="tnf-panels">
        ${dashboard.tabs.map((tab) => `<section class="tnf-panel ${tab.id === activeTabId ? "active" : ""}" data-panel="${tab.id}">${tab.html}</section>`).join("")}
      </div>
    `;

    const style = document.createElement("style");
    style.id = SIDEBAR_STYLE_ID;
    style.textContent = `
      #${SIDEBAR_ID} {
        position: fixed;
        overflow: auto;
        z-index: 2147483647;
        background: #090c10;
        color: #f4f7fb;
        border: 1px solid #2b3746;
        border-radius: 10px;
        box-shadow: 0 24px 80px rgba(0,0,0,.52);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${SIDEBAR_ID} * {
        box-sizing: border-box;
      }
      #${SIDEBAR_ID} .tnf-sidebar-head {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 18px;
        background: #10161e;
        border-bottom: 1px solid #2b3746;
        cursor: move;
        user-select: none;
        touch-action: none;
      }
      #${SIDEBAR_ID}.tnf-dragging {
        opacity: .96;
        box-shadow: 0 30px 90px rgba(0,0,0,.66);
      }
      #${SIDEBAR_ID} .tnf-sidebar-head strong {
        display: block;
        font-size: 17px;
        line-height: 1.2;
      }
      #${SIDEBAR_ID} .tnf-tabs {
        position: sticky;
        top: 70px;
        z-index: 2;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding: 12px;
        background: #090c10;
        border-bottom: 1px solid #2b3746;
      }
      #${SIDEBAR_ID} .tnf-tab {
        min-height: 36px;
        padding: 0 10px;
        border: 1px solid #2b3746;
        border-radius: 8px;
        background: #151d27;
        color: #aeb9c8;
        cursor: pointer;
        font-size: 13px;
        font-weight: 800;
      }
      #${SIDEBAR_ID} .tnf-tab.active {
        background: #f4d35e;
        border-color: #f4d35e;
        color: #111;
      }
      #${SIDEBAR_ID} .tnf-panel {
        display: none;
        padding: 14px;
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
        width: 34px;
        height: 34px;
        border: 1px solid #2b3746;
        border-radius: 8px;
        background: #1b2531;
        color: #fff;
        cursor: pointer;
      }
      #${SIDEBAR_ID} .tnf-card {
        margin: 0 0 12px;
        padding: 14px;
        background: #10161e;
        border: 1px solid #2b3746;
        border-radius: 10px;
      }
      #${SIDEBAR_ID} .tnf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 12px;
      }
      #${SIDEBAR_ID} .tnf-stat {
        padding: 12px;
        background: #10161e;
        border: 1px solid #2b3746;
        border-radius: 10px;
      }
      #${SIDEBAR_ID} .tnf-stat span {
        display: block;
        font-size: 17px;
        font-weight: 900;
      }
      #${SIDEBAR_ID} .tnf-stat small {
        display: block;
        margin-top: 3px;
        color: #9facbd;
        font-size: 11px;
      }
      #${SIDEBAR_ID} .tnf-section-title {
        margin: 14px 0 10px;
        color: #f4f7fb;
        font-size: 15px;
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
        align-items: center;
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
        margin-bottom: 10px;
        padding: 5px 10px;
        border-radius: 999px;
        background: #ffcc00;
        color: #111;
        font-weight: 900;
        font-size: 12px;
      }
      #${SIDEBAR_ID} .tnf-text {
        font-size: 13px;
        line-height: 1.55;
        color: #e7edf5;
      }
      #${SIDEBAR_ID} .tnf-meta {
        margin: 10px 0;
        color: #9facbd;
        font-size: 12px;
        line-height: 1.45;
      }
      #${SIDEBAR_ID} .tnf-empty {
        padding: 16px;
        color: #9facbd;
        background: #10161e;
        border: 1px dashed #344154;
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.45;
      }
      #${SIDEBAR_ID} a {
        color: #69a7ff;
        font-size: 12px;
        text-decoration: none;
        font-weight: 800;
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
      #${SIDEBAR_ID} .tnf-asset-card {
        position: relative;
        overflow: hidden;
        padding: 15px;
      }
      #${SIDEBAR_ID} .tnf-asset-card::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 5px;
        background: #8b98a8;
      }
      #${SIDEBAR_ID} .tnf-asset-card.bullish {
        background: rgba(20, 199, 132, .12);
        border-color: rgba(20, 199, 132, .42);
      }
      #${SIDEBAR_ID} .tnf-asset-card.bullish::before {
        background: #14c784;
      }
      #${SIDEBAR_ID} .tnf-asset-card.bearish {
        background: rgba(255, 95, 109, .12);
        border-color: rgba(255, 95, 109, .44);
      }
      #${SIDEBAR_ID} .tnf-asset-card.bearish::before {
        background: #ff5f6d;
      }
      #${SIDEBAR_ID} .tnf-asset-card.mixed,
      #${SIDEBAR_ID} .tnf-asset-card.neutral {
        background: rgba(244, 211, 94, .10);
        border-color: rgba(244, 211, 94, .32);
      }
      #${SIDEBAR_ID} .tnf-asset-card.mixed::before,
      #${SIDEBAR_ID} .tnf-asset-card.neutral::before {
        background: #f4d35e;
      }
      #${SIDEBAR_ID} .tnf-asset-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
      }
      #${SIDEBAR_ID} .tnf-asset-symbol {
        color: #f4f7fb;
        font-size: 18px;
        font-weight: 950;
      }
      #${SIDEBAR_ID} .tnf-asset-score {
        color: #dce6f2;
        font-size: 12px;
        font-weight: 900;
      }
      #${SIDEBAR_ID} .tnf-asset-body {
        display: grid;
        gap: 9px;
      }
      #${SIDEBAR_ID} .tnf-driver-list {
        margin: 8px 0 0;
        padding-left: 18px;
        color: #dce6f2;
        font-size: 12px;
        line-height: 1.45;
      }
      #${SIDEBAR_ID} .tnf-ai-reason-box {
        display: grid;
        gap: 7px;
        margin-top: 2px;
        padding: 10px;
        background: rgba(9, 12, 16, .62);
        border: 1px solid rgba(255,255,255,.08);
        border-radius: 8px;
      }
      #${SIDEBAR_ID} .tnf-ai-reason-title {
        color: #f4f7fb;
        font-size: 12px;
        font-weight: 950;
      }
      #${SIDEBAR_ID} .tnf-ai-reason-list {
        margin: 0;
        padding-left: 18px;
        color: #dce6f2;
        font-size: 12px;
        line-height: 1.45;
      }
      #${SIDEBAR_ID} .tnf-ai-warning {
        color: #f4d35e;
        font-size: 12px;
        line-height: 1.45;
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
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(sidebar);
    setupSidebarDragging(sidebar, settings);
    return { ok: true };
  }

  function getSidebarLayout(settings) {
    const width = clampNumber(settings.sidebarWidth, 320, Math.min(760, Math.max(320, window.innerWidth - 24)), 430);
    const maxHeight = clampNumber(settings.sidebarMaxHeight, 45, 95, 80);
    const top = clampNumber(settings.sidebarTop, 0, Math.max(0, window.innerHeight - 80), 80);
    const sideOffset = clampNumber(settings.sidebarSideOffset, 0, Math.max(0, window.innerWidth - width), 20);
    const placement = ["left", "right", "custom"].includes(settings.sidebarPlacement) ? settings.sidebarPlacement : "right";

    return {
      width,
      maxHeight,
      top,
      sideOffset,
      placement
    };
  }

  function applySidebarLayout(sidebar, layout) {
    sidebar.style.width = `${layout.width}px`;
    sidebar.style.maxHeight = `${layout.maxHeight}vh`;
    sidebar.style.top = `${layout.top}px`;

    if (layout.placement === "left" || layout.placement === "custom") {
      sidebar.style.left = `${layout.sideOffset}px`;
      sidebar.style.right = "auto";
      return;
    }

    sidebar.style.right = `${layout.sideOffset}px`;
    sidebar.style.left = "auto";
  }

  function setupSidebarDragging(sidebar, settings) {
    if (settings.sidebarDraggable === false) return;

    const header = sidebar.querySelector(".tnf-sidebar-head");
    if (!header) return;

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    header.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, a")) return;
      const rect = sidebar.getBoundingClientRect();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      sidebar.classList.add("tnf-dragging");
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - sidebar.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - Math.min(sidebar.offsetHeight, window.innerHeight));
      const nextLeft = clampNumber(startLeft + event.clientX - startX, 0, maxLeft, startLeft);
      const nextTop = clampNumber(startTop + event.clientY - startY, 0, maxTop, startTop);
      sidebar.style.left = `${nextLeft}px`;
      sidebar.style.right = "auto";
      sidebar.style.top = `${nextTop}px`;
    });

    header.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      sidebar.classList.remove("tnf-dragging");
      header.releasePointerCapture(event.pointerId);
      saveDraggedSidebarPosition(sidebar);
    });

    header.addEventListener("pointercancel", () => {
      dragging = false;
      sidebar.classList.remove("tnf-dragging");
    });
  }

  function saveDraggedSidebarPosition(sidebar) {
    const rect = sidebar.getBoundingClientRect();
    TNFStorage.saveSettings({
      sidebarPlacement: "custom",
      sidebarTop: Math.round(rect.top),
      sidebarSideOffset: Math.round(rect.left),
      sidebarWidth: Math.round(rect.width),
      sidebarDraggable: true
    }).catch(() => {});
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function buildSidebarDashboard(tweets, rawCount, sessionBrief, assetBiases) {
    const today = buildTodayPanel(tweets, rawCount, sessionBrief);
    return {
      tabs: [
        { id: "assets", label: "Assets", html: buildAssetsPanel(tweets, assetBiases) },
        { id: "today", label: "Today", html: today },
        { id: "macro", label: "Macro Desk", html: buildMacroPanel(tweets) }
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

  function buildAssetsPanel(tweets, assetBiases) {
    const groups = groupBy(tweets.flatMap((tweet) => (tweet.affectedAssets || []).map((asset) => ({ asset, tweet }))), (item) => item.asset);
    const assets = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    if (assets.length === 0) return '<div class="tnf-empty">No watched assets detected in filtered tweets.</div>';
    const aiBySymbol = getAssetBiasMap(assetBiases);
    return assets.map(([asset, items]) => {
      const assetTweets = items.map((item) => item.tweet);
      const avg = Math.round(assetTweets.reduce((sum, tweet) => sum + Number(tweet.contextScoreValue || 0), 0) / assetTweets.length);
      const aiBias = aiBySymbol.get(String(asset).toUpperCase());
      const bias = aiBias && aiBias.newsBias && aiBias.newsBias !== "unclear" ? aiBias.newsBias : inferAssetBias(assetTweets);
      const risk = assetTweets.some((tweet) => tweet.contextRiskLevel === "high") ? "high" : avg >= 55 ? "medium" : "low";
      const drivers = aiBias && aiBias.mainDrivers && aiBias.mainDrivers.length
        ? aiBias.mainDrivers.slice(0, 3)
        : getTopItems(assetTweets.map((tweet) => tweet.macroTheme || "").filter(Boolean), 3);
      const topTweet = assetTweets.sort((a, b) => Number(b.contextScoreValue || 0) - Number(a.contextScoreValue || 0))[0];
      return `
        <div class="tnf-card tnf-asset-card ${escapeAttribute(bias)}">
          <div class="tnf-asset-head">
            <div class="tnf-asset-symbol">${escapeHtml(asset)}</div>
            <div class="tnf-asset-score">${escapeHtml(aiBias ? `${Math.round(aiBias.confidence || 0)}% AI` : `Context ${avg}/100`)}</div>
          </div>
          <div class="tnf-asset-body">
            <div class="tnf-pill-row">
              <span class="tnf-pill ${escapeAttribute(risk)}">${escapeHtml(risk)} risk</span>
              <span class="tnf-pill">${assetTweets.length} supporting tweet(s)</span>
              ${aiBias && aiBias.fallback ? '<span class="tnf-pill">local fallback</span>' : aiBias ? '<span class="tnf-pill">OpenAI reasons</span>' : '<span class="tnf-pill">local reasons</span>'}
            </div>
            <div class="tnf-text">${escapeHtml(aiBias && aiBias.tradingContext ? aiBias.tradingContext : getAssetContextLine(asset, bias, risk, topTweet))}</div>
            ${renderAssetAiReasons(aiBias, bias)}
            ${drivers.length ? `<ul class="tnf-driver-list">${drivers.map((driver) => `<li>${escapeHtml(driver)}</li>`).join("")}</ul>` : ""}
            ${aiBias && aiBias.riskWarning ? `<div class="tnf-ai-warning">${escapeHtml(aiBias.riskWarning)}</div>` : ""}
            ${topTweet && topTweet.url ? `<a href="${escapeAttribute(topTweet.url)}" target="_blank" rel="noreferrer">Open strongest tweet</a>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  function getAssetBiasMap(assetBiases) {
    const rows = assetBiases && Array.isArray(assetBiases.instrumentBiases)
      ? assetBiases.instrumentBiases
      : [];
    return new Map(rows.map((row) => [
      String(row.symbol || "").toUpperCase(),
      { ...row, fallback: Boolean(assetBiases && assetBiases.fallback) }
    ]));
  }

  function renderAssetAiReasons(aiBias, bias) {
    if (!aiBias) {
      return `
        <div class="tnf-ai-reason-box">
          <div class="tnf-ai-reason-title">Why this read?</div>
          <ul class="tnf-ai-reason-list">
            <li>Local score uses matched asset keywords, context score, risk level, and tweet direction.</li>
            <li>Add your OpenAI API key to get institutional-style reasons under each asset.</li>
          </ul>
        </div>
      `;
    }

    const reasons = bias === "bearish"
      ? aiBias.bearishReasons || []
      : bias === "bullish"
        ? aiBias.bullishReasons || []
        : [...(aiBias.bullishReasons || []), ...(aiBias.bearishReasons || [])];
    const cleanReasons = reasons.length ? reasons.slice(0, 4) : aiBias.mainDrivers || [];
    if (!cleanReasons.length) return "";

    return `
      <div class="tnf-ai-reason-box">
        <div class="tnf-ai-reason-title">Why ${escapeHtml(bias)}?</div>
        <ul class="tnf-ai-reason-list">
          ${cleanReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
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
        </div>
      </div>
    `;
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

  function getAssetContextLine(asset, bias, risk, topTweet) {
    const driver = topTweet && topTweet.macroTheme ? topTweet.macroTheme : "latest filtered news";
    const riskText = risk === "high" ? "high event risk" : risk === "medium" ? "moderate event risk" : "limited event risk";
    if (bias === "bullish") {
      return `${asset} has a constructive news read from ${driver}, with ${riskText}. Treat it as context, not a trade signal.`;
    }
    if (bias === "bearish") {
      return `${asset} has a negative news read from ${driver}, with ${riskText}. Treat it as context, not a trade signal.`;
    }
    if (bias === "mixed") {
      return `${asset} has conflicting news drivers around ${driver}. Wait for clearer confirmation before relying on the read.`;
    }
    return `${asset} has no clear directional news read yet. Current context is informational, not actionable.`;
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

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }
})();
