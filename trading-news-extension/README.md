# Trading News Filter for X/Twitter

Personal Chrome Extension Manifest V3 that scans only the tweets currently visible on an X/Twitter page, filters trading-relevant news locally, scores impact from 0 to 5, and stores useful items in local Chrome storage.

The local filter works without a backend and without AI. Optional OpenAI analysis can be enabled by adding your own API key in the options page. The key is never hardcoded in the project.

## Features

- Manual slow scan from the popup with `Scan Latest 10 Tweets`.
- The scan returns to the top of the opened X/Twitter page, scrolls slowly, and stops after 10 unique tweets.
- Optional auto-refresh with a configurable interval, disabled by default.
- Minimum auto-refresh interval: 1 minute.
- Auto-refresh can target a watched X/Twitter tab, so it can continue after you move to another tab.
- Reads visible tweet `article` elements only.
- Local keyword categories for XAUUSD, USD, Fed, inflation, jobs data, geopolitics, oil/risk sentiment, and EURUSD/ECB.
- Market coverage for Forex, crypto, stocks, indices, commodities, and economic calendar terms.
- `News for PAIR` filtering for watched pairs/markets such as XAUUSD, EURUSD, BTCUSD, US100, SPX500, and USOIL.
- Impact scoring from 0 to 5.
- Local bullish, bearish, or neutral direction hint based on tweet text.
- Optional OpenAI market analysis with bullish/bearish/mixed/neutral bias and explicit news drivers.
- Context Edge Score from 0 to 100 for each relevant tweet, with reasons, penalties, clarity, risk level, affected assets, and macro theme.
- Popup filters: All, High Impact, XAUUSD, USD, Fed, Inflation, Geopolitics.
- Floating sidebar on X/Twitter via `Show Sidebar`, focused on Assets, Today, and Macro Desk.
- Local history with deduplication by tweet URL or text hash.
- CSV export for filtered news and raw scan results.
- Options page for keywords, categories, minimum score, theme, auto-refresh, import/export settings, and future AI Backend URL.

## Install Locally in Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable `Developer Mode`.
4. Click `Load unpacked`.
5. Select the `trading-news-extension` folder.
6. Pin the extension if you want quick popup access.

## Usage

1. Open a page on X/Twitter, for example `https://x.com/some_account`.
2. Click the extension icon.
3. Click `Scan Latest 10 Tweets`.
4. Review the filtered tweets in the popup.
5. Use filters to focus on high impact, XAUUSD, USD, Fed, Inflation, or Geopolitics.
6. Click `Open Tweet` when a tweet URL is available.
7. Click `Show Sidebar` to display relevant trading context directly on the X/Twitter page.

## Auto-Refresh

Auto-refresh is disabled by default.

To enable it:

1. Open the popup.
2. Set a refresh interval in minutes.
3. On the X/Twitter page you want to monitor, click `Watch This Tab`.
4. Enable `Auto-refresh visible page`.
5. You can move to another tab after the watched tab is saved.

When enabled, the extension:

1. Waits for the configured interval.
2. Refreshes only the watched X/Twitter tab.
3. Waits briefly for tweets to load.
4. Slowly scans the latest 10 unique tweets.
5. Saves only new relevant non-duplicate tweets.

The interval cannot be lower than 1 minute. The extension still refreshes only the watched X/Twitter tab and scans only the latest 10 tweets with slow scrolling.

To disable it:

- Turn off the toggle in the popup, or
- Click `Disable auto-refresh now`, or
- Click `Stop Watching` to clear the watched X/Twitter tab, or
- Disable it from the options page.

The extension never refreshes every few seconds, never opens a new tab, and never refreshes non-X/Twitter pages.

## Settings

Open the extension options page from Chrome extensions or by right-clicking the extension icon and selecting options.

You can configure:

- Keywords per category.
- Category enabled/disabled state.
- Minimum impact score to display.
- Auto-refresh interval.
- Watched pairs/markets.
- Default `News for PAIR` market.
- Theme: system, light, or dark.
- OpenAI API key for optional AI analysis.
- OpenAI model.
- Custom AI analysis prompt to guide how the model scans and interprets news.
- Optional AI Backend URL for future backend routing.
- Export/import settings JSON.
- Reset settings.

