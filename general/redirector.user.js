// ==UserScript==
// @name           ⚙ [General] Redirector
// @namespace      github.com/koresent/userscripts
// @version        1.1.0
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
// @match          *://*.habr.com/*
// @match          *://*.x.com/*
// @match          *://*.wikipedia.org/wiki/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
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

    // Toggle setting and reload page to apply changes
    function toggleSetting(name, key) {
        GM_setValue(key, !settings[name]);
        window.location.reload();
    }

    // Register menu commands
    GM_registerMenuCommand(`Reddit -> Redlib: ${settings.reddit ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('reddit', 'redirect_reddit'));
    GM_registerMenuCommand(`Habr -> Geekr: ${settings.habr ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('habr', 'redirect_habr'));
    GM_registerMenuCommand(`X -> Nitter: ${settings.x ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('x', 'redirect_x'));
    GM_registerMenuCommand(`Wikipedia -> Wikiwand: ${settings.wikipedia ? '✅ ON' : '❌ OFF'}`, () => toggleSetting('wikipedia', 'redirect_wikipedia'));

    const currentUrl = window.location.href;
    const hostname = window.location.hostname;

    // ==========================================
    // 1. Reddit to Redlib
    // ==========================================
    if (settings.reddit && /(?:^|\.)reddit\.com$/.test(hostname)) {
        const targetInstance = 'https://red.umbra.team';
        const urlObj = new URL(currentUrl);
        const targetUrl = targetInstance + urlObj.pathname + urlObj.search + urlObj.hash;

        if (targetUrl !== currentUrl) {
            window.location.replace(targetUrl);
            return;
        }
    }

    // ==========================================
    // 2. Habr to Geekr
    // ==========================================
    if (settings.habr && hostname.endsWith('habr.com')) {
        const geekr = 'https://geekr.vercel.app/post/$2/';
        const regex = {
            post: /\/(m?\.?habr\.com)\/.+\/([0-9]{1,})(\/?.{1,})?/,
            sub_domain: /[^\m]{0,}\.habr\.com\/.+\/([0-9]{1,})(\/?.{1,})/,
            comment: /^\/#(comment.+)/,
            sandbox: /sandbox/,
        };

        if (!regex.sub_domain.test(currentUrl) && !regex.sandbox.test(currentUrl)) {
            let redirect = currentUrl.replace(regex.post, geekr);
            const maybeComment = currentUrl.match(regex.post);

            if (maybeComment && maybeComment[3] && regex.comment.test(maybeComment[3])) {
                redirect += 'comments' + maybeComment[3];
            }

            if (redirect !== currentUrl && redirect.startsWith('https://geekr.vercel.app/post/')) {
                window.location.replace(redirect);
                return;
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

        window.location.replace(targetUrl);
        return;
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

                    window.location.replace(targetUrl);
                    return;
                }
            }
        }
    }
})();
