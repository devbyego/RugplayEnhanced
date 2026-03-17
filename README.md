<div align="center">

<br/>

```
██████╗ ██╗   ██╗ ██████╗ ██████╗ ██╗      █████╗ ██╗   ██╗
██╔══██╗██║   ██║██╔════╝ ██╔══██╗██║     ██╔══██╗╚██╗ ██╔╝
██████╔╝██║   ██║██║  ███╗██████╔╝██║     ███████║ ╚████╔╝ 
██╔══██╗██║   ██║██║   ██║██╔═══╝ ██║     ██╔══██║  ╚██╔╝  
██║  ██║╚██████╔╝╚██████╔╝██║     ███████╗██║  ██║   ██║   
╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝  
███████╗███╗   ██╗██╗  ██╗ █████╗ ███╗   ██╗ ██████╗███████╗██████╗ 
██╔════╝████╗  ██║██║  ██║██╔══██╗████╗  ██║██╔════╝██╔════╝██╔══██╗
█████╗  ██╔██╗ ██║███████║███████║██╔██╗ ██║██║     █████╗  ██║  ██║
██╔══╝  ██║╚██╗██║██╔══██║██╔══██║██║╚██╗██║██║     ██╔══╝  ██║  ██║
███████╗██║ ╚████║██║  ██║██║  ██║██║ ╚████║╚██████╗███████╗██████╔╝
╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═════╝ 
```

**The #1 userscript for [rugplay.com](https://rugplay.com)**

83 mods. Live WebSocket data. Zero tracking. Zero third-party servers.

<br/>

