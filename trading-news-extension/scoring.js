(function () {
  "use strict";

  const DEFAULT_CATEGORIES = [
    {
      name: "Gold / XAUUSD",
      enabled: true,
      keywords: ["gold", "xauusd", "precious metals", "safe haven", "bullion"]
    },
    {
      name: "USD / DXY / Yields",
      enabled: true,
      keywords: [
        "usd",
        "dollar",
        "dxy",
        "dollar index",
        "treasury yields",
        "bond yields",
        "10y yield",
        "us10y",
        "yields"
      ]
    },
    {
      name: "Fed / Rates",
      enabled: true,
      keywords: [
        "fed",
        "federal reserve",
        "fomc",
        "powell",
        "rate cut",
        "rate hike",
        "interest rates",
        "monetary policy",
        "hawkish",
        "dovish"
      ]
    },
    {
      name: "Inflation",
      enabled: true,
      keywords: ["cpi", "pce", "ppi", "inflation", "core cpi", "core pce", "prices"]
    },
    {
      name: "Jobs / US Data",
      enabled: true,
      keywords: [
        "nfp",
        "nonfarm payrolls",
        "unemployment",
        "jobless claims",
        "jobs report",
        "employment",
        "wages",
        "payrolls"
      ]
    },
    {
      name: "Geopolitics",
      enabled: true,
      keywords: [
        "war",
        "middle east",
        "iran",
        "israel",
        "russia",
        "ukraine",
        "geopolitical",
        "sanctions",
        "conflict",
        "escalation"
      ]
    },
    {
      name: "Oil / Risk sentiment",
      enabled: true,
      keywords: ["oil", "crude", "brent", "wti", "risk off", "risk on", "safe haven demand"]
    },
    {
      name: "EURUSD / ECB",
      enabled: true,
      keywords: ["eurusd", "euro", "ecb", "lagarde", "eurozone", "european central bank"]
    },
    {
      name: "Crypto",
      enabled: true,
      keywords: ["bitcoin", "btc", "btcUSD", "ethereum", "eth", "crypto", "stablecoin", "etf inflows"]
    },
    {
      name: "Stocks / Indices",
      enabled: true,
      keywords: [
        "stocks",
        "equities",
        "nasdaq",
        "dow",
        "s&p",
        "spx",
        "sp500",
        "us100",
        "earnings",
        "guidance"
      ]
    },
    {
      name: "Economic Calendar",
      enabled: true,
      keywords: [
        "economic calendar",
        "retail sales",
        "gdp",
        "ism",
        "pmi",
        "consumer confidence",
        "fomc minutes",
        "central bank"
      ]
    }
  ];

  const PAIR_KEYWORDS = {
    XAUUSD: ["xauusd", "gold", "bullion", "precious metals", "usd", "dxy", "yields", "fed", "cpi", "inflation"],
    EURUSD: ["eurusd", "euro", "ecb", "lagarde", "eurozone", "usd", "dxy", "fed", "cpi", "inflation"],
    GBPUSD: ["gbpusd", "pound", "sterling", "boe", "bank of england", "uk", "usd", "fed"],
    USDJPY: ["usdjpy", "yen", "jpy", "boj", "bank of japan", "japan", "yields", "usd"],
    BTCUSD: ["btcusd", "bitcoin", "btc", "crypto", "etf", "risk on", "risk off", "liquidity", "fed"],
    ETHUSD: ["ethusd", "ethereum", "eth", "crypto", "etf", "risk on", "risk off", "liquidity", "fed"],
    US100: ["us100", "nasdaq", "tech", "stocks", "equities", "yields", "fed", "earnings", "ai"],
    SPX500: ["spx500", "spx", "s&p", "sp500", "stocks", "equities", "fed", "earnings", "risk on"],
    NASDAQ: ["nasdaq", "us100", "tech", "stocks", "equities", "yields", "fed", "earnings"],
    DOW: ["dow", "djia", "industrials", "stocks", "equities", "fed", "earnings"],
    USOIL: ["usoil", "oil", "crude", "wti", "brent", "opec", "inventories", "middle east"]
  };

  const SCORE_5 = [
    "cpi",
    "nfp",
    "fomc",
    "powell speech",
    "rate decision",
    "federal reserve decision",
    "inflation surprise",
    "war escalation",
    "major geopolitical escalation"
  ];

  const SCORE_4 = [
    "pce",
    "ppi",
    "unemployment",
    "jobless claims",
    "us10y",
    "treasury yields",
    "dxy strong move",
    "hawkish fed",
    "dovish fed",
    "10y yield"
  ];

  const SCORE_3 = [
    "gold",
    "xauusd",
    "usd",
    "oil",
    "ecb",
    "eurusd",
    "market sentiment",
    "dollar",
    "risk off",
    "risk on"
  ];

  const BULLISH_TERMS = [
    "bullish",
    "rally",
    "surge",
    "higher",
    "safe haven demand",
    "risk off",
    "rate cut",
    "dovish",
    "weaker dollar",
    "dollar falls",
    "yields fall",
    "yields drop"
  ];

  const BEARISH_TERMS = [
    "bearish",
    "selloff",
    "falls",
    "lower",
    "risk on",
    "rate hike",
    "hawkish",
    "stronger dollar",
    "dollar rises",
    "yields rise",
    "hotter than expected"
  ];

  function hasPhrase(text, phrase) {
    const normalized = ` ${text.toLowerCase()} `;
    const escaped = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i");
    return pattern.test(normalized);
  }

  function findMatches(text, categories) {
    const detectedCategories = [];
    const detectedKeywords = [];

    categories
      .filter((category) => category.enabled !== false)
      .forEach((category) => {
        const matches = category.keywords.filter((keyword) => hasPhrase(text, keyword));
        if (matches.length > 0) {
          detectedCategories.push(category.name);
          detectedKeywords.push(...matches);
        }
      });

    return {
      categories: Array.from(new Set(detectedCategories)),
      detectedKeywords: Array.from(new Set(detectedKeywords))
    };
  }

  function calculateImpactScore(tweetText, detectedKeywords) {
    const text = String(tweetText || "").toLowerCase();
    const keywords = detectedKeywords || [];

    if (SCORE_5.some((phrase) => hasPhrase(text, phrase))) return 5;
    if (SCORE_4.some((phrase) => hasPhrase(text, phrase))) return 4;
    if (SCORE_3.some((phrase) => hasPhrase(text, phrase))) return 3;
    if (keywords.length >= 3) return 2;
    if (keywords.length > 0) return 1;
    return 0;
  }

  function getImportanceLabel(score) {
    if (score >= 5) return "High Impact";
    if (score === 4) return "Important";
    if (score === 3) return "Medium";
    if (score >= 1) return "Low";
    return "Not Relevant";
  }

  function getScoreBadge(score) {
    if (score >= 5) return "🚨 High Impact";
    if (score === 4) return "🔥 Important";
    if (score === 3) return "🟡 Medium";
    if (score >= 1) return "⚪ Low";
    return "NO IMPACT";
  }

  function detectDirection(text) {
    const normalized = String(text || "").toLowerCase();
    const bullish = BULLISH_TERMS.filter((term) => hasPhrase(normalized, term)).length;
    const bearish = BEARISH_TERMS.filter((term) => hasPhrase(normalized, term)).length;

    if (bullish > bearish) return "bullish";
    if (bearish > bullish) return "bearish";
    return "neutral";
  }

  function getPairRelevance(text, selectedPair) {
    const pair = String(selectedPair || "").toUpperCase();
    const keywords = PAIR_KEYWORDS[pair] || [pair.toLowerCase()];
    const matchedKeywords = keywords.filter((keyword) => hasPhrase(text, keyword));
    return {
      pair,
      isRelevant: matchedKeywords.length > 0,
      matchedKeywords
    };
  }

  function buildReason(categories, keywords, score) {
    if (score === 0) return "No clear trading keyword was detected.";
    const categoryText = categories.slice(0, 3).join(", ");
    const keywordText = keywords.slice(0, 5).join(", ");
    return `Mentions ${keywordText || "trading terms"} in ${categoryText || "market news"}, which can affect watched trading pairs.`;
  }

  function summarize(text) {
    const cleaned = globalThis.TNFUtils ? globalThis.TNFUtils.normalizeText(text) : String(text || "").trim();
    if (cleaned.length <= 170) return cleaned;
    return `${cleaned.slice(0, 167).trim()}...`;
  }

  function classifyTweet(rawTweet, settings) {
    const categories = settings && settings.categories ? settings.categories : DEFAULT_CATEGORIES;
    const text = rawTweet.text || "";
    const matches = findMatches(text, categories);
    const impactScore = calculateImpactScore(text, matches.detectedKeywords);
    const pairRelevance = getPairRelevance(text, settings && settings.selectedPair);
    const minimumScore = settings && Number.isFinite(Number(settings.minimumScore))
      ? Number(settings.minimumScore)
      : 1;

    if (impactScore < minimumScore || impactScore === 0) {
      return null;
    }

    const id = rawTweet.url
      ? rawTweet.url
      : globalThis.TNFUtils.simpleHash(`${rawTweet.author || ""}:${text}`);

    return {
      id,
      text,
      author: rawTweet.author || "Unknown",
      time: rawTweet.time || "",
      url: rawTweet.url || "",
      categories: matches.categories,
      impactScore,
      importanceLabel: getImportanceLabel(impactScore),
      scoreBadge: getScoreBadge(impactScore),
      reason: buildReason(matches.categories, matches.detectedKeywords, impactScore),
      detectedKeywords: matches.detectedKeywords,
      direction: detectDirection(text),
      selectedPair: pairRelevance.pair,
      pairRelevant: pairRelevance.isRelevant,
      pairKeywords: pairRelevance.matchedKeywords,
      summary: summarize(text),
      createdAt: new Date().toISOString()
    };
  }

  globalThis.TNFScoring = {
    DEFAULT_CATEGORIES,
    calculateImpactScore,
    classifyTweet,
    getImportanceLabel,
    getScoreBadge,
    detectDirection,
    getPairRelevance,
    PAIR_KEYWORDS
  };
})();
