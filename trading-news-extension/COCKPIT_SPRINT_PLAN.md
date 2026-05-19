# Sprint Plan — Adaptation de l’extension X/Twitter News vers un AI Trading Context Cockpit

## Objectif global

Transformer l’extension Chrome Manifest V3 actuelle en un assistant de contexte trading inspiré de la logique produit de HybridTrader, sans copier son branding, son design exact, son code, ses textes propriétaires ou sa logique privée.

L’objectif n’est PAS de créer un service de signaux de trading.

L’objectif est de transformer les tweets visibles d’un compte X/Twitter news en :

- contexte macro compréhensible ;
- score de risque/contexte ;
- biais par actif ;
- résumé de session ;
- détection de calendar risk ;
- journal de décision ;
- coaching basé sur les erreurs et habitudes du trader ;
- rapport quotidien exportable.

---



## Contraintes UI

1. Interface claire, compacte, simple à lire pendant une session de trading.
2. Dark/light/system theme.
3. Sidebar transformée en dashboard avec onglets.
4. Pas de design copié d’un outil existant.
5. Tous les scores doivent être expliqués avec des badges simples.
6. Les boutons doivent être clairs : Save to Journal, Ask AI, Open Tweet, Hide, Export.

---


# Vision cible

Nouvelle identité fonctionnelle :

## AI Trading Context Cockpit for X/Twitter News

L’extension doit suivre ce workflow :

```text
Before session:
- Session Brief
- Calendar Risk
- Main macro drivers

During session:
- Live tweet monitoring
- Context Edge Score
- Macro Desk
- Instrument Bias

After session:
- Save decisions to Journal
- Coaching Review
- Daily Report
```

---

# Nouvelles sections de la sidebar

Remplacer la sidebar simple par une sidebar dashboard avec ces onglets :

1. Today
2. Macro Desk
3. Assets
4. Calendar Risk
5. Journal
6. Coach
7. Settings

---

# Sprint 0 — Audit et préparation technique

## Objectif

Comprendre le code existant, identifier les fichiers, préparer les types et ne rien casser.

## Tâches

- Lire toute l’architecture existante.
- Identifier :
  - manifest.json
  - background service worker
  - content script
  - popup files
  - sidebar files
  - options page
  - storage utilities
  - AI/OpenAI utilities
  - export utilities
  - types/interfaces existants
- Vérifier comment les tweets sont capturés.
- Vérifier comment les scores locaux sont calculés.
- Vérifier comment les données sont stockées.
- Vérifier comment la sidebar est injectée.
- Préparer une branche ou un plan de modification.

## Critères d’acceptation

- L’extension build sans erreur.
- Les fonctionnalités actuelles continuent de marcher.
- Aucun fichier clé n’est supprimé sans justification.
- Les zones à modifier sont clairement identifiées.

## Résultat attendu

Un résumé technique indiquant :

- fichiers à modifier ;
- fichiers à créer ;
- risques techniques ;
- ordre recommandé d’implémentation.

---

# Sprint 1 — Data Models et architecture interne

## Objectif

Créer les structures de données nécessaires pour supporter le nouveau cockpit.

## Nouveaux types/interfaces à créer ou mettre à jour

### CapturedTweet

```ts
export interface CapturedTweet {
  id: string;
  url?: string;
  text: string;
  author?: string;
  handle?: string;
  timestamp?: string;
  capturedAt: string;
  textHash: string;
  rawHtml?: string;
}
```

### LocalTweetAnalysis

```ts
export interface LocalTweetAnalysis {
  tweetId: string;
  matched: boolean;
  categories: string[];
  matchedKeywords: string[];
  localScore: number; // 0-5
  directionHint: "bullish" | "bearish" | "neutral" | "unclear";
  affectedAssets: string[];
  importance: "high" | "medium" | "low" | "ignore";
}
```

### AiTweetAnalysis

```ts
export interface AiTweetAnalysis {
  tweetId: string;
  isRelevant: boolean;
  importance: "high" | "medium" | "low" | "ignore";
  affectedAssets: string[];
  marketBias: "bullish" | "bearish" | "mixed" | "neutral" | "unclear";
  riskTone: "risk-on" | "risk-off" | "cautious" | "neutral" | "unclear";
  summary: string;
  whyItMatters: string;
  mainDriver: string;
  tradingWarning: string;
  clarity: "high" | "medium" | "low";
  shouldNotify: boolean;
}
```