## Cockpit Sprint Plan

The target product plan is stored in `COCKPIT_SPRINT_PLAN.md`. It is the reference roadmap for evolving this extension into an AI Trading Context Cockpit.

Implemented from that plan so far:

- Sprint 0 audit and preparation: existing MV3 architecture reviewed and preserved.
- Sprint 1 data model groundwork: captured tweet, local analysis, affected assets, macro theme, and context score objects are now generated locally.
- Sprint 2 Context Edge Score: relevant tweet cards show a 0-100 score with reasons, penalties, clarity, and risk level.
- Sprint 3 AI Tweet Analysis: each tweet card has `Ask AI`, returning structured context, bias, risk tone, affected assets, why it matters, warning, and a local fallback if OpenAI fails.
- Sprint 4 Sidebar Dashboard: the injected sidebar is now a focused cockpit with Assets first, then Today, then Macro Desk.
- Sprint 5 Session Brief: popup can generate and store a session brief from recent tweets; OpenAI is used when available, otherwise a local fallback is shown.

Not fully implemented yet:

- AI-enhanced Macro Desk.
- AI-enhanced Instrument Bias.
- Calendar Risk dashboard.
- Dynamic Journal.
- Coaching Review.
- Daily Report.

## Export

The popup can export:

- Filtered CSV
- Scan CSV

Filtered exports contain only tweets that matched your local trading filters. Scan exports contain the raw tweets captured during the latest slow scan, even if they did not match keywords.

Exports are generated locally in the browser from locally stored data.

## Known Limits

- X/Twitter changes its DOM often, so selectors may need updates.
- The extension only reads visible tweets from the page you opened.
- It does not fetch hidden tweets, replies, or timeline data from X/Twitter APIs.
- It does not auto-scroll.
- Local keyword scoring is useful for triage but not a trading signal.
- Bullish/bearish classification is a simple local text hint and can be wrong.
- Chrome alarms are reliable for extension tasks, but exact timing may vary slightly depending on browser state.

## Safety Notes

- This is a personal tool.
- It does not guarantee trading signals.
- It does not replace human analysis.
- It reads only visible tweets.
- Auto-refresh is optional and limited to a minimum interval of 1 minute.
- Do not use it to bypass X/Twitter rules or protections.
- Do not store API secrets in the extension code.

## Roadmap

- Telegram alerts via personal webhook.
- Local Node.js or Python backend.
- AI summaries via a personal endpoint.
- Web dashboard.
- Official X API integration.
- Scoring based on an economic calendar.
- Better bullish/bearish impact detection for XAUUSD.
- Filter by specific Twitter/X account.
- Chrome desktop notifications.
## OpenAI Analysis

OpenAI is optional. The extension still scans, filters, scores, saves, and exports news without an API key.

To enable AI analysis:

1. Open the extension options page.
2. Paste your OpenAI API key into `OpenAI API Key`.
3. Set the model name, for example `gpt-5.4-mini`.
4. Edit `AI analysis prompt` if you want to define your own macro/trading framework.
5. Click `Save Settings`.
6. Open the popup on an X/Twitter page.
7. Click `Scan Latest 10 Tweets`.
8. Click `Analyze with OpenAI`.

With `Auto-analyze all scanned tweets after scan` enabled, every `Scan Latest 10 Tweets` run will use OpenAI for:

- market-wide analysis,
- session brief,
- per-tweet analysis for each scanned tweet.

To reduce token consumption, OpenAI is called only for tweets that contain at least one configured AI keyword. You can edit this list in Options under `AI keyword filter`.

This can send up to 10 tweet-analysis requests plus the summary/brief requests per scan, but only for keyword-matched tweets. It requires a valid OpenAI API key and will consume API usage.

If the local keyword filter finds `0 relevant` items, the AI analysis can still use the latest 10 visible tweets captured during the slow scan. This is useful when a news account posts market-moving headlines that do not match your current keyword list yet.

The AI output summarizes:

- bullish, bearish, mixed, or neutral market bias,
- confidence,
- macro summary,
- market drivers,
- bullish and bearish factors,
- exact news items that influenced the decision,
- risk notes.

The key is stored in `chrome.storage.local` for personal use. Do not commit it, share it, or hardcode it in extension files.
