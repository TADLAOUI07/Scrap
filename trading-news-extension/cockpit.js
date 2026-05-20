(function () {
  "use strict";

  const CALENDAR_TERMS = [
    "cpi",
    "ppi",
    "pce",
    "nfp",
    "nonfarm payrolls",
    "unemployment claims",
    "jobless claims",
    "fomc",
    "fed minutes",
    "powell",
    "ism",
    "pmi",
    "gdp",
    "retail sales",
    "ecb",
    "boe",
    "boj",
    "opec",
    "eia crude inventories",
    "crude inventories",
    "rate decision",
    "interest rates",
    "inflation data"
  ];

  const MACRO_CATEGORY_MAP = {
    "USD / DXY / Yields": "USD / Rates",
    "Fed / Rates": "Fed / Central Banks",
    Inflation: "Inflation",
    "Jobs / US Data": "Jobs Data",
    Geopolitics: "Geopolitics",
    "Oil / Risk sentiment": "Oil / Energy",
    "Stocks / Indices": "Equities / Tech",
    Crypto: "Crypto",
    "Gold / XAUUSD": "Commodities / Gold",
    "EURUSD / ECB": "Fed / Central Banks",
    "Economic Calendar": "Other"
  };

  function buildCapturedTweet(rawTweet) {
    const text = rawTweet.text || "";
    const textHash = globalThis.TNFUtils.simpleHash(text);
    return {
      id: rawTweet.url || globalThis.TNFUtils.simpleHash(`${rawTweet.author || ""}:${text}`),
      url: rawTweet.url || "",
      text,
      author: rawTweet.author || "Unknown",
      handle: inferHandle(rawTweet.url),
      timestamp: rawTweet.time || "",
      capturedAt: new Date().toISOString(),
      textHash,
      rawHtml: ""
    };
  }

  function buildLocalTweetAnalysis(classifiedTweet, settings) {
    const affectedAssets = detectAffectedAssets(classifiedTweet, settings);
    const localScore = Number(classifiedTweet.impactScore || 0);
    return {
      tweetId: classifiedTweet.id,
      matched: localScore > 0,
      categories: classifiedTweet.categories || [],
      matchedKeywords: classifiedTweet.detectedKeywords || [],
      localScore,
      directionHint: normalizeDirection(classifiedTweet.direction),
      affectedAssets,
      importance: getLocalImportance(localScore)
    };
  }

  function calculateContextScore(tweet, localAnalysis, aiAnalysis, watchedMarkets, recentTweets, settings) {
    const reasons = [];
    const penalties = [];
    let score = 0;

    const text = `${tweet.text || ""} ${(tweet.detectedKeywords || []).join(" ")}`.toLowerCase();
    const categories = tweet.categories || [];
    const affectedAssets = localAnalysis.affectedAssets || [];
    const calendarTerms = detectCalendarTerms(text);

    if (localAnalysis.localScore >= 5) {
      score += 20;
      reasons.push("High-impact local news score.");
    } else if (localAnalysis.localScore >= 4) {
      score += 15;
      reasons.push("Important local news score.");
    } else if (localAnalysis.localScore >= 3) {
      score += 10;
      reasons.push("Medium local news score.");
    }

    if (affectedAssets.length > 0) {
      score += 15;
      reasons.push(`Affects watched market(s): ${affectedAssets.join(", ")}.`);
    }

    if (hasMacroCore(categories, text)) {
      score += 15;
      reasons.push("Contains macro drivers such as USD, rates, inflation, jobs data, or central banks.");
    }

    if (isRecentTweet(tweet)) {
      score += 10;
      reasons.push("Fresh headline from the current session.");
    }

    if (localAnalysis.directionHint !== "neutral" && localAnalysis.directionHint !== "unclear") {
      score += 10;
      reasons.push(`Direction hint is ${localAnalysis.directionHint}.`);
    } else {
      penalties.push("Direction is unclear.");
    }

    if (hasThemeConfirmation(tweet, recentTweets)) {
      score += 10;
      reasons.push("Several recent tweets confirm the same macro theme.");
    }

    if (isSessionRelevant(tweet, settings)) {
      score += 10;
      reasons.push("Relevant to the configured trading session or watchlist.");
    }

    if (calendarTerms.length > 0) {
      score += 10;
      reasons.push(`Calendar/event risk detected: ${calendarTerms.join(", ")}.`);
    }

    if (hasContradiction(tweet, recentTweets)) {
      score -= 15;
      penalties.push("Recent tweets show conflicting direction around the same theme.");
    }

    if ((tweet.detectedKeywords || []).length <= 1 && localAnalysis.localScore <= 1) {
      score -= 10;
      penalties.push("Low keyword clarity.");
    }

    if (hasHeadlineRisk(text)) {
      score -= 10;
      penalties.push("Headline risk or excess volatility warning.");
    }

    const finalScore = globalThis.TNFUtils.clampNumber(score, 0, 100);
    return {
      tweetId: tweet.id,
      score: finalScore,
      reasons,
      penalties,
      clarity: getClarity(finalScore, penalties),
      riskLevel: getRiskLevel(finalScore, calendarTerms, text)
    };
  }

  function enrichTweet(classifiedTweet, rawTweet, settings, recentRawTweets) {
    const capturedTweet = buildCapturedTweet(rawTweet);
    const localAnalysis = buildLocalTweetAnalysis(classifiedTweet, settings);
    const contextScore = calculateContextScore(
      classifiedTweet,
      localAnalysis,
      null,
      settings.watchedPairs || [],
      recentRawTweets || [],
      settings
    );
    const macroTheme = inferMacroTheme(classifiedTweet.categories || []);

    return {
      ...classifiedTweet,
      capturedTweet,
      localAnalysis,
      contextScore,
      contextScoreValue: contextScore.score,
      contextRiskLevel: contextScore.riskLevel,
      contextClarity: contextScore.clarity,
      affectedAssets: localAnalysis.affectedAssets,
      macroTheme
    };
  }

  function detectAffectedAssets(tweet, settings) {
    const watched = settings.watchedPairs || [];
    const text = `${tweet.text || ""} ${(tweet.categories || []).join(" ")} ${(tweet.detectedKeywords || []).join(" ")}`.toLowerCase();
    return watched.filter((asset) => {
      const keywords = getAssetKeywords(asset);
      return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
    });
  }

  function getAssetKeywords(asset) {
    const symbol = String(asset || "").toUpperCase();
    const base = [symbol];
    const map = {
      XAUUSD: ["gold", "xau", "xauusd", "bullion", "dxy", "usd", "yields", "fed", "cpi"],
      XAG: ["silver", "xag", "xagusd", "precious metals", "gold", "usd", "dxy", "yields", "fed", "cpi"],
      EURUSD: ["eurusd", "euro", "ecb", "lagarde", "dxy", "usd", "fed"],
      GBPUSD: ["gbpusd", "gbp", "pound", "sterling", "boe", "usd"],
      USDJPY: ["usdjpy", "jpy", "yen", "boj", "yields", "usd"],
      BTC: ["btc", "bitcoin", "crypto", "risk-on", "risk off", "liquidity", "fed", "usd", "yields"],
      BTCUSD: ["btcusd", "bitcoin", "btc", "crypto", "risk-on", "risk off"],
      ETHUSD: ["ethusd", "ethereum", "eth", "crypto"],
      US100: ["us100", "nasdaq", "tech", "stocks", "equities", "yields"],
      SPX500: ["spx500", "spx", "s&p", "sp500", "stocks", "equities"],
      NASDAQ: ["nasdaq", "us100", "tech", "stocks"],
      DOW: ["dow", "djia", "stocks"],
      USOIL: ["usoil", "oil", "crude", "wti", "brent", "opec"],
      DXY: ["dxy", "dollar index", "usd", "dollar"]
    };
    return Array.from(new Set([...base, ...(map[symbol] || [])]));
  }

  function detectCalendarTerms(text) {
    return CALENDAR_TERMS.filter((term) => text.includes(term));
  }

  function inferMacroTheme(categories) {
    if (!categories || categories.length === 0) return "Other";
    return MACRO_CATEGORY_MAP[categories[0]] || "Other";
  }

  function inferHandle(url) {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split("/").filter(Boolean);
      return parts[0] ? `@${parts[0]}` : "";
    } catch (error) {
      return "";
    }
  }

  function normalizeDirection(direction) {
    if (direction === "bullish" || direction === "bearish" || direction === "neutral") return direction;
    return "unclear";
  }

  function getLocalImportance(score) {
    if (score >= 5) return "high";
    if (score >= 3) return "medium";
    if (score >= 1) return "low";
    return "ignore";
  }

  function hasMacroCore(categories, text) {
    const macroCategories = ["USD / DXY / Yields", "Fed / Rates", "Inflation", "Jobs / US Data", "Economic Calendar"];
    if (categories.some((category) => macroCategories.includes(category))) return true;
    return ["fed", "usd", "dxy", "cpi", "nfp", "fomc", "rates", "inflation", "jobs"].some((term) => text.includes(term));
  }

  function isRecentTweet(tweet) {
    if (!tweet.time) return true;
    const timestamp = Date.parse(tweet.time);
    if (Number.isNaN(timestamp)) return true;
    return Date.now() - timestamp <= 90 * 60 * 1000;
  }

  function hasThemeConfirmation(tweet, recentTweets) {
    const categories = tweet.categories || [];
    if (categories.length === 0) return false;
    const primary = categories[0];
    const count = (recentTweets || []).filter((recent) => {
      const text = recent.text || "";
      return categories.some((category) => text.toLowerCase().includes(category.toLowerCase().split(" ")[0]));
    }).length;
    return primary && count >= 2;
  }

  function isSessionRelevant(tweet, settings) {
    const text = `${tweet.text || ""} ${(tweet.detectedKeywords || []).join(" ")}`.toLowerCase();
    const watched = settings.watchedPairs || [];
    return watched.some((asset) => getAssetKeywords(asset).some((keyword) => text.includes(keyword.toLowerCase())));
  }

  function hasContradiction(tweet, recentTweets) {
    const direction = tweet.direction;
    if (!direction || direction === "neutral") return false;
    const opposite = direction === "bullish" ? "bearish" : "bullish";
    return (recentTweets || []).some((recent) => {
      const detected = globalThis.TNFScoring.detectDirection(recent.text || "");
      return detected === opposite;
    });
  }

  function hasHeadlineRisk(text) {
    return ["war", "escalation", "emergency", "breaking", "attack", "sanctions", "default"].some((term) => text.includes(term));
  }

  function getClarity(score, penalties) {
    if (penalties.length >= 2 || score < 40) return "low";
    if (penalties.length === 1 || score < 70) return "medium";
    return "high";
  }

  function getRiskLevel(score, calendarTerms, text) {
    if (score >= 70 || calendarTerms.length > 0 || hasHeadlineRisk(text)) return "high";
    if (score >= 40) return "medium";
    return "low";
  }

  globalThis.TNFCockpit = {
    CALENDAR_TERMS,
    buildCapturedTweet,
    buildLocalTweetAnalysis,
    calculateContextScore,
    enrichTweet,
    detectAffectedAssets,
    detectCalendarTerms,
    inferMacroTheme
  };
})();
