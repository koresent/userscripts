// ==UserScript==
// @name           ⚙ [Brave Search] Auto-Expand AI, Infobox & Filters
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Automatically expands LLM snippet, infobox, and filters on Brave Search
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.google.com/s2/favicons?sz=64&domain=brave.com
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/brave/search-auto-expand.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/brave/search-auto-expand.user.js
//
// @match          https://search.brave.com/*
//
// @run-at         document-end
//
// @grant          none
// ==/UserScript==

(function() {
    'use strict';
    const targets = {
        llm: { selector: '#llm-show-more-button', discoveredAt: 0, clicked: false },
        infobox: { selector: '.infobox-factsheet-show-more', discoveredAt: 0, clicked: false },
        filters: { selector: 'button[aria-label="Фильтры"]', discoveredAt: 0, clicked: false }
    };
    const interval = setInterval(() => {
        const now = Date.now();
        let allDone = true;
        for (const [key, state] of Object.entries(targets)) {
            if (state.clicked) continue;
            allDone = false;
            const elements = document.querySelectorAll(state.selector);
            let targetEl = null;
            for (const el of elements) {
                if (el.offsetWidth > 0 || el.offsetHeight > 0) {
                    targetEl = el;
                    break;
                }
            }
            if (targetEl) {
                if (state.discoveredAt === 0) {
                    state.discoveredAt = now;
                } else if (now - state.discoveredAt > 1000) {
                    targetEl.click();
                    state.clicked = true;
                }
            }
        }
        if (allDone) {
            clearInterval(interval);
        }
    }, 200);
    setTimeout(() => {
        clearInterval(interval);
    }, 30000);
})();