### ContextScore

```ts
export interface ContextScore {
  tweetId?: string;
  score: number; // 0-100
  reasons: string[];
  penalties: string[];
  clarity: "high" | "medium" | "low";
  riskLevel: "low" | "medium" | "high";
}
```

### SessionBrief

```ts
export interface SessionBrief {
  id: string;
  generatedAt: string;
  session: "London" | "New York" | "Asia" | "Unknown";
  riskTone: "risk-on" | "risk-off" | "cautious" | "neutral" | "unclear";
  keyDriver: string;
  assetsToWatch: string[];
  avoid: string[];
  topNews: {
    tweetId?: string;
    summary: string;
    affectedAssets: string[];
    importance: "high" | "medium" | "low";
    whyItMatters: string;
  }[];
  sessionPlan: string;
  averageContextScore: number;
}
```

### MacroTheme

```ts
export interface MacroTheme {
  id: string;
  generatedAt: string;
  theme:
    | "USD / Rates"
    | "Fed / Central Banks"
    | "Inflation"
    | "Jobs Data"
    | "Geopolitics"
    | "Oil / Energy"
    | "Risk Sentiment"
    | "Equities / Tech"
    | "Crypto"
    | "Commodities / Gold"
    | "Other";
  narrativeSummary: string;
  affectedAssets: string[];
  tone: "bullish" | "bearish" | "mixed" | "neutral" | "unclear";
  supportingTweetIds: string[];
  conflictingTweetIds: string[];
  confidence: number; // 0-100
}
```

### InstrumentBias

```ts
export interface InstrumentBias {
  symbol: string;
  generatedAt: string;
  newsBias: "bullish" | "bearish" | "mixed" | "neutral" | "unclear";
  confidence: number; // 0-100
  mainDrivers: string[];
  supportingTweetIds: string[];
  conflictingTweetIds: string[];
  riskWarning: string;
  tradingContext: string;
}
```

### CalendarRiskItem

```ts
export interface CalendarRiskItem {
  id: string;
  eventName: string;
  detectedTerms: string[];
  mentionsCount: number;
  affectedAssets: string[];
  riskLevel: "low" | "medium" | "high";
  relatedTweetIds: string[];
  warning: string;
}
```

### JournalEntry

```ts
export interface JournalEntry {
  id: string;
  createdAt: string;
  linkedTweetIds: string[];
  instrument: string;
  tradeIdea: "long" | "short" | "no_trade" | "watch_only";
  setup:
    | "breakout"
    | "retest"
    | "range"
    | "reversal"
    | "news_reaction"
    | "other";
  confidence: number; // 1-5
  emotion:
    | "calm"
    | "fomo"
    | "angry"
    | "fearful"
    | "confident"
    | "tired"
    | "other";
  followedPlan: boolean;
  result: "win" | "loss" | "breakeven" | "skipped" | "pending";
  notes: string;
  marketContextSnapshot: {
    riskTone?: string;
    mainDriver?: string;
    contextScore?: number;
    affectedAssets?: string[];
  };
}
```

### CoachingReview

```ts
export interface CoachingReview {
  id: string;
  generatedAt: string;
  period: "daily" | "weekly" | "monthly" | "custom";
  strengths: string[];
  weaknesses: string[];
  behaviorPatterns: string[];
  riskPatterns: string[];
  commonMistakes: string[];
  bestSession?: string;
  worstSession?: string;
  rulesToImprove: string[];
  nextSessionFocus: string;
}
```

### DailyReport

```ts
export interface DailyReport {
  id: string;
  generatedAt: string;
  date: string;
  sessionSummary: string;
  topMacroThemes: MacroTheme[];
  topAssetsToWatch: InstrumentBias[];
  highestImpactTweetIds: string[];
  calendarRisk: CalendarRiskItem[];
  journalNotes: string[];
  coachingInsight: string;
  mistakesToAvoidTomorrow: string[];
}
```

### ExtensionSettings