[![Version](https://img.shields.io/github/v/release/devbyego/rugplay-enhanced?color=%2322c55e&label=version&style=flat-square)](https://github.com/devbyego/rugplay-enhanced/releases/latest)
[![License](https://img.shields.io/github/license/devbyego/rugplay-enhanced?style=flat-square&color=%2318181b)](LICENSE)
[![Stars](https://img.shields.io/github/stars/devbyego/rugplay-enhanced?style=flat-square&color=%23f59e0b)](https://github.com/devbyego/rugplay-enhanced/stargazers)
[![Issues](https://img.shields.io/github/issues/devbyego/rugplay-enhanced?style=flat-square&color=%23ef4444)](https://github.com/devbyego/rugplay-enhanced/issues)

<br/>

[![Install](https://img.shields.io/badge/⚡%20Install%20Now-v1.1.0-22c55e?style=for-the-badge&logoColor=white)](https://github.com/devbyego/rugplay-enhanced/releases/latest/download/rugplay-enhanced.user.js)

*Requires [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)*

<br/>

</div>

---

## What is this?

Rugplay Enhanced transforms [rugplay.com](https://rugplay.com) from a basic trading site into a clean, professional-grade dashboard. It intercepts Rugplay's own WebSocket feed to deliver real-time trade data, risk scoring, price alerts, and 83 toggleable quality-of-life improvements — without a single external API call or analytics tracker.

**It is free. It does not track you. It never will.**

---

## Installation

**Takes 30 seconds.**

**1.** Install a userscript manager for your browser:

| Browser | Recommended |
|---|---|
| Chrome / Edge / Brave | [Tampermonkey](https://www.tampermonkey.net/) |
| Firefox | [Violentmonkey](https://violentmonkey.github.io/) |
| Safari | [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) |

**2.** Click the install button:

[![Install](https://img.shields.io/badge/Install%20Rugplay%20Enhanced-latest-22c55e?style=for-the-badge)](https://github.com/devbyego/rugplay-enhanced/releases/latest/download/rugplay-enhanced.user.js)

**3.** Open [rugplay.com](https://rugplay.com). The **Enhanced** button appears in your sidebar instantly.

> Auto-updates are built-in. Tampermonkey checks for new versions automatically.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + E` | Open / close the Enhanced panel |
| `Ctrl + K` | Quick search (coins + users) |

You can also open the panel directly by navigating to `rugplay.com/#rugplay-enhanced`.

---

## Features

### ⚡ Enhanced Panel

A full pro dashboard injected into Rugplay. Open it with `Ctrl+Shift+E`.

**Dashboard**
- Live platform-wide trade feed with real-time WebSocket data
- Filter by coin, user, minimum trade value, or side (buy/sell)
- Market Radar — hot coins ranked by volume, whale activity tracker
- Session stats: total trades seen, volume, buy/sell ratio, average trade size

**Watchlist**
- Add any coin symbol to your watchlist
- Live prices update in real time via WebSocket
- Get notified the moment a watched coin gets a new trade

**Alerts**
- Set price alerts for any coin — fires instantly via WebSocket, not polling
- Trigger above or below a target price
- Optional: desktop notifications, tab title flash, sound alert (Web Audio API)

**Reporter**
- Submit rugpull reports to the Enhanced community network
- View, upvote, and downvote community reports
- Offline fallback — reports save locally if the API is down

**Mods**
- 83 toggleable quality-of-life improvements across 6 categories
- Search and filter mods by category
- All on / All off bulk controls
- Changes apply instantly — no refresh needed

**Status**
- Live WebSocket health indicator
- Enhanced API status
- Script version info

---

### 🪙 Coin Page Upgrades

Everything injected directly onto coin pages, using Rugplay's own data.

| Feature | Description |
|---|---|
| **Risk Assessment Card** | 0–100 risk score based on coin age, holder count, market cap, and sell pressure |
| **Recent Transactions** | Last 10 trades with live refresh, pagination, and new-tx highlight animation |
| **Coin Notes** | Private per-coin notes stored 100% locally, never sent anywhere |
| **Reported Badge** | "Community reported" warning if the creator is in the reporter database |
| **Watch Button** | One-click add to watchlist from any coin page |
| **Coin Age Badge** | Shows coin age inline (red if under 1h, amber if under 6h) |
| **Holder Count** | Holder count displayed prominently with icon |
| **Low Holder Warning** | Red banner when holders drop below 10 |
| **Low Liquidity Warning** | Amber banner when market cap is under $500 |
| **24h Price Change** | Color-coded % badge next to coin name |
| **Live Spread** | Bid/ask spread derived from live WebSocket trades |
| **Fee Estimate** | Estimated 0.3% fee shown as you type your trade amount |
| **Trade Confirmation** | Confirm dialog before executing buy/sell (prevents misclicks) |
| **Price Drop Alert** | Fires if price drops by your configured % within a minute |

---

### 👤 Profile Page Upgrades

| Feature | Description |
|---|---|
| **Trade History Modal** | Full paginated trade history for any user, opened from their profile |
| **Watch User** | Add any user to your watchlist directly from their profile |

---

### 🔍 Detection & Alerts

All detection runs locally — no data leaves your browser.

| Feature | Description |
|---|---|
| **Bot Detection** | Analyses trade timing variance and repeat-trader ratio in the WS feed |
| **Volume Spike Alert** | Fires when 60-second rolling volume on a coin exceeds your threshold |
| **Whale Ping** | Notification when a single trade exceeds your whale threshold |
| **Creator Sell Alert** | Fires when the coin creator's wallet shows a SELL — classic rug signal |
| **Holder Drop Alert** | Fires if holder count drops 10%+ in 2 minutes |
| **Risk Change Alert** | Fires if a coin's risk score changes by 10+ points between checks |
| **New Report Alert** | Notifies when a new community report is submitted |
| **New Coin Alert** | Notifies when a brand-new coin first appears in the live feed |

---

### 🛡 Privacy Mods

| Mod | Description |
|---|---|
| **Appear Offline** | Spoofs `document.visibilityState` to suppress your online status in DMs |
| **Hide Balance** | Hides all portfolio values — hover to reveal |
| **Blur Portfolio** | Blurs portfolio numbers — great for streaming |
| **Block Analytics** | CSS-blocks known analytics trackers (gtag, segment, mixpanel, hotjar) |
| **Strip Tracking Params** | Removes UTM and tracking query params from URLs automatically |
| **Anonymous Mode** | Replaces your username with `@anon` in the UI |
| **No Referrer** | Adds `rel="noreferrer"` to all external links |
| **Hide DM Online Status** | Hides online presence dots in DM conversations |

---

### 🎨 Interface Mods

| Mod | Description |
|---|---|
| Force Dark Mode | Forces dark mode regardless of OS setting |
| Ad Blocker | Removes Google and third-party ads |
| Compact Page Layout | Tightens all spacing for a denser data view |
| Compact Sidebar | Reduces sidebar item height to fit more nav items |
| Focus Mode | Fades sidebar/header to 12% — hover to reveal |
| Borderless Cards | Removes all card borders for a flat minimal look |
| Monospace Font | Forces monospace font across the entire UI |
| Hide Footer | Hides the page footer |
| Hide Right Panel | Collapses the right sidebar on pages that have one |
| Hide Online Count | Hides user online count indicators |
| Dim Inactive Tabs | Dims the page to 50% when your tab loses focus |
| Better Scrollbars | Slim 5px scrollbars that match the dark theme |
| Smooth Scrolling | Enables CSS smooth scroll across all pages |
| Preload Coin Data | Prefetches coin data on hover so pages load instantly |
| Sticky Portfolio | Pins your portfolio widget to the sidebar footer |
| Auto-open Panel | Opens the Enhanced panel on every page load |
| Large Click Targets | Ensures all buttons/links are at least 32px tall |
| URL Shortcuts | Navigate via `/@username` and `/*SYMBOL` in the address bar |
| Keyboard Shortcuts | Enables `Ctrl+K` and `Ctrl+Shift+E` |
| Sidebar Quick Search | Adds the Quick Search button to the sidebar |

---

### 🧪 Experimental Mods

| Mod | Description |
|---|---|
| Slippage Tracker | Computes slippage from WS execution vs expected price |
| Live Bid/Ask | Derives live bid/ask from the last buy/sell WS trades |
| Cost Basis | Estimates your average cost per coin from trade history |
| Risk Change Alert | Fires when a coin's risk score shifts by 10+ points |
| Dev Mode | Logs all WS events to the browser console (`[RE:WS]`) |

---

## Architecture

```
rugplay.com
    │
    ▼
WebSocket (wss://ws.rugplay.com)
    │
    ├── alertEngine       — price alerts, flash title, sound
    ├── volumeDetector    — 60s rolling volume per coin
    ├── botDetector       — timing variance + repeat trader analysis
    ├── liveFeed          — trade feed, whale ping, watchlist alerts
    ├── spreadTracker     — live bid/ask derivation
    └── slippageTracker   — execution vs expected price

Rugplay REST API (/api/*, /coin/*/__data.json)
    │
    ├── riskScorer        — 0-100 risk score per coin
    ├── coinPageEnhancer  — tx card, notes, age, holders, warnings
    ├── profileEnhancer   — trade history modal, watch button
    ├── costBasisTracker  — average cost basis from trade history
    └── holderDropMonitor — holder count change detection

Enhanced API (rugplay-enhanced.workers.dev)
    │
    ├── reportedChecker   — community-flagged coins/creators
    ├── reportPoller      — new report notifications
    └── updateChecker     — version comparison

Local Storage (GM_setValue)
    ├── store.settings()  — all 83 mod settings
    ├── store.alerts()    — price alert list
    ├── store.notes()     — per-coin private notes
    └── store.portfolio() — session P&L snapshots
```

**Zero external tracking.** The Enhanced API is only used for community reports and update checks. All trade data, risk scoring, and detection runs locally using Rugplay's own WebSocket and REST API.

---

## Troubleshooting

Open the Enhanced panel → **Status** tab for live diagnostics.

| Issue | Fix |
|---|---|
| Enhanced button not in sidebar | Refresh the page. If it persists, disable and re-enable the script in Tampermonkey |
| WebSocket shows 0 messages | No live trades have happened yet, or Rugplay changed their WS endpoint — check the Status tab |
| Enhanced API errors | Reporter and community features are limited until the API recovers. Reports save locally |
| Tabs show blank content | Update to the latest version — this was fixed in v1.1.0 |
| Mods not working | Update to v1.1.0+ — all 83 mods were fully implemented in this release |

---

## Contributing

Pull requests are welcome. The codebase is a single-file userscript (`rugplay-enhanced.user.js`).

```bash
git clone https://github.com/devbyego/rugplay-enhanced.git
```

Load the local file directly in Tampermonkey during development. No build step required.

**Good first contributions:**
- New mod ideas with clear, real functionality
- Better selectors if Rugplay updates their DOM
- UI polish in the panel (`_render()` method)

Please open an issue before starting large changes so we can align on direction.

---

## License

MIT — do whatever you want, just don't pretend you made it.

---

<div align="center">

Made by [devbyego](https://github.com/devbyego) &nbsp;·&nbsp; [Releases](https://github.com/devbyego/rugplay-enhanced/releases) &nbsp;·&nbsp; [Issues](https://github.com/devbyego/rugplay-enhanced/issues) &nbsp;·&nbsp; Discord: **devbyego**

<br/>

*Not affiliated with Rugplay. Use at your own risk.*

</div>
