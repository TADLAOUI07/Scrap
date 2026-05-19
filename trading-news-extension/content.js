(function () {
  "use strict";

  if (globalThis.__TNF_CONTENT_LOADED__) return;
  globalThis.__TNF_CONTENT_LOADED__ = true;

  const SIDEBAR_ID = "tnf-sidebar";

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;

    if (message.type === "TNF_MANUAL_SCAN") {
      scanVisibleTweets("manual").then(sendResponse);
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
      showSidebar(message.tweets || []);
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });

  async function waitForTweetsThenScan() {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 12000) {
      if (document.querySelectorAll("article").length > 0) break;
      await delay(500);
    }
    return scanVisibleTweets("auto");
  }

  async function scanVisibleTweets(source) {
    const settings = await TNFStorage.getSettings();
    const rawTweets = extractVisibleTweets();
    const classified = rawTweets
      .map((tweet) => TNFScoring.classifyTweet(tweet, settings))
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
      rawTweets: rawTweets.map(normalizeRawTweetForAnalysis),
      tweets: deduped.sort((a, b) => b.impactScore - a.impactScore),
      message: rawTweets.length === 0 ? "No visible tweets found on this page." : "",
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

  function showSidebar(tweets) {
    const existing = document.getElementById(SIDEBAR_ID);
    if (existing) existing.remove();

    const sidebar = document.createElement("aside");
    sidebar.id = SIDEBAR_ID;
    sidebar.innerHTML = `
      <div class="tnf-sidebar-head">
        <strong>Market Terminal</strong>
        <button type="button" class="tnf-close" aria-label="Close">x</button>
      </div>
      <div class="tnf-sidebar-list"></div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #${SIDEBAR_ID} {
        position: fixed;
        right: 20px;
        top: 80px;
        width: 360px;
        max-height: 80vh;
        overflow: auto;
        z-index: 2147483647;
        background: #101318;
        color: #f4f7fb;
        border: 1px solid #29313d;
        border-radius: 12px;
        box-shadow: 0 20px 70px rgba(0,0,0,.45);
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      #${SIDEBAR_ID} .tnf-sidebar-head {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        background: #151a21;
        border-bottom: 1px solid #29313d;
      }
      #${SIDEBAR_ID} .tnf-close {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        background: #252d38;
        color: #fff;
        cursor: pointer;
      }
      #${SIDEBAR_ID} .tnf-card {
        margin: 10px;
        padding: 12px;
        background: #171d25;
        border: 1px solid #2d3745;
        border-radius: 10px;
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
      #${SIDEBAR_ID} a {
        color: #69a7ff;
        font-size: 12px;
        text-decoration: none;
      }
    `;

    const list = sidebar.querySelector(".tnf-sidebar-list");
    const sortedTweets = [...tweets].sort((a, b) => b.impactScore - a.impactScore);

    if (sortedTweets.length === 0) {
      list.innerHTML = '<div class="tnf-card"><div class="tnf-text">No relevant trading news yet.</div></div>';
    } else {
      sortedTweets.forEach((tweet) => {
        const card = document.createElement("div");
        card.className = "tnf-card";
        card.innerHTML = `
          <div class="tnf-score">${tweet.impactScore}/5 ${tweet.scoreBadge || tweet.importanceLabel}</div>
          <div class="tnf-text"></div>
          <div class="tnf-meta">${escapeHtml(tweet.selectedPair || "")} | ${escapeHtml(tweet.direction || "neutral")} | ${escapeHtml(tweet.categories.join(" / "))}</div>
          ${tweet.url ? `<a href="${escapeAttribute(tweet.url)}" target="_blank" rel="noreferrer">Open Tweet</a>` : ""}
        `;
        card.querySelector(".tnf-text").textContent = tweet.summary || tweet.text;
        list.appendChild(card);
      });
    }

    sidebar.querySelector(".tnf-close").addEventListener("click", () => sidebar.remove());
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(sidebar);
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
