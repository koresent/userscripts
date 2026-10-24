// ==UserScript==
// @name           ⚙ [General] Dark Reader
// @namespace      github.com/koresent/userscripts
// @version        1.3.0
// @description    Dark Reader userscript with CORS bypass, native dark theme detection, and 3-state toggle.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.google.com/s2/favicons?sz=64&domain=darkreader.org
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/dark-reader.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/dark-reader.user.js
//
// @match          *://*/*
//
// @run-at         document-start
//
// @require        https://cdn.jsdelivr.net/npm/darkreader@4.9.133/darkreader.min.js
//
// @connect        *
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_MODES = 'dr_site_modes';
    const STORAGE_KEY_LEGACY_DISABLED = 'dr_disabled_hosts';
    const FALLBACK_STYLE_ID = 'dr-fouc-fallback-style';

    const MODE = {
        AUTO: 'auto',
        FORCED: 'forced',
        DISABLED: 'disabled'
    };

    const THEME_OPTIONS = {
        brightness: 100,
        contrast: 100,
        sepia: 0
    };

    let isInitialized = false;
    let pageObserver = null;
    let isDarkReaderActive = false;
    let lastHandledHref = location.href;

    const DR = typeof DarkReader !== 'undefined' ? DarkReader : window.DarkReader;
    if (!DR) {
        console.error('[Dark Reader Userscript] DarkReader library failed to load.');
        return;
    }

    function getAllSiteModes() {
        const modes = GM_getValue(STORAGE_KEY_MODES, null);
        if (modes && typeof modes === 'object' && !Array.isArray(modes)) {
            return modes;
        }

        const legacyDisabled = GM_getValue(STORAGE_KEY_LEGACY_DISABLED, []);
        const migrated = {};
        if (Array.isArray(legacyDisabled)) {
            for (const host of legacyDisabled) {
                migrated[host] = MODE.DISABLED;
            }
        }
        return migrated;
    }

    function getSiteMode(hostname = location.hostname) {
        if (!hostname) return MODE.AUTO;
        const modes = getAllSiteModes();

        if (modes[hostname]) {
            return modes[hostname];
        }

        const parts = hostname.split('.');
        for (let i = 1; i < parts.length - 1; i++) {
            const parentDomain = parts.slice(i).join('.');
            if (modes[parentDomain]) {
                return modes[parentDomain];
            }
        }

        return MODE.AUTO;
    }

    function setSiteMode(hostname, mode) {
        if (!hostname) return;
        const modes = getAllSiteModes();

        if (mode === MODE.AUTO) {
            delete modes[hostname];
        } else {
            modes[hostname] = mode;
        }

        GM_setValue(STORAGE_KEY_MODES, modes);
    }

    function getNextMode(currentMode) {
        switch (currentMode) {
            case MODE.AUTO:
                return MODE.FORCED;
            case MODE.FORCED:
                return MODE.DISABLED;
            case MODE.DISABLED:
            default:
                return MODE.AUTO;
        }
    }

    function getModeInfo(mode) {
        switch (mode) {
            case MODE.FORCED:
                return {
                    label: 'Forced Dark',
                    icon: '🌙'
                };
            case MODE.DISABLED:
                return {
                    label: 'Disabled',
                    icon: '🚫'
                };
            case MODE.AUTO:
            default:
                return {
                    label: 'Automatic',
                    icon: '⚡'
                };
        }
    }

    function injectFOUCFallback() {
        if (document.getElementById(FALLBACK_STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = FALLBACK_STYLE_ID;
        style.classList.add('darkreader', 'darkreader--fallback');
        style.media = 'screen';
        style.textContent = `
            html, body {
                background-color: #181a1b !important;
                color: #e8e6e3 !important;
            }
        `;

        const target = document.head || document.documentElement;
        if (target) {
            target.appendChild(style);
        } else {
            const rootObserver = new MutationObserver(() => {
                const root = document.head || document.documentElement;
                if (root) {
                    rootObserver.disconnect();
                    root.appendChild(style);
                }
            });
            rootObserver.observe(document, { childList: true });
        }
    }

    function removeFOUCFallback() {
        const fallback = document.getElementById(FALLBACK_STYLE_ID);
        if (fallback && fallback.parentNode) {
            fallback.parentNode.removeChild(fallback);
        }
    }

    function configureCORSFetch() {
        DR.setFetchMethod((url) => {
            return new Promise((resolve, reject) => {
                const absoluteUrl = new URL(url, location.href).href;

                GM_xmlhttpRequest({
                    method: 'GET',
                    url: absoluteUrl,
                    responseType: 'blob',
                    timeout: 15000,
                    onload: (res) => {
                        try {
                            const headers = new Headers();
                            if (res.responseHeaders) {
                                res.responseHeaders.trim().split(/[\r\n]+/).forEach((line) => {
                                    const sep = line.indexOf(':');
                                    if (sep > 0) {
                                        const key = line.slice(0, sep).trim();
                                        const val = line.slice(sep + 1).trim();
                                        try {
                                            headers.append(key, val);
                                        } catch (_) {}
                                    }
                                });
                            }

                            const status = (res.status >= 200 && res.status < 300) || res.status === 304
                                ? res.status
                                : (res.status === 0 ? 200 : res.status);

                            const blob = res.response instanceof Blob
                                ? res.response
                                : new Blob([res.responseText || '']);

                            const response = new Response(blob, {
                                status: status,
                                statusText: res.statusText || 'OK',
                                headers: headers
                            });

                            resolve(response);
                        } catch (err) {
                            const text = res.responseText || '';
                            const fallbackBlob = res.response instanceof Blob ? res.response : new Blob([text]);
                            resolve({
                                ok: res.status >= 200 && res.status < 300,
                                status: res.status || 200,
                                statusText: res.statusText || 'OK',
                                headers: {
                                    get: (headerName) => {
                                        const regex = new RegExp(`^${headerName}:\\s*(.*)$`, 'im');
                                        const match = res.responseHeaders && res.responseHeaders.match(regex);
                                        return match ? match[1].trim() : null;
                                    }
                                },
                                text: async () => (res.responseText !== undefined ? res.responseText : await fallbackBlob.text()),
                                blob: async () => fallbackBlob
                            });
                        }
                    },
                    onerror: (err) => {
                        reject(new Error(`[Dark Reader] CORS fetch error for: ${absoluteUrl} (${err.error || 'Network error'})`));
                    },
                    ontimeout: () => {
                        reject(new Error(`[Dark Reader] CORS fetch timed out for: ${absoluteUrl}`));
                    }
                });
            });
        });
    }

    function parseColor(colorStr) {
        if (!colorStr || colorStr === 'transparent') {
            return { r: 0, g: 0, b: 0, a: 0 };
        }
        const match = colorStr.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/i);
        if (match) {
            return {
                r: parseInt(match[1], 10),
                g: parseInt(match[2], 10),
                b: parseInt(match[3], 10),
                a: match[4] !== undefined ? parseFloat(match[4]) : 1
            };
        }
        return { r: 0, g: 0, b: 0, a: 0 };
    }

    function getLuminance(r, g, b) {
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    function isDarkReaderColor(color) {
        return color.r === 24 && color.g === 26 && color.b === 27;
    }

    function isEarlyNativeDark() {
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta && meta.content) {
            const content = meta.content.trim().toLowerCase();
            if (content === 'dark' || content === 'only dark') return true;
        }

        const html = document.documentElement;
        if (!html) return false;

        const darkClasses = ['dark', 'dark-theme', 'dark-mode', 'theme-dark', 'theme--dark', 'theme-night'];
        for (const cls of darkClasses) {
            if (html.classList.contains(cls)) return true;
        }

        const darkAttrs = ['data-theme', 'data-color-mode', 'data-bs-theme', 'data-palette', 'data-theme-mode'];
        for (const attr of darkAttrs) {
            const val = html.getAttribute(attr);
            if (val && (val.toLowerCase() === 'dark' || val.toLowerCase().includes('dark'))) {
                return true;
            }
        }

        return false;
    }

    function detectNativeDarkTheme() {
        const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
        if (colorSchemeMeta && colorSchemeMeta.content) {
            const content = colorSchemeMeta.content.trim().toLowerCase();
            if (content === 'dark' || content === 'only dark') return true;
            if (content === 'light' || content === 'only light') return false;
        }

        const htmlEl = document.documentElement;
        if (!htmlEl) return false;

        const darkClasses = ['dark', 'dark-theme', 'dark-mode', 'theme-dark', 'theme--dark', 'theme-night'];
        const darkAttrs = ['data-theme', 'data-color-mode', 'data-bs-theme', 'data-palette', 'data-theme-mode'];

        for (const cls of darkClasses) {
            if (htmlEl.classList.contains(cls) || (document.body && document.body.classList.contains(cls))) {
                return true;
            }
        }

        for (const attr of darkAttrs) {
            const valHtml = htmlEl.getAttribute(attr);
            if (valHtml && (valHtml.toLowerCase() === 'dark' || valHtml.toLowerCase().includes('dark'))) {
                return true;
            }
            if (document.body) {
                const valBody = document.body.getAttribute(attr);
                if (valBody && (valBody.toLowerCase() === 'dark' || valBody.toLowerCase().includes('dark'))) {
                    return true;
                }
            }
        }

        const fallbackEl = document.getElementById(FALLBACK_STYLE_ID);
        const fallbackParent = fallbackEl ? fallbackEl.parentNode : null;
        if (fallbackEl && fallbackParent) {
            fallbackParent.removeChild(fallbackEl);
        }

        const drSheets = Array.from(document.styleSheets).filter((sheet) => {
            try {
                const node = sheet.ownerNode;
                return node && node.classList && node.classList.contains('darkreader');
            } catch (_) {
                return false;
            }
        });
        drSheets.forEach((sheet) => { sheet.disabled = true; });

        try {
            const rootStyle = window.getComputedStyle(htmlEl);

            if (rootStyle.colorScheme === 'dark' || rootStyle.filter.includes('invert(1)')) {
                return true;
            }

            const rawRootBg = parseColor(rootStyle.backgroundColor);
            const bodyStyle = document.body ? window.getComputedStyle(document.body) : null;
            const rawBodyBg = bodyStyle ? parseColor(bodyStyle.backgroundColor) : { r: 0, g: 0, b: 0, a: 0 };

            const rootBg = isDarkReaderColor(rawRootBg) ? { r: 0, g: 0, b: 0, a: 0 } : rawRootBg;
            const bodyBg = isDarkReaderColor(rawBodyBg) ? { r: 0, g: 0, b: 0, a: 0 } : rawBodyBg;

            if (rootBg.a === 1 && getLuminance(rootBg.r, rootBg.g, rootBg.b) < 0.35) {
                return true;
            }
            if (bodyBg.a === 1 && getLuminance(bodyBg.r, bodyBg.g, bodyBg.b) < 0.35) {
                return true;
            }

            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;

            if (winWidth > 0 && winHeight > 0 && document.body && document.body.childElementCount > 0) {
                const stepX = Math.floor(winWidth / 4);
                const stepY = Math.floor(winHeight / 4);
                let darkCount = 0;
                let sampleCount = 0;
                const processed = new Set();

                for (let y = Math.floor(stepY / 2); y < winHeight; y += stepY) {
                    for (let x = Math.floor(stepX / 2); x < winWidth; x += stepX) {
                        const el = document.elementFromPoint(x, y);
                        if (!el || processed.has(el) || el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'VIDEO') {
                            continue;
                        }
                        processed.add(el);

                        const elStyle = (el === htmlEl) ? rootStyle : window.getComputedStyle(el);
                        const bg = parseColor(elStyle.backgroundColor);
                        if (!bg || isDarkReaderColor(bg)) continue;

                        if (bg.a > 0.5) {
                            sampleCount++;
                            if (getLuminance(bg.r, bg.g, bg.b) < 0.4) {
                                darkCount++;
                            }
                        } else {
                            const fg = parseColor(elStyle.color);
                            if (fg && fg.a > 0.5) {
                                sampleCount++;
                                if (getLuminance(fg.r, fg.g, fg.b) > 0.65) {
                                darkCount++;
                                }
                            }
                        }
                    }
                }

                if (sampleCount >= 4 && (darkCount / sampleCount) >= 0.75) {
                    return true;
                }
            }

            if (rootBg.a === 0 && bodyBg.a === 0) {
                return false;
            }

            const rootLum = (1 - rootBg.a) + rootBg.a * getLuminance(rootBg.r, rootBg.g, rootBg.b);
            const finalLum = (1 - bodyBg.a) * rootLum + bodyBg.a * getLuminance(bodyBg.r, bodyBg.g, bodyBg.b);
            return finalLum < 0.35;
        } finally {
            drSheets.forEach((sheet) => { sheet.disabled = false; });

            if (fallbackEl && fallbackParent && !fallbackEl.parentNode && !isDarkReaderActive) {
                fallbackParent.appendChild(fallbackEl);
            }
        }
    }

    function applyTheme() {
        const mode = getSiteMode(location.hostname);

        if (mode === MODE.DISABLED) {
            disableTheme();
            return;
        }

        if (mode === MODE.AUTO) {
            if (detectNativeDarkTheme()) {
                disableTheme();
                return;
            }
        }

        enableTheme();
    }

    function enableTheme() {
        DR.enable(THEME_OPTIONS);
        isDarkReaderActive = true;
        removeFOUCFallback();
    }

    function disableTheme() {
        DR.disable();
        isDarkReaderActive = false;
        removeFOUCFallback();
    }

    function setModeDirectly(newMode) {
        const host = location.hostname;
        setSiteMode(host, newMode);

        const info = getModeInfo(newMode);
        showNotification(`${info.icon} ${info.label}`);

        if (newMode === MODE.DISABLED) {
            disableTheme();
        } else if (newMode === MODE.FORCED) {
            injectFOUCFallback();
            enableTheme();
        } else {
            injectFOUCFallback();
            applyTheme();
        }
    }

    function cycleModeForCurrentSite() {
        const host = location.hostname;
        if (!host) return;

        const currentMode = getSiteMode(host);
        const nextMode = getNextMode(currentMode);
        setModeDirectly(nextMode);
    }

    function showNotification(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        Object.assign(toast.style, {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '10px 18px',
            backgroundColor: '#1f2428',
            color: '#f0f6fc',
            border: '1px solid #30363d',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
            fontSize: '13px',
            fontWeight: '600',
            zIndex: '2147483647',
            pointerEvents: 'none',
            opacity: '0',
            transform: 'translateY(10px)',
            transition: 'opacity 0.2s ease, transform 0.2s ease'
        });

        const root = document.body || document.documentElement;
        if (root) {
            root.appendChild(toast);
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 250);
            }, 1800);
        }
    }

    function setupMenuCommands() {
        if (window !== window.top) return;
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('🌙 Force Dark', () => {
            setModeDirectly(MODE.FORCED);
        });

        GM_registerMenuCommand('⚡ Auto Detect', () => {
            setModeDirectly(MODE.AUTO);
        });

        GM_registerMenuCommand('🚫 Disable', () => {
            setModeDirectly(MODE.DISABLED);
        });
    }

    function setupKeyboardShortcut() {
        window.addEventListener('keydown', (event) => {
            if (event.altKey && event.shiftKey && (event.code === 'KeyD' || event.key === 'D' || event.key === 'd')) {
                event.preventDefault();
                event.stopPropagation();
                cycleModeForCurrentSite();
            }
        }, true);
    }

    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                timer = null;
                fn.apply(this, args);
            }, delay);
        };
    }

    const debouncedApplyTheme = debounce(() => {
        applyTheme();
    }, 250);

    function setupPageObserver() {
        if (pageObserver) return;

        pageObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.target instanceof Element && mutation.target.classList.contains('darkreader')) {
                    continue;
                }
                debouncedApplyTheme();
                break;
            }
        });

        if (document.documentElement) {
            pageObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'data-theme', 'data-color-mode', 'data-bs-theme']
            });
        }
    }

    function setupSPANavigationListeners() {
        const handleNavigation = debounce(() => {
            if (location.href === lastHandledHref) return;
            lastHandledHref = location.href;
            applyTheme();
        }, 150);

        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('hashchange', handleNavigation);

        const originalPushState = history.pushState;
        if (typeof originalPushState === 'function') {
            history.pushState = function (...args) {
                const result = originalPushState.apply(this, args);
                handleNavigation();
                return result;
            };
        }

        const originalReplaceState = history.replaceState;
        if (typeof originalReplaceState === 'function') {
            history.replaceState = function (...args) {
                const result = originalReplaceState.apply(this, args);
                handleNavigation();
                return result;
            };
        }
    }

    function init() {
        if (isInitialized) return;
        isInitialized = true;

        configureCORSFetch();
        setupMenuCommands();
        setupKeyboardShortcut();
        setupSPANavigationListeners();

        const mode = getSiteMode(location.hostname);
        if (mode === MODE.DISABLED) {
            return;
        }

        if (mode === MODE.FORCED) {
            injectFOUCFallback();
            enableTheme();
        } else {
            if (!isEarlyNativeDark()) {
                injectFOUCFallback();
                enableTheme();
            }
        }

        const onDOMReady = () => {
            setupPageObserver();
            applyTheme();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onDOMReady, { once: true });
        } else {
            onDOMReady();
        }

        window.addEventListener('load', () => {
            applyTheme();
        }, { once: true });
    }

    init();
})();