```ts
export interface ExtensionSettings {
  theme: "system" | "light" | "dark";
  minLocalScore: number;
  autoRefreshEnabled: boolean;
  autoRefreshIntervalMinutes: number;
  watchedMarkets: string[];
  defaultMarket: string;
  categories: Record<string, {
    enabled: boolean;
    keywords: string[];
  }>;
  openAiApiKey?: string;
  openAiModel: string;
  customAiPrompt?: string;
  aiBackendUrl?: string;
  tradingProfile: {
    style: "scalping" | "intraday" | "swing";
    mainSession: "London" | "New York" | "Asia";
    riskMode: "conservative" | "normal" | "aggressive";
    experienceLevel: "beginner" | "intermediate" | "advanced";
    outputLanguage: "fr" | "en" | "ar";
    noSignalMode: boolean;
  };
  journalSettings: {
    trackEmotion: boolean;
    trackConfidence: boolean;
    trackResult: boolean;
    trackFollowedPlan: boolean;
  };
}
```

## Critères d’acceptation

- Tous les types sont créés.
- Les anciens types restent compatibles.
- Les nouvelles données peuvent être stockées localement.
- Aucun conflit de nommage.
- Build sans erreur.

---

# Sprint 2 — Context Edge Score 0-100

## Objectif

Améliorer le score actuel 0-5 avec un score de contexte 0-100.

## Règle

Le score 0-5 existant reste utilisé pour le filtrage local rapide.

Le nouveau score 0-100 sert à mesurer la qualité du contexte trading.

## Scoring recommandé

```text
+20 si news high impact
+15 si un actif surveillé est concerné
+15 si Fed/USD/CPI/NFP/FOMC/rates/inflation/jobs data
+10 si news très récente
+10 si direction claire
+10 si plusieurs tweets confirment le même thème
+10 si news pertinente pour la session active
+10 si risque événementiel important
-15 si news contradictoire
-10 si clarté faible
-10 si headline risk / volatilité excessive
```

## Tâches

- Créer une fonction `calculateContextScore()`.
- La fonction prend :
  - tweet ;
  - analyse locale ;
  - analyse IA optionnelle ;
  - watched markets ;
  - tweets récents ;
  - settings utilisateur.
- Retourner :
  - score 0-100 ;
  - reasons ;
  - penalties ;
  - clarity ;
  - riskLevel.
- Ajouter affichage dans les tweet cards.
- Ajouter couleurs/badges :
  - 0-39 : low context
  - 40-69 : medium context
  - 70-100 : high context

## Critères d’acceptation

- Chaque tweet pertinent affiche :
  - local score 0-5 ;
  - context score 0-100 ;
  - reasons ;
  - risk level ;
  - clarity.
- Si l’IA est désactivée, le score fonctionne en local.
- Aucun signal direct buy/sell n’est affiché.

---

# Sprint 3 — AI Tweet Analysis

## Objectif

Améliorer l’analyse IA par tweet avec un format JSON stable.

## Prompt par défaut

```text
You are an AI trading news analyst.

Analyze this tweet for an active trader.

Tweet:
{{tweet_text}}

User watchlist:
{{watchlist}}

Trading style:
{{trading_style}}

Main session:
{{main_session}}

Output language:
{{output_language}}

Return ONLY valid JSON:

{
  "is_relevant": true,
  "importance": "high",
  "affected_assets": ["XAUUSD", "NASDAQ"],
  "market_bias": "bullish | bearish | mixed | neutral | unclear",
  "risk_tone": "risk-on | risk-off | cautious | neutral | unclear",
  "summary": "short simple summary",
  "why_it_matters": "why this matters for traders",
  "main_driver": "main market driver",
  "trading_warning": "what to be careful about",
  "clarity": "high | medium | low",
  "should_notify": true
}

Rules:
- Do not provide direct buy or sell signals.
- Do not predict with certainty.
- Do not tell the user to enter a trade.
- Focus on context, risk, catalysts, affected assets, and caution.
- Be concise and beginner-friendly.
```

## Tâches

- Créer ou améliorer le service OpenAI.
- Ajouter parsing JSON robuste.
- Ajouter fallback si l’IA échoue.
- Ajouter gestion des erreurs :
  - API key missing ;
  - rate limit ;
  - invalid JSON ;
  - network error.
- Ajouter bouton “Ask AI” sur chaque tweet card.
- Ajouter option pour relancer l’analyse IA.

## Critères d’acceptation

- Analyse IA retourne toujours un objet utilisable ou fallback.
- L’extension ne crash pas si OpenAI échoue.
- Aucun prompt ne contient d’ordre buy/sell.
- L’utilisateur peut désactiver l’IA.

