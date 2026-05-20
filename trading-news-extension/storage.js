(function () {
  "use strict";

  const SETTINGS_KEY = "tnf_settings";
  const HISTORY_KEY = "tnf_history";
  const LAST_SCAN_KEY = "tnf_last_scan";
  const SESSION_BRIEF_KEY = "tnf_session_brief";
  const JOURNAL_KEY = "tnf_journal";
  const LEGACY_DEFAULT_AI_ANALYSIS_PROMPT = [
    "Analyze the supplied X/Twitter news like a professional macro trader.",
    "Focus on market-moving impact for the selected pair or market.",
    "Prioritize fresh macro drivers: central banks, inflation, jobs data, yields, DXY, geopolitics, oil, risk sentiment, crypto liquidity, earnings, and indices.",
    "Separate bullish and bearish forces clearly.",
    "Mention exactly which supplied news items support the bias.",
    "If the news is weak, noisy, or contradictory, return mixed or neutral with low confidence.",
    "Do not invent external facts. Do not give trade entries, stop losses, or financial advice."
  ].join("\n");
  const DEFAULT_AI_ANALYSIS_PROMPT = [
    "Act as a senior institutional macro strategist and cross-asset trading desk analyst.",
    "Analyze only the supplied X/Twitter news. Do not use or invent outside facts.",
    "Think like a bank macro desk: identify the catalyst, transmission channel, asset sensitivity, market regime, and second-order effects.",
    "Focus on market-moving impact for the selected pair or market, but also explain spillovers across FX, rates, yields, DXY, commodities, crypto, equities, and indices.",
    "Prioritize central banks, inflation, jobs data, growth data, bond yields, DXY, geopolitics, oil/energy, risk sentiment, liquidity, earnings, and major policy headlines.",
    "Classify the setup as bullish, bearish, mixed, neutral, or unclear for the selected market, with confidence level and clear reasoning.",
    "Separate bullish and bearish forces in a balanced way. Highlight what would invalidate the current read.",
    "Mention exactly which supplied news items support each conclusion. If a conclusion is not supported by the supplied tweets, say so.",
    "Explain the likely market mechanism: why this headline can move price, what assets are most sensitive, and whether the impact is immediate, delayed, or uncertain.",
    "Distinguish hard macro catalysts from noise, rumors, recycled headlines, and low-quality commentary.",
    "If the news is weak, old, noisy, contradictory, or not directly relevant, return mixed or neutral with low confidence.",
    "Use concise professional language suitable for a trader reading a bank desk note.",
    "Do not provide trade entries, stop losses, take profits, position sizing, or financial advice.",
    "Do not tell the user to buy or sell. Provide context, risk, scenarios, and uncertainty only."
  ].join("\n");
  const DEFAULT_AI_KEYWORDS = [
    "gold",
    "xauusd",
    "usd",
    "dxy",
    "fed",
    "fomc",
    "powell",
    "cpi",
    "pce",
    "ppi",
    "nfp",
    "unemployment",
    "jobless claims",
    "yields",
    "us10y",
    "oil",
    "crude",
    "brent",
    "wti",
    "eurusd",
    "ecb",
    "bitcoin",
    "btc",
    "ethereum",
    "eth",
    "nasdaq",
    "s&p",
    "spx",
    "dow",
    "opec",
    "war",
    "geopolitical",
    "risk off",
    "risk on"
  ];

  const DEFAULT_SETTINGS = {
    autoRefreshEnabled: false,
    autoRefreshMinutes: 5,
    nextRefreshAt: "",
    lastRefreshAt: "",
    lastRefreshStatus: "Auto-refresh is off.",
    autoRefreshTargetTabId: null,
    autoRefreshTargetUrl: "",
    autoRefreshTargetTitle: "",
    autoShowSidebarEnabled: false,
    sidebarTargetUrl: "",
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
    openAiModel: "gpt-5.4-mini",
    aiAutoAnalyze: true,
    aiKeywordGateEnabled: true,
    aiKeywords: DEFAULT_AI_KEYWORDS,
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
    const stored = data[SETTINGS_KEY] || {};
    const aiAnalysisPrompt = !stored.aiAnalysisPrompt || stored.aiAnalysisPrompt === LEGACY_DEFAULT_AI_ANALYSIS_PROMPT
      ? DEFAULT_AI_ANALYSIS_PROMPT
      : stored.aiAnalysisPrompt;
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      aiAnalysisPrompt,
      categories: mergeCategories(stored.categories)
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

  async function getJournal() {
    const data = await getFromStorage([JOURNAL_KEY]);
    return Array.isArray(data[JOURNAL_KEY]) ? data[JOURNAL_KEY] : [];
  }

  async function setJournal(entries) {
    const cleanEntries = globalThis.TNFUtils.uniqueById(entries).sort((a, b) => {
      return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0);
    });
    await setInStorage({ [JOURNAL_KEY]: cleanEntries });
    return cleanEntries;
  }

  async function saveJournalEntry(entry) {
    const journal = await getJournal();
    const nextEntry = {
      ...entry,
      id: entry.id || globalThis.TNFUtils.simpleHash(`${entry.createdAt || Date.now()}:${(entry.linkedTweetIds || []).join(",")}:${entry.notes || ""}`),
      createdAt: entry.createdAt || new Date().toISOString()
    };
    return setJournal([nextEntry, ...journal]);
  }

  async function updateJournalEntry(entryId, patch) {
    const journal = await getJournal();
    const next = journal.map((entry) => {
      if (entry.id !== entryId) return entry;
      return {
        ...entry,
        ...patch,
        id: entry.id,
        updatedAt: new Date().toISOString()
      };
    });
    return setJournal(next);
  }

  async function deleteJournalEntry(entryId) {
    const journal = await getJournal();
    return setJournal(journal.filter((entry) => entry.id !== entryId));
  }

  async function clearJournal() {
    await setInStorage({ [JOURNAL_KEY]: [] });
    return [];
  }

  function deduplicateTweets(tweets) {
    return globalThis.TNFUtils.uniqueById(tweets);
  }

  globalThis.TNFStorage = {
    SETTINGS_KEY,
    HISTORY_KEY,
    LAST_SCAN_KEY,
    SESSION_BRIEF_KEY,
    JOURNAL_KEY,
    LEGACY_DEFAULT_AI_ANALYSIS_PROMPT,
    DEFAULT_AI_ANALYSIS_PROMPT,
    DEFAULT_AI_KEYWORDS,
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
    getJournal,
    setJournal,
    saveJournalEntry,
    updateJournalEntry,
    deleteJournalEntry,
    clearJournal,
    deduplicateTweets
  };
})();
