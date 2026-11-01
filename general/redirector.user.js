// ==UserScript==
// @name           ⚙ [General] Redirector
// @namespace      github.com/koresent/userscripts
// @version        1.2.1
// @description    Automatically redirects Reddit, Habr, X, and Wikipedia to alternative frontends with toggleable menus.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.svgrepo.com/show/183574/curved-arrow-share.svg
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/redirector.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/redirector.user.js
//
// @match          *://*.reddit.com/*
// @match          *://red.umbra.team/*
// @match          *://*.habr.com/*
// @match          *://geekr.vercel.app/*
// @match          *://*.x.com/*
// @match          *://x.umbra.team/*
// @match          *://*.wikipedia.org/wiki/*
// @match          *://*.wikiwand.com/*
//
// @connect        red.umbra.team
// @connect        geekr.vercel.app
// @connect        x.umbra.team
// @connect        wikiwand.com
// @connect        *.wikiwand.com
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    // Retrieve toggle states from storage (default is true)
    const settings = {
        reddit: GM_getValue('redirect_reddit', true),
        habr: GM_getValue('redirect_habr', true),
        x: GM_getValue('redirect_x', true),
        wikipedia: GM_getValue('redirect_wikipedia', true)
    };

    const currentUrl = window.location.href;
    const hostname = window.location.hostname;

    // Cache duration for unreachable hosts to avoid repeated timeouts (60 seconds)
    const FAILURE_CACHE_TTL = 60 * 1000;
    // Timeout for availability checks (2.5 seconds)
    const REQUEST_TIMEOUT = 2500;

    function clearHostCaches() {
        ['red.umbra.team', 'geekr.vercel.app', 'x.umbra.team', 'www.wikiwand.com'].forEach(host => {
            GM_setValue(`down_${host}`, 0);
        });
    }

    function isHostCachedDown(targetUrl) {
        try {
            const host = new URL(targetUrl).hostname;
            const downUntil = GM_getValue(`down_${host}`, 0);
            return Date.now() < downUntil;
        } catch (e) {
            return false;
        }
    }

    function markHostDown(targetUrl) {
        try {
            const host = new URL(targetUrl).hostname;
            GM_setValue(`down_${host}`, Date.now() + FAILURE_CACHE_TTL);
        } catch (e) {
            // ignore
        }
    }

    function clearHostDown(targetUrl) {
        try {
            const host = new URL(targetUrl).hostname;
            GM_setValue(`down_${host}`, 0);
        } catch (e) {
            // ignore
        }
    }

    // Toggle setting and reload page or return to original site
    function toggleSetting(name, key) {
        const newValue = !settings[name];
        GM_setValue(key, newValue);
        settings[name] = newValue;
        clearHostCaches();

        // If redirect was disabled while currently on the target frontend, redirect back to original website
        if (!newValue) {
            const urlObj = new URL(window.location.href);

            if (name === 'reddit' && /(?:^|\.)red\.umbra\.team$/.test(hostname)) {
                window.location.replace('https://www.reddit.com' + urlObj.pathname + urlObj.search + urlObj.hash);
                return;
            }
            if (name === 'habr' && hostname === 'geekr.vercel.app') {
                const match = urlObj.pathname.match(/^\/post\/(\d+)/);
                if (match) {
                    window.location.replace(`https://habr.com/post/${match[1]}/` + urlObj.search + urlObj.hash);
                    return;
                }
                window.location.replace('https://habr.com/' + urlObj.search + urlObj.hash);
                return;
            }
            if (name === 'x' && /(?:^|\.)x\.umbra\.team$/.test(hostname)) {
                window.location.replace('https://x.com' + urlObj.pathname + urlObj.search + urlObj.hash);
                return;
            }
            if (name === 'wikipedia' && /(?:^|\.)wikiwand\.com$/.test(hostname)) {
                const match = urlObj.pathname.match(/^\/([a-z0-9-]+)\/(.+)/i);
                if (match) {
                    window.location.replace(`https://${match[1]}.wikipedia.org/wiki/${match[2]}` + urlObj.search + urlObj.hash);
                    return;
                }
                window.location.replace('https://wikipedia.org/' + urlObj.search + urlObj.hash);
                return;
            }
        }

        window.location.reload();
    }

    // Register menu commands
    GM_registerMenuCommand(`Reddit -> Redlib: ${settings.reddit ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('reddit', 'redirect_reddit'));
    GM_registerMenuCommand(`Habr -> Geekr: ${settings.habr ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('habr', 'redirect_habr'));
    GM_registerMenuCommand(`X -> Nitter: ${settings.x ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('x', 'redirect_x'));
    GM_registerMenuCommand(`Wikipedia -> Wikiwand: ${settings.wikipedia ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('wikipedia', 'redirect_wikipedia'));

    // Check if target URL is reachable and returns HTTP 2xx or 3xx
    function checkUrlAvailability(url) {
        return new Promise((resolve) => {
            function sendReq(method) {
                GM_xmlhttpRequest({
                    method: method,
                    url: url,
                    timeout: REQUEST_TIMEOUT,
                    onload: function(response) {
                        // If HEAD is rejected with 405 Method Not Allowed or 501 Not Implemented, fallback to GET
                        if (method === 'HEAD' && (response.status === 405 || response.status === 501)) {
                            sendReq('GET');
                            return;
                        }
                        const isAvailable = response.status >= 200 && response.status < 400;
                        resolve(isAvailable);
                    },
                    onerror: function() {
                        resolve(false);
                    },
                    ontimeout: function() {
                        resolve(false);
                    }
                });
            }

            try {
                sendReq('HEAD');
            } catch (err) {
                resolve(false);
            }
        });
    }

    async function safeRedirect(targetUrl) {
        if (isHostCachedDown(targetUrl)) {
            return;
        }

        const isAvailable = await checkUrlAvailability(targetUrl);
        if (isAvailable) {
            clearHostDown(targetUrl);
            window.location.replace(targetUrl);
        } else {
            markHostDown(targetUrl);
            console.warn(`[Redirector] Target unavailable (${targetUrl}), skipping redirect.`);
        }
    }

    // ==========================================
    // 1. Reddit to Redlib
    // ==========================================
    if (settings.reddit && /(?:^|\.)reddit\.com$/.test(hostname)) {
        const targetInstance = 'https://red.umbra.team';
        const urlObj = new URL(currentUrl);
        const targetUrl = targetInstance + urlObj.pathname + urlObj.search + urlObj.hash;

        if (targetUrl !== currentUrl) {
            safeRedirect(targetUrl);
            return;
        }
    }

    // ==========================================
    // 2. Habr to Geekr
    // ==========================================
    if (settings.habr && /(?:^|\.)habr\.com$/.test(hostname)) {
        // Skip sandbox posts as Geekr does not support sandbox
        if (!window.location.pathname.includes('/sandbox/')) {
            const match = window.location.pathname.match(/\/(?:articles|post|news)\/(\d+)/);
            if (match) {
                const postId = match[1];
                const hash = window.location.hash || '';
                const targetUrl = `https://geekr.vercel.app/post/${postId}/${hash}`;

                if (targetUrl !== currentUrl) {
                    safeRedirect(targetUrl);
                    return;
                }
            }
        }
    }

    // ==========================================
    // 3. X to Nitter
    // ==========================================
    if (settings.x && /(?:^|\.)x\.com$/.test(hostname)) {
        const targetInstance = 'https://x.umbra.team';
        const urlObj = new URL(currentUrl);
        const targetUrl = targetInstance + urlObj.pathname + urlObj.search + urlObj.hash;

        if (targetUrl !== currentUrl) {
            safeRedirect(targetUrl);
            return;
        }
    }

    // ==========================================
    // 4. Wikipedia to Wikiwand
    // ==========================================
    if (settings.wikipedia && /(?:^|\.)wikipedia\.org$/.test(hostname)) {
        // Skip redirect if returning from Wikiwand (oldformat parameter)
        if (!/[?&]oldformat\b/i.test(window.location.search)) {
            const hostMatch = hostname.match(/^([a-z0-9-]+?)(?:\.m)?\.wikipedia\.org$/i);
            if (hostMatch && hostMatch[1].toLowerCase() !== 'www') {
                const pathMatch = window.location.pathname.match(/^\/wiki\/([^?#]+)/);
                if (pathMatch) {
                    const lang = hostMatch[1].toLowerCase();
                    const article = pathMatch[1];
                    const hash = window.location.hash || '';
                    const targetUrl = `https://www.wikiwand.com/${lang}/${article}${hash}`;

                    safeRedirect(targetUrl);
                    return;
                }
            }
        }
    }
})();