---

# Sprint 4 — Sidebar Dashboard avec onglets

## Objectif

Transformer la sidebar actuelle en vrai cockpit.

## Onglets

1. Today
2. Macro Desk
3. Assets
4. Calendar Risk
5. Journal
6. Coach
7. Settings

## Tâches

- Refactor sidebar existante.
- Ajouter tab navigation.
- Garder bouton Show/Hide Sidebar.
- Garder affichage des tweets importants.
- Ajouter composants réutilisables :
  - ScoreBadge
  - RiskBadge
  - BiasBadge
  - TweetCard
  - EmptyState
  - LoadingState
  - ErrorState

## Today Tab

Afficher :

- Session Brief.
- Average Context Score.
- Main Driver.
- Risk Tone.
- Assets to Watch.
- Avoid Today.
- Top important tweets.

## Critères d’acceptation

- Sidebar fonctionne sur x.com et twitter.com.
- UI lisible.
- Pas de régression avec scan actuel.
- Les tweets scannés apparaissent toujours.
- Les nouveaux onglets peuvent être vides au début mais ne doivent pas casser l’extension.

---

# Sprint 5 — AI Session Brief

## Objectif

Créer un résumé de session à partir des tweets pertinents.

## Fonctionnalité

Bouton :

```text
Generate Session Brief
```

Option :

```text
Auto-generate after scan
```

## Prompt

```text
You are an AI trading context assistant.

Prepare a pre-session brief from recent tweets captured from X/Twitter.

Do not provide buy or sell signals.
Do not predict the market with certainty.
Focus on macro context, event risk, affected assets, risk tone, and trading caution.

User watchlist:
{{WATCHLIST}}

Trading style:
{{TRADING_STYLE}}

Trading session:
{{SESSION_NAME}}

Recent relevant tweets:
{{TWEETS}}

Return ONLY valid JSON:

{
  "session": "London | New York | Asia | Unknown",
  "risk_tone": "risk-on | risk-off | cautious | neutral | unclear",
  "key_driver": "main macro/news driver",
  "assets_to_watch": ["XAUUSD", "NASDAQ", "DXY"],
  "avoid": ["specific trading mistakes to avoid"],
  "top_news": [
    {
      "tweet_id": "optional id",
      "summary": "short summary",
      "affected_assets": ["XAUUSD"],
      "importance": "high",
      "why_it_matters": "short explanation"
    }
  ],
  "session_plan": "beginner-friendly preparation advice without trade signals",
  "average_context_score": 0
}
```

## Tâches

- Créer `generateSessionBrief()`.
- Utiliser les tweets pertinents récents.
- Sauvegarder le brief dans Chrome storage.
- Afficher dans Today tab.
- Ajouter bouton export Markdown pour le brief.

## Critères d’acceptation

- Le brief est généré à partir des tweets récents.
- Le brief ne donne aucun signal direct.
- Le brief affiche :
  - risk tone ;
  - key driver ;
  - assets to watch ;
  - avoid ;
  - top news ;
  - session plan.
- Si OpenAI désactivé, afficher un brief local basique.

---

# Sprint 6 — Macro Desk

## Objectif

Créer une vision macro groupée par thèmes.

## Thèmes obligatoires

- USD / Rates
- Fed / Central Banks
- Inflation
- Jobs Data
- Geopolitics
- Oil / Energy
- Risk Sentiment
- Equities / Tech
- Crypto
- Commodities / Gold
- Other

## Tâches

- Créer `groupTweetsByMacroTheme()`.
- Créer un résumé local par thème.
- Si IA activée, générer une narrative plus propre.
- Ajouter Macro Desk tab.
- Afficher :
  - theme ;
  - narrative summary ;
  - affected assets ;
  - tone ;
  - confidence ;
  - supporting tweets ;
  - conflicting tweets.

## Prompt IA

