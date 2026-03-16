// ==UserScript==
// @name         Rugplay Enhanced
// @version      1.0.0
// @icon         https://raw.githubusercontent.com/devbyego/rugplay-enhanced/main/icon.png
// @description  The #1 Rugplay userscript: price alerts, live feed, risk scoring, bot & volume alerts, P&L, quick search (Ctrl+K), coin notes, rugpull reporter. Uses Rugplay's own API—no third-party data. Zero tracking.
// @author       devbyego
// @match        https://rugplay.com/*
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_info
// @grant        unsafeWindow
// @connect      rugplay-enhanced-api.rugplay-enhanced.workers.dev
// @connect      api.vaaq.dev
// @connect      vaaq.dev
// @connect      rugplay.com
// @run-at       document-start
// @downloadURL  https://github.com/devbyego/rugplay-enhanced/releases/latest/download/rugplay-enhanced.user.js
// @updateURL    https://github.com/devbyego/rugplay-enhanced/releases/latest/download/rugplay-enhanced.user.js
// ==/UserScript==

(function () {
    'use strict';

    const RE_API = 'https://rugplay-enhanced-api.rugplay-enhanced.workers.dev';

    const wsInterceptor = {
        _patched: false,
        _cbs: [],
        stats: { lastMsgAt: 0, count: 0 },
        patch() {
            if (this._patched) return;
            this._patched = true;

            const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

            // Bridge messages from page context -> userscript context
            window.addEventListener('message', (ev) => {
                const d = ev?.data;
                if (!d || d.__re_source !== 'ws') return;
                this.stats.lastMsgAt = Date.now();
                this.stats.count += 1;
                this._cbs.forEach(fn => { try { fn(d.payload); } catch {} });
            });

            // Prefer patching pageWindow.WebSocket directly (works even under CSP).
            const patchWebSocketDirect = () => {
                try {
                    const WS = pageWindow.WebSocket;
                    if (!WS || !WS.prototype || WS.prototype.__rePatched) return true;
                    const Orig = WS;
                    const self = this;
                    function PW(...a) {
                        const ws = new Orig(...a);
                        try {
                            const url = a && a[0];
                            if (typeof url === 'string' && url.startsWith('wss://ws.rugplay.com')) {
                                ws.addEventListener('message', (ev) => {
                                    try {
                                        const post = (payload) => window.postMessage({ __re_source: 'ws', payload }, '*');
                                        const parseAndPost = (txt) => {
                                            try { post(JSON.parse(txt)); }
                                            catch { post({ __re_unparsed: true }); }
                                        };
                                        if (typeof ev.data === 'string') { parseAndPost(ev.data); return; }
                                        if (ev.data instanceof ArrayBuffer) {
                                            const txt = new TextDecoder('utf-8').decode(new Uint8Array(ev.data));
                                            parseAndPost(txt);
                                            return;
                                        }
                                        if (typeof Blob !== 'undefined' && ev.data instanceof Blob) {
                                            ev.data.text().then(parseAndPost).catch(() => post({ __re_unparsed: true }));
                                            return;
                                        }
                                        post({ __re_unparsed: true });
                                    } catch {}
                                });
                            }
                        } catch {}
                        return ws;
                    }
                    PW.prototype = Orig.prototype;
                    try { Object.keys(Orig).forEach(k => { PW[k] = Orig[k]; }); } catch {}
                    pageWindow.WebSocket = PW;
                    pageWindow.WebSocket.prototype.__rePatched = true;
                    return true;
                } catch { return false; }
            };

            if (patchWebSocketDirect()) return;

            // Fallback: Patch WebSocket in *page* context via script injection (may be blocked by CSP).
            const inject = () => {
                try {
                    const s = document.createElement('script');
                    s.textContent = `(() => {
  try {
    if (window.WebSocket && window.WebSocket.prototype && window.WebSocket.prototype.__rePatched) return;
    const Orig = window.WebSocket;
    function PW(...a) {
      const ws = new Orig(...a);
      try {
        const url = a && a[0];
        if (typeof url === 'string' && url.startsWith('wss://ws.rugplay.com')) {
          ws.addEventListener('message', (ev) => {
            try {
              const post = (payload) => window.postMessage({ __re_source: 'ws', payload }, '*');
              const parseAndPost = (txt) => {
                try { post(JSON.parse(txt)); }
                catch { post({ __re_unparsed: true }); }
              };
              if (typeof ev.data === 'string') {
                parseAndPost(ev.data);
                return;
              }
              if (ev.data instanceof ArrayBuffer) {
                const txt = new TextDecoder('utf-8').decode(new Uint8Array(ev.data));
                parseAndPost(txt);
                return;
              }
              if (typeof Blob !== 'undefined' && ev.data instanceof Blob) {
                ev.data.text().then(parseAndPost).catch(() => post({ __re_unparsed: true }));
                return;
              }
              post({ __re_unparsed: true });
            } catch {}
          });
        }
      } catch {}
      return ws;
    }
    PW.prototype = Orig.prototype;
    try { Object.keys(Orig).forEach(k => { PW[k] = Orig[k]; }); } catch {}
    window.WebSocket = PW;
    window.WebSocket.prototype.__rePatched = true;
  } catch {}
})();`;
                    (document.documentElement || document.head || document.body).appendChild(s);
                    s.remove();
                } catch {}
            };

            if (document.documentElement) inject();
            else document.addEventListener('DOMContentLoaded', inject, { once: true });
        },
        on(fn) { this._cbs.push(fn); },
        off(fn) { this._cbs = this._cbs.filter(c => c !== fn); },
    };
    wsInterceptor.patch();

    const pathname = window.location.pathname;
    const userMatch = pathname.match(/^\/@([a-zA-Z0-9_.-]+)$/);
    if (userMatch) { window.location.replace(`https://rugplay.com/user/${userMatch[1]}`); return; }
    const coinMatch = pathname.match(/^\/\*([A-Z0-9]+)$/i);
    if (coinMatch) { window.location.replace(`https://rugplay.com/coin/${coinMatch[1].toUpperCase()}`); return; }

    const store = {
        get: (k, d = null) => { const v = GM_getValue(k, null); if (v === null) return d; try { return JSON.parse(v); } catch { return v; } },
        set: (k, v) => GM_setValue(k, JSON.stringify(v)),
        settings: () => ({ adblock: true, notifications: true, stickyPortfolio: false, appearOffline: false, riskScore: true, botWarning: true, volumeSpikes: true, desktopAlerts: false, showPnL: true, compactMode: false, forceDark: false, autoOpenPanel: false, panelTab: 'dashboard', ...store.get('re:cfg', {}) }),
        cfg: (k, v) => { const s = store.settings(); s[k] = v; store.set('re:cfg', s); },
        alerts: () => store.get('re:al', []),
        alSet: v => store.set('re:al', v),
        portfolio: () => store.get('re:pf', { snaps: [] }),
        pfSet: v => store.set('re:pf', v),
        notes: () => store.get('re:notes', {}),
        notesSet: v => store.set('re:notes', v),
        localReports: () => store.get('re:reports_local', []),
        localReportsSet: v => store.set('re:reports_local', v),
    };

    const CONFIG = {
        selectors: {
            notificationBadge: 'a[href="/notifications"] > div',
            tableSelectors: ['main table tbody', 'table tbody'],
            coinImageSelectors: ['img[alt]', 'img'],
            profileHeaderContainer: 'main > div > div > div > div > div > div.bg-card.text-card-foreground.flex.flex-col',
            loggedInUserSpan: '#bits-c1 > div.grid.flex-1.text-left.text-sm.leading-tight > span.truncate.text-xs',
            profileUsernameMeta: 'meta[property="og:title"]',
            coinPageCardContainer: 'main div.lg\\:col-span-1',
            mainContent: 'main',
            sidebarMenuList: 'ul[data-sidebar="menu"]',
            sidebarFirstItem: 'li[data-sidebar="menu-item"]:first-child',
        },
        ids: {
            enhancedBtn: 're-enhanced-btn',
            searchBtn: 're-search-btn',
            panelWrapper: 're-panel-wrapper',
            feedbackModal: 're-feedback-modal',
            reportedCreatorBadge: 're-reported-badge',
            historyModalOverlay: 're-history-overlay',
            historyModalBody: 're-history-body',
            historyModalPagination: 're-history-pagination',
            historyModalUsername: 're-history-username',
            coinTxCard: 're-tx-card',
            coinTxBody: 're-tx-body',
            coinTxPagination: 're-tx-pagination',
            coinTxRefresh: 're-tx-refresh',
            coinRiskCard: 're-risk-card',
            coinNoteCard: 're-note-card',
            profileBtns: 're-profile-btns',
            watchBtn: 're-watch-btn',
            pnlEl: 're-pnl',
        },
        intervals: {
            init: 300,
            tsUpdate: 1000,
            updateCheck: 900000,
        },
    };

    const ICONS = {
        enhanced: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        search: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        close: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
        refresh: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.651 7.65a7.131 7.131 0 0 0-12.68 3.15M18.001 4v4h-4m-7.652 8.35a7.13 7.13 0 0 0 12.68-3.15M6 20v-4h4"/></svg>`,
        loading: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="re-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
        history: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
        edit: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
        alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
    };

    const utils = {
        isUserPage: () => window.location.href.includes('/user/'),
        isCoinPage: () => window.location.href.includes('/coin/'),
        getCoinSymbol: () => { const m = window.location.pathname.match(/\/coin\/([^/?#]+)/); return m ? m[1].toUpperCase() : null; },
        getUsernameFromPage: () => { const m = document.querySelector(CONFIG.selectors.profileUsernameMeta)?.getAttribute('content')?.match(/\(@([^)]+)\)/); return m?.[1]?.trim() ?? null; },
        getLoggedInUsername: async (timeout = 10000) => { let e = 0; while (e < timeout) { const el = document.querySelector(CONFIG.selectors.loggedInUserSpan); if (el?.textContent?.trim()) return el.textContent.replace('@', '').trim(); await utils.sleep(100); e += 100; } return null; },
        sleep: ms => new Promise(r => setTimeout(r, ms)),
        debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
        ago: ts => { if (!ts) return '?'; const s = Math.floor((Date.now() - +ts) / 1000); if (s < 2) return 'just now'; if (s < 60) return s + 's ago'; if (s < 3600) return Math.floor(s / 60) + 'm ago'; if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago'; },
        date: ts => { if (!ts) return '?'; return new Date(+ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); },
        num: n => { n = +n || 0; if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K'; return n.toFixed(4); },
        usd: n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(+n || 0),
        findElement: sels => { for (const s of sels) { try { const el = document.querySelector(s); if (el) return el; } catch {} } return null; },
        uid: () => typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36),
    };

    const api = {
        req: (method, path, body) => new Promise((res, rej) => GM_xmlhttpRequest({
            method, url: `${RE_API}${path}`,
            headers: { 'Content-Type': 'application/json' },
            data: body ? JSON.stringify(body) : undefined,
            timeout: 10000,
            onload: r => { try { res(JSON.parse(r.responseText)); } catch { rej(new Error('parse')); } },
            onerror: () => rej(new Error('network')),
            ontimeout: () => rej(new Error('timeout')),
        })),
        get: p => api.req('GET', p),
        post: (p, b) => api.req('POST', p, b),
    };

    const vaaqApi = {
        maxRetries: 4,
        initialDelay: 800,
        getJson: (url) => new Promise((resolve, reject) => {
            let attempt = 0;
            const run = () => {
                attempt++;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    timeout: 15000,
                    onload: (r) => {
                        try {
                            if (r.status < 200 || r.status >= 300) throw new Error(`http_${r.status}`);
                            const data = JSON.parse(r.responseText);
                            resolve(data);
                        } catch (e) {
                            if (attempt < vaaqApi.maxRetries) {
                                const delay = vaaqApi.initialDelay * Math.pow(2, attempt - 1);
                                setTimeout(run, delay);
                            } else reject(e);
                        }
                    },
                    onerror: () => {
                        if (attempt < vaaqApi.maxRetries) {
                            const delay = vaaqApi.initialDelay * Math.pow(2, attempt - 1);
                            setTimeout(run, delay);
                        } else reject(new Error('network'));
                    },
                    ontimeout: () => {
                        if (attempt < vaaqApi.maxRetries) {
                            const delay = vaaqApi.initialDelay * Math.pow(2, attempt - 1);
                            setTimeout(run, delay);
                        } else reject(new Error('timeout'));
                    },
                });
            };
            run();
        }),
        coinTrades: (sym, page = 1, limit = 10) => vaaqApi.getJson(`https://api.vaaq.dev/rugplay/v1/search/?coinSymbol=${encodeURIComponent(sym)}&page=${page}&limit=${limit}`),
    };

    class URLWatcher {
        constructor() { this.href = location.href; this.cbs = []; }
        on(fn) { this.cbs.push(fn); return this; }
        start() {
            const chk = () => { if (location.href !== this.href) { const p = this.href; this.href = location.href; this.cbs.forEach(fn => { try { fn(this.href, p); } catch {} }); } };
            setInterval(chk, 300);
            window.addEventListener('popstate', chk);
            window.addEventListener('hashchange', chk);
            return this;
        }
    }

    const notifier = {
        container: null,
        init() { if (!this.container) { this.container = document.createElement('div'); this.container.id = 're-notifier'; document.body.appendChild(this.container); } },
        show({ title, description, type = 'info', duration = 5000, actions = [] }) {
            this.init();
            const colors = { info: '#3b82f6', success: '#22c55e', warning: '#f59e0b', error: '#ef4444' };
            const icons = {
                info: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
                success: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
                warning: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
                error: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
            };
            const n = document.createElement('div');
            n.className = 're-notif';
            n.innerHTML = `<div class="re-notif-icon" style="color:${colors[type]}">${icons[type]}</div><div class="re-notif-body">${title ? `<div class="re-notif-title">${title}</div>` : ''}<div class="re-notif-desc">${description}</div>${actions.length ? `<div class="re-notif-actions">${actions.map((a, i) => `<button class="re-notif-btn ${i === 0 ? 'primary' : 'secondary'}" data-i="${i}">${a.label}</button>`).join('')}</div>` : ''}</div><button class="re-notif-close" title="Close">${ICONS.close}</button>`;
            const kill = () => { n.classList.add('re-notif-out'); n.addEventListener('animationend', () => n.remove(), { once: true }); };
            n.querySelector('.re-notif-close').onclick = kill;
            n.querySelectorAll('.re-notif-btn').forEach(b => b.onclick = () => { actions[+b.dataset.i]?.onClick?.(); kill(); });
            this.container.appendChild(n);
            if (duration > 0) setTimeout(kill, duration);
            return n;
        },
        ok: (desc, o = {}) => notifier.show({ ...o, description: desc, type: 'success' }),
        err: (desc, o = {}) => notifier.show({ ...o, description: desc, type: 'error' }),
        warn: (desc, o = {}) => notifier.show({ ...o, description: desc, type: 'warning' }),
        info: (desc, o = {}) => notifier.show({ ...o, description: desc, type: 'info' }),
    };

    const diagnostics = {
        state: { lastApiOkAt: 0, lastApiErrAt: 0, lastApiErr: '', lastReportOkAt: 0, lastReportErrAt: 0, lastReportErr: '' },
        async pingApi() {
            try {
                const r = await api.get('/v1/update');
                if (r?.status === 'success') this.state.lastApiOkAt = Date.now();
                else throw new Error('bad_response');
            } catch (e) {
                this.state.lastApiErrAt = Date.now();
                this.state.lastApiErr = String(e?.message || e);
            }
        },
        render() {
            if (!enhancedPanel.isVisible) return;
            const el = document.getElementById('re-diag');
            if (!el) return;
            const wsAge = wsInterceptor.stats.lastMsgAt ? `${utils.ago(wsInterceptor.stats.lastMsgAt)}` : 'never';
            const apiOk = this.state.lastApiOkAt ? utils.ago(this.state.lastApiOkAt) : 'never';
            el.innerHTML = `
                <div class="re-stat-grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
                    <div class="re-stat"><div class="re-stat-k">WebSocket</div><div class="re-stat-v">${wsInterceptor.stats.count ? `${wsInterceptor.stats.count} msgs` : '0 msgs'}</div><div class="re-mini-sub">last: ${wsAge}</div></div>
                    <div class="re-stat"><div class="re-stat-k">Enhanced API</div><div class="re-stat-v">${apiOk}</div><div class="re-mini-sub">${this.state.lastApiErrAt ? `err: ${utils.ago(this.state.lastApiErrAt)}${this.state.lastApiErr ? ` (${this.state.lastApiErr})` : ''}` : ''}</div></div>
                    <div class="re-stat"><div class="re-stat-k">Reports</div><div class="re-stat-v">${this.state.lastReportOkAt ? utils.ago(this.state.lastReportOkAt) : '—'}</div><div class="re-mini-sub">${this.state.lastReportErrAt ? `err: ${utils.ago(this.state.lastReportErrAt)}${this.state.lastReportErr ? ` (${this.state.lastReportErr})` : ''}` : ''}</div></div>
                </div>
            `;
        },
    };

    const notifications = {
        apply() {
            const enabled = store.settings().notifications;
            document.querySelectorAll(CONFIG.selectors.notificationBadge).forEach(b => { b.style.display = enabled ? '' : 'none'; });
        },
    };

    const adBlocker = {
        apply() {
            const enabled = store.settings().adblock;
            let el = document.getElementById('re-adblock');
            if (enabled && !el) { el = document.createElement('style'); el.id = 're-adblock'; el.textContent = `.GoogleActiveViewElement,[data-google-av-adk],[data-google-av-cxn],ins.adsbygoogle,iframe[src*="pagead2.googlesyndication.com"],iframe[src*="doubleclick.net"],div[id^="google_ads_iframe"],.ad-container,[class*="ns-"][data-nc]{display:none!important;height:0!important;width:0!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;position:absolute!important;z-index:-9999!important;}`; document.head.appendChild(el); }
            else if (!enabled && el) el.remove();
        },
    };

    const visibilitySpoof = {
        _patched: false,
        apply() {
            const enabled = !!store.settings().appearOffline;
            const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;
            if (!pageWindow?.document) return;
            if (!this._patched) {
                this._patched = true;
                try {
                    const doc = pageWindow.document;
                    const proto = Object.getPrototypeOf(doc);
                    const state = () => (!!store.settings().appearOffline);
                    const define = (obj, prop, getter) => {
                        try {
                            const desc = Object.getOwnPropertyDescriptor(obj, prop);
                            if (desc && desc.configurable === false) return;
                            Object.defineProperty(obj, prop, { configurable: true, get: getter });
                        } catch {}
                    };
                    define(doc, 'hidden', () => state());
                    define(proto, 'hidden', () => state());
                    define(doc, 'visibilityState', () => state() ? 'hidden' : 'visible');
                    define(proto, 'visibilityState', () => state() ? 'hidden' : 'visible');
                } catch {}
            }
            try {
                window.dispatchEvent(new CustomEvent('rpp_visibility_changed', { detail: { hidden: enabled } }));
                window.dispatchEvent(new CustomEvent('re_visibility_changed', { detail: { hidden: enabled } }));
            } catch {}
        },
    };

    const settingsEngine = {
        applyAll() {
            try { notifications.apply(); } catch {}
            try { adBlocker.apply(); } catch {}
            try { portfolioMover.apply(); } catch {}
            try { theme.apply(); } catch {}
            try { visibilitySpoof.apply(); } catch {}
            try { document.body.classList.toggle('re-compact', !!store.settings().compactMode); } catch {}
            try { if (store.settings().desktopAlerts && typeof Notification !== 'undefined') Notification.requestPermission(); } catch {}
            try {
                if (!store.settings().riskScore) document.getElementById(CONFIG.ids.coinRiskCard)?.remove();
            } catch {}
            try { portfolioUpdater.reload?.(); } catch {}
        },
    };

    const theme = {
        apply() {
            const enabled = !!store.settings().forceDark;
            try {
                // Rugplay uses shadcn/tailwind style variables; toggling `dark` is the safest global switch.
                document.documentElement.classList.toggle('dark', enabled);
                document.documentElement.style.colorScheme = enabled ? 'dark' : '';
            } catch {}
        },
    };

    const portfolioMover = {
        apply() {
            const enabled = store.settings().stickyPortfolio;
            const footer = document.querySelector('div[data-sidebar="footer"]');
            const content = document.querySelector('div[data-sidebar="content"]') || document.querySelector('div[data-slot="sidebar-content"]');
            if (!footer || !content) return;
            const grp = Array.from(document.querySelectorAll('div[data-sidebar="group"]')).find(g => g.querySelector('div[data-sidebar="group-label"]')?.textContent?.includes('Portfolio'));
            if (!grp) return;
            if (enabled && grp.parentElement !== footer) { grp.style.borderTop = '1px solid var(--sidebar-border)'; footer.insertBefore(grp, footer.firstChild); }
            else if (!enabled && grp.parentElement === footer) { grp.style.borderTop = ''; content.appendChild(grp); }
        },
    };

    const portfolioUpdater = {
        reloading: false, lastTs: 0, lastTotal: null,
        trigger() { const now = Date.now(); if (this.reloading || now - this.lastTs < 3000) return; this.lastTs = now; this.reload(); },
        async reload() {
            if (this.reloading) return; this.reloading = true;
            try {
                const r = await fetch('/api/portfolio/summary', { headers: { Accept: 'application/json' } });
                if (r.ok) { const d = await r.json(); this.update(d); }
            } catch {} finally { this.reloading = false; }
        },
        update(data) {
            const total = data.total_value ?? data.totalValue ?? data.total;
            const cash = data.cash_value ?? data.cashValue ?? data.cash;
            const coins = data.coins_value ?? data.coinsValue ?? data.coins;
            const labels = Array.from(document.querySelectorAll('span'));
            const lbl = labels.find(s => s.textContent.trim() === 'Total Value');
            if (!lbl) return;
            const wrap = lbl.closest('.space-y-2');
            if (!wrap) return;
            const spans = wrap.querySelectorAll('span.font-mono');
            const fmt = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
            if (spans[0] && total !== undefined) { spans[0].textContent = fmt(total); spans[0].style.transition = 'background .2s,transform .2s'; spans[0].style.backgroundColor = 'rgba(76,175,80,.25)'; spans[0].style.transform = 'scale(1.04)'; setTimeout(() => { spans[0].style.backgroundColor = 'transparent'; spans[0].style.transform = ''; }, 400); }
            if (spans[1] && cash !== undefined) spans[1].textContent = fmt(cash);
            if (spans[2] && coins !== undefined) spans[2].textContent = fmt(coins);
            if (store.settings().showPnL && total !== undefined) {
                const pf = store.portfolio();
                if (!pf.snaps) pf.snaps = [];
                pf.snaps.push({ total, ts: Date.now() });
                pf.snaps = pf.snaps.filter(s => Date.now() - s.ts < 86400000 * 7);
                store.pfSet(pf);
                document.getElementById(CONFIG.ids.pnlEl)?.remove();
                if (pf.snaps.length >= 2) {
                    const old = pf.snaps[0].total;
                    const diff = total - old;
                    const pct = old > 0 ? ((diff / old) * 100).toFixed(2) : '0.00';
                    const el = document.createElement('div');
                    el.id = CONFIG.ids.pnlEl;
                    el.className = `re-pnl ${diff >= 0 ? 'pos' : 'neg'}`;
                    el.textContent = `${diff >= 0 ? '+' : ''}${utils.usd(diff)} (${diff >= 0 ? '+' : ''}${pct}%) session`;
                    wrap.appendChild(el);
                }
            }
            this.lastTotal = total;
        },
    };

    const alertEngine = {
        init() { wsInterceptor.on(d => { const sym = ((d.data?.coinSymbol || d.data?.symbol) || '').toUpperCase(); const px = parseFloat(d.data?.price || d.data?.currentPrice || 0); if (sym && px) this._chk(sym, px); }); },
        _chk(sym, px) {
            const al = store.alerts(); let ch = false;
            al.forEach(a => {
                if (a.sym !== sym || a.done) return;
                const hit = (a.dir === 'above' && px >= a.px) || (a.dir === 'below' && px <= a.px);
                if (!hit) return;
                a.done = true; a.hitAt = Date.now(); ch = true;
                notifier.show({ title: '🔔 Price Alert', description: `${sym} hit ${utils.usd(px)} — target: ${a.dir} ${utils.usd(a.px)}`, type: a.dir === 'above' ? 'success' : 'warning', duration: 0, actions: [{ label: 'View Coin', onClick: () => { location.href = `/coin/${sym}`; } }, { label: 'Dismiss', onClick: () => {} }] });
                if (store.settings().desktopAlerts && typeof GM_notification !== 'undefined' && Notification.permission === 'granted') GM_notification({ title: 'Rugplay Enhanced', text: `${sym} hit ${utils.usd(px)}`, timeout: 8000 });
            });
            if (ch) store.alSet(al);
        },
        add(sym, px, dir) { const al = store.alerts(); al.push({ id: utils.uid(), sym: sym.toUpperCase(), px: parseFloat(px), dir, done: false, at: Date.now() }); store.alSet(al); notifier.ok(`Alert set: ${sym} ${dir} ${utils.usd(px)}`); },
        del: id => store.alSet(store.alerts().filter(a => a.id !== id)),
    };

    const volumeDetector = {
        hist: {},
        init() { wsInterceptor.on(d => { if (!['live-trade', 'all-trades'].includes(d.type)) return; const sym = (d.data?.coinSymbol || '').toUpperCase(); const v = parseFloat(d.data?.totalValue || 0); if (!sym || !v) return; if (!this.hist[sym]) this.hist[sym] = { t: [], last: 0 }; const h = this.hist[sym]; h.t.push({ v, ts: Date.now() }); h.t = h.t.filter(x => Date.now() - x.ts < 60000); const tot = h.t.reduce((s, x) => s + x.v, 0); if (!store.settings().volumeSpikes) return; if (tot > 5000 && Date.now() - h.last > 30000) { h.last = Date.now(); notifier.show({ title: '📈 Volume Spike', description: `${sym} — ${utils.usd(tot)} in the last 60s`, type: 'warning', duration: 8000, actions: [{ label: 'View', onClick: () => { location.href = `/coin/${sym}`; } }] }); } }); },
        get: sym => (volumeDetector.hist[sym]?.t || []).reduce((s, x) => s + x.v, 0),
    };

    const botDetector = {
        tr: {},
        init() { wsInterceptor.on(d => { if (!['live-trade', 'all-trades'].includes(d.type)) return; const sym = (d.data?.coinSymbol || '').toUpperCase(); const usr = d.data?.username; if (!sym || !usr) return; if (!this.tr[sym]) this.tr[sym] = []; this.tr[sym].push({ usr, v: parseFloat(d.data?.totalValue || 0), type: (d.data?.type || '').toUpperCase(), ts: Date.now() }); this.tr[sym] = this.tr[sym].filter(x => Date.now() - x.ts < 120000); this._ana(sym); }); },
        _ana(sym) { const tr = this.tr[sym]; if (!tr || tr.length < 6 || !store.settings().botWarning) return; const uc = {}; tr.forEach(t => { uc[t.usr] = (uc[t.usr] || 0) + 1; }); const iv = []; for (let i = 1; i < tr.length; i++) iv.push(tr[i].ts - tr[i - 1].ts); const avg = iv.reduce((a, b) => a + b, 0) / iv.length; const vr = iv.reduce((a, b) => a + (b - avg) ** 2, 0) / iv.length; if ((vr < 5000 && avg < 3000) || Object.values(uc).some(c => c >= 4)) { const k = `re_bw_${sym}`; if (GM_getValue(k, 0) > Date.now() - 60000) return; GM_setValue(k, Date.now()); notifier.show({ title: '🤖 Bot Activity', description: `${sym} — suspicious patterns detected in the last 2 minutes`, type: 'warning', duration: 10000, actions: [{ label: 'View Coin', onClick: () => { location.href = `/coin/${sym}`; } }] }); } },
        trades: sym => botDetector.tr[sym] || [],
    };

    const riskScorer = {
        cache: {},
        async score(sym) {
            if (this.cache[sym] && Date.now() - this.cache[sym].ts < 300000) return this.cache[sym];
            try {
                const r = await fetch(`/coin/${sym}/__data.json?x-sveltekit-invalidated=11`); if (!r.ok) return null;
                const d = await r.json(); const da = d?.nodes?.[1]?.data; if (!Array.isArray(da)) return null;
                const ci = da[0]?.coin; if (ci === undefined) return null;
                const coin = da[ci]; if (!coin || typeof coin !== 'object') return null;
                const getVal = (idx) => (idx != null && da[idx] !== undefined ? da[idx] : null);
                const holders = getVal(coin.holderCount) ?? 0;
                const mcap = getVal(coin.marketCap) ?? 0;
                const created = getVal(coin.createdAt) ?? Date.now();
                const ageH = (Date.now() - new Date(created).getTime()) / 3600000;
                let risk = 0; const fac = [];
                if (ageH < 1) { risk += 30; fac.push('Under 1 hour old'); } else if (ageH < 6) { risk += 15; fac.push('Under 6 hours old'); }
                if (holders < 10) { risk += 25; fac.push('Under 10 holders'); } else if (holders < 50) { risk += 12; fac.push('Under 50 holders'); }
                if (mcap < 100) { risk += 20; fac.push('Market cap under $100'); } else if (mcap < 1000) { risk += 10; fac.push('Market cap under $1,000'); }
                const sells = botDetector.trades(sym).filter(t => t.type === 'SELL' && Date.now() - t.ts < 60000);
                if (sells.length > 5) { risk += 20; fac.push('Heavy recent selling'); }
                risk = Math.min(100, Math.max(0, risk));
                const label = risk >= 70 ? 'HIGH' : risk >= 40 ? 'MEDIUM' : 'LOW';
                const creatorUsername = getVal(coin.creatorUsername) ?? getVal(coin.creator) ?? null;
                const result = { sym, risk, fac, label, ts: Date.now(), creatorUsername: typeof creatorUsername === 'string' ? creatorUsername : null };
                this.cache[sym] = result;
                return result;
            } catch { return null; }
        },
    };

    const reportedChecker = {
        cache: null,
        cacheTs: 0,
        TTL: 300000,
        async getReportedSet() {
            if (this.cache && Date.now() - this.cacheTs < this.TTL) return this.cache;
            try {
                const r = await api.get('/v1/reports?page=1&limit=100');
                if (r.status !== 'success' || !r.data?.reports) { this.cache = new Set(); this.cacheTs = Date.now(); return this.cache; }
                const set = new Set();
                r.data.reports.forEach(rp => {
                    if (rp.reported_username) set.add(String(rp.reported_username).toLowerCase());
                    if (rp.coin_symbol) set.add(`*${String(rp.coin_symbol).toUpperCase()}`);
                });
                this.cache = set; this.cacheTs = Date.now();
                return set;
            } catch { this.cache = new Set(); this.cacheTs = Date.now(); return this.cache; }
        },
        async isReported(creatorUsername, coinSymbol) {
            const set = await this.getReportedSet();
            if (!set) return false;
            if (creatorUsername && set.has(String(creatorUsername).toLowerCase())) return true;
            if (coinSymbol && set.has(`*${String(coinSymbol).toUpperCase()}`)) return true;
            return false;
        },
    };

    const liveFeed = {
        trades: [],
        open: false,
        tsTimer: null,
        paused: false,
        _renderT: 0,
        init() {
            wsInterceptor.on(d => {
                if (!['live-trade', 'all-trades'].includes(d.type)) return;
                const t = d.data; if (!t) return;
                portfolioUpdater.trigger();
                this.trades.unshift({ sym: (t.coinSymbol || '').toUpperCase(), usr: t.username || '?', type: (t.type || 'BUY').toUpperCase(), val: parseFloat(t.totalValue || 0), px: parseFloat(t.price || 0), ts: t.timestamp || Date.now() });
                this.trades = this.trades.slice(0, 500);
                if (this.open && !this.paused) this._renderThrottled();
            });
        },
        _renderThrottled() {
            const now = Date.now();
            if (now - this._renderT < 250) return;
            this._renderT = now;
            this.render();
            dashboard.render();
        },
        render() {
            const body = document.getElementById('re-feed-rows'); if (!body) return;
            const f = (document.getElementById('re-feed-filter')?.value || '').trim();
            const fU = f.toUpperCase();
            const min = parseFloat(document.getElementById('re-feed-min')?.value || '0') || 0;
            const side = document.getElementById('re-feed-side')?.value || 'all';
            const shown = this.trades.filter(t => {
                if (min && t.val < min) return false;
                if (side !== 'all' && t.type !== side) return false;
                if (!f) return true;
                return t.sym.includes(fU) || (t.usr || '').toLowerCase().includes(f.toLowerCase());
            });
            if (!shown.length) { body.innerHTML = '<div class="re-empty">Waiting for live trades...</div>'; return; }
            body.innerHTML = shown.slice(0, 80).map(t => `<a href="/coin/${t.sym}" class="re-feed-row ${t.type === 'SELL' ? 'sell' : 'buy'}"><span class="re-fd-b ${t.type === 'SELL' ? 'sell' : 'buy'}">${t.type}</span><span class="re-fd-s">${t.sym}</span><span class="re-fd-u">${t.usr}</span><span class="re-fd-v">${utils.usd(t.val)}</span><span class="re-fd-t" data-ts="${t.ts}">${utils.ago(t.ts)}</span></a>`).join('');
        },
        startTsTimer() { this.stopTsTimer(); this.tsTimer = setInterval(() => { document.querySelectorAll('.re-fd-t[data-ts]').forEach(el => { el.textContent = utils.ago(+el.dataset.ts); }); }, 1000); },
        stopTsTimer() { if (this.tsTimer) { clearInterval(this.tsTimer); this.tsTimer = null; } },
    };

    const dashboard = {
        render() {
            if (!enhancedPanel.isVisible) return;
            const hotEl = document.getElementById('re-hot-body');
            const whaleEl = document.getElementById('re-whale-body');
            const statEl = document.getElementById('re-stats-body');
            if (!hotEl || !whaleEl || !statEl) return;

            const sinceMs = parseInt(document.getElementById('re-agg-window')?.value || '600000', 10) || 600000;
            const since = Date.now() - sinceMs;
            const trades = liveFeed.trades.filter(t => +t.ts >= since);
            const by = {};
            for (const t of trades) {
                if (!t.sym) continue;
                if (!by[t.sym]) by[t.sym] = { sym: t.sym, vol: 0, n: 0, buy: 0, sell: 0, last: t.ts };
                const a = by[t.sym];
                a.vol += +t.val || 0;
                a.n += 1;
                if (t.type === 'BUY') a.buy += 1;
                if (t.type === 'SELL') a.sell += 1;
                if (+t.ts > +a.last) a.last = t.ts;
            }
            const hot = Object.values(by).sort((a, b) => b.vol - a.vol).slice(0, 10);
            hotEl.innerHTML = hot.length
                ? hot.map(h => `<a class="re-mini-row" href="/coin/${h.sym}"><span class="re-mini-sym">${h.sym}</span><span class="re-mini-sub">${h.n} trades · ${utils.usd(h.vol)} · ${utils.ago(h.last)}</span><span class="re-mini-badge ${h.buy >= h.sell ? 'buy' : 'sell'}">${h.buy}/${h.sell}</span></a>`).join('')
                : `<div class="re-empty">No data yet.</div>`;

            const minWhale = parseFloat(document.getElementById('re-whale-min')?.value || '250') || 250;
            const whales = trades.filter(t => (+t.val || 0) >= minWhale).slice(0, 25).sort((a, b) => (+b.val || 0) - (+a.val || 0)).slice(0, 12);
            whaleEl.innerHTML = whales.length
                ? whales.map(t => `<a class="re-mini-row" href="/coin/${t.sym}"><span class="re-mini-sym">${t.sym}</span><span class="re-mini-sub">${t.usr} · ${t.type} · ${utils.usd(t.val)} · ${utils.ago(t.ts)}</span><span class="re-mini-badge ${t.type === 'SELL' ? 'sell' : 'buy'}">${t.type}</span></a>`).join('')
                : `<div class="re-empty">No whales over ${utils.usd(minWhale)}.</div>`;

            const totalVol = trades.reduce((s, t) => s + (+t.val || 0), 0);
            const buys = trades.filter(t => t.type === 'BUY').length;
            const sells = trades.filter(t => t.type === 'SELL').length;
            const avg = trades.length ? totalVol / trades.length : 0;
            statEl.innerHTML = `
                <div class="re-stat-grid">
                    <div class="re-stat"><div class="re-stat-k">Window</div><div class="re-stat-v">${Math.round(sinceMs / 60000)}m</div></div>
                    <div class="re-stat"><div class="re-stat-k">Trades</div><div class="re-stat-v">${trades.length}</div></div>
                    <div class="re-stat"><div class="re-stat-k">Volume</div><div class="re-stat-v">${utils.usd(totalVol)}</div></div>
                    <div class="re-stat"><div class="re-stat-k">Avg</div><div class="re-stat-v">${utils.usd(avg)}</div></div>
                    <div class="re-stat"><div class="re-stat-k">Buys/Sells</div><div class="re-stat-v">${buys}/${sells}</div></div>
                </div>
            `;
        },
    };

    const userTagger = {
        cache: null, cacheTs: 0,
        async load() { if (this.cache && Date.now() - this.cacheTs < 300000) return this.cache; try { const r = await api.get('/v1/tags'); if (r.status === 'success') { this.cache = r.data; this.cacheTs = Date.now(); return this.cache; } } catch {} return {}; },
        async applyTags() {
            const tags = await this.load(); if (!tags || !Object.keys(tags).length) return;
            if (utils.isUserPage()) { const u = utils.getUsernameFromPage(); if (u) { const d = tags[u.toLowerCase()]; const el = document.querySelector('p.text-muted-foreground.text-lg'); if (el && d && !el.querySelector('.re-tag')) { const t = document.createElement('span'); t.className = 're-tag'; t.textContent = d.label || d.tag; t.style.background = d.style?.bg || '#6366f1'; t.style.color = d.style?.text || '#fff'; el.appendChild(t); } } }
            if (utils.isCoinPage()) { document.querySelectorAll('.border-b:not([data-re-tag])').forEach(el => { const sp = el.querySelector('button span.truncate'); if (!sp) return; const u = sp.textContent.replace('@', '').trim().toLowerCase(); const d = tags[u]; if (d && !el.querySelector('.re-tag')) { const t = document.createElement('span'); t.className = 're-tag'; t.textContent = d.label || d.tag; t.style.background = d.style?.bg || '#6366f1'; t.style.color = d.style?.text || '#fff'; sp.parentElement?.appendChild(t); } el.setAttribute('data-re-tag', '1'); }); }
        },
    };

    const updateChecker = {
        newer: (c, r) => { const ca = c.split('.').map(Number), ra = r.split('.').map(Number); for (let i = 0; i < Math.max(ca.length, ra.length); i++) { if ((ra[i] || 0) > (ca[i] || 0)) return true; if ((ca[i] || 0) > (ra[i] || 0)) return false; } return false; },
        async check() {
            try {
                const r = await api.get('/v1/update'); if (r.status !== 'success') return;
                const rem = r.data?.version; if (!rem || !this.newer(GM_info.script.version, rem)) return;
                let desc = `Version ${rem} is available.`;
                try { const cl = await api.get(`/v1/changelog?version=${rem}`); if (cl?.data?.changes?.length) desc = cl.data.changes.slice(0, 3).join(' · '); } catch {}
                notifier.show({ title: `Rugplay Enhanced ${rem}`, description: desc, type: 'info', duration: 0, actions: [{ label: 'Update Now', onClick: () => window.open('https://github.com/devbyego/rugplay-enhanced/releases/latest', '_blank') }, { label: 'Later', onClick: () => {} }] });
            } catch {}
        },
    };

    const tableEnhancer = {
        enhance() {
            if (!utils.isUserPage()) return;
            const tbody = utils.findElement(CONFIG.selectors.tableSelectors); if (!tbody) return;
            tbody.querySelectorAll('tr:not([data-re-click])').forEach(row => {
                const img = row.querySelector('img[alt]'); if (!img) return;
                const sym = img.getAttribute('alt'); if (!sym) return;
                row.setAttribute('data-re-click', '1'); row.style.cursor = 'pointer'; row.style.transition = 'background .15s';
                row.addEventListener('mouseenter', () => row.style.backgroundColor = 'rgba(255,255,255,.04)');
                row.addEventListener('mouseleave', () => row.style.backgroundColor = '');
                row.addEventListener('click', e => { if (!['A', 'BUTTON'].includes(e.target.tagName.toUpperCase())) location.href = `https://rugplay.com/coin/${sym}`; });
            });
        },
    };

    const quickSearch = {
        open: false,
        toggle() {
            let el = document.getElementById('re-search-modal');
            if (el) { el.remove(); this.open = false; return; }
            this.open = true;
            el = document.createElement('div'); el.id = 're-search-modal'; el.className = 're-search-wrap';
            el.innerHTML = `<div class="re-search-box"><div class="re-search-top"><div class="re-search-icon-wrap">${ICONS.search}</div><input id="re-sq" class="re-search-inp" placeholder="Search coins or users..." autofocus /><kbd class="re-kbd">ESC</kbd></div><div id="re-search-res" class="re-search-results"><div class="re-empty">Type to search...</div></div></div>`;
            document.body.appendChild(el);
            el.addEventListener('click', e => { if (e.target === el) { el.remove(); this.open = false; } });
            document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.getElementById('re-search-modal')?.remove(); this.open = false; } }, { once: true });
            const inp = document.getElementById('re-sq');
            const closeModal = () => { document.getElementById('re-search-modal')?.remove(); this.open = false; };
            const navigate = (raw) => {
                const q = String(raw || '').trim();
                if (!q) return;
                const qNoAt = q.startsWith('@') ? q.slice(1) : q;
                // If it looks like an UPPERCASE symbol, treat as coin; otherwise treat as user.
                const isLikelyCoin = /^[A-Z0-9]{1,12}$/.test(q);
                if (q.startsWith('@') || (!isLikelyCoin && /^[a-zA-Z0-9_.-]{2,}$/.test(qNoAt))) {
                    location.href = `/user/${encodeURIComponent(qNoAt)}`;
                } else {
                    location.href = `/coin/${encodeURIComponent(q.toUpperCase())}`;
                }
            };
            inp.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    navigate(inp.value);
                    closeModal();
                }
            });
            inp.addEventListener('input', utils.debounce(async () => {
                const q = inp.value.trim(); const res = document.getElementById('re-search-res'); if (!res) return;
                if (q.length < 2) { res.innerHTML = '<div class="re-empty">Type at least 2 characters...</div>'; return; }
                res.innerHTML = `<div class="re-empty">${ICONS.loading} Searching...</div>`;
                try {
                    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`); if (!r.ok) throw new Error();
                    const d = await r.json();
                    const coins = d.coins || d.results || []; const users = d.users || [];
                    if (!coins.length && !users.length) { res.innerHTML = '<div class="re-empty">No results found</div>'; return; }
                    res.innerHTML = [
                        ...coins.slice(0, 6).map(c => `<a href="/coin/${c.symbol}" class="re-sr-row" data-re-close="1"><div class="re-sr-main"><span class="re-sr-name">${c.name || c.symbol}</span><span class="re-badge ${c.priceChange24h >= 0 ? 'buy' : 'sell'}" style="font-size:10px">${(c.priceChange24h || 0) >= 0 ? '+' : ''}${(c.priceChange24h || 0).toFixed(2)}%</span></div><div class="re-sr-sub">${c.symbol} · ${utils.usd(c.currentPrice || 0)}</div></a>`),
                        ...users.slice(0, 3).map(u => `<a href="/user/${u.username}" class="re-sr-row" data-re-close="1"><div class="re-sr-main"><span class="re-sr-name">@${u.username}</span></div><div class="re-sr-sub">User Profile</div></a>`),
                    ].join('');
                    res.querySelectorAll('a[data-re-close="1"]').forEach(a => a.addEventListener('click', closeModal, { once: true }));
                } catch {
                    // Fallback: search through observed live trades (no API needed).
                    const ql = q.toLowerCase();
                    const coinQ = q.replace(/^\*/, '').toUpperCase();
                    const userQ = (q.startsWith('@') ? q.slice(1) : q).toLowerCase();
                    const coins = Array.from(new Set(liveFeed.trades.map(t => t.sym).filter(Boolean)))
                        .filter(s => s.toLowerCase().includes(ql))
                        .slice(0, 8);
                    const users = Array.from(new Set(liveFeed.trades.map(t => t.usr).filter(Boolean)))
                        .filter(u => u.toLowerCase().includes(userQ))
                        .slice(0, 6);
                    const coinRows = coins.map(s => `<a href="/coin/${encodeURIComponent(s)}" class="re-sr-row" data-re-close="1"><div class="re-sr-main"><span class="re-sr-name">${s}</span></div><div class="re-sr-sub">From live feed</div></a>`);
                    const userRows = users.map(u => `<a href="/user/${encodeURIComponent(u)}" class="re-sr-row" data-re-close="1"><div class="re-sr-main"><span class="re-sr-name">@${u}</span></div><div class="re-sr-sub">From live feed</div></a>`);
                    res.innerHTML = `
                        <div class="re-empty re-err">Search API unavailable. Using live feed fallback.</div>
                        ${coinRows.length ? `<div class="re-empty" style="padding:10px 16px;text-align:left">Coins</div>${coinRows.join('')}` : ''}
                        ${userRows.length ? `<div class="re-empty" style="padding:10px 16px;text-align:left">Users</div>${userRows.join('')}` : ''}
                        <div class="re-empty" style="padding:10px 16px;text-align:left">Direct jump</div>
                        <a href="/coin/${encodeURIComponent(coinQ)}" class="re-sr-row" data-re-close="1"><div class="re-sr-main"><span class="re-sr-name">Coin: ${coinQ}</span></div><div class="re-sr-sub">Press Enter to go</div></a>
                        <a href="/user/${encodeURIComponent(q.startsWith('@') ? q.slice(1) : q)}" class="re-sr-row" data-re-close="1"><div class="re-sr-main"><span class="re-sr-name">User: @${q.startsWith('@') ? q.slice(1) : q}</span></div><div class="re-sr-sub">Press Enter to go</div></a>
                    `;
                    res.querySelectorAll('a[data-re-close="1"]').forEach(a => a.addEventListener('click', closeModal, { once: true }));
                }
            }, 300));
        },
    };

    const coinPageEnhancer = {
        tsTimer: null,
        _pending: new Set(),
        _findTradeCard(sym) {
            try {
                const s = String(sym || '').toUpperCase();
                const buttons = Array.from(document.querySelectorAll('main button'));
                const buyBtn = buttons.find(b => (b.textContent || '').trim().toUpperCase() === `BUY ${s}`);
                const sellBtn = buttons.find(b => (b.textContent || '').trim().toUpperCase() === `SELL ${s}`);
                const any = buyBtn || sellBtn || buttons.find(b => /^BUY\b/i.test((b.textContent || '').trim()));
                const card = any?.closest('div.bg-card') || any?.closest('div.rounded-xl') || any?.closest('section') || any?.closest('div');
                return card || null;
            } catch { return null; }
        },
        _insertAfterTrade(sym, cardEl) {
            const trade = this._findTradeCard(sym);
            if (!trade) return false;
            const after = document.getElementById(CONFIG.ids.coinNoteCard)
                || document.getElementById(CONFIG.ids.coinRiskCard)
                || document.getElementById(CONFIG.ids.coinTxCard)
                || trade;
            try { after.insertAdjacentElement('afterend', cardEl); return true; } catch { return false; }
        },
        async init() {
            if (!utils.isCoinPage()) { this.stopTsTimer(); return; }
            const sym = utils.getCoinSymbol(); if (!sym) return;
            await Promise.all([this._riskCard(sym), this._reportedBadge(sym), this._txCard(sym), this._noteCard(sym)]);
        },
        async _riskCard(sym) {
            if (document.getElementById(CONFIG.ids.coinRiskCard) || !store.settings().riskScore) return;
            const key = `risk:${sym}`;
            if (this._pending.has(key)) return;
            this._pending.add(key);
            await utils.sleep(900);
            const sc = await riskScorer.score(sym); if (!sc) { this._pending.delete(key); return; }
            const anchor = Array.from(document.querySelectorAll(`${CONFIG.selectors.coinPageCardContainer} > div.bg-card`)).find(c => c.textContent.includes('Top Holders'));
            const col = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' }[sc.label];
            const card = document.createElement('div'); card.id = CONFIG.ids.coinRiskCard; card.className = 'bg-card text-card-foreground flex flex-col rounded-xl border py-6 shadow-sm gap-4';
            card.innerHTML = `<div class="grid grid-cols-[1fr_auto] items-center gap-1.5 px-6"><div class="font-semibold leading-none flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>Risk Assessment</div><span style="color:${col};font-weight:700;font-size:13px;padding:2px 10px;background:${col}18;border-radius:5px">${sc.label}</span></div><div class="px-6"><div style="height:5px;background:hsl(var(--accent));border-radius:3px;overflow:hidden;margin-bottom:10px"><div style="width:${sc.risk}%;height:100%;background:${col};border-radius:3px;transition:width .5s ease"></div></div><div style="font-size:22px;font-weight:800;color:${col};margin-bottom:8px">${sc.risk}<span style="font-size:13px;font-weight:400;color:hsl(var(--muted-foreground))">/100</span></div>${sc.fac.length ? sc.fac.map(f => `<div style="font-size:12px;color:hsl(var(--muted-foreground));margin-bottom:3px">⚠ ${f}</div>`).join('') : '<div style="font-size:12px;color:hsl(var(--muted-foreground))">No major risk factors detected</div>'}</div>`;
            if (!this._insertAfterTrade(sym, card)) {
                if (!anchor) { this._pending.delete(key); return; }
                anchor.insertAdjacentElement('beforebegin', card);
            }
            this._pending.delete(key);
        },
        async _reportedBadge(sym) {
            if (document.getElementById(CONFIG.ids.reportedCreatorBadge)) return;
            const key = `reported:${sym}`;
            if (this._pending.has(key)) return;
            this._pending.add(key);
            const sc = await riskScorer.score(sym); if (!sc?.creatorUsername) return;
            const reported = await reportedChecker.isReported(sc.creatorUsername, sym);
            if (!reported) { this._pending.delete(key); return; }
            await utils.sleep(500);
            const createdBySpan = Array.from(document.querySelectorAll('span')).find(s => s.textContent?.trim() === 'Created by');
            if (!createdBySpan?.parentElement) { this._pending.delete(key); return; }
            const badge = document.createElement('div');
            badge.id = CONFIG.ids.reportedCreatorBadge;
            badge.className = 're-reported-badge';
            badge.innerHTML = `<span class="re-reported-label">⚠ Community reported</span><div class="re-reported-tooltip">This creator or coin has been reported in Rugpull Reporter. Check the Enhanced panel for details.</div>`;
            createdBySpan.parentElement.appendChild(badge);
            this._pending.delete(key);
        },
        async _txCard(sym) {
            if (document.getElementById(CONFIG.ids.coinTxCard)) return;
            const key = `tx:${sym}`;
            if (this._pending.has(key)) return;
            this._pending.add(key);
            await utils.sleep(800);
            const anchor = Array.from(document.querySelectorAll(`${CONFIG.selectors.coinPageCardContainer} > div.bg-card`)).find(c => c.textContent.includes('Top Holders'));
            const style = document.createElement('style'); style.textContent = `@keyframes re-hl{from{background:rgba(74,222,128,.18)}to{background:transparent}}.re-new-tx{animation:re-hl 2s ease-out}`; document.head.appendChild(style);
            const card = document.createElement('div'); card.id = CONFIG.ids.coinTxCard; card.className = 'bg-card text-card-foreground flex flex-col rounded-xl border py-6 shadow-sm gap-4';
            card.innerHTML = `<div class="grid grid-cols-[1fr_auto] items-center gap-1.5 px-6"><div class="font-semibold leading-none flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>Recent Transactions<button id="${CONFIG.ids.coinTxRefresh}" class="ml-1 p-1.5 rounded-md hover:bg-accent transition-colors" title="Refresh">${ICONS.refresh}</button></div></div><div id="${CONFIG.ids.coinTxBody}" class="px-0 min-h-[120px] flex items-center justify-center"><div class="flex flex-col items-center gap-2 text-muted-foreground">${ICONS.loading}<span class="text-sm animate-pulse">Loading...</span></div></div><div id="${CONFIG.ids.coinTxPagination}" class="px-6 flex justify-center items-center gap-2"></div>`;
            if (!this._insertAfterTrade(sym, card)) {
                if (!anchor) { this._pending.delete(key); return; }
                anchor.insertAdjacentElement('beforebegin', card);
            }
            document.getElementById(CONFIG.ids.coinTxRefresh)?.addEventListener('click', () => this._loadTx(sym, 1, true));
            await this._loadTx(sym, 1);
            this.startTsTimer();
            this._pending.delete(key);
        },
        async _loadTx(sym, pg = 1, isRefresh = false) {
            const body = document.getElementById(CONFIG.ids.coinTxBody); if (!body) return;
            const ref = document.getElementById(CONFIG.ids.coinTxRefresh);
            if (ref) ref.querySelector('svg')?.classList.add('re-spin');
            if (!isRefresh) body.innerHTML = `<div class="flex flex-col items-center gap-2 text-muted-foreground">${ICONS.loading}<span class="text-sm animate-pulse">Loading page ${pg}...</span></div>`;
            try {
                let d = null;
                try {
                    d = await vaaqApi.coinTrades(sym, pg, 10);
                } catch {}
                if (!d) {
                    const r = await fetch(`/api/coin/${sym}/trades?page=${pg}&limit=10`); if (!r.ok) throw 0;
                    d = await r.json();
                }
                const tr = d.trades || d.data || d.results || [];
                if (ref) ref.querySelector('svg')?.classList.remove('re-spin');
                if (!document.getElementById(CONFIG.ids.coinTxCard)) return;
                if (!tr.length) { body.innerHTML = '<div class="flex justify-center items-center p-6 text-muted-foreground text-sm">No transactions found</div>'; return; }
                const rows = tr.map(t => {
                    const type = (t.type || 'BUY').toUpperCase();
                    const isSell = type === 'SELL';
                    const cls = isSell ? 'bg-destructive hover:bg-destructive/90' : 'bg-green-600 hover:bg-green-700';
                    const ts = t.timestamp || t.createdAt || 0;
                    const id = t.id || t.txId || `${t.username || ''}_${ts}_${t.totalValue || t.value || ''}`;
                    const user = t.username || t.user || '?';
                    const val = +(t.totalValue || t.value || 0);
                    return `<tr class="hover:bg-muted/50 border-b transition-colors" data-ts="${ts}" data-id="${String(id)}"><td class="py-2 px-3 pl-6 w-[15%]"><span class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium text-white border-transparent ${cls}">${type}</span></td><td class="py-2 px-3 w-[35%]"><a href="/user/${user}" class="font-medium hover:underline">${user}</a></td><td class="py-2 px-3 w-[25%] font-mono text-sm">$${val.toFixed(2)}</td><td class="py-2 px-3 w-[25%] pr-6 text-right text-muted-foreground text-sm re-ts-el" data-ts="${ts}">${utils.ago(ts)}</td></tr>`;
                }).join('');
                if (isRefresh) {
                    const tbody = body.querySelector('tbody');
                    if (tbody) { const oldIds = new Set(Array.from(tbody.querySelectorAll('tr')).map(r => r.dataset.id)); const newIds = new Set(tr.map(t => String(t.id || ''))); tbody.querySelectorAll('tr').forEach(row => { if (!newIds.has(row.dataset.id)) row.remove(); }); const tmp = document.createElement('div'); tmp.innerHTML = `<table><tbody>${rows}</tbody></table>`; Array.from(tmp.querySelectorAll('tr')).reverse().forEach(nr => { if (!oldIds.has(nr.dataset.id)) { nr.classList.add('re-new-tx'); tbody.prepend(nr); } }); while (tbody.children.length > 10) tbody.lastChild.remove(); return; }
                }
                body.innerHTML = `<div class="relative w-full overflow-x-auto"><table class="w-full caption-bottom text-sm"><thead class="[&_tr]:border-b"><tr class="border-b"><th class="h-9 px-3 pl-6 text-left font-medium text-muted-foreground">Type</th><th class="h-9 px-3 text-left font-medium text-muted-foreground">User</th><th class="h-9 px-3 text-left font-medium text-muted-foreground">Value</th><th class="h-9 px-3 pr-6 text-right font-medium text-muted-foreground">Time</th></tr></thead><tbody>${rows}</tbody></table></div>`;
                const pag = document.getElementById(CONFIG.ids.coinTxPagination);
                const p = d.pagination;
                if (pag && p && p.total_pages > 1) {
                    pag.innerHTML = '';
                    const mkBtn = (label, page, disabled = false) => { const b = document.createElement('button'); b.textContent = label; b.className = 'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium h-9 px-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors'; if (disabled) { b.setAttribute('disabled', ''); b.style.opacity = '.4'; } else b.onclick = () => this._loadTx(sym, page); return b; };
                    pag.appendChild(mkBtn('«', p.current_page - 1, p.current_page === 1));
                    const info = document.createElement('span'); info.className = 'text-sm text-muted-foreground'; info.textContent = `${p.current_page} / ${p.total_pages}`; pag.appendChild(info);
                    pag.appendChild(mkBtn('»', p.current_page + 1, p.current_page >= p.total_pages));
                }
            } catch { if (ref) ref.querySelector('svg')?.classList.remove('re-spin'); body.innerHTML = '<div class="flex justify-center items-center p-6 text-destructive text-sm">Failed to load transactions</div>'; }
        },
        startTsTimer() { this.stopTsTimer(); this.tsTimer = setInterval(() => { document.querySelectorAll('.re-ts-el[data-ts]').forEach(el => { el.textContent = utils.ago(+el.dataset.ts); }); }, 1000); },
        stopTsTimer() { if (this.tsTimer) { clearInterval(this.tsTimer); this.tsTimer = null; } },
        async _noteCard(sym) {
            if (document.getElementById(CONFIG.ids.coinNoteCard)) return;
            const key = `note:${sym}`;
            if (this._pending.has(key)) return;
            this._pending.add(key);
            await utils.sleep(1100);
            const anchor = Array.from(document.querySelectorAll(`${CONFIG.selectors.coinPageCardContainer} > div.bg-card`)).find(c => c.textContent.includes('Top Holders'));
            const saved = (store.notes()[sym] || '');
            const card = document.createElement('div'); card.id = CONFIG.ids.coinNoteCard; card.className = 'bg-card text-card-foreground flex flex-col rounded-xl border py-6 shadow-sm gap-4';
            card.innerHTML = `<div class="px-6"><div class="font-semibold leading-none mb-4 flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>My Notes<span class="text-xs font-normal text-muted-foreground ml-auto">Local only</span></div><textarea id="re-note-ta" style="width:100%;min-height:80px;resize:vertical;background:hsl(var(--background));border:1px solid hsl(var(--border));border-radius:6px;padding:8px;font-size:13px;color:hsl(var(--foreground));outline:none;box-sizing:border-box;font-family:inherit" placeholder="Notes about this coin...">${saved}</textarea><div id="re-note-st" style="font-size:11px;color:hsl(var(--muted-foreground));text-align:right;margin-top:4px;height:14px"></div></div>`;
            if (!this._insertAfterTrade(sym, card)) {
                if (!anchor) { this._pending.delete(key); return; }
                anchor.insertAdjacentElement('beforebegin', card);
            }
            const ta = document.getElementById('re-note-ta'); const st = document.getElementById('re-note-st');
            ta.addEventListener('input', utils.debounce(() => { const n = store.notes(); if (ta.value.trim()) n[sym] = ta.value.trim(); else delete n[sym]; store.notesSet(n); st.textContent = 'Saved'; setTimeout(() => { st.textContent = ''; }, 1500); }, 600));
            this._pending.delete(key);
        },
    };

    const profileEnhancer = {
        async init() {
            if (!utils.isUserPage() || document.getElementById(CONFIG.ids.profileBtns)) return;
            const pu = utils.getUsernameFromPage(); if (!pu) return;
            const hdr = document.querySelector(CONFIG.selectors.profileHeaderContainer); if (!hdr) return;
            hdr.style.position = 'relative';
            const cont = document.createElement('div'); cont.id = CONFIG.ids.profileBtns;
            cont.className = 'absolute top-4 right-4 flex items-center gap-2 z-10';
            const btnCls = 'focus-visible:border-ring focus-visible:ring-ring/50 inline-flex shrink-0 items-center justify-center whitespace-nowrap text-sm font-medium outline-none transition-all focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 cursor-pointer bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border h-8 gap-1.5 rounded-md px-3';
            const me = await utils.getLoggedInUsername();
            if (me?.toLowerCase() === pu.toLowerCase()) { const a = document.createElement('a'); a.href = '/settings'; a.className = btnCls; a.innerHTML = `${ICONS.edit} Edit`; cont.appendChild(a); }
            const histBtn = document.createElement('button'); histBtn.className = btnCls; histBtn.innerHTML = `${ICONS.history} History`; histBtn.onclick = () => this._showHistory(pu, 1); cont.appendChild(histBtn);
            hdr.appendChild(cont);
        },
        async _showHistory(user, pg = 1) {
            let ov = document.getElementById(CONFIG.ids.historyModalOverlay);
            if (!ov) {
                ov = document.createElement('div'); ov.id = CONFIG.ids.historyModalOverlay; ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.72);align-items:center;justify-content:center;backdrop-filter:blur(4px)';
                ov.innerHTML = `<div style="position:relative;margin:20px;width:95%;max-width:900px;max-height:85vh;display:flex;flex-direction:column;animation:re-modal-in .2s cubic-bezier(.16,1,.3,1) forwards" class="bg-card text-card-foreground rounded-xl border shadow-2xl overflow-hidden"><button id="re-hist-cl" style="position:absolute;right:12px;top:12px;z-index:50;padding:8px;cursor:pointer;border:none;border-radius:6px;background:none;color:hsl(var(--muted-foreground));transition:background .2s" onmouseenter="this.style.background='hsl(var(--accent))'" onmouseleave="this.style.background='none'">${ICONS.close}</button><div class="p-6 pb-3"><div class="font-bold text-xl flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-6 w-6 text-primary"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>Trade History</div><p class="text-muted-foreground text-sm mt-1">Viewing history for <span id="${CONFIG.ids.historyModalUsername}" class="text-foreground font-mono"></span></p></div><div id="${CONFIG.ids.historyModalBody}" style="flex:1;overflow-y:auto;min-height:200px"></div><div id="${CONFIG.ids.historyModalPagination}" class="p-4 border-t flex justify-center items-center gap-2 bg-muted/20"></div></div>`;
                document.body.appendChild(ov);
                document.getElementById('re-hist-cl').onclick = () => { ov.style.display = 'none'; };
                ov.onclick = e => { if (e.target === ov) ov.style.display = 'none'; };
            }
            document.getElementById(CONFIG.ids.historyModalUsername).textContent = `@${user}`;
            ov.style.display = 'flex';
            const body = document.getElementById(CONFIG.ids.historyModalBody); const pag = document.getElementById(CONFIG.ids.historyModalPagination);
            pag.innerHTML = '';
            body.innerHTML = `<div class="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">${ICONS.loading}<span class="text-sm animate-pulse">Loading...</span></div>`;
            try {
                const r = await fetch(`/api/user/${user}/trades?page=${pg}&limit=15`); if (!r.ok) throw 0;
                const d = await r.json(); const tr = d.trades || d.data || d.results || [];
                if (!tr.length) { body.innerHTML = '<div class="flex items-center justify-center h-64 text-muted-foreground">No trade history found</div>'; return; }
                body.innerHTML = `<table class="w-full text-sm"><thead class="sticky top-0 bg-card z-10 border-b"><tr class="text-muted-foreground"><th class="h-10 px-4 text-left font-medium">Type</th><th class="h-10 px-4 text-left font-medium">Coin</th><th class="h-10 px-4 text-left font-medium">Qty</th><th class="h-10 px-4 text-left font-medium">Price</th><th class="h-10 px-4 text-right font-medium">Total</th><th class="h-10 px-4 text-right font-medium">Time</th></tr></thead><tbody>${tr.map(t => { const type = (t.type || 'BUY').toUpperCase(); const isSell = type === 'SELL'; const cls = isSell ? 'bg-destructive' : 'bg-green-600'; return `<tr class="hover:bg-muted/40 border-b transition-colors"><td class="p-4 align-middle"><span class="inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium text-white border-transparent ${cls}">${type}</span></td><td class="p-4 align-middle"><a href="/coin/${t.coinSymbol || t.symbol}" class="font-bold hover:text-primary">${t.coinSymbol || t.symbol || '?'}</a></td><td class="p-4 align-middle font-mono text-xs text-muted-foreground">${utils.num(parseFloat(t.quantity || 0))}</td><td class="p-4 align-middle font-mono text-sm">$${parseFloat(t.price || 0).toFixed(6)}</td><td class="p-4 align-middle font-mono text-sm font-bold text-right">${utils.usd(t.totalValue || 0)}</td><td class="p-4 align-middle text-sm text-muted-foreground text-right">${utils.date(t.timestamp || t.createdAt)}</td></tr>`; }).join('')}</tbody></table>`;
                const p = d.pagination;
                if (p && p.total_pages > 1) {
                    const mkBtn = (label, page, disabled = false) => { const b = document.createElement('button'); b.textContent = label; b.className = 'inline-flex items-center justify-center text-sm font-medium h-9 px-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors'; if (disabled) { b.setAttribute('disabled', ''); b.style.opacity = '.4'; } else b.onclick = () => this._showHistory(user, page); return b; };
                    pag.appendChild(mkBtn('«', p.current_page - 1, p.current_page === 1));
                    const info = document.createElement('span'); info.className = 'text-sm text-muted-foreground'; info.textContent = `${p.current_page} / ${p.total_pages}`; pag.appendChild(info);
                    pag.appendChild(mkBtn('»', p.current_page + 1, p.current_page >= p.total_pages));
                }
            } catch { body.innerHTML = '<div class="flex items-center justify-center h-64 text-destructive text-sm">Failed to load trade history</div>'; }
        },
    };

    const enhancedPanel = {
        isVisible: false,
        originalMainChildren: [],
        init() { window.addEventListener('hashchange', () => this.handleHashChange()); },
        handleHashChange() { const isHash = location.hash === '#rugplay-enhanced'; if (isHash && !this.isVisible) this.show(); else if (!isHash && this.isVisible) this.hide(); },
        show() {
            if (this.isVisible) return;
            const main = document.querySelector(CONFIG.selectors.mainContent); if (!main) return;
            this.originalMainChildren = Array.from(main.children);
            this.originalMainChildren.forEach(c => c.style.display = 'none');
            const wrap = document.createElement('div'); wrap.id = CONFIG.ids.panelWrapper; wrap.className = 'w-full max-w-6xl mx-auto p-4 md:p-8';
            wrap.style.animation = 're-fadein .25s cubic-bezier(.16,1,.3,1) forwards';
            wrap.innerHTML = this._render();
            main.appendChild(wrap);
            this.isVisible = true;
            if (location.hash !== '#rugplay-enhanced') location.hash = 'rugplay-enhanced';
            this._attachListeners();
            this._loadChangelog();
            notifications.apply();
            adBlocker.apply();
            const s = store.settings();
            this._syncToggle('re-tog-notifications', s.notifications);
            this._syncToggle('re-tog-adblock', s.adblock);
            this._syncToggle('re-tog-offline', s.appearOffline);
            this._syncToggle('re-tog-sticky', s.stickyPortfolio);
            this._syncToggle('re-tog-pnl', s.showPnL);
            this._syncToggle('re-tog-risk', s.riskScore);
            this._syncToggle('re-tog-bot', s.botWarning);
            this._syncToggle('re-tog-volume', s.volumeSpikes);
            this._syncToggle('re-tog-desktop', s.desktopAlerts);
            this._syncToggle('re-tog-compact', s.compactMode);
            this._syncToggle('re-tog-dark', s.forceDark);
            this._syncToggle('re-tog-auto', s.autoOpenPanel);
            liveFeed.open = true; liveFeed.render(); liveFeed.startTsTimer();
            dashboard.render();
            settingsEngine.applyAll();
        },
        hide() {
            if (!this.isVisible) return;
            document.getElementById(CONFIG.ids.panelWrapper)?.remove();
            this.originalMainChildren.forEach(c => c.style.display = '');
            this.originalMainChildren = [];
            this.isVisible = false;
            liveFeed.open = false; liveFeed.stopTsTimer();
            if (location.hash === '#rugplay-enhanced') history.pushState('', document.title, location.pathname + location.search);
        },
        _syncToggle(id, val) { const el = document.getElementById(id); if (el) { el.setAttribute('aria-checked', String(val)); el.innerHTML = val ? ICONS_TOGGLE.on : ICONS_TOGGLE.off; } },
        _render() {
            const cardCls = 'bg-card text-card-foreground rounded-xl border shadow-sm p-6';
            const inputCls = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
            const textareaCls = 'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
            const btnCls = 're-panel-btn inline-flex shrink-0 items-center justify-center whitespace-nowrap text-sm font-medium transition-all focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 shadow-xs h-9 rounded-md px-4 w-full cursor-pointer';
            const togRow = (id, label, desc) => `<div class="flex items-center justify-between rounded-lg border p-4 shadow-sm transition-colors hover:bg-muted/30 mt-3 first:mt-0"><div class="space-y-0.5"><label class="text-sm font-medium">${label}</label><p class="text-xs text-muted-foreground">${desc}</p></div><button id="${id}" type="button" role="switch" class="cursor-pointer transition-transform hover:scale-105"></button></div>`;
            return `
            <style>
            @keyframes re-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
            @keyframes re-modal-in{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:none}}
            .re-panel-btn{background:hsl(var(--foreground))!important;color:hsl(var(--background))!important;border:none!important}
            .re-panel-btn:hover{opacity:.9}
            .re-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
            .re-tab{border:1px solid hsl(var(--border));background:transparent;color:hsl(var(--muted-foreground));padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;transition:background .12s,color .12s,border-color .12s}
            .re-tab:hover{background:hsl(var(--accent)/0.6);color:hsl(var(--foreground))}
            .re-tab.active{background:hsl(var(--foreground));color:hsl(var(--background));border-color:transparent}
            </style>
            <div class="mb-6 space-y-1.5">
                <h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">${ICONS.enhanced} Rugplay Enhanced</h1>
                <p class="text-muted-foreground">v${GM_info.script.version} by <a href="https://github.com/devbyego/rugplay-enhanced" target="_blank" class="hover:text-foreground transition-colors underline-offset-4 hover:underline">devbyego</a> · <a href="https://discord.com" target="_blank" class="hover:text-foreground transition-colors">Discord: devbyego</a></p>
                <p class="text-xs text-muted-foreground mt-2"><kbd class="re-kbd">Ctrl+K</kbd> Quick search · <kbd class="re-kbd">Ctrl+Shift+E</kbd> This panel</p>
                <div class="re-tabs">
                    <button class="re-tab" data-re-tab="dashboard">Dashboard</button>
                    <button class="re-tab" data-re-tab="alerts">Alerts</button>
                    <button class="re-tab" data-re-tab="reporter">Reporter</button>
                    <button class="re-tab" data-re-tab="settings">Settings</button>
                    <button class="re-tab" data-re-tab="status">Status</button>
                </div>
            </div>
            <div class="grid lg:grid-cols-3 gap-6 items-start">
                <div class="space-y-6 lg:col-span-2">
                    <div class="${cardCls}" data-re-section="dashboard">
                        <div class="space-y-1.5 mb-4"><h2 class="font-semibold leading-none tracking-tight">Live Trade Feed</h2><p class="text-sm text-muted-foreground">Real-time platform-wide trades via WebSocket.</p></div>
                        <div class="grid grid-cols-1 md:grid-cols-[1fr_120px_140px_auto] gap-2 mb-3">
                            <input id="re-feed-filter" class="${inputCls}" placeholder="Filter by coin or user..." />
                            <input id="re-feed-min" class="${inputCls}" type="number" min="0" step="25" placeholder="Min $" />
                            <select id="re-feed-side" class="${inputCls}">
                                <option value="all">All</option>
                                <option value="BUY">Buys</option>
                                <option value="SELL">Sells</option>
                            </select>
                            <button id="re-feed-pause" class="${btnCls}" style="height:36px;width:auto;padding:0 14px">Pause</button>
                        </div>
                        <div class="grid grid-cols-[46px_64px_1fr_auto_auto] gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b"><span>Type</span><span>Coin</span><span>User</span><span>Value</span><span>Time</span></div>
                        <div id="re-feed-rows" style="max-height:320px;overflow-y:auto"></div>
                    </div>
                    <div class="${cardCls}" data-re-section="dashboard">
                        <div class="flex items-center justify-between mb-3">
                            <div>
                                <h2 class="font-semibold leading-none tracking-tight">Market Radar</h2>
                                <p class="text-sm text-muted-foreground">Hot coins, whales, and session stats from the live stream.</p>
                            </div>
                            <div class="flex items-center gap-2">
                                <select id="re-agg-window" class="${inputCls}" style="width:auto;height:34px;padding:0 10px">
                                    <option value="300000">5m</option>
                                    <option value="600000" selected>10m</option>
                                    <option value="900000">15m</option>
                                </select>
                                <input id="re-whale-min" class="${inputCls}" style="width:120px;height:34px" type="number" min="0" step="25" value="250" placeholder="Whale $" />
                            </div>
                        </div>
                        <div class="grid md:grid-cols-2 gap-4">
                            <div>
                                <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Hot Coins</div>
                                <div id="re-hot-body" class="re-mini-list"></div>
                            </div>
                            <div>
                                <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Whale Radar</div>
                                <div id="re-whale-body" class="re-mini-list"></div>
                            </div>
                        </div>
                        <div class="mt-4">
                            <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Session Stats</div>
                            <div id="re-stats-body"></div>
                        </div>
                    </div>
                    <div class="${cardCls}" data-re-section="reporter">
                        <div class="space-y-1.5 mb-5"><h2 class="font-semibold leading-none tracking-tight flex items-center gap-2"><span class="relative flex h-3 w-3"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span><span class="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span></span>Rugpull Reporter</h2><p class="text-sm text-muted-foreground">Warn the community about malicious actors.</p></div>
                        <div class="grid grid-cols-2 gap-4 mb-4"><div><label class="text-sm font-medium mb-2 block">Username</label><input id="re-rp-usr" class="${inputCls}" placeholder="e.g. scammer123" /></div><div><label class="text-sm font-medium mb-2 block">Coin Symbol</label><input id="re-rp-sym" class="${inputCls}" placeholder="e.g. SCAM" /></div></div>
                        <div class="mb-4"><label class="text-sm font-medium mb-2 block">Evidence / Description</label><textarea id="re-rp-desc" class="${textareaCls}" placeholder="Describe the rugpull with evidence..." rows="3"></textarea></div>
                        <button id="re-rp-sub" class="${btnCls}">Submit Report</button>
                        <div id="re-rp-msg" class="text-sm mt-2 text-center h-4 font-medium transition-all"></div>
                    </div>
                    <div class="${cardCls} flex-1" data-re-section="reporter">
                        <div class="space-y-1.5 mb-4 border-b pb-4"><h2 class="font-semibold leading-none tracking-tight">Community Reports</h2></div>
                        <div id="re-rp-list" style="max-height:400px;overflow-y:auto" class="space-y-3 pr-1"></div>
                        <div id="re-rp-pag" class="pt-4"></div>
                    </div>
                </div>
                <div class="space-y-6">
                    <div class="${cardCls}" data-re-section="alerts">
                        <div class="space-y-1.5 mb-4"><h2 class="font-semibold leading-none tracking-tight">Price Alerts</h2><p class="text-sm text-muted-foreground">Get notified when coins hit your targets.</p></div>
                        <div class="space-y-2 mb-3">
                            <input id="re-al-sym" class="${inputCls}" placeholder="Coin symbol..." />
                            <input id="re-al-px" class="${inputCls}" type="number" step="any" min="0" placeholder="Target price (USD)..." />
                            <select id="re-al-dir" class="${inputCls}"><option value="above">Notify when above</option><option value="below">Notify when below</option></select>
                            <button id="re-al-add" class="${btnCls}">Set Alert</button>
                        </div>
                        <div id="re-al-body" class="space-y-2 mt-3"></div>
                    </div>
                    <div class="${cardCls}" data-re-section="settings">
                        <div class="space-y-1.5 mb-5"><h2 class="font-semibold leading-none tracking-tight">Preferences</h2><p class="text-sm text-muted-foreground">Customize your experience.</p></div>
                        ${togRow('re-tog-notifications', 'Notification Badges', 'Show unread count on sidebar icon')}
                        ${togRow('re-tog-adblock', 'Ad Blocker', 'Hide ads across Rugplay')}
                        ${togRow('re-tog-offline', 'Appear Offline', 'Hide your online status')}
                        ${togRow('re-tog-sticky', 'Sticky Portfolio', 'Pin portfolio to sidebar bottom')}
                        ${togRow('re-tog-pnl', 'Show P&L', 'Show session profit/loss in sidebar')}
                        ${togRow('re-tog-risk', 'Risk Scoring', 'Show rugpull risk on coin pages')}
                        ${togRow('re-tog-bot', 'Bot Detection', 'Warn on suspicious trade patterns')}
                        ${togRow('re-tog-volume', 'Volume Spikes', 'Alert on abnormal volume activity')}
                        ${togRow('re-tog-desktop', 'Desktop Notifications', 'Browser push notifications for alerts')}
                        ${togRow('re-tog-compact', 'Compact Mode', 'Tighten spacing across the UI')}
                        ${togRow('re-tog-dark', 'Force Dark Mode', 'Force Rugplay into dark theme')}
                        ${togRow('re-tog-auto', 'Auto-open Panel', 'Open Enhanced automatically on load')}
                        <div class="mt-4 pt-4 border-t space-y-3">
                        <button id="re-feedback-btn" class="${btnCls}" style="background:hsl(var(--accent))!important;color:hsl(var(--accent-foreground))!important">💬 Feedback</button>
                        </div>
                        <div class="mt-2 pt-4 border-t text-xs text-muted-foreground flex justify-between items-center">
                            <span>Rugplay Enhanced v${GM_info.script.version}</span>
                            <div class="flex gap-3"><a href="https://github.com/devbyego/rugplay-enhanced" target="_blank" class="hover:text-foreground transition-colors">GitHub</a><a href="https://discord.com" target="_blank" class="hover:text-foreground transition-colors">Discord</a></div>
                        </div>
                    </div>
                    <div class="${cardCls} py-4" data-re-section="settings">
                        <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Why Enhanced?</div>
                        <p class="text-sm text-muted-foreground leading-relaxed">Price alerts, risk scoring, bot & volume alerts, session P&L, quick search, coin notes, rugpull reporter. Trade history & data use <strong>Rugplay’s own API</strong>—no third-party servers for your data.</p>
                    </div>
                    <div class="${cardCls} py-4" data-re-section="status">
                        <div class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</div>
                        <div id="re-diag"></div>
                    </div>
                    <div id="re-changelog-card" class="${cardCls} min-h-[120px] flex flex-col justify-center" data-re-section="status"><div class="flex flex-col items-center gap-2 text-muted-foreground">${ICONS.loading}<span class="text-sm animate-pulse">Loading changelog...</span></div></div>
                </div>
            </div>`;
        },
        _attachListeners() {
            const applyTab = (tab) => {
                const t = tab || 'dashboard';
                store.cfg('panelTab', t);
                document.querySelectorAll('.re-tab[data-re-tab]').forEach(b => b.classList.toggle('active', b.dataset.reTab === t));
                document.querySelectorAll('[data-re-section]').forEach(el => {
                    const sec = el.getAttribute('data-re-section');
                    el.style.display = (sec === t) ? '' : 'none';
                });
            };
            document.querySelectorAll('.re-tab[data-re-tab]').forEach(b => b.addEventListener('click', () => applyTab(b.dataset.reTab)));
            document.getElementById('re-feed-filter')?.addEventListener('input', utils.debounce(() => liveFeed.render(), 150));
            document.getElementById('re-feed-min')?.addEventListener('input', utils.debounce(() => liveFeed.render(), 150));
            document.getElementById('re-feed-side')?.addEventListener('change', () => liveFeed.render());
            document.getElementById('re-feed-pause')?.addEventListener('click', (e) => {
                liveFeed.paused = !liveFeed.paused;
                e.currentTarget.textContent = liveFeed.paused ? 'Resume' : 'Pause';
                if (!liveFeed.paused) { liveFeed.render(); dashboard.render(); }
            });
            document.getElementById('re-agg-window')?.addEventListener('change', () => dashboard.render());
            document.getElementById('re-whale-min')?.addEventListener('input', utils.debounce(() => dashboard.render(), 150));
            document.getElementById('re-al-add')?.addEventListener('click', () => { const sym = document.getElementById('re-al-sym')?.value.trim().toUpperCase(); const px = document.getElementById('re-al-px')?.value.trim(); const dir = document.getElementById('re-al-dir')?.value; if (!sym || !px) { notifier.err('Fill in symbol and price'); return; } alertEngine.add(sym, px, dir); document.getElementById('re-al-sym').value = ''; document.getElementById('re-al-px').value = ''; this._renderAlerts(); });
            document.getElementById('re-rp-sub')?.addEventListener('click', () => this._submitReport());
            document.getElementById('re-feedback-btn')?.addEventListener('click', () => this._showFeedbackModal());
            this._renderAlerts();
            this._loadReports(1);
            dashboard.render();
            diagnostics.pingApi().finally(() => diagnostics.render());
            diagnostics.render();
            applyTab(store.settings().panelTab || store.get('re:panelTab', null) || 'dashboard');
            const toggleMap = {
                're-tog-notifications': ['notifications'],
                're-tog-adblock': ['adblock'],
                're-tog-offline': ['appearOffline'],
                're-tog-sticky': ['stickyPortfolio'],
                're-tog-pnl': ['showPnL'],
                're-tog-risk': ['riskScore'],
                're-tog-bot': ['botWarning'],
                're-tog-volume': ['volumeSpikes'],
                're-tog-desktop': ['desktopAlerts'],
                're-tog-compact': ['compactMode'],
                're-tog-dark': ['forceDark'],
                're-tog-auto': ['autoOpenPanel'],
            };
            Object.entries(toggleMap).forEach(([id, [key]]) => {
                document.getElementById(id)?.addEventListener('click', e => {
                    const cur = store.settings()[key]; const next = !cur;
                    store.cfg(key, next);
                    e.currentTarget.setAttribute('aria-checked', String(next));
                    e.currentTarget.innerHTML = next ? ICONS_TOGGLE.on : ICONS_TOGGLE.off;
                    settingsEngine.applyAll();
                });
            });
        },
        _renderAlerts() {
            const el = document.getElementById('re-al-body'); if (!el) return;
            const al = store.alerts();
            if (!al.length) { el.innerHTML = '<p class="text-sm text-muted-foreground text-center py-2">No alerts set. Add one above.</p>'; return; }
            el.innerHTML = al.map(a => `<div class="flex items-center gap-2 rounded-lg border p-3 ${a.done ? 'opacity-60' : ''}"><div class="flex-1"><div class="font-semibold text-sm">${a.sym}</div><div class="text-xs text-muted-foreground">${a.dir} ${utils.usd(a.px)}${a.done ? ` · Triggered ${utils.ago(a.hitAt)}` : ''}</div></div><button class="re-al-del text-muted-foreground hover:text-destructive transition-colors p-1 rounded" data-id="${a.id}">${ICONS.close}</button></div>`).join('');
            el.querySelectorAll('.re-al-del').forEach(b => b.onclick = () => { alertEngine.del(b.dataset.id); this._renderAlerts(); });
        },
        async _loadReports(pg = 1) {
            const list = document.getElementById('re-rp-list'); if (!list) return;
            list.innerHTML = `<div class="flex items-center justify-center p-6 text-muted-foreground gap-2">${ICONS.loading}<span class="text-sm animate-pulse">Loading...</span></div>`;
            try {
                const r = await api.get(`/v1/reports?page=${pg}&limit=8`); if (r.status !== 'success') throw 0;
                const rpts = r.data?.reports || [];
                if (!rpts.length) { list.innerHTML = '<p class="text-muted-foreground text-sm text-center p-6">No reports yet.</p>'; return; }
                list.innerHTML = rpts.map(rp => `<div class="bg-muted/40 border border-border rounded-lg p-3" data-id="${rp.id}"><div class="flex items-center gap-2 mb-1"><span class="font-semibold text-sm">${rp.reported_username}</span><span class="text-primary font-mono text-xs">*${rp.coin_symbol}</span></div><p class="text-sm text-muted-foreground mb-2 line-clamp-2">${rp.description}</p><div class="flex items-center gap-3 text-xs"><button class="re-vote flex items-center gap-1 hover:text-green-500 transition-colors" data-id="${rp.id}" data-t="upvote">▲ ${rp.upvotes || 0}</button><button class="re-vote flex items-center gap-1 hover:text-red-500 transition-colors" data-id="${rp.id}" data-t="downvote">▼ ${rp.downvotes || 0}</button><span class="text-muted-foreground ml-auto">${utils.ago(rp.created_at)}</span></div></div>`).join('');
                list.querySelectorAll('.re-vote').forEach(b => b.onclick = async () => { try { await api.post('/v1/reports/vote', { id: b.dataset.id, type: b.dataset.t }); notifier.ok('Vote recorded'); this._loadReports(pg); } catch { notifier.err('Already voted or failed'); } });
                const pag = document.getElementById('re-rp-pag'); const p = r.data?.pagination;
                if (pag && p && p.total_pages > 1) { pag.innerHTML = ''; const mkBtn = (lbl, page, dis = false) => { const b = document.createElement('button'); b.textContent = lbl; b.className = 'inline-flex items-center justify-center text-sm font-medium h-9 px-3 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors'; if (dis) { b.setAttribute('disabled', ''); b.style.opacity = '.4'; } else b.onclick = () => this._loadReports(page); return b; }; pag.classList.add('flex', 'justify-center', 'items-center', 'gap-2'); pag.appendChild(mkBtn('«', p.current_page - 1, p.current_page === 1)); const inf = document.createElement('span'); inf.className = 'text-sm text-muted-foreground'; inf.textContent = `${p.current_page} / ${p.total_pages}`; pag.appendChild(inf); pag.appendChild(mkBtn('»', p.current_page + 1, p.current_page >= p.total_pages)); }
                diagnostics.state.lastReportOkAt = Date.now();
                diagnostics.render();
            } catch (e) {
                diagnostics.state.lastReportErrAt = Date.now();
                diagnostics.state.lastReportErr = String(e?.message || e);
                diagnostics.render();
                const local = store.localReports().slice().reverse();
                if (local.length) {
                    list.innerHTML = `
                        <div class="p-4 text-xs text-muted-foreground">Enhanced API is down. Showing <b>local-only</b> reports saved on your device.</div>
                        ${local.slice(0, 20).map(rp => `<div class="bg-muted/40 border border-border rounded-lg p-3"><div class="flex items-center gap-2 mb-1"><span class="font-semibold text-sm">${rp.username}</span><span class="text-primary font-mono text-xs">*${rp.coinSymbol}</span><span class="text-xs text-muted-foreground ml-auto">local · ${utils.ago(rp.createdAt)}</span></div><p class="text-sm text-muted-foreground mb-2">${rp.description}</p></div>`).join('')}
                        <div class="p-4 text-center text-sm"><button id="re-rp-retry" class="re-panel-btn" style="max-width:220px;margin:0 auto">Retry API</button></div>
                    `;
                    document.getElementById('re-rp-retry')?.addEventListener('click', () => this._loadReports(pg), { once: true });
                    return;
                }
                list.innerHTML = `<div class="p-6 text-center text-sm"><div class="text-destructive font-semibold mb-2">Failed to load reports</div><div class="text-muted-foreground mb-4">Check the Status tab — your Enhanced API may be down.</div><button id="re-rp-retry" class="re-panel-btn" style="max-width:220px;margin:0 auto">Retry</button></div>`;
                document.getElementById('re-rp-retry')?.addEventListener('click', () => this._loadReports(pg), { once: true });
            }
        },
        async _submitReport() {
            const usr = document.getElementById('re-rp-usr')?.value.trim();
            const sym = document.getElementById('re-rp-sym')?.value.trim().toUpperCase();
            const desc = document.getElementById('re-rp-desc')?.value.trim();
            const msg = document.getElementById('re-rp-msg'); if (!msg) return;
            if (!usr || !sym || !desc) { msg.textContent = 'All fields are required'; msg.style.color = 'hsl(var(--destructive))'; return; }
            msg.textContent = 'Submitting...'; msg.style.color = 'hsl(var(--muted-foreground))';
            try {
                const r = await api.post('/v1/reports/submit', { username: usr, coinSymbol: sym, description: desc });
                if (r.status === 'success') {
                    diagnostics.state.lastReportOkAt = Date.now();
                    msg.textContent = 'Report submitted — pending review'; msg.style.color = '#22c55e';
                    document.getElementById('re-rp-usr').value = ''; document.getElementById('re-rp-sym').value = ''; document.getElementById('re-rp-desc').value = '';
                    this._loadReports(1);
                    diagnostics.render();
                }
                else { msg.textContent = r.message || 'Submission failed'; msg.style.color = 'hsl(var(--destructive))'; }
            } catch (e) {
                diagnostics.state.lastReportErrAt = Date.now();
                diagnostics.state.lastReportErr = String(e?.message || e);
                // Local fallback so the feature still "works" tonight even if backend is down.
                const lr = store.localReports();
                lr.push({ id: utils.uid(), username: usr, coinSymbol: sym, description: desc, createdAt: Date.now() });
                store.localReportsSet(lr.slice(-200));
                msg.textContent = 'API down — saved locally (see Community Reports)'; msg.style.color = '#f59e0b';
                this._loadReports(1);
                diagnostics.render();
            }
        },
        _loadChangelog() {
            const card = document.getElementById('re-changelog-card'); if (!card) return;
            api.get(`/v1/changelog?version=${GM_info.script.version}`).then(r => {
                if (r.status === 'success' && r.data) { card.innerHTML = `<div class="space-y-1.5 mb-4 border-b pb-4"><h2 class="font-semibold leading-none tracking-tight">What's New in v${r.data.version}</h2><p class="text-xs text-muted-foreground">${new Date(r.data.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p></div><ul class="space-y-2 text-sm text-muted-foreground pl-4 list-disc">${r.data.changes.map(c => `<li>${c}</li>`).join('')}</ul>`; }
                else card.innerHTML = '<div class="text-sm text-muted-foreground text-center">No changelog available</div>';
            }).catch(() => { card.innerHTML = '<div class="text-sm text-destructive text-center">Failed to load changelog</div>'; });
        },
        _showFeedbackModal() {
            let ov = document.getElementById(CONFIG.ids.feedbackModal);
            if (!ov) {
                ov = document.createElement('div');
                ov.id = CONFIG.ids.feedbackModal;
                ov.className = 're-feedback-overlay';
                ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.7);align-items:center;justify-content:center;backdrop-filter:blur(4px)';
                ov.innerHTML = `<div class="re-feedback-box bg-card text-card-foreground rounded-xl border shadow-2xl overflow-hidden" style="width:90%;max-width:440px;animation:re-modal-in .2s cubic-bezier(.16,1,.3,1) forwards"><div class="p-6"><h2 class="font-bold text-lg mb-2">Send Feedback</h2><p class="text-sm text-muted-foreground mb-4">Bug report or feature idea? Open GitHub Issues with your message pre-filled.</p><textarea id="re-feedback-ta" rows="4" class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-4" placeholder="Describe your feedback..."></textarea><div class="flex gap-2"><button id="re-feedback-open" class="re-panel-btn flex-1">Open GitHub Issues</button><button id="re-feedback-cancel" class="re-panel-btn flex-1" style="background:hsl(var(--accent))!important;color:hsl(var(--accent-foreground))!important">Cancel</button></div></div></div>`;
                document.body.appendChild(ov);
                ov.addEventListener('click', e => { if (e.target === ov) this._hideFeedbackModal(); });
                document.getElementById('re-feedback-open').onclick = () => { const ta = document.getElementById('re-feedback-ta'); const body = (ta?.value || '').trim() || 'No description provided'; const url = `https://github.com/devbyego/rugplay-enhanced/issues/new?title=${encodeURIComponent('Feedback: ')}&body=${encodeURIComponent(`**Rugplay Enhanced v${GM_info.script.version}**\n\n${body}`)}`; window.open(url, '_blank'); this._hideFeedbackModal(); };
                document.getElementById('re-feedback-cancel').onclick = () => this._hideFeedbackModal();
            }
            ov.style.display = 'flex';
            const ta = document.getElementById('re-feedback-ta'); if (ta) { ta.value = ''; ta.focus(); }
        },
        _hideFeedbackModal() {
            const ov = document.getElementById(CONFIG.ids.feedbackModal);
            if (ov) ov.style.display = 'none';
        },
    };

    const ICONS_TOGGLE = {
        on: `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path fill-rule="evenodd" d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12Zm13.707-1.293a1 1 0 0 0-1.414-1.414L11 12.586l-1.793-1.793a1 1 0 0 0-1.414 1.414l2.5 2.5a1 1 0 0 0 1.414 0l4-4Z" clip-rule="evenodd"/></svg>`,
        off: `<svg class="w-6 h-6" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7.757 12h8.486M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
    };

    const sidebarEnhancer = {
        done: false,
        create() {
            if (this.done) return true;
            const homeBtn = document.querySelector('a[data-sidebar="menu-button"][href="/"], a[href="/"].peer\\/menu-button, a[href="/"][data-sidebar="menu-button"]');
            const firstItem = homeBtn?.closest('li[data-sidebar="menu-item"]') || document.querySelector('li[data-sidebar="menu-item"]:first-child');
            if (!firstItem) return false;
            const menuList = firstItem.closest('ul[data-sidebar="menu"]') || document.querySelector('ul[data-sidebar="menu"]');
            if (!menuList) return false;
            if (!document.getElementById(CONFIG.ids.enhancedBtn)) {
                const li = firstItem.cloneNode(true);
                const btn = li.querySelector('a');
                if (!btn) return false;
                btn.id = CONFIG.ids.enhancedBtn;
                btn.href = 'https://rugplay.com/#rugplay-enhanced';
                btn.removeAttribute('data-active');
                const svg = btn.querySelector('svg'); if (svg) svg.outerHTML = ICONS.enhanced;
                const span = btn.querySelector('span'); if (span) span.textContent = 'Enhanced';
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    enhancedPanel.show();
                });
                firstItem.insertAdjacentElement('afterend', li);
            }
            if (!document.getElementById(CONFIG.ids.searchBtn)) {
                const li2 = firstItem.cloneNode(true);
                const btn2 = li2.querySelector('a');
                if (!btn2) return false;
                btn2.id = CONFIG.ids.searchBtn;
                btn2.href = '#';
                btn2.removeAttribute('data-active');
                const svg2 = btn2.querySelector('svg'); if (svg2) svg2.outerHTML = ICONS.search;
                const span2 = btn2.querySelector('span'); if (span2) span2.textContent = 'Quick Search';
                btn2.addEventListener('click', e => { e.preventDefault(); quickSearch.toggle(); });
                menuList.appendChild(li2);
            }
            this.done = true;
            return true;
        },
    };

    const analytics = {
        async run() {
            const sk = 're:ls'; if (Date.now() - GM_getValue(sk, 0) < 14400000) return; GM_setValue(sk, Date.now());
            try { await api.post('/v1/analytics', { event: 'active_session', version: GM_info.script.version }); } catch {}
            const ik = 're:inst'; if (!GM_getValue(ik, false)) { try { await api.post('/v1/analytics', { event: 'install', version: GM_info.script.version }); } catch {} GM_setValue(ik, true); }
        },
    };

    GM_addStyle(`
        :root{--re-radius:16px;--re-border: hsl(var(--border)/0.7);--re-glass: hsl(var(--background)/0.55)}
        #${CONFIG.ids.panelWrapper}{padding-top:22px!important}
        #${CONFIG.ids.panelWrapper} .bg-card{border-radius:var(--re-radius)!important;border-color:var(--re-border)!important}
        #${CONFIG.ids.panelWrapper} .shadow-sm{box-shadow:0 8px 24px rgba(0,0,0,.06)!important}
        #${CONFIG.ids.panelWrapper} h2{letter-spacing:-.01em}
        #${CONFIG.ids.panelWrapper} .text-muted-foreground{opacity:.92}
        #${CONFIG.ids.panelWrapper} input,#${CONFIG.ids.panelWrapper} select,#${CONFIG.ids.panelWrapper} textarea{border-radius:12px!important}
        #${CONFIG.ids.panelWrapper} .re-panel-btn{border-radius:12px!important}
        #${CONFIG.ids.panelWrapper} .re-tabs{position:sticky;top:10px;z-index:50;background:linear-gradient(to bottom, hsl(var(--background)) 50%, transparent);padding:8px 0 10px;backdrop-filter:blur(8px)}
        #${CONFIG.ids.panelWrapper} .re-tab{padding:7px 12px}
        #${CONFIG.ids.panelWrapper} .re-tab.active{box-shadow:0 10px 30px rgba(0,0,0,.14)}
        #${CONFIG.ids.panelWrapper} .re-mini-row{border-radius:14px}
        #${CONFIG.ids.panelWrapper} .re-stat{border-radius:14px}
        #${CONFIG.ids.panelWrapper} .re-feed-row{border-radius:12px;margin:6px 6px 0 6px;border:1px solid hsl(var(--border)/0.5)}
        #${CONFIG.ids.panelWrapper} .re-feed-row:hover{background:hsl(var(--accent)/0.35)}
        #${CONFIG.ids.panelWrapper} #re-feed-rows{padding-bottom:8px}
        #re-notifier{position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column-reverse;gap:10px;pointer-events:none;width:360px}
        .re-notif{background:hsl(var(--background));color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.18);display:flex;align-items:flex-start;padding:14px;gap:12px;position:relative;opacity:0;transform:translateY(16px) scale(.96);animation:re-notif-in .25s cubic-bezier(.16,1,.3,1) forwards;pointer-events:all}
        .re-notif-out{animation:re-notif-out .2s ease-in forwards}
        @keyframes re-notif-in{to{opacity:1;transform:none}}
        @keyframes re-notif-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(16px) scale(.96)}}
        .re-notif-icon{flex-shrink:0;margin-top:2px}
        .re-notif-body{flex:1}
        .re-notif-title{font-weight:600;font-size:13px;margin-bottom:3px}
        .re-notif-desc{font-size:12px;color:hsl(var(--muted-foreground));line-height:1.4}
        .re-notif-close{position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;color:hsl(var(--muted-foreground));padding:3px 6px;border-radius:4px;font-size:12px;line-height:1}
        .re-notif-close:hover{background:hsl(var(--accent))}
        .re-notif-actions{display:flex;gap:8px;margin-top:10px}
        .re-notif-btn{border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:500;cursor:pointer;transition:opacity .15s;font-family:inherit}
        .re-notif-btn.primary{background:hsl(var(--foreground));color:hsl(var(--background))}
        .re-notif-btn.secondary{background:hsl(var(--accent));color:hsl(var(--foreground))}
        .re-notif-btn:hover{opacity:.85}
        .re-spin{animation:re-spinning 1s linear infinite}
        @keyframes re-spinning{to{transform:rotate(360deg)}}
        .re-tag{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-left:7px;vertical-align:middle}
        .re-pnl{font-size:11px;font-weight:600;padding:3px 8px;border-radius:4px;margin-top:4px;display:inline-block}
        .re-pnl.pos{background:rgba(34,197,94,.12);color:#22c55e}
        .re-pnl.neg{background:rgba(239,68,68,.12);color:#ef4444}
        .re-outline-btn{background:transparent;color:hsl(var(--foreground));border:1px solid hsl(var(--border));border-radius:6px;padding:4px 12px;font-size:12px;font-weight:500;cursor:pointer;margin-left:10px;font-family:inherit;vertical-align:middle;transition:background .15s}
        .re-outline-btn:hover,.re-outline-btn.active{background:hsl(var(--accent))}
        .re-feed-row{display:grid;grid-template-columns:46px 64px 1fr auto auto;gap:6px;padding:7px 14px;border-bottom:1px solid hsl(var(--border)/0.5);font-size:12px;text-decoration:none;color:hsl(var(--foreground));transition:background .1s;align-items:center}
        .re-feed-row:hover{background:hsl(var(--accent)/0.5)}
        .re-feed-row.buy{border-left:2px solid #22c55e}
        .re-feed-row.sell{border-left:2px solid #ef4444}
        .re-fd-b{font-size:10px;font-weight:700}
        .re-fd-b.buy{color:#22c55e}
        .re-fd-b.sell{color:#ef4444}
        .re-fd-s{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .re-fd-u{color:hsl(var(--muted-foreground));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}
        .re-fd-v{font-weight:600;font-size:11px;white-space:nowrap}
        .re-fd-t{color:hsl(var(--muted-foreground));font-size:10px;white-space:nowrap}
        .re-wl-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:7px;transition:background .12s}
        .re-wl-row:hover{background:hsl(var(--accent)/0.5)}
        .re-wl-sym{font-weight:700;font-size:13px;color:hsl(var(--foreground));text-decoration:none;flex:1}
        .re-wl-px{font-size:12px;color:hsl(var(--muted-foreground));font-family:ui-monospace,monospace}
        .re-wl-del{background:none;border:none;cursor:pointer;color:hsl(var(--muted-foreground));padding:2px 5px;border-radius:4px;font-size:12px;transition:all .15s}
        .re-wl-del:hover{background:rgba(239,68,68,.12);color:#ef4444}
        .re-mini-list{display:flex;flex-direction:column;gap:6px}
        .re-mini-row{display:grid;grid-template-columns:64px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid hsl(var(--border)/0.7);border-radius:10px;text-decoration:none;color:hsl(var(--foreground));background:hsl(var(--background)/0.2);transition:background .12s,border-color .12s}
        .re-mini-row:hover{background:hsl(var(--accent)/0.5);border-color:hsl(var(--border))}
        .re-mini-sym{font-weight:800;font-family:ui-monospace,monospace;font-size:12px}
        .re-mini-sub{font-size:11px;color:hsl(var(--muted-foreground));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .re-mini-badge{font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px}
        .re-mini-badge.buy{background:rgba(34,197,94,.14);color:#22c55e}
        .re-mini-badge.sell{background:rgba(239,68,68,.14);color:#ef4444}
        .re-stat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
        .re-stat{border:1px solid hsl(var(--border)/0.7);border-radius:10px;padding:10px;background:hsl(var(--background)/0.2)}
        .re-stat-k{font-size:10px;color:hsl(var(--muted-foreground));text-transform:uppercase;letter-spacing:.08em;font-weight:700}
        .re-stat-v{font-size:12px;font-weight:800;margin-top:4px}
        .re-empty{padding:20px;text-align:center;color:hsl(var(--muted-foreground));font-size:12px;line-height:1.6}
        .re-badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase}
        .re-badge.buy{background:rgba(34,197,94,.12);color:#22c55e}
        .re-badge.sell{background:rgba(239,68,68,.12);color:#ef4444}
        .re-search-wrap{position:fixed;inset:0;background:rgba(0,0,0,.68);z-index:999999;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;backdrop-filter:blur(4px)}
        .re-search-box{width:90%;max-width:560px;background:hsl(var(--card));border:1px solid hsl(var(--border));border-radius:12px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3)}
        .re-search-top{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid hsl(var(--border))}
        .re-search-icon-wrap{color:hsl(var(--muted-foreground));flex-shrink:0}
        .re-search-inp{flex:1;background:none;border:none;outline:none;font-size:15px;color:hsl(var(--foreground));font-family:inherit}
        .re-kbd{font-size:11px;background:hsl(var(--accent));border:1px solid hsl(var(--border));border-radius:4px;padding:2px 6px;color:hsl(var(--muted-foreground));font-family:inherit}
        .re-search-results{max-height:320px;overflow-y:auto}
        .re-sr-row{display:flex;flex-direction:column;padding:11px 16px;border-bottom:1px solid hsl(var(--border)/0.5);text-decoration:none;transition:background .1s}
        .re-sr-row:hover{background:hsl(var(--accent)/0.6)}
        .re-sr-main{display:flex;align-items:center;gap:8px;margin-bottom:2px}
        .re-sr-name{font-weight:600;font-size:13px;color:hsl(var(--foreground))}
        .re-sr-sub{font-size:12px;color:hsl(var(--muted-foreground))}
        .re-err{color:#ef4444!important}
        body.re-compact .space-y-4{gap:8px!important}
        body.re-compact .p-4{padding:8px!important}
        body.re-compact .p-6{padding:12px!important}
        .re-reported-badge{position:relative;display:inline-flex;margin-left:8px;vertical-align:middle}
        .re-reported-label{padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;cursor:help;color:#f87171;background:rgba(248,113,113,.15);border:1px solid rgba(248,113,113,.4)}
        .re-reported-tooltip{visibility:hidden;width:260px;background:hsl(var(--card));color:hsl(var(--card-foreground));text-align:left;border:1px solid hsl(var(--border));border-radius:8px;padding:10px;position:absolute;z-index:10000;bottom:100%;left:50%;margin-left:-130px;margin-bottom:6px;opacity:0;transition:opacity .2s,visibility .2s;font-size:12px;line-height:1.4;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.15)}
        .re-reported-badge:hover .re-reported-tooltip{visibility:visible;opacity:1}
    `);

    const app = {
        w: new URLWatcher(),
        async init() {
            wsInterceptor.patch();
            alertEngine.init();
            volumeDetector.init();
            botDetector.init();
            liveFeed.init();
            enhancedPanel.init();
            if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
            settingsEngine.applyAll();
            document.addEventListener('keydown', e => {
                if ((e.ctrlKey || e.metaKey) && !e.shiftKey && String(e.key).toLowerCase() === 'k') {
                    e.preventDefault();
                    quickSearch.toggle();
                }
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && String(e.key).toLowerCase() === 'e') {
                    e.preventDefault();
                    if (!enhancedPanel.isVisible) enhancedPanel.show();
                    else enhancedPanel.hide();
                }
            }, { capture: true });
            if (store.settings().autoOpenPanel) {
                setTimeout(() => {
                    try { enhancedPanel.show(); } catch {}
                }, 700);
            }
            analytics.run().catch(() => {});
            setTimeout(() => updateChecker.check().catch(() => {}), 4000);
            setInterval(() => updateChecker.check().catch(() => {}), CONFIG.intervals.updateCheck);
            const run = utils.debounce(async () => {
                sidebarEnhancer.create();
                notifications.apply();
                adBlocker.apply();
                portfolioMover.apply();
                enhancedPanel.handleHashChange();
                await userTagger.applyTags().catch(() => {});
                if (!enhancedPanel.isVisible) {
                    tableEnhancer.enhance();
                    await profileEnhancer.init().catch(() => {});
                    await coinPageEnhancer.init().catch(() => {});
                }
            }, CONFIG.intervals.init);
            new MutationObserver(run).observe(document.body, { childList: true, subtree: true });
            this.w.on(run).start();
            run();
        },
    };

    app.init();
})();
