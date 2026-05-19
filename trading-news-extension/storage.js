(function () {
  "use strict";

  const SETTINGS_KEY = "tnf_settings";
  const HISTORY_KEY = "tnf_history";
  const LAST_SCAN_KEY = "tnf_last_scan";

  const DEFAULT_SETTINGS = {
    autoRefreshEnabled: false,
    autoRefreshMinutes: 5,
    nextRefreshAt: "",
    minimumScore: 1,
    theme: "dark",
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

  function deduplicateTweets(tweets) {
    return globalThis.TNFUtils.uniqueById(tweets);
  }

  globalThis.TNFStorage = {
    SETTINGS_KEY,
    HISTORY_KEY,
    LAST_SCAN_KEY,
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    getHistory,
    setHistory,
    saveTweet,
    saveTweets,
    clearHistory,
    getLastScan,
    setLastScan,
    deduplicateTweets
  };
})();