```text
You are an AI macro desk assistant for traders.

Group the following trading-related tweets into macro themes.

Tweets:
{{TWEETS}}

Themes allowed:
- USD / Rates
- Fed / Central Banks
- Inflation
- Jobs Data
- Geopolitics
- Oil / Energy
- Risk Sentiment
- Equities / Tech
- Crypto
- Commodities / Gold
- Other

Return ONLY valid JSON:

{
  "themes": [
    {
      "theme": "USD / Rates",
      "narrative_summary": "short macro narrative",
      "affected_assets": ["XAUUSD", "EURUSD", "NASDAQ"],
      "tone": "bullish | bearish | mixed | neutral | unclear",
      "supporting_tweet_ids": [],
      "conflicting_tweet_ids": [],
      "confidence": 0
    }
  ]
}

Rules:
- No buy/sell signals.
- Explain market context only.
- Mention uncertainty when needed.
```

## Critères d’acceptation

- Les tweets sont groupés correctement.
- Un thème dominant est identifiable.
- Les contradictions sont visibles.
- La tab Macro Desk reste lisible même sans IA.

---

# Sprint 7 — Instrument Bias

## Objectif

Créer une fiche de biais news par actif surveillé.

## Actifs supportés

- XAUUSD
- EURUSD
- BTCUSD
- US100
- SPX500
- USOIL
- DXY

## Tâches

- Créer `generateInstrumentBias()`.
- Pour chaque watched market :
  - récupérer tweets liés ;
  - déterminer news bias ;
  - calculer confidence ;
  - lister main drivers ;
  - lister supporting/conflicting tweets ;
  - créer risk warning ;
  - créer trading context.
- Ajouter Assets tab.

## Prompt IA

```text
You are an AI trading context analyst.

Create a news-based instrument bias for each watched asset.

Watched assets:
{{WATCHLIST}}

Recent relevant tweets:
{{TWEETS}}

Return ONLY valid JSON:

{
  "instrument_biases": [
    {
      "symbol": "XAUUSD",
      "news_bias": "bullish | bearish | mixed | neutral | unclear",
      "confidence": 0,
      "main_drivers": [],
      "supporting_tweet_ids": [],
      "conflicting_tweet_ids": [],
      "risk_warning": "short warning",
      "trading_context": "context explanation without trade signal"
    }
  ]
}

Rules:
- Do not provide entry, stop loss, or take profit.
- Do not tell the user to buy or sell.
- Focus on context and uncertainty.
```

## Critères d’acceptation

- Chaque actif surveillé a sa fiche.
- Les drivers sont compréhensibles.
- Les contradictions sont affichées.
- Pas de signal direct.

---

# Sprint 8 — Calendar Risk

## Objectif

Détecter les risques liés au calendrier économique depuis les tweets.

## Termes à détecter

- CPI
- PPI
- NFP
- Nonfarm Payrolls
- Unemployment Claims
- Jobless Claims
- FOMC
- Fed Minutes
- Powell
- ISM
- PMI
- GDP
- Retail Sales
- ECB
- BoE
- BoJ
- OPEC
- EIA Crude Inventories
- Crude Inventories
- Rate Decision
- Interest Rates
- Inflation Data

## Tâches

- Créer dictionnaire de termes.
- Créer `detectCalendarRisk()`.
- Compter les mentions.
- Relier les tweets.
- Estimer riskLevel.
- Ajouter Calendar Risk tab.
- Afficher :
  - event name ;
  - mentions count ;
  - related tweets ;
  - affected assets ;
  - risk level ;
  - warning.

## Critères d’acceptation

- Les événements importants sont détectés.
- La tab fonctionne sans API externe.
- Les warnings sont prudents.
- Pas de calendrier externe obligatoire.

---

# Sprint 9 — Dynamic Journal

## Objectif

Transformer les tweets/news en journal de décision trading.

## Bouton à ajouter

Sur chaque tweet card :

```text
Save to Journal
```

## Formulaire journal

Champs :

- Instrument
- Trade idea :
  - long
  - short
  - no trade
  - watch only
- Setup :
  - breakout
  - retest
  - range
  - reversal
  - news reaction
  - other
- Confidence 1-5
- Emotion :
  - calm
  - FOMO
  - angry
  - fearful
  - confident
  - tired
  - other
- Followed plan : yes/no
- Result :
  - win
  - loss
  - breakeven
  - skipped
  - pending
- Notes

## Tâches

- Créer storage pour JournalEntry.
- Ajouter modal ou panel de création.
- Lier tweet IDs au journal.
- Sauvegarder snapshot du contexte :
  - riskTone ;
  - mainDriver ;
  - contextScore ;
  - affectedAssets.
- Ajouter Journal tab.
- Ajouter filtres :
  - by instrument ;
  - by result ;
  - by emotion ;
  - by date.
