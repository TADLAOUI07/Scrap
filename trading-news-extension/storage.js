(function () {
  "use strict";

  const SETTINGS_KEY = "tnf_settings";
  const HISTORY_KEY = "tnf_history";
  const LAST_SCAN_KEY = "tnf_last_scan";
  const SESSION_BRIEF_KEY = "tnf_session_brief";
  const DEFAULT_AI_ANALYSIS_PROMPT = [
    "Analyze the supplied X/Twitter news like a professional macro trader.",
    "Focus on market-moving impact for the selected pair or market.",
    "Prioritize fresh macro drivers: central banks, inflation, jobs data, yields, DXY, geopolitics, oil, risk sentiment, crypto liquidity, earnings, and indices.",
    "Separate bullish and bearish forces clearly.",
    "Mention exactly which supplied news items support the bias.",
    "If the news is weak, noisy, or contradictory, return mixed or neutral with low confidence.",
    "Do not invent external facts. Do not give trade entries, stop losses, or financial advice."
  ].join("\n");

  const DEFAULT_SETTINGS = {
    autoRefreshEnabled: false,
    autoRefreshMinutes: 5,
    nextRefreshAt: "",
    lastRefreshAt: "",
    lastRefreshStatus: "Auto-refresh is off.",
    autoRefreshTargetTabId: null,
    minimumScore: 1,
    theme: "dark",
    selectedPair: "XAUUSD",
    watchedPairs: [
      "XAUUSD",
      "EURUSD",
      "GBPUSD",
      "USDJPY",
      "BTCUSD",
      "ETHUSD",
      "US100",
      "SPX500",
      "NASDAQ",
      "DOW",
      "USOIL"
    ],
    aiProvider: "openai",
    openAiApiKey: "",
    openAiModel: "gpt-4.1-mini",
    aiAutoAnalyze: false,
    aiAnalysisPrompt: DEFAULT_AI_ANALYSIS_PROMPT,
    aiBackendUrl: "",
    categories: globalThis.TNFScoring ? globalThis.TNFScoring.DEFAULT_CATEGORIES : [],
    enabledFilters: {
      highImpactOnly: false
    }
  };

  function getFromStorage(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  function setInStorage(payload) {
    return new Promise((resolve) => {
      chrome.storage.local.set(payload, resolve);
    });
  }

  async function getSettings() {
    const data = await getFromStorage([SETTINGS_KEY]);
    return {
      ...DEFAULT_SETTINGS,
      ...(data[SETTINGS_KEY] || {}),
      categories: mergeCategories(data[SETTINGS_KEY] && data[SETTINGS_KEY].categories)
    };
  }

  async function saveSettings(settings) {
    const current = await getSettings();
    const next = {
      ...current,
      ...settings,
      categories: settings.categories ? mergeCategories(settings.categories) : current.categories
    };
    await setInStorage({ [SETTINGS_KEY]: next });
    return next;
  }

  function mergeCategories(categories) {
    const source = Array.isArray(categories) ? categories : [];
    const byName = new Map(source.map((category) => [category.name, category]));

    return DEFAULT_SETTINGS.categories.map((defaultCategory) => {
      const stored = byName.get(defaultCategory.name);
      if (!stored) return { ...defaultCategory, keywords: [...defaultCategory.keywords] };
      return {
        ...defaultCategory,
        ...stored,
        keywords: Array.isArray(stored.keywords) ? stored.keywords : defaultCategory.keywords
      };
    });
  }

  async function getHistory() {
    const data = await getFromStorage([HISTORY_KEY]);
    return Array.isArray(data[HISTORY_KEY]) ? data[HISTORY_KEY] : [];
  }

  async function setHistory(items) {
    const cleanItems = globalThis.TNFUtils.uniqueById(items).sort((a, b) => b.impactScore - a.impactScore);
    await setInStorage({ [HISTORY_KEY]: cleanItems });
    return cleanItems;
  }

  async function saveTweet(tweet) {
    const history = await getHistory();
    const existing = history.some((item) => item.id === tweet.id);
    if (existing) return { saved: false, history };
    const next = await setHistory([tweet, ...history]);
    return { saved: true, history: next };
  }

  async function saveTweets(tweets) {
    const history = await getHistory();
    const knownIds = new Set(history.map((item) => item.id));
    const fresh = tweets.filter((tweet) => tweet && tweet.id && !knownIds.has(tweet.id));
    const next = await setHistory([...fresh, ...history]);
    return {
      savedCount: fresh.length,
      duplicateCount: tweets.length - fresh.length,
      history: next
    };
  }

  async function upsertTweets(tweets) {
    const history = await getHistory();
    const byId = new Map(history.map((item) => [item.id, item]));
    tweets.forEach((tweet) => {
      if (!tweet || !tweet.id) return;
      byId.set(tweet.id, {
        ...(byId.get(tweet.id) || {}),
        ...tweet
      });
    });
    return setHistory(Array.from(byId.values()));
  }

  async function clearHistory() {
    await setInStorage({ [HISTORY_KEY]: [] });
    return [];
  }

  async function getLastScan() {
    const data = await getFromStorage([LAST_SCAN_KEY]);
    return data[LAST_SCAN_KEY] || null;
  }

  async function setLastScan(scan) {
    await setInStorage({ [LAST_SCAN_KEY]: scan });
    return scan;
  }

  async function getSessionBrief() {
    const data = await getFromStorage([SESSION_BRIEF_KEY]);
    return data[SESSION_BRIEF_KEY] || null;
  }

  async function setSessionBrief(brief) {
    await setInStorage({ [SESSION_BRIEF_KEY]: brief });
    return brief;
  }

  function deduplicateTweets(tweets) {
    return globalThis.TNFUtils.uniqueById(tweets);
  }

  globalThis.TNFStorage = {
    SETTINGS_KEY,
    HISTORY_KEY,
    LAST_SCAN_KEY,
    SESSION_BRIEF_KEY,
    DEFAULT_AI_ANALYSIS_PROMPT,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getHistory,
    setHistory,
    saveTweet,
    saveTweets,
    upsertTweets,
    clearHistory,
    getLastScan,
    setLastScan,
    getSessionBrief,
    setSessionBrief,
    deduplicateTweets
  };
})();
