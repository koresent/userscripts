// ==UserScript==
// @name           ⚙ [General] Discord Rich Presence (PreMiD)
// @namespace      github.com/koresent/userscripts
// @version        2.2.0
// @description    Universal Discord Rich Presence for web services via PreMiD database and local RPC.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://cdn.rcd.gg/PreMiD/resources/play.png
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/discord-rpc.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/discord-rpc.user.js
//
// @match          *://*/*
//
// @run-at         document-start
//
// @connect        premid.app
// @connect        api.premid.app
// @connect        cdn.rcd.gg
// @connect        127.0.0.1
// @connect        localhost
//
// @grant          unsafeWindow
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          GM_xmlhttpRequest
// @grant          GM_webSocket
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = '[Discord RPC Engine]';
    const log = (...args) => console.log(SCRIPT_NAME, ...args);
    const warn = (...args) => console.warn(SCRIPT_NAME, ...args);
    const err = (...args) => console.error(SCRIPT_NAME, ...args);

    const RESOLVER_API_URL = 'https://premid.app/api/activities';
    const NEGATIVE_CACHE_TTL = 10 * 1000;
    const RESOURCE_CACHE_TTL = 24 * 60 * 60 * 1000;

    const State = {
        serviceName: null,
        metadata: null,
        presenceInstance: null,
        activeClientId: null,
        updateInterval: null,
        lastPayloadHash: null,
        pid: Math.floor(Math.random() * 89999) + 10000,
        ws: null,
        wsConnected: false,
        wsReady: false,
        uiOpen: false,
        uiShadow: null,
        settings: {},
    };

    const Config = {
        rpcPort: 6463,
        updateFrequency: 2500,
        enableButtons: true,
        customButtonLabel: '',
        customClientId: '',
    };

    function isServiceEnabled(serviceName) {
        if (!serviceName) return false;
        const defaultEnabled = GM_getValue('global_default_enabled', false);
        return GM_getValue(`service_enabled_${serviceName}`, defaultEnabled);
    }

    function setServiceEnabled(serviceName, enabled) {
        if (!serviceName) return;
        GM_setValue(`service_enabled_${serviceName}`, Boolean(enabled));
    }

    const ServiceResolver = {
        extractSlug(hostname) {
            const parts = hostname.toLowerCase().split('.');
            if (parts.length < 2) return parts[0];

            let slug = parts[parts.length - 2];
            const secondLevelTLDs = ['co', 'com', 'org', 'net', 'edu', 'gov'];
            if (secondLevelTLDs.includes(slug) && parts.length >= 3) {
                slug = parts[parts.length - 3];
            }
            return slug;
        },

        async resolve(hostname, currentUrl) {
            const metaTag = document.querySelector('meta[name="PreMiD_Presence"]')?.content;
            if (metaTag?.trim()) {
                return metaTag.trim();
            }

            const cacheKey = `srv_res_v2_${hostname.toLowerCase()}`;
            const cached = GM_getValue(cacheKey, null);
            if (cached) {
                if (cached.service) return cached.service;
                if (Date.now() - cached.timestamp < NEGATIVE_CACHE_TTL) {
                    return null;
                }
            }

            const slug = this.extractSlug(hostname);
            const candidates = [slug];
            const domainParts = hostname.toLowerCase().split('.');
            if (slug.length <= 3 && domainParts.length >= 2) {
                candidates.unshift(domainParts.slice(-2).join('.'));
            }

            for (const query of candidates) {
                const service = await this.querySearch(query, hostname, currentUrl);
                if (service) {
                    GM_setValue(cacheKey, { service, timestamp: Date.now() });
                    return service;
                }
            }

            GM_setValue(cacheKey, { service: null, timestamp: Date.now() });
            return null;
        },

        querySearch(query, hostname, currentUrl) {
            return new Promise((resolve) => {
                const url = `${RESOLVER_API_URL}?search=${encodeURIComponent(query)}`;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (res) => {
                        if (res.status !== 200) return resolve(null);

                        try {
                            const json = JSON.parse(res.responseText);
                            const activities = Array.isArray(json.data) ? json.data : [];

                            // Pass 1: Exact domain match (e.g. music.yandex.ru -> Yandex Music)
                            for (const act of activities) {
                                const actUrls = Array.isArray(act.url) ? act.url : [act.url];
                                for (const u of actUrls) {
                                    if (!u || typeof u !== 'string') continue;
                                    if (hostname === u.toLowerCase().trim()) {
                                        return resolve(act.service);
                                    }
                                }
                            }

                            // Pass 2: Subdomain / parent domain match (e.g. m.youtube.com -> YouTube)
                            for (const act of activities) {
                                const actUrls = Array.isArray(act.url) ? act.url : [act.url];
                                for (const u of actUrls) {
                                    if (!u || typeof u !== 'string') continue;
                                    const clean = u.toLowerCase().trim();
                                    if (hostname.endsWith('.' + clean) || clean.endsWith('.' + hostname)) {
                                        return resolve(act.service);
                                    }
                                }
                            }

                            // Pass 3: Exact service name match
                            const exact = activities.find(a => a.service?.toLowerCase() === query.toLowerCase());
                            if (exact) return resolve(exact.service);

                            resolve(null);
                        } catch (e) {
                            resolve(null);
                        }
                    },
                    onerror: () => resolve(null)
                });
            });
        }
    };

    const ResourceLoader = {
        async fetchMetadata(serviceName) {
            const cacheKey = `metadata_${serviceName}`;
            const cached = GM_getValue(cacheKey, null);
            if (cached && cached.version && (Date.now() - cached._cachedAt < RESOURCE_CACHE_TTL)) {
                return cached;
            }

            return new Promise((resolve, reject) => {
                const url = `https://api.premid.app/v6/activities/${encodeURIComponent(serviceName)}/metadata.json`;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (res) => {
                        if (res.status === 200) {
                            try {
                                const data = JSON.parse(res.responseText);
                                data._cachedAt = Date.now();
                                GM_setValue(cacheKey, data);
                                resolve(data);
                            } catch (e) { reject(e); }
                        } else {
                            reject(new Error(`Failed to load metadata: HTTP ${res.status}`));
                        }
                    },
                    onerror: reject
                });
            });
        },

        async fetchPresence(serviceName) {
            const cacheKey = `presence_code_${serviceName}`;
            const cached = GM_getValue(cacheKey, null);
            if (cached && (Date.now() - cached._cachedAt < RESOURCE_CACHE_TTL)) {
                return cached.code;
            }

            return new Promise((resolve, reject) => {
                const url = `https://api.premid.app/v6/activities/${encodeURIComponent(serviceName)}/presence.js`;
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    onload: (res) => {
                        if (res.status === 200) {
                            GM_setValue(cacheKey, { code: res.responseText, _cachedAt: Date.now() });
                            resolve(res.responseText);
                        } else {
                            reject(new Error(`Failed to load presence: HTTP ${res.status}`));
                        }
                    },
                    onerror: reject
                });
            });
        }
    };

    const RpcGateway = {
        reconnectTimer: null,

        connect(clientId) {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            if (!isServiceEnabled(State.serviceName)) {
                return;
            }

            if (State.ws && State.activeClientId === clientId && State.wsConnected) return;
            if (State.ws) this.disconnect(false);

            State.activeClientId = clientId;
            const targetPort = Config.rpcPort;
            const wsUrl = `ws://127.0.0.1:${targetPort}/?v=1&encoding=json&client_id=${clientId}`;
            log(`Connecting to Discord RPC [ID: ${clientId}]...`);

            try {
                if (typeof GM_webSocket !== 'undefined') {
                    State.ws = GM_webSocket({
                        url: wsUrl,
                        headers: { Origin: 'https://discord.com' },
                        onopen: this.onOpen.bind(this),
                        onmessage: this.onMessage.bind(this),
                        onclose: this.onClose.bind(this),
                        onerror: this.onError.bind(this)
                    });
                } else {
                    const nativeWs = new WebSocket(wsUrl);
                    nativeWs.onopen = this.onOpen.bind(this);
                    nativeWs.onmessage = this.onMessage.bind(this);
                    nativeWs.onclose = this.onClose.bind(this);
                    nativeWs.onerror = this.onError.bind(this);
                    State.ws = nativeWs;
                }
            } catch (e) {
                warn('WebSocket error:', e);
                this.updateUIStatus();
                this.scheduleReconnect();
            }
        },

        scheduleReconnect() {
            if (this.reconnectTimer) return;
            if (!isServiceEnabled(State.serviceName)) return;

            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                if (!State.wsReady && State.activeClientId && isServiceEnabled(State.serviceName)) {
                    this.connect(State.activeClientId);
                }
            }, 3000);
        },

        onOpen() {
            log('WebSocket opened. Awaiting Discord RPC READY handshake...');
            State.wsConnected = true;
            this.updateUIStatus();
        },

        onMessage(event) {
            try {
                const msg = JSON.parse(event.data);
                if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
                    log('Discord RPC handshake successful (READY).');
                    State.wsReady = true;
                    this.updateUIStatus();
                }
            } catch (e) {}
        },

        onClose() {
            State.wsConnected = false;
            State.wsReady = false;
            State.ws = null;
            this.updateUIStatus();
            if (isServiceEnabled(State.serviceName)) {
                this.scheduleReconnect();
            }
        },

        onError(e) {
            warn('WebSocket error:', e);
            State.wsConnected = false;
            State.wsReady = false;
            this.updateUIStatus();
            if (isServiceEnabled(State.serviceName)) {
                this.scheduleReconnect();
            }
        },

        disconnect(sendClear = true) {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (State.ws) {
                try {
                    if (sendClear) {
                        this.sendRaw({
                            cmd: 'SET_ACTIVITY',
                            args: { pid: State.pid, activity: null },
                            nonce: 'clear-tab-disconnect'
                        });
                    }
                    if (State.ws.close) State.ws.close();
                } catch (e) {}
                State.ws = null;
            }
            State.wsConnected = false;
            State.wsReady = false;
            State.lastPayloadHash = null;
            this.updateUIStatus();
        },

        sendRaw(payload) {
            if (!State.ws) return;
            const str = JSON.stringify(payload);
            try {
                if (typeof GM_webSocket !== 'undefined' && State.ws.send) {
                    State.ws.send(str);
                } else if (State.ws.readyState === WebSocket.OPEN) {
                    State.ws.send(str);
                }
            } catch (e) {}
        },

        sendActivity(rawActivity) {
            if (!State.wsReady || !isServiceEnabled(State.serviceName)) return;

            if (rawActivity && Config.enableButtons) {
                const currentUrl = window.location.href;
                const buttons = Array.isArray(rawActivity.buttons) ? [...rawActivity.buttons] : [];

                if (buttons.length === 0) {
                    buttons.push({
                        label: Config.customButtonLabel || `View ${State.serviceName || 'Page'}`,
                        url: currentUrl
                    });
                }
                rawActivity.buttons = buttons;
            }

            const hash = JSON.stringify(rawActivity);
            if (hash === State.lastPayloadHash) return;
            State.lastPayloadHash = hash;

            this.sendRaw({
                cmd: 'SET_ACTIVITY',
                args: {
                    pid: State.pid,
                    activity: rawActivity
                },
                nonce: `act-${Date.now()}`
            });
        },

        updateUIStatus() {
            if (!State.uiShadow) return;
            const pill = State.uiShadow.querySelector('.status-pill');
            if (!pill) return;

            if (!isServiceEnabled(State.serviceName)) {
                pill.className = 'status-pill disabled';
                pill.innerHTML = '<span class="dot"></span> Presence Disabled';
            } else if (State.wsReady) {
                pill.className = 'status-pill online';
                pill.innerHTML = '<span class="dot"></span> Discord RPC Connected';
            } else if (State.wsConnected || (State.ws && State.ws.readyState === 0)) {
                pill.className = 'status-pill connecting';
                pill.innerHTML = '<span class="dot"></span> Connecting...';
            } else {
                pill.className = 'status-pill offline';
                pill.innerHTML = '<span class="dot"></span> Discord RPC Offline (6463)';
            }
        }
    };

    const PresenceRuntime = {
        started: false,

        async start() {
            if (this.started) return;
            this.started = true;
            log(`Enabling presence runtime for ${State.serviceName}...`);

            if (!State.presenceInstance) {
                try {
                    const presenceCode = await ResourceLoader.fetchPresence(State.serviceName);
                    log(`Executing presence script for ${State.serviceName} (${presenceCode.length} bytes)...`);

                    const runner = new Function(
                        'Presence',
                        'ActivityType',
                        'Assets',
                        'getTimestampsFromMedia',
                        'timestampFromFormat',
                        presenceCode
                    );
                    runner(
                        window.Presence,
                        window.ActivityType,
                        window.Assets,
                        window.getTimestampsFromMedia,
                        window.timestampFromFormat
                    );
                } catch (e) {
                    err(`Failed to initialize presence for ${State.serviceName}:`, e);
                }
            } else {
                RpcGateway.connect(State.activeClientId || Config.customClientId || '463097721130188830');
            }

            if (!State.updateInterval) {
                State.updateInterval = setInterval(() => {
                    if (this.started && State.presenceInstance && State.presenceInstance.updateListeners) {
                        for (const listener of State.presenceInstance.updateListeners) {
                            try { listener(); } catch (e) {}
                        }
                    }
                }, Config.updateFrequency);
            }

            if (State.presenceInstance && State.presenceInstance.updateListeners) {
                for (const listener of State.presenceInstance.updateListeners) {
                    try { listener(); } catch (e) {}
                }
            }

            RpcGateway.updateUIStatus();
        },

        stop() {
            if (!this.started) return;
            this.started = false;
            log(`Disabling presence runtime for ${State.serviceName}...`);

            if (State.updateInterval) {
                clearInterval(State.updateInterval);
                State.updateInterval = null;
            }

            RpcGateway.disconnect(true);
            RpcGateway.updateUIStatus();
        }
    };

    function installPreMiDRuntime() {
        const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

        root.ActivityType = window.ActivityType = { Playing: 0, Streaming: 1, Listening: 2, Watching: 3, Competing: 5 };
        root.StatusDisplayType = window.StatusDisplayType = { Name: 0, State: 1, Details: 2 };
        root.Assets = window.Assets = {
            Play: 'https://cdn.rcd.gg/PreMiD/resources/play.png',
            Pause: 'https://cdn.rcd.gg/PreMiD/resources/pause.png',
            Stop: 'https://cdn.rcd.gg/PreMiD/resources/stop.png',
            Search: 'https://cdn.rcd.gg/PreMiD/resources/search.png',
            Question: 'https://cdn.rcd.gg/PreMiD/resources/question.png',
            Live: 'https://cdn.rcd.gg/PreMiD/resources/live.png'
        };

        const getTimestampsFromMedia = function (media) {
            if (!media || isNaN(media.duration) || media.duration <= 0) return [0, 0];
            const start = Date.now() / 1000 - media.currentTime;
            const end = start + media.duration;
            return [Math.floor(start), Math.floor(end)];
        };
        root.getTimestampsFromMedia = window.getTimestampsFromMedia = getTimestampsFromMedia;

        const timestampFromFormat = function (str) {
            if (!str || typeof str !== 'string') return 0;
            const parts = str.split(':').map(Number);
            while (parts.length < 3) parts.unshift(0);
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        };
        root.timestampFromFormat = window.timestampFromFormat = timestampFromFormat;

        class PreMiDPresence {
            constructor(options = {}) {
                this.clientId = Config.customClientId || options.clientId || '463097721130188830';
                this.options = options;
                this.updateListeners = [];
                State.presenceInstance = this;
                State.activeClientId = this.clientId;

                if (isServiceEnabled(State.serviceName)) {
                    RpcGateway.connect(this.clientId);
                }
            }

            on(event, callback) {
                if (event === 'UpdateData') {
                    this.updateListeners.push(callback);
                }
            }

            setActivity(data, playback = true) {
                if (!isServiceEnabled(State.serviceName)) return;

                if (!data || Object.keys(data).length === 0) {
                    RpcGateway.sendActivity(null);
                    return;
                }

                const activity = {};

                if (data.details) activity.details = String(data.details).trim().slice(0, 128);
                if (data.state) activity.state = String(data.state).trim().slice(0, 128);

                if (data.startTimestamp || data.endTimestamp) {
                    activity.timestamps = {};
                    if (data.startTimestamp) activity.timestamps.start = Math.floor(data.startTimestamp);
                    if (data.endTimestamp) activity.timestamps.end = Math.floor(data.endTimestamp);
                }

                if (data.largeImageKey || data.smallImageKey) {
                    activity.assets = {};
                    if (data.largeImageKey) activity.assets.large_image = data.largeImageKey;
                    if (data.largeImageText) activity.assets.large_text = String(data.largeImageText).slice(0, 128);
                    if (data.smallImageKey) activity.assets.small_image = data.smallImageKey;
                    if (data.smallImageText) activity.assets.small_text = String(data.smallImageText).slice(0, 128);
                }

                if (Array.isArray(data.buttons)) {
                    activity.buttons = data.buttons;
                }

                RpcGateway.sendActivity(activity);
            }

            clearActivity() {
                RpcGateway.sendActivity(null);
            }

            getActivity() {
                return {};
            }

            getSetting(id) {
                if (State.settings && id in State.settings) {
                    return Promise.resolve(State.settings[id]);
                }
                if (State.metadata && Array.isArray(State.metadata.settings)) {
                    const s = State.metadata.settings.find(item => item.id === id);
                    if (s) return Promise.resolve(s.value);
                }
                return Promise.resolve(null);
            }

            getStrings(strMap) {
                return Promise.resolve(strMap || {});
            }

            getPageVariable(variable) {
                return Promise.resolve(window[variable]);
            }

            info(...args) { log(`[${State.serviceName}]`, ...args); }
            warn(...args) { warn(`[${State.serviceName}]`, ...args); }
            error(...args) { err(`[${State.serviceName}]`, ...args); }
        }

        root.Presence = window.Presence = PreMiDPresence;
    }

    function loadSettings(serviceName, metadata) {
        const key = `settings_${serviceName}`;
        const saved = GM_getValue(key, {});
        const result = { ...saved };

        if (metadata && Array.isArray(metadata.settings)) {
            for (const s of metadata.settings) {
                if (!(s.id in result)) {
                    result[s.id] = s.value;
                }
            }
        }
        State.settings = result;
        Config.enableButtons = GM_getValue(`enable_buttons_${serviceName}`, true);
        Config.customButtonLabel = GM_getValue(`btn_label_${serviceName}`, '');
        Config.customClientId = GM_getValue(`client_id_${serviceName}`, '');
    }

    function saveSetting(serviceName, id, value) {
        State.settings[id] = value;
        GM_setValue(`settings_${serviceName}`, State.settings);
    }

    function openUI() {
        if (!State.uiShadow) {
            injectShadowUI();
        }
        if (!State.uiShadow) return;

        State.uiOpen = true;
        renderSettingsForm(State.uiShadow);
        const modal = State.uiShadow.querySelector('.modal-backdrop');
        if (modal) {
            modal.classList.add('open');
            RpcGateway.updateUIStatus();
            const closeBtn = State.uiShadow.querySelector('.close-btn');
            if (closeBtn) closeBtn.focus();
        }
    }

    function closeUI() {
        State.uiOpen = false;
        if (!State.uiShadow) return;
        const modal = State.uiShadow.querySelector('.modal-backdrop');
        if (modal) {
            modal.classList.remove('open');
        }
    }

    function toggleUI() {
        if (State.uiOpen) closeUI();
        else openUI();
    }

    function injectShadowUI() {
        if (document.getElementById('premid-rpc-host')) return;

        const mountPoint = document.body || document.documentElement;
        if (!mountPoint) {
            window.addEventListener('DOMContentLoaded', () => injectShadowUI(), { once: true });
            return;
        }

        const host = document.createElement('div');
        host.id = 'premid-rpc-host';
        host.style.position = 'fixed';
        host.style.bottom = '0';
        host.style.right = '0';
        host.style.zIndex = '2147483647';
        host.style.pointerEvents = 'none';
        host.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

        const shadow = host.attachShadow({ mode: 'closed' });
        State.uiShadow = shadow;

        const style = document.createElement('style');
        style.textContent = `
            * { box-sizing: border-box; margin: 0; padding: 0; }
            .modal-backdrop {
                display: none;
                pointer-events: auto;
                position: fixed;
                bottom: 24px;
                right: 24px;
                width: 360px;
                max-height: calc(100vh - 48px);
                background: #1e1f22;
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                flex-direction: column;
                animation: slideUp 0.18s ease-out;
            }
            .modal-backdrop.open { display: flex; }
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(8px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @media (prefers-reduced-motion: reduce) {
                .modal-backdrop, .slider, .btn {
                    animation: none !important;
                    transition: none !important;
                }
            }
            .modal-header {
                padding: 14px 16px;
                background: #2b2d31;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .header-info { display: flex; align-items: center; gap: 10px; }
            .header-title { font-size: 14px; font-weight: 700; color: #fff; }
            .status-pill {
                font-size: 11px;
                padding: 3px 8px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
                font-weight: 600;
            }
            .status-pill.online { background: #1b3d2b; color: #47d17e; }
            .status-pill.connecting { background: #3d3319; color: #ffc83b; }
            .status-pill.offline { background: #421d20; color: #ff6b72; }
            .status-pill.disabled { background: #2b2d31; color: #949ba4; border: 1px solid rgba(255, 255, 255, 0.08); }
            .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
            .close-btn {
                background: none;
                border: none;
                color: #b5bac1;
                font-size: 20px;
                cursor: pointer;
                width: 36px;
                height: 36px;
                min-width: 36px;
                min-height: 36px;
                border-radius: 8px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .close-btn:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
            .close-btn:focus-visible {
                outline: 2px solid #5865f2;
                outline-offset: -2px;
            }
            .modal-body {
                padding: 16px;
                overflow-y: auto;
                max-height: 60vh;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .section-title {
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: #949ba4;
                margin-bottom: 8px;
            }
            .setting-item {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .setting-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                min-height: 36px;
            }
            .setting-label {
                font-size: 13px;
                color: #dbdee1;
                font-weight: 500;
                cursor: pointer;
            }
            .switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
                flex-shrink: 0;
            }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider {
                position: absolute; cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: #4e5058;
                transition: background-color 0.15s ease;
                border-radius: 12px;
            }
            .slider:before {
                position: absolute; content: "";
                height: 18px; width: 18px;
                left: 3px; bottom: 3px;
                background-color: white;
                transition: transform 0.15s ease;
                border-radius: 50%;
            }
            .switch input:focus-visible + .slider {
                outline: 2px solid #5865f2;
                outline-offset: 2px;
            }
            input:checked + .slider { background-color: #5865f2; }
            input:checked + .slider:before { transform: translateX(20px); }
            .styled-select, .styled-input {
                width: 100%;
                background: #111214;
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 8px;
                padding: 10px 12px;
                color: #f2f3f5;
                font-size: 13px;
                outline: none;
                transition: border-color 0.15s ease;
            }
            .styled-select:focus-visible, .styled-input:focus-visible {
                border-color: #5865f2;
                outline: 2px solid #5865f2;
                outline-offset: 1px;
            }
            .modal-footer {
                padding: 12px 16px;
                background: #2b2d31;
                border-top: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                align-items: center;
            }
            .btn {
                padding: 8px 16px;
                min-height: 38px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 8px;
                cursor: pointer;
                border: none;
                transition: background-color 0.15s ease;
            }
            .btn-primary { background: #5865f2; color: #fff; }
            .btn-primary:hover { background: #4752c4; }
            .btn-primary:focus-visible {
                outline: 2px solid #fff;
                outline-offset: 2px;
            }
            .hotkey-hint {
                font-size: 11px;
                color: #949ba4;
                margin-right: auto;
            }
        `;

        const container = document.createElement('div');
        container.innerHTML = `
            <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title-heading">
                <div class="modal-header">
                    <div class="header-info">
                        <span class="header-title" id="modal-title-heading">${State.serviceName || 'Rich Presence'}</span>
                        <div class="status-pill offline"><span class="dot"></span> Discord RPC</div>
                    </div>
                    <button type="button" class="close-btn" aria-label="Close settings">&times;</button>
                </div>
                <div class="modal-body" id="modal-settings-container"></div>
                <div class="modal-footer">
                    <span class="hotkey-hint">Alt + P / Esc</span>
                    <button type="button" class="btn btn-primary" id="save-close-btn">Done</button>
                </div>
            </div>
        `;

        shadow.appendChild(style);
        shadow.appendChild(container);
        mountPoint.appendChild(host);

        const closeBtn = shadow.querySelector('.close-btn');
        const saveCloseBtn = shadow.querySelector('#save-close-btn');

        closeBtn.addEventListener('click', closeUI);
        saveCloseBtn.addEventListener('click', closeUI);

        window.addEventListener('keydown', (e) => {
            if (e.altKey && (e.code === 'KeyP' || e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                toggleUI();
            } else if (e.key === 'Escape' && State.uiOpen) {
                e.preventDefault();
                closeUI();
            }
        });

        window.addEventListener('pointerdown', (e) => {
            if (!State.uiOpen) return;
            if (host && !e.composedPath().includes(host)) {
                closeUI();
            }
        });
    }

    function renderSettingsForm(shadow) {
        const container = shadow.querySelector('#modal-settings-container');
        if (!container) return;
        container.innerHTML = '';

        // Master switch: Enable/Disable Rich Presence for this service
        if (State.serviceName) {
            const masterSec = document.createElement('div');
            masterSec.className = 'setting-item';
            masterSec.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
            masterSec.style.paddingBottom = '14px';
            masterSec.style.marginBottom = '4px';

            const enabled = isServiceEnabled(State.serviceName);
            masterSec.innerHTML = `
                <div class="setting-row">
                    <div>
                        <label class="setting-label" for="master-presence-toggle" style="font-weight: 600; color: #fff;">Enable Presence</label>
                        <div style="font-size: 11px; color: #949ba4; margin-top: 2px;">Share activity on Discord for ${State.serviceName}</div>
                    </div>
                    <label class="switch">
                        <input type="checkbox" id="master-presence-toggle" ${enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            `;

            const masterToggle = masterSec.querySelector('#master-presence-toggle');
            masterToggle.addEventListener('change', () => {
                const next = masterToggle.checked;
                setServiceEnabled(State.serviceName, next);
                if (next) {
                    PresenceRuntime.start();
                } else {
                    PresenceRuntime.stop();
                }
                registerMenuCommands();
            });

            container.appendChild(masterSec);
        }

        if (State.metadata && Array.isArray(State.metadata.settings) && State.metadata.settings.length > 0) {
            const sec1 = document.createElement('div');
            sec1.innerHTML = `<div class="section-title">Presence Settings (${State.serviceName})</div>`;

            for (const s of State.metadata.settings) {
                if (s.id === 'lang') continue;

                const item = document.createElement('div');
                item.className = 'setting-item';
                item.dataset.settingId = s.id;

                if (s.if) {
                    item.dataset.condition = JSON.stringify(s.if);
                }

                const currentValue = State.settings[s.id] ?? s.value;
                const fieldId = `field_${s.id}`;

                if (typeof s.value === 'boolean' || (!s.values && typeof currentValue === 'boolean')) {
                    item.innerHTML = `
                        <div class="setting-row">
                            <label class="setting-label" for="${fieldId}">${s.title || s.id}</label>
                            <label class="switch">
                                <input type="checkbox" id="${fieldId}" ${currentValue ? 'checked' : ''}>
                                <span class="slider"></span>
                            </label>
                        </div>
                    `;
                    const checkbox = item.querySelector('input');
                    checkbox.addEventListener('change', () => {
                        saveSetting(State.serviceName, s.id, checkbox.checked);
                        evaluateConditions(container);
                    });
                } else if (Array.isArray(s.values)) {
                    let optionsHtml = '';
                    s.values.forEach((val, idx) => {
                        const selected = (currentValue === idx || currentValue === val) ? 'selected' : '';
                        optionsHtml += `<option value="${idx}" ${selected}>${val}</option>`;
                    });

                    item.innerHTML = `
                        <label class="setting-label" for="${fieldId}">${s.title || s.id}</label>
                        <select class="styled-select" id="${fieldId}">${optionsHtml}</select>
                    `;
                    const select = item.querySelector('select');
                    select.addEventListener('change', () => {
                        const val = Number.isInteger(s.value) ? parseInt(select.value, 10) : select.value;
                        saveSetting(State.serviceName, s.id, val);
                        evaluateConditions(container);
                    });
                } else {
                    item.innerHTML = `
                        <label class="setting-label" for="${fieldId}">${s.title || s.id}</label>
                        <input class="styled-input" type="text" id="${fieldId}" placeholder="${s.placeholder || ''}" value="${currentValue || ''}">
                    `;
                    const input = item.querySelector('input');
                    input.addEventListener('change', () => {
                        saveSetting(State.serviceName, s.id, input.value);
                    });
                }

                sec1.appendChild(item);
            }
            container.appendChild(sec1);
            evaluateConditions(container);
        }

        const sec2 = document.createElement('div');
        sec2.innerHTML = `
            <div class="section-title">Rich Presence Customization</div>
            <div class="setting-item">
                <div class="setting-row">
                    <label class="setting-label" for="unlocked-buttons-check">Show Profile Action Buttons</label>
                    <label class="switch">
                        <input type="checkbox" id="unlocked-buttons-check" ${Config.enableButtons ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <div class="setting-item" style="margin-top: 8px;">
                <label class="setting-label" for="custom-btn-label">Direct Link Button Label</label>
                <input class="styled-input" type="text" id="custom-btn-label" placeholder="View ${State.serviceName}" value="${Config.customButtonLabel}">
            </div>
            <div class="setting-item" style="margin-top: 8px;">
                <label class="setting-label" for="custom-client-id">Custom Discord Client ID (Optional)</label>
                <input class="styled-input" type="text" id="custom-client-id" placeholder="Leave empty for default" value="${Config.customClientId}">
            </div>
        `;

        const buttonsCheck = sec2.querySelector('#unlocked-buttons-check');
        buttonsCheck.addEventListener('change', () => {
            Config.enableButtons = buttonsCheck.checked;
            GM_setValue(`enable_buttons_${State.serviceName}`, Config.enableButtons);
        });

        const btnLabel = sec2.querySelector('#custom-btn-label');
        btnLabel.addEventListener('change', () => {
            Config.customButtonLabel = btnLabel.value.trim();
            GM_setValue(`btn_label_${State.serviceName}`, Config.customButtonLabel);
        });

        const clientIdInput = sec2.querySelector('#custom-client-id');
        clientIdInput.addEventListener('change', () => {
            Config.customClientId = clientIdInput.value.trim();
            GM_setValue(`client_id_${State.serviceName}`, Config.customClientId);
            if (Config.customClientId && isServiceEnabled(State.serviceName)) {
                RpcGateway.connect(Config.customClientId);
            }
        });

        container.appendChild(sec2);
    }

    function evaluateConditions(container) {
        const items = container.querySelectorAll('.setting-item[data-condition]');
        items.forEach(item => {
            try {
                const cond = JSON.parse(item.dataset.condition);
                let visible = true;
                for (const [key, expectedVal] of Object.entries(cond)) {
                    if (State.settings[key] !== expectedVal) {
                        visible = false;
                        break;
                    }
                }
                item.style.display = visible ? 'flex' : 'none';
            } catch (e) {}
        });
    }

    let activeMenuCommands = [];

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand === 'undefined') return;

        if (typeof GM_unregisterMenuCommand !== 'undefined') {
            for (const cmdId of activeMenuCommands) {
                try { GM_unregisterMenuCommand(cmdId); } catch (e) {}
            }
        }
        activeMenuCommands = [];

        const defaultEnabled = GM_getValue('global_default_enabled', false);

        if (State.serviceName) {
            const enabled = isServiceEnabled(State.serviceName);
            const toggleLabel = enabled
                ? `● ${State.serviceName}: Enabled (Click to Disable)`
                : `○ ${State.serviceName}: Disabled (Click to Enable)`;

            const toggleId = GM_registerMenuCommand(toggleLabel, () => {
                const next = !enabled;
                setServiceEnabled(State.serviceName, next);
                if (next) {
                    PresenceRuntime.start();
                } else {
                    PresenceRuntime.stop();
                }
                registerMenuCommands();
                if (State.uiShadow) {
                    renderSettingsForm(State.uiShadow);
                }
            });
            if (toggleId !== undefined) activeMenuCommands.push(toggleId);

            const configId = GM_registerMenuCommand(`⚙ Configure ${State.serviceName} Presence`, () => {
                openUI();
            });
            if (configId !== undefined) activeMenuCommands.push(configId);
        }

        const defaultLabel = defaultEnabled
            ? '★ Default Mode: Enabled (Click to set Disabled)'
            : '☆ Default Mode: Disabled (Click to set Enabled)';

        const defaultId = GM_registerMenuCommand(defaultLabel, () => {
            const next = !defaultEnabled;
            GM_setValue('global_default_enabled', next);
            registerMenuCommands();
        });
        if (defaultId !== undefined) activeMenuCommands.push(defaultId);
    }

    async function bootstrap() {
        registerMenuCommands();

        const currentUrl = window.location.href;
        const currentHostname = window.location.hostname;

        const serviceName = await ServiceResolver.resolve(currentHostname, currentUrl);
        if (!serviceName) {
            return;
        }

        log(`Identified service: ${serviceName}`);
        State.serviceName = serviceName;

        installPreMiDRuntime();

        try {
            State.metadata = await ResourceLoader.fetchMetadata(serviceName);
            loadSettings(serviceName, State.metadata);
            log(`Loaded metadata for ${serviceName} (v${State.metadata.version})`);
        } catch (e) {
            warn(`Could not load metadata for ${serviceName}:`, e);
        }

        registerMenuCommands();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => injectShadowUI());
        } else {
            injectShadowUI();
        }

        if (isServiceEnabled(serviceName)) {
            await PresenceRuntime.start();
        } else {
            log(`Presence for ${serviceName} is disabled by default.`);
        }

        window.addEventListener('beforeunload', () => {
            RpcGateway.disconnect();
        });
    }

    bootstrap();
})();