- Ajouter edit/delete.
- Ajouter export JSON/CSV.

## Critères d’acceptation

- Un tweet peut être sauvegardé dans le journal.
- Un journal peut exister sans trade réel : watch only / skipped.
- Les entrées sont modifiables.
- Les entrées sont exportables.
- Aucun bug si le tweet source est supprimé de la page.

---

# Sprint 10 — AI Coaching Review

## Objectif

Analyser le journal pour aider l’utilisateur à progresser.

## Fonctionnalité

Bouton :

```text
Generate Coaching Review
```

## Prompt IA

```text
You are an AI trading performance coach.

Analyze the user's trading journal and news context.

Do not give financial advice.
Do not recommend specific buy/sell trades.
Focus on behavior, execution quality, risk management, and decision patterns.

Journal entries:
{{JOURNAL_ENTRIES}}

Return ONLY valid JSON:

{
  "strengths": [],
  "weaknesses": [],
  "behavior_patterns": [],
  "risk_patterns": [],
  "common_mistakes": [],
  "best_session": "",
  "worst_session": "",
  "rules_to_improve": [],
  "next_session_focus": ""
}
```

## Tâches

- Créer `generateCoachingReview()`.
- Utiliser les 20 à 50 dernières entrées.
- Ajouter Coach tab.
- Afficher :
  - strengths ;
  - weaknesses ;
  - behavior patterns ;
  - risk patterns ;
  - mistakes ;
  - rules to improve ;
  - next session focus.
- Ajouter fallback local simple :
  - win rate par émotion ;
  - résultats par instrument ;
  - résultats par followedPlan ;
  - fréquence FOMO ;
  - nombre de skipped trades.

## Critères d’acceptation

- Le coaching est basé sur le journal réel.
- Il ne donne pas de signaux.
- Il donne des règles comportementales.
- Il fonctionne même avec peu d’entrées, avec message “not enough data”.

---

# Sprint 11 — Daily Report

## Objectif

Créer un rapport quotidien complet exportable.

## Contenu du rapport

- Session summary
- Risk tone
- Key driver
- Top macro themes
- Top assets to watch
- Highest impact tweets
- Calendar risk
- Journal notes
- Coaching insight
- Mistakes to avoid tomorrow

## Prompt IA

```text
You are an AI trading report assistant.

Create a daily trading context report based on:
- recent captured tweets,
- macro themes,
- instrument biases,
- calendar risk,
- journal entries,
- coaching observations.

Do not give financial advice.
Do not provide buy or sell signals.

Data:
{{DATA}}

Return ONLY valid JSON:

{
  "session_summary": "",
  "top_macro_themes": [],
  "top_assets_to_watch": [],
  "highest_impact_tweet_ids": [],
  "calendar_risk": [],
  "journal_notes": [],
  "coaching_insight": "",
  "mistakes_to_avoid_tomorrow": []
}
```

## Tâches

- Créer `generateDailyReport()`.
- Ajouter bouton dans Today ou Coach.
- Sauvegarder le rapport.
- Exporter :
  - JSON ;
  - CSV partiel ;
  - Markdown.
- Ajouter historique des rapports.

## Critères d’acceptation

- Rapport généré correctement.
- Export Markdown lisible.
- Rapport ne contient pas de signal direct.
- Fonctionne avec IA ou fallback local.

---

# Sprint 12 — Options Page avancée

## Objectif

Ajouter les paramètres nécessaires au cockpit.

## Nouvelles sections options

### Trading Profile

- Trading style :
  - Scalping
  - Intraday
  - Swing
- Main session :
  - London
  - New York
  - Asia
- Risk mode :
  - Conservative
  - Normal
  - Aggressive
- Experience level :
  - Beginner
  - Intermediate
  - Advanced
- Output language :
  - French
  - English
  - Arabic
- No signal mode :
  - ON par défaut

### AI Behavior

- Enable OpenAI analysis
- OpenAI API key
- OpenAI model
- Custom tweet analysis prompt
- Custom session brief prompt
- Custom coaching prompt
- Max tweets per AI request
- AI Backend URL future

### Journal Settings

- Track emotion
- Track confidence
- Track result
- Track followed plan

### Export / Import

- Export all settings
- Import settings JSON
- Reset settings
- Export all local data
- Clear local data

