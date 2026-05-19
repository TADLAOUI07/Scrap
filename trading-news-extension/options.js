(function () {
  "use strict";

  let settings = null;

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindElements();
    bindEvents();
    settings = await TNFStorage.getSettings();
    render();
  }

  function bindElements() {
    [
      "autoRefreshEnabled",
      "autoRefreshState",
      "autoRefreshMinutes",
      "minimumScore",
      "selectedPair",
      "watchedPairs",
      "theme",
      "openAiApiKey",
      "openAiModel",
      "aiAutoAnalyze",
      "aiBackendUrl",
      "categoryList",
      "saveSettings",
      "exportSettings",
      "importSettings",
      "resetSettings",
      "message"
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.saveSettings.addEventListener("click", save);
    els.exportSettings.addEventListener("click", exportSettings);
    els.importSettings.addEventListener("change", importSettings);
    els.resetSettings.addEventListener("click", resetSettings);
    els.autoRefreshEnabled.addEventListener("change", () => {
      els.autoRefreshState.textContent = `Auto-refresh: ${els.autoRefreshEnabled.checked ? "ON" : "OFF"}`;
    });
  }

  function render() {
    els.autoRefreshEnabled.checked = Boolean(settings.autoRefreshEnabled);
    els.autoRefreshMinutes.value = settings.autoRefreshMinutes || 5;
    els.autoRefreshState.textContent = `Auto-refresh: ${settings.autoRefreshEnabled ? "ON" : "OFF"} | every ${settings.autoRefreshMinutes || 5} min`;
    els.minimumScore.value = settings.minimumScore;
    renderPairOptions();
    els.watchedPairs.value = (settings.watchedPairs || []).join(", ");
    els.theme.value = settings.theme;
    els.openAiApiKey.value = settings.openAiApiKey || "";
    els.openAiModel.value = settings.openAiModel || "gpt-4.1-mini";
    els.aiAutoAnalyze.checked = Boolean(settings.aiAutoAnalyze);
    els.aiBackendUrl.value = settings.aiBackendUrl || "";
    renderCategories();
  }

  function renderPairOptions() {
    const pairs = settings.watchedPairs && settings.watchedPairs.length
      ? settings.watchedPairs
      : TNFStorage.DEFAULT_SETTINGS.watchedPairs;
    els.selectedPair.innerHTML = pairs
      .map((pair) => `<option value="${escapeAttribute(pair)}">${escapeHtml(pair)}</option>`)
      .join("");
    els.selectedPair.value = settings.selectedPair || pairs[0];
  }

  function renderCategories() {
    els.categoryList.innerHTML = "";
    settings.categories.forEach((category, index) => {
      const card = document.createElement("article");
      card.className = "category-card";
      card.innerHTML = `
        <div class="category-head">
          <h3>${escapeHtml(category.name)}</h3>
          <label class="row">
            <span>Enabled</span>
            <input type="checkbox" data-enabled="${index}" ${category.enabled !== false ? "checked" : ""}>
          </label>
        </div>
        <label>
          Keywords, comma-separated
          <textarea data-keywords="${index}">${escapeHtml(category.keywords.join(", "))}</textarea>
        </label>
      `;
      els.categoryList.appendChild(card);
    });
  }

  async function save() {
    const nextSettings = readSettingsFromForm();
    settings = await TNFStorage.saveSettings(nextSettings);

    await chrome.runtime.sendMessage({
      type: "TNF_SET_AUTO_REFRESH",
      enabled: settings.autoRefreshEnabled,
      minutes: settings.autoRefreshMinutes
    });

    render();
    showMessage("Settings saved.");
  }

  function readSettingsFromForm() {
    const categories = settings.categories.map((category, index) => {
      const enabled = document.querySelector(`[data-enabled="${index}"]`).checked;
      const keywordText = document.querySelector(`[data-keywords="${index}"]`).value;
      const keywords = keywordText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      return {
        ...category,
        enabled,
        keywords
      };
    });

    return {
      autoRefreshEnabled: els.autoRefreshEnabled.checked,
      autoRefreshMinutes: TNFUtils.clampNumber(els.autoRefreshMinutes.value, 5, 1440),
      minimumScore: TNFUtils.clampNumber(els.minimumScore.value, 0, 5),
      selectedPair: els.selectedPair.value,
      watchedPairs: els.watchedPairs.value
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
      theme: els.theme.value,
      openAiApiKey: els.openAiApiKey.value.trim(),
      openAiModel: els.openAiModel.value.trim() || "gpt-4.1-mini",
      aiAutoAnalyze: els.aiAutoAnalyze.checked,
      aiBackendUrl: els.aiBackendUrl.value.trim(),
      categories
    };
  }

  function exportSettings() {
    const payload = JSON.stringify(readSettingsFromForm(), null, 2);
    TNFUtils.downloadText(`trading-news-settings-${Date.now()}.json`, payload, "application/json");
  }

  async function importSettings(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      settings = await TNFStorage.saveSettings(imported);
      render();
      showMessage("Settings imported.");
    } catch (error) {
      showMessage("Import failed. Use a valid JSON settings file.");
    } finally {
      event.target.value = "";
    }
  }

  async function resetSettings() {
    settings = await TNFStorage.saveSettings(TNFStorage.DEFAULT_SETTINGS);
    await chrome.runtime.sendMessage({ type: "TNF_SET_AUTO_REFRESH", enabled: false, minutes: 5 });
    render();
    showMessage("Settings reset.");
  }

  function showMessage(text) {
    els.message.hidden = !text;
    els.message.textContent = text || "";
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
