// ==UserScript==
// @name           ⚙ [Discord] Quest Completer Launcher
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Adds a button near the user panel to inject and launch the latest discord-quest-completer (Orion) directly from GitHub.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/discord.svg
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/discord/quest-completer.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/discord/quest-completer.user.js
//
// @match          https://discord.com/*
// @match          https://canary.discord.com/*
// @match          https://ptb.discord.com/*
//
// @run-at         document-idle
//
// @connect        raw.githubusercontent.com
// @connect        github.com
// @connect        objects.githubusercontent.com
//
// @grant          unsafeWindow
// @grant          GM_xmlhttpRequest
// @grant          GM_registerMenuCommand
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_notification
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = '[DQC Launcher]';
    const log = (...args) => console.log(SCRIPT_NAME, ...args);
    const warn = (...args) => console.warn(SCRIPT_NAME, ...args);
    const error = (...args) => console.error(SCRIPT_NAME, ...args);

    const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/nyxxbit/discord-quest-completer/main/index.js';
    const GITHUB_RELEASE_URL = 'https://github.com/nyxxbit/discord-quest-completer/releases/latest/download/index.js';
    const STORAGE_KEY_CACHE = 'dqc_cached_script';
    const STORAGE_KEY_TIME = 'dqc_cached_time';

    let isFetching = false;

    function injectStyles() {
        if (document.getElementById('dqc-launcher-styles')) return;

        const style = document.createElement('style');
        style.id = 'dqc-launcher-styles';
        style.textContent = `
            .dqc-btn {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                padding: 0;
                margin: 0;
                border: none;
                background: transparent;
                border-radius: var(--radius-sm, 4px);
                color: var(--interactive-normal, #b5bac1);
                cursor: pointer;
                transition: color 0.15s ease, background-color 0.15s ease, transform 0.1s ease;
                flex-shrink: 0;
                outline: none;
            }
            .dqc-btn:hover {
                color: var(--interactive-hover, #dbdee1);
                background-color: var(--background-modifier-hover, rgba(78, 80, 88, 0.3));
            }
            .dqc-btn:active {
                color: var(--interactive-active, #ffffff);
                background-color: var(--background-modifier-active, rgba(78, 80, 88, 0.48));
                transform: scale(0.95);
            }
            .dqc-btn.dqc-loading {
                pointer-events: none;
                opacity: 0.75;
            }
            .dqc-btn.dqc-loading .dqc-icon {
                animation: dqc-spin 1s linear infinite;
            }
            .dqc-btn.dqc-success {
                color: var(--status-positive, #23a55a) !important;
            }
            .dqc-btn.dqc-error {
                color: var(--status-danger, #f23f43) !important;
            }
            @keyframes dqc-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .dqc-toast {
                position: absolute;
                bottom: calc(100% + 8px);
                left: 50%;
                transform: translateX(-50%);
                padding: 6px 10px;
                font-size: 12px;
                font-weight: 500;
                line-height: 1.3;
                white-space: nowrap;
                pointer-events: none;
                z-index: 10001;
                border-radius: var(--radius-sm, 4px);
                background-color: var(--background-floating, #111214);
                color: var(--text-normal, #dbdee1);
                box-shadow: var(--elevation-high, 0 8px 16px rgba(0, 0, 0, 0.24));
                opacity: 0;
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            .dqc-toast.dqc-toast-visible {
                opacity: 1;
                transform: translateX(-50%) translateY(-2px);
            }
            .dqc-toast.dqc-toast-success {
                color: var(--status-positive, #23a55a);
            }
            .dqc-toast.dqc-toast-error {
                color: var(--status-danger, #f23f43);
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function showToast(button, text, status = 'info', durationMs = 2500) {
        if (!button) return;

        let toast = button.querySelector('.dqc-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'dqc-toast';
            button.appendChild(toast);
        }

        toast.textContent = text;
        toast.className = `dqc-toast dqc-toast-visible dqc-toast-${status}`;

        clearTimeout(button._dqcToastTimeout);
        button._dqcToastTimeout = setTimeout(() => {
            toast.classList.remove('dqc-toast-visible');
        }, durationMs);
    }

    function fetchRemoteScript(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${url}?_ts=${Date.now()}`,
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 20000,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300 && response.responseText) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
                    }
                },
                ontimeout: () => reject(new Error('Network request timed out')),
                onerror: (err) => reject(new Error(err.error || 'Network error'))
            });
        });
    }

    async function loadLatestScript() {
        try {
            log('Fetching latest script from GitHub repository...');
            const code = await fetchRemoteScript(GITHUB_RAW_URL);
            GM_setValue(STORAGE_KEY_CACHE, code);
            GM_setValue(STORAGE_KEY_TIME, Date.now());
            return code;
        } catch (rawError) {
            warn('Failed to load raw branch, attempting release fallback:', rawError.message);
            try {
                const fallbackCode = await fetchRemoteScript(GITHUB_RELEASE_URL);
                GM_setValue(STORAGE_KEY_CACHE, fallbackCode);
                GM_setValue(STORAGE_KEY_TIME, Date.now());
                return fallbackCode;
            } catch (fallbackError) {
                const cached = GM_getValue(STORAGE_KEY_CACHE, null);
                if (cached) {
                    warn('Using offline cached script version as fallback');
                    return cached;
                }
                throw fallbackError;
            }
        }
    }

    function executeInPageContext(code) {
        const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

        try {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            const nonce = document.querySelector('script[nonce]')?.nonce;
            if (nonce) script.nonce = nonce;
            script.textContent = code;
            (document.head || document.documentElement).appendChild(script);
            script.remove();
            return;
        } catch (scriptError) {
            warn('Script element injection failed, attempting eval fallback:', scriptError);
        }

        if (typeof root.eval === 'function') {
            root.eval(code);
            return;
        }

        const runner = new root.Function(code);
        runner();
    }

    function isOrionRunning() {
        const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        return Boolean(
            root.orionLock ||
            document.getElementById('orion-container') ||
            document.getElementById('orion-styles')
        );
    }

    async function launchQuestCompleter(button) {
        if (isFetching) return;

        if (isOrionRunning()) {
            const container = document.getElementById('orion-container');
            if (container && container.style.display === 'none') {
                container.style.display = 'block';
                showToast(button, 'Orion открыт (Shift + .)', 'info');
            } else {
                showToast(button, 'Orion уже запущен!', 'info');
            }
            return;
        }

        isFetching = true;
        if (button) {
            button.classList.add('dqc-loading');
            showToast(button, 'Загрузка с GitHub...', 'info', 10000);
        }

        try {
            const code = await loadLatestScript();
            log('Injecting script into page context...');
            executeInPageContext(code);

            if (button) {
                button.classList.remove('dqc-loading');
                button.classList.add('dqc-success');
                showToast(button, 'Orion запущен!', 'success');
                setTimeout(() => button.classList.remove('dqc-success'), 2000);
            }
        } catch (err) {
            error('Failed to launch Quest Completer:', err);
            if (button) {
                button.classList.remove('dqc-loading');
                button.classList.add('dqc-error');
                showToast(button, 'Ошибка загрузки!', 'error', 3500);
                setTimeout(() => button.classList.remove('dqc-error'), 3000);
            }
        } finally {
            isFetching = false;
        }
    }

    function findInsertionTarget() {
        const settingsBtn = document.querySelector(
            'section[class*="panels_"] button[aria-label*="Settings" i], ' +
            'section[class*="panels_"] button[aria-label*="Настройки" i], ' +
            'div[class*="panels_"] button[aria-label*="Settings" i], ' +
            'div[class*="panels_"] button[aria-label*="Настройки" i], ' +
            'section[aria-label*="User" i] button[aria-label*="Settings" i], ' +
            'section[aria-label*="пользовател" i] button[aria-label*="Настройки" i]'
        );
        if (settingsBtn && settingsBtn.parentElement) {
            return {
                container: settingsBtn.parentElement,
                beforeNode: settingsBtn,
                sampleButton: settingsBtn
            };
        }

        const controlBtn = document.querySelector(
            'section[class*="panels_"] button[aria-label], ' +
            'div[class*="panels_"] button[aria-label], ' +
            'section[aria-label*="User" i] button[aria-label], ' +
            'section[aria-label*="пользовател" i] button[aria-label]'
        );
        if (controlBtn && controlBtn.parentElement) {
            return {
                container: controlBtn.parentElement,
                beforeNode: null,
                sampleButton: controlBtn
            };
        }

        const buttonsGroup = document.querySelector(
            'section[class*="panels_"] [class*="buttons_"], ' +
            'div[class*="panels_"] [class*="buttons_"]'
        );
        if (buttonsGroup) {
            return {
                container: buttonsGroup,
                beforeNode: null,
                sampleButton: buttonsGroup.querySelector('button')
            };
        }

        const panelsSection = document.querySelector(
            'section[class*="panels_"], ' +
            'div[class*="panels_"], ' +
            'section[aria-label*="User" i], ' +
            'section[aria-label*="пользовател" i]'
        );
        if (panelsSection) {
            return {
                container: panelsSection,
                beforeNode: null,
                sampleButton: null
            };
        }

        return null;
    }

    function createLauncherButton(sampleButton) {
        const button = document.createElement('button');
        button.id = 'dqc-launcher-btn';
        button.type = 'button';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', 'Quest Completer (Orion)');
        button.title = 'Quest Completer (Orion)';

        let classList = ['dqc-btn'];
        if (sampleButton) {
            for (const cls of sampleButton.classList) {
                if (!cls.startsWith('dqc-') && !cls.includes('active') && !cls.includes('selected')) {
                    classList.push(cls);
                }
            }
        }
        button.className = classList.join(' ');

        button.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dqc-icon" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none"></polygon>
            </svg>
        `;

        button.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            launchQuestCompleter(button);
        });

        return button;
    }

    function ensureButtonMounted() {
        const existing = document.getElementById('dqc-launcher-btn');
        if (existing && existing.isConnected) {
            return;
        }

        const target = findInsertionTarget();
        if (!target || !target.container) return;

        injectStyles();
        const button = createLauncherButton(target.sampleButton);

        if (target.beforeNode && target.beforeNode.parentElement === target.container) {
            target.container.insertBefore(button, target.beforeNode);
        } else {
            target.container.appendChild(button);
        }

        log('Mounted launcher button near user controls');
    }

    function initObserver() {
        let scheduled = false;
        const debouncedMount = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                ensureButtonMounted();
            });
        };

        const observer = new MutationObserver(debouncedMount);
        observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true
        });

        debouncedMount();
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        GM_registerMenuCommand('⚡ Запустить Quest Completer (Orion)', () => {
            const btn = document.getElementById('dqc-launcher-btn');
            launchQuestCompleter(btn);
        });

        GM_registerMenuCommand('🔄 Обновить кэш Quest Completer', async () => {
            try {
                const code = await fetchRemoteScript(GITHUB_RAW_URL);
                GM_setValue(STORAGE_KEY_CACHE, code);
                GM_setValue(STORAGE_KEY_TIME, Date.now());
                if (typeof GM_notification === 'function') {
                    GM_notification({
                        text: 'Актуальная версия Orion успешно сохранена в кэш.',
                        title: 'Quest Completer',
                        timeout: 3000
                    });
                } else {
                    alert('Кэш Quest Completer обновлен.');
                }
            } catch (e) {
                alert(`Ошибка обновления: ${e.message}`);
            }
        });
    }

    registerMenuCommands();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initObserver);
    } else {
        initObserver();
    }
})();