## Critères d’acceptation

- Tous les paramètres sont persistés.
- Valeurs par défaut propres.
- Reset fonctionne.
- Import/export settings fonctionne.
- No signal mode est ON par défaut.

---

# Sprint 13 — Export complet

## Objectif

Améliorer les exports pour supporter le nouveau cockpit.

## Exports à supporter

### Tweets

- Raw scan JSON
- Raw scan CSV
- Filtered news JSON
- Filtered news CSV

### Journal

- Journal JSON
- Journal CSV

### Reports

- Session Brief Markdown
- Daily Report Markdown
- Daily Report JSON
- Coaching Review JSON
- Coaching Review Markdown

### Full Backup

- Settings
- Captured tweets
- Analyses
- Session briefs
- Macro themes
- Instrument biases
- Calendar risk items
- Journal entries
- Coaching reviews
- Daily reports

## Critères d’acceptation

- Les exports existants continuent de fonctionner.
- Nouveaux exports ajoutés.
- Les fichiers sont générés localement.
- Pas de backend obligatoire.

---

# Sprint 14 — Sécurité, robustesse, performance

## Objectif

Rendre l’extension fiable.

## Tâches

- Vérifier Manifest V3 permissions.
- Réduire les permissions inutiles.
- Éviter de scanner si l’onglet n’est pas x.com/twitter.com.
- Rate limit interne pour éviter trop d’appels OpenAI.
- Ne pas envoyer tous les tweets à l’IA si non nécessaire.
- Limiter le nombre de tweets par analyse IA.
- Gérer storage quota.
- Ajouter cleanup des anciens tweets si besoin.
- Ajouter logs debug optionnels.
- Ajouter messages d’erreur lisibles.

## Critères d’acceptation

- Pas de crash si Twitter/X change légèrement son DOM.
- Pas de boucle infinie de scan.
- Pas d’appel IA automatique excessif.
- La clé API peut être supprimée.
- L’utilisateur comprend les erreurs.

---

# Sprint 15 — Tests manuels

## Objectif

Vérifier que tout marche en conditions réelles.

## Checklist

### Scan

- Ouvrir x.com.
- Ouvrir un compte de news.
- Cliquer Scan Latest 10 Tweets.
- Vérifier 10 tweets uniques.
- Vérifier déduplication.
- Vérifier raw scan export.

### Local filter

- Vérifier tweets Fed/USD/CPI.
- Vérifier XAUUSD.
- Vérifier geopolitics.
- Vérifier tweets ignorés.

### AI

- Ajouter API key.
- Lancer analyse.
- Vérifier JSON.
- Couper internet ou enlever key.
- Vérifier fallback local.

### Sidebar

- Show sidebar.
- Switch tabs.
- Vérifier Today.
- Vérifier Macro Desk.
- Vérifier Assets.
- Vérifier Calendar Risk.
- Vérifier Journal.
- Vérifier Coach.

### Journal

- Save to Journal.
- Modifier entrée.
- Supprimer entrée.
- Exporter CSV/JSON.

### Reports

- Générer Session Brief.
- Générer Daily Report.
- Export Markdown.

### Auto-refresh

- Activer intervalle.
- Vérifier active tab only.
- Vérifier x.com only.
- Vérifier intervalle minimum.

## Critères d’acceptation

- Tout fonctionne sans erreur critique.
- Les anciennes fonctionnalités ne sont pas cassées.
- L’extension reste rapide.
- L’expérience utilisateur est claire.

---

# Priorité de développement

Ordre recommandé :

```text
1. Sprint 0 — Audit
2. Sprint 1 — Data Models
3. Sprint 2 — Context Edge Score
4. Sprint 3 — AI Tweet Analysis
5. Sprint 4 — Sidebar Dashboard
6. Sprint 5 — Session Brief
7. Sprint 8 — Calendar Risk
8. Sprint 7 — Instrument Bias
9. Sprint 6 — Macro Desk
10. Sprint 9 — Dynamic Journal
11. Sprint 10 — Coaching Review
12. Sprint 11 — Daily Report
13. Sprint 12 — Options Page avancée
14. Sprint 13 — Export complet
15. Sprint 14 — Sécurité/performance
16. Sprint 15 — Tests
```

Pourquoi cet ordre ?

