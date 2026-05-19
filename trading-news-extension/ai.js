(function () {
  "use strict";

  function buildMarketPrompt(tweets, pair, userPrompt) {
    const compactTweets = tweets.slice(0, 20).map((tweet, index) => ({
      index: index + 1,
      text: tweet.text,
      author: tweet.author,
      time: tweet.time,
      url: tweet.url,
      categories: tweet.categories,
      impactScore: tweet.impactScore,
      detectedKeywords: tweet.detectedKeywords
    }));

    return [
      "You are a Market Research Knowledge Terminal for active traders.",
      "Analyze only the supplied visible X/Twitter news items. Do not invent external facts.",
      `Target instrument or pair: ${pair}.`,
      "Return concise market-moving insight for Forex, crypto, stocks, indices, and macro context.",
      "Decide whether the supplied news flow is bullish, bearish, mixed, or neutral for the target instrument.",
      "Mention the specific news items that impacted the decision.",
      "Keep it practical and risk-aware. This is not financial advice.",
      "",
      "User analysis framework:",
      userPrompt || "Use the default market-moving macro analysis framework.",
      "",
      "News items JSON:",
      JSON.stringify(compactTweets, null, 2)
    ].join("\n");
  }

  function buildTweetPrompt(tweet, settings) {
    return [
      "You are an AI trading news analyst.",
      "Analyze this single X/Twitter news item for an active trader.",
      "Do not provide direct buy or sell signals.",
      "Do not predict with certainty.",
      "Do not tell the user to enter a trade.",
      "Focus only on context, risk, catalysts, affected assets, and caution.",
      "",
      `Tweet: ${tweet.text || ""}`,
      `Author: ${tweet.author || "Unknown"}`,
      `Time: ${tweet.time || tweet.timestamp || ""}`,
      `User watchlist: ${(settings.watchedPairs || []).join(", ")}`,
      `Trading style: ${settings.tradingProfile && settings.tradingProfile.style ? settings.tradingProfile.style : "intraday"}`,
      `Main session: ${settings.tradingProfile && settings.tradingProfile.mainSession ? settings.tradingProfile.mainSession : "Unknown"}`,
      `Output language: ${settings.tradingProfile && settings.tradingProfile.outputLanguage ? settings.tradingProfile.outputLanguage : "en"}`,
      "",
      "Custom user analysis framework:",
      settings.aiAnalysisPrompt || "",
      "",
      "Return ONLY valid JSON matching the requested schema."
    ].join("\n");
  }

  async function analyzeWithOpenAI({ apiKey, model, pair, tweets, userPrompt }) {
    if (!apiKey) {
      throw new Error("OpenAI API key is missing. Add it in Options, or use a local backend URL.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model || "gpt-4.1-mini",
        input: buildMarketPrompt(tweets, pair, userPrompt),
        text: {
          format: {
            type: "json_schema",
            name: "market_research_terminal_analysis",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                pair: { type: "string" },
                bias: { type: "string", enum: ["bullish", "bearish", "mixed", "neutral"] },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                headline: { type: "string" },
                macroSummary: { type: "string" },
                marketDrivers: {
                  type: "array",
                  items: { type: "string" }
                },
                impactedMarkets: {
                  type: "array",
                  items: { type: "string" }
                },
                bullishFactors: {
                  type: "array",
                  items: { type: "string" }
                },
                bearishFactors: {
                  type: "array",
                  items: { type: "string" }
                },
                keyNews: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      title: { type: "string" },
                      impact: { type: "string" },
                      sourceNumber: { type: "number" }
                    },
                    required: ["title", "impact", "sourceNumber"]
                  }
                },
                riskNotes: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: [
                "pair",
                "bias",
                "confidence",
                "headline",
                "macroSummary",
                "marketDrivers",
                "impactedMarkets",
                "bullishFactors",
                "bearishFactors",
                "keyNews",
                "riskNotes"
              ]
            },
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText.slice(0, 180)}`);
    }

    const data = await response.json();
    const text = extractOutputText(data);
    return JSON.parse(text);
  }

  async function analyzeTweetWithOpenAI(settings, tweet) {
    if (!settings.openAiApiKey) {
      throw new Error("OpenAI API key is missing.");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.openAiApiKey}`
      },
      body: JSON.stringify({
        model: settings.openAiModel || "gpt-4.1-mini",
        input: buildTweetPrompt(tweet, settings),
        text: {
          format: {
            type: "json_schema",
            name: "ai_tweet_analysis",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                tweetId: { type: "string" },
                isRelevant: { type: "boolean" },
                importance: { type: "string", enum: ["high", "medium", "low", "ignore"] },
                affectedAssets: { type: "array", items: { type: "string" } },
                marketBias: { type: "string", enum: ["bullish", "bearish", "mixed", "neutral", "unclear"] },
                riskTone: { type: "string", enum: ["risk-on", "risk-off", "cautious", "neutral", "unclear"] },
                summary: { type: "string" },
                whyItMatters: { type: "string" },
                mainDriver: { type: "string" },
                tradingWarning: { type: "string" },
                clarity: { type: "string", enum: ["high", "medium", "low"] },
                shouldNotify: { type: "boolean" }
              },
              required: [
                "tweetId",
                "isRelevant",
                "importance",
                "affectedAssets",
                "marketBias",
                "riskTone",
                "summary",
                "whyItMatters",
                "mainDriver",
                "tradingWarning",
                "clarity",
                "shouldNotify"
              ]
            },
            strict: true
          }
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI request failed: ${response.status} ${errorText.slice(0, 180)}`);
    }

    const data = await response.json();
    const text = extractOutputText(data);
    return normalizeTweetAnalysis(JSON.parse(text), tweet);
  }

  async function analyzeWithBackend({ backendUrl, pair, tweets }) {
    if (!backendUrl) {
      throw new Error("AI backend URL is missing.");
    }

    const response = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair, tweets })
    });

    if (!response.ok) {
      throw new Error(`AI backend failed: ${response.status}`);
    }

    return response.json();
  }

  async function analyzeMarketNews(settings, tweets) {
    const pair = settings.selectedPair || "XAUUSD";
    const pairTweets = filterTweetsForPair(tweets, pair);
    const analysisTweets = pairTweets.length > 0 ? pairTweets : tweets;

    if (analysisTweets.length === 0) {
      throw new Error("No news available for AI analysis. Run a scan first.");
    }

    if (settings.aiProvider === "backend" && settings.aiBackendUrl) {
      return analyzeWithBackend({
        backendUrl: settings.aiBackendUrl,
        pair,
        tweets: analysisTweets
      });
    }

    const result = await analyzeWithOpenAI({
      apiKey: settings.openAiApiKey,
      model: settings.openAiModel,
      pair,
      tweets: analysisTweets,
      userPrompt: settings.aiAnalysisPrompt
    });
    return {
      headline: result.headline || "Market read",
      pair: result.pair || pair,
      bias: result.bias || "neutral",
      confidence: result.confidence || "low",
      macroSummary: result.macroSummary || "",
      marketDrivers: result.marketDrivers || [],
      impactedMarkets: result.impactedMarkets || [],
      bullishFactors: result.bullishFactors || [],
      bearishFactors: result.bearishFactors || [],
      keyNews: result.keyNews || [],
      riskNotes: result.riskNotes || []
    };
  }

  async function analyzeTweet(settings, tweet) {
    try {
      return await analyzeTweetWithOpenAI(settings, tweet);
    } catch (error) {
      return {
        ...fallbackTweetAnalysis(tweet, settings),
        fallback: true,
        error: error.message || "AI tweet analysis failed."
      };
    }
  }

  function fallbackTweetAnalysis(tweet, settings) {
    const affectedAssets = globalThis.TNFCockpit
      ? globalThis.TNFCockpit.detectAffectedAssets(tweet, settings)
      : [];
    const contextScore = tweet.contextScore && Number.isFinite(tweet.contextScore.score)
      ? tweet.contextScore.score
      : Number(tweet.contextScoreValue || 0);
    const importance = contextScore >= 70 || tweet.impactScore >= 5
      ? "high"
      : contextScore >= 40 || tweet.impactScore >= 3
        ? "medium"
        : tweet.impactScore > 0
          ? "low"
          : "ignore";
    const direction = tweet.direction === "bullish" || tweet.direction === "bearish"
      ? tweet.direction
      : "neutral";
    return {
      tweetId: tweet.id,
      isRelevant: importance !== "ignore",
      importance,
      affectedAssets,
      marketBias: direction,
      riskTone: inferRiskTone(tweet),
      summary: tweet.summary || globalThis.TNFUtils.normalizeText(tweet.text).slice(0, 180),
      whyItMatters: tweet.reason || "Local fallback based on keyword relevance and context score.",
      mainDriver: tweet.macroTheme || (tweet.categories && tweet.categories[0]) || "Unknown",
      tradingWarning: "Local fallback only. Treat as context, not a trading signal.",
      clarity: tweet.contextClarity || (contextScore >= 70 ? "high" : contextScore >= 40 ? "medium" : "low"),
      shouldNotify: importance === "high"
    };
  }

  function normalizeTweetAnalysis(analysis, tweet) {
    return {
      tweetId: analysis.tweetId || tweet.id,
      isRelevant: Boolean(analysis.isRelevant),
      importance: analysis.importance || "low",
      affectedAssets: Array.isArray(analysis.affectedAssets) ? analysis.affectedAssets : [],
      marketBias: analysis.marketBias || "unclear",
      riskTone: analysis.riskTone || "unclear",
      summary: analysis.summary || "",
      whyItMatters: analysis.whyItMatters || "",
      mainDriver: analysis.mainDriver || "",
      tradingWarning: analysis.tradingWarning || "",
      clarity: analysis.clarity || "low",
      shouldNotify: Boolean(analysis.shouldNotify),
      fallback: false
    };
  }

  function inferRiskTone(tweet) {
    const text = `${tweet.text || ""} ${(tweet.detectedKeywords || []).join(" ")}`.toLowerCase();
    if (text.includes("risk off") || text.includes("war") || text.includes("escalation")) return "risk-off";
    if (text.includes("risk on") || text.includes("rally") || text.includes("surge")) return "risk-on";
    if (tweet.contextRiskLevel === "high") return "cautious";
    return "neutral";
  }

  function filterTweetsForPair(tweets, pair) {
    const keywords = getPairKeywords(pair);
    return tweets.filter((tweet) => {
      const haystack = `${tweet.text || ""} ${(tweet.categories || []).join(" ")} ${(tweet.detectedKeywords || []).join(" ")}`.toLowerCase();
      return keywords.some((keyword) => haystack.includes(keyword));
    });
  }

  function getPairKeywords(pair) {
    const normalized = String(pair || "").toUpperCase();
    const base = [normalized.toLowerCase()];
    const map = {
      XAUUSD: ["gold", "xau", "xauusd", "usd", "dxy", "fed", "cpi", "pce", "yields", "safe haven"],
      EURUSD: ["eurusd", "euro", "eur", "usd", "dxy", "ecb", "fed", "lagarde", "eurozone"],
      GBPUSD: ["gbpusd", "gbp", "pound", "boe", "usd", "fed", "dxy"],
      USDJPY: ["usdjpy", "jpy", "yen", "boj", "usd", "fed", "yields", "us10y"],
      BTCUSD: ["btcusd", "bitcoin", "btc", "crypto", "risk on", "risk off", "usd", "fed", "yields"],
      ETHUSD: ["ethusd", "ethereum", "eth", "crypto", "risk on", "risk off", "usd", "fed"],
      US100: ["us100", "nasdaq", "tech", "stocks", "yields", "fed", "risk on", "risk off"],
      SPX500: ["spx", "spx500", "s&p", "stocks", "equities", "fed", "risk on", "risk off"],
      NASDAQ: ["nasdaq", "us100", "tech", "stocks", "yields", "fed", "earnings"],
      DOW: ["dow", "djia", "stocks", "industrials", "fed", "earnings"],
      USOIL: ["usoil", "oil", "crude", "wti", "brent", "opec", "inventories", "middle east"]
    };
    return Array.from(new Set([...base, ...(map[normalized] || [])])).map((item) => item.toLowerCase());
  }

  function extractOutputText(data) {
    if (data.output_text) return data.output_text;
    const message = (data.output || []).find((item) => item.type === "message");
    const textPart = message && (message.content || []).find((item) => item.type === "output_text");
    if (textPart && textPart.text) return textPart.text;
    throw new Error("OpenAI response did not include output text.");
  }

  globalThis.TNFAI = {
    analyzeMarketNews,
    analyzeTweet,
    fallbackTweetAnalysis,
    filterTweetsForPair,
    getPairKeywords
  };
})();
