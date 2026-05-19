(function () {
  "use strict";

  const X_HOSTS = ["x.com", "twitter.com", "www.x.com", "www.twitter.com"];

  function isTwitterUrl(url) {
    try {
      const parsed = new URL(url);
      return X_HOSTS.includes(parsed.hostname);
    } catch (error) {
      return false;
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeCsv(value) {
    const text = String(value || "");
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function toCsv(items) {
    const headers = [
      "id",
      "impactScore",
      "importanceLabel",
      "categories",
      "detectedKeywords",
      "direction",
      "contextScoreValue",
      "contextRiskLevel",
      "contextClarity",
      "affectedAssets",
      "macroTheme",
      "author",
      "time",
      "url",
      "reason",
      "summary",
      "text",
      "createdAt"
    ];

    const rows = items.map((item) =>
      headers
        .map((header) => {
          const value = Array.isArray(item[header])
            ? item[header].join("; ")
            : item[header];
          return escapeCsv(value);
        })
        .join(",")
    );

    return [headers.join(","), ...rows].join("\n");
  }

  function downloadText(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function simpleHash(input) {
    const text = normalizeText(input).toLowerCase();
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(index);
      hash |= 0;
    }
    return `h_${Math.abs(hash)}`;
  }

  function uniqueById(items) {
    const seen = new Set();
    const result = [];
    items.forEach((item) => {
      if (!item || !item.id || seen.has(item.id)) return;
      seen.add(item.id);
      result.push(item);
    });
    return result;
  }

  function formatDateTime(isoDate) {
    if (!isoDate) return "Never";
    try {
      return new Date(isoDate).toLocaleString();
    } catch (error) {
      return String(isoDate);
    }
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (Number.isNaN(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  globalThis.TNFUtils = {
    isTwitterUrl,
    normalizeText,
    escapeCsv,
    toCsv,
    downloadText,
    simpleHash,
    uniqueById,
    formatDateTime,
    clampNumber
  };
})();