- Le score et les types doivent venir avant la UI.
- Le Session Brief donne rapidement une vraie valeur.
- Calendar Risk est plus simple que Macro Desk complet.
- Journal et Coaching doivent venir après les analyses.
- Daily Report doit venir quand toutes les données existent.

---

# MVP recommandé

Ne pas tout développer d’un coup.

## MVP 1

À livrer en premier :

- Context Edge Score 0-100.
- AI Tweet Analysis JSON propre.
- Sidebar avec onglets.
- Today tab.
- Session Brief.
- Calendar Risk simple.
- Save to Journal basique.

## MVP 2

Ensuite :

- Instrument Bias.
- Macro Desk.
- Journal complet.
- Coaching Review.
- Daily Report.

## MVP 3

Enfin :

- Export complet.
- Rapport historique.
- Backend IA optionnel.
- Economic calendar API optionnelle.
- Dashboard plus avancé.

---

# Prompt maître à donner à Codex

```text
You are a senior Chrome Extension Manifest V3 engineer and product architect.

I have an existing personal Chrome extension that scans only visible tweets on an opened X/Twitter page, filters trading-relevant news locally, scores impact from 0 to 5, and stores useful items locally.

I want to evolve it into an AI Trading Context Cockpit for X/Twitter news.

Important:
- Do not copy HybridTrader branding, UI, code, text, or proprietary logic.
- Use only the product concept: context-first trading assistant.
- Do not create buy/sell signals.
- Do not give financial advice.
- Keep the extension local-first.
- AI is optional.
- OpenAI key must never be hardcoded.
- Manifest V3 compatibility is mandatory.
- The extension must scan only visible tweets on x.com/twitter.com.
- Keep all existing features working.
- For every change, provide the full updated code for each modified file.

Existing features:
- Manual slow scan from popup with Scan Latest 10 Tweets.
- Auto-refresh optional and disabled by default.
- Auto-refresh only active tab on x.com/twitter.com.
- Visible tweet article elements only.
- Local keyword categories for XAUUSD, USD, Fed, inflation, jobs data, geopolitics, oil/risk sentiment, EURUSD/ECB.
- Market coverage for Forex, crypto, stocks, indices, commodities, economic calendar terms.
- Watched markets: XAUUSD, EURUSD, BTCUSD, US100, SPX500, USOIL.
- Impact score 0-5.
- Local bullish/bearish/neutral direction hint.
- Optional OpenAI market analysis.
- Popup filters.
- Floating sidebar.
- Local history with deduplication.
- JSON/CSV export.
- Options page with keywords, categories, min score, theme, auto-refresh, watched markets, OpenAI key/model/prompt, AI Backend URL, import/export/reset.

Target modules:
1. Context Edge Score 0-100.
2. AI Tweet Analysis with valid JSON.
3. Sidebar dashboard tabs:
   - Today
   - Macro Desk
   - Assets
   - Calendar Risk
   - Journal
   - Coach
   - Settings
4. AI Session Brief.
5. Macro Desk by themes.
6. Instrument Bias per watched asset.
7. Calendar Risk from tweet terms.
8. Dynamic Journal.
9. AI Coaching Review.
10. Daily Report.
11. Advanced Options Page.
12. Full export/backup.
13. Security/performance hardening.

Start with Sprint 0, then Sprint 1, then Sprint 2.
Do not jump directly to all features.
After each sprint:
- explain what changed;
- list modified files;
- provide the full code for every modified file;
- provide testing steps;
- mention any limitation.
```

---

# Definition of Done globale

Le projet est terminé quand :

- L’utilisateur peut ouvrir un compte X/Twitter news.
- Scanner les 10 derniers tweets visibles.
- Voir uniquement les tweets utiles pour son trading.
- Comprendre l’impact possible sur XAUUSD, NASDAQ, EURUSD, DXY, BTC, USOIL.
- Voir un Context Edge Score 0-100.
- Générer un Session Brief.
- Voir les thèmes macro.
- Voir les biais par actif.
- Voir les risques calendrier.
- Sauvegarder une news dans son journal.
- Générer un coaching review.
- Générer un daily report.
- Exporter les données.
- Utiliser l’extension sans IA.
- Utiliser l’extension avec OpenAI si clé ajoutée.
- Ne jamais recevoir de signal direct buy/sell.
- Garder un fonctionnement local-first et Manifest V3.
