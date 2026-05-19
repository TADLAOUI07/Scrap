# Trading News Filter for X/Twitter

Personal Chrome Extension Manifest V3 that scans only the tweets currently visible on an X/Twitter page, filters trading-relevant news locally, scores impact from 0 to 5, and stores useful items in local Chrome storage.

The MVP is fully local and free. It does not use a backend, does not include API keys, does not call internal X/Twitter endpoints, does not auto-scroll, and does not open tabs automatically.

## Features

- Manual scan from the popup with `Scan Trading News`.
- Optional auto-refresh every 5 minutes, disabled by default.
- Auto-refresh only runs on the active tab when it is on `x.com` or `twitter.com`.
- Reads visible tweet `article` elements only.
- Local keyword categories for XAUUSD, USD, Fed, inflation, jobs data, geopolitics, oil/risk sentiment, and EURUSD/ECB.
- Impact scoring from 0 to 5.
- Local bullish, bearish, or neutral direction hint based on tweet text.
- Popup filters: All, High Impact, XAUUSD, USD, Fed, Inflation, Geopolitics.
- Floating sidebar on X/Twitter via `Show Sidebar`.
- Local history with deduplication by tweet URL or text hash.
- JSON and CSV export.
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
3. Click `Scan Trading News`.
4. Review the filtered tweets in the popup.
5. Use filters to focus on high impact, XAUUSD, USD, Fed, Inflation, or Geopolitics.
6. Click `Open Tweet` when a tweet URL is available.
7. Click `Show Sidebar` to display relevant trading news directly on the X/Twitter page.

## Auto-Refresh Every 5 Minutes

Auto-refresh is disabled by default.

To enable it:

1. Open the popup.
2. Enable `Auto-refresh every 5 minutes`.
3. Keep the active tab on `x.com` or `twitter.com`.

When enabled, the extension:

1. Waits 5 minutes.
2. Refreshes only the active X/Twitter tab.
3. Waits briefly for visible tweets to load.
4. Scans visible tweets once.
5. Saves only relevant non-duplicate tweets.

To disable it:

- Turn off the toggle in the popup, or
- Click `Disable auto-refresh now`, or
- Disable it from the options page.

The extension never refreshes every few seconds, never opens a new tab, and never refreshes non-X/Twitter pages.

## Settings

Open the extension options page from Chrome extensions or by right-clicking the extension icon and selecting options.

You can configure:

- Keywords per category.
- Category enabled/disabled state.
- Minimum impact score to display.
- Auto-refresh every 5 minutes.
- Theme: system, light, or dark.
- Future AI Backend URL, disabled by default.
- Export/import settings JSON.
- Reset settings.

## Export

The popup can export filtered news as:

- JSON
- CSV

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
- Auto-refresh is optional and limited to every 5 minutes.
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
