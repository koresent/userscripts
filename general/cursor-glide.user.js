// ==UserScript==
// @name           ⚙ [General] Cursor Glide
// @namespace      github.com/koresent/userscripts
// @version        1.4.0
// @description    Smooth smear caret animation for web editors and text inputs
// @author         Koresent
// @license        GPL-3.0
// @icon           https://img.icons8.com/?size=100&id=18711&format=png&color=000000
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/cursor-glide.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/cursor-glide.user.js
//
// @match          *://*/*
// @match          https://*.lan/*
// @match          http://*.lan/*
// @match          https://cursor.lan/*
// @match          http://cursor.lan/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          GM_addValueChangeListener
// @grant          GM_openInTab
// @grant          GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'cursor_glide_config';
    const SETTINGS_URL = 'https://cursor.lan';
    const isTelegram = location.hostname === 'web.telegram.org' || location.hostname.endsWith('.telegram.org');

    const DEFAULT_CONFIG = {
        version: 1,
        enabled: true,
        duration: 150,
        cornerRadius: 3.0,
        bgOpacity: 0.85,
        trailSmear: 0.85,
        cursorWidth: 2.5,
        maxGlideDist: 350,
        customColor: '',
        hideNativeCaret: true,
        exclusions: []
    };

    let activeConfig = loadConfig();

    function loadConfig() {
        try {
            const stored = GM_getValue(STORAGE_KEY, null);
            if (!stored) {
                const legacy = {
                    duration: GM_getValue('duration', DEFAULT_CONFIG.duration),
                    cornerRadius: GM_getValue('cornerRadius', DEFAULT_CONFIG.cornerRadius),
                    bgOpacity: GM_getValue('bgOpacity', DEFAULT_CONFIG.bgOpacity),
                    trailSmear: GM_getValue('trailSmear', DEFAULT_CONFIG.trailSmear),
                    cursorWidth: GM_getValue('cursorWidth', DEFAULT_CONFIG.cursorWidth),
                    maxGlideDist: GM_getValue('maxGlideDist', DEFAULT_CONFIG.maxGlideDist),
                    customColor: GM_getValue('customColor', DEFAULT_CONFIG.customColor),
                };
                return Object.assign({}, DEFAULT_CONFIG, legacy);
            }
            const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
            return Object.assign({}, DEFAULT_CONFIG, parsed, {
                exclusions: Array.isArray(parsed.exclusions)
                    ? parsed.exclusions.map(e => (typeof e === 'string' ? { pattern: e } : e))
                    : []
            });
        } catch (err) {
            return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        }
    }

    function saveConfig(cfg) {
        activeConfig = cfg;
        if (Array.isArray(activeConfig.exclusions)) {
            activeConfig.exclusions = activeConfig.exclusions.filter(e => {
                const pat = typeof e === 'string' ? e : e?.pattern;
                return pat && pat.trim().length > 0;
            });
        }
        GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
        GM_setValue('duration', cfg.duration);
        GM_setValue('customColor', cfg.customColor);
        GM_setValue('cornerRadius', cfg.cornerRadius);
        GM_setValue('bgOpacity', cfg.bgOpacity);
        GM_setValue('trailSmear', cfg.trailSmear);
        GM_setValue('cursorWidth', cfg.cursorWidth);
        GM_setValue('maxGlideDist', cfg.maxGlideDist);
    }

    if (typeof GM_addValueChangeListener === 'function') {
        GM_addValueChangeListener(STORAGE_KEY, (_name, _oldVal, newVal, remote) => {
            if (remote && newVal) {
                try {
                    const parsed = typeof newVal === 'string' ? JSON.parse(newVal) : newVal;
                    activeConfig = Object.assign({}, DEFAULT_CONFIG, parsed);
                    handleConfigUpdate();
                } catch (_) {}
            }
        });
    }

    function isUrlExcluded() {
        if (!activeConfig.enabled) return true;
        const currentHost = (location.hostname || '').toLowerCase();
        const currentUrl = (location.href || '').toLowerCase();
        if (!currentHost && !currentUrl) return false;

        for (const rule of activeConfig.exclusions) {
            const raw = (typeof rule === 'string' ? rule : rule?.pattern || '').trim().toLowerCase();
            if (!raw) continue;

            if (raw.startsWith('/') && raw.endsWith('/') && raw.length > 2) {
                try {
                    const regex = new RegExp(raw.slice(1, -1), 'i');
                    if (regex.test(currentUrl) || regex.test(currentHost)) return true;
                } catch (_) {}
                continue;
            }

            const pat = raw.replace(/^\*\./, '');
            if (currentHost === pat || currentHost.endsWith('.' + pat) || currentHost.includes(pat) || currentUrl.includes(pat)) {
                return true;
            }
        }
        return false;
    }

    let menuIds = [];

    function updateMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        if (typeof GM_unregisterMenuCommand === 'function') {
            menuIds.forEach(id => {
                try { GM_unregisterMenuCommand(id); } catch (_) {}
            });
        }
        menuIds = [];

        const host = location.hostname || 'current site';
        const excluded = isUrlExcluded();

        if (excluded) {
            const id = GM_registerMenuCommand(`✅ Enable Cursor Glide on ${host}`, () => {
                toggleCurrentSiteExclusion(false);
            });
            if (id) menuIds.push(id);
        } else {
            const id = GM_registerMenuCommand(`🚫 Disable Cursor Glide on ${host}`, () => {
                toggleCurrentSiteExclusion(true);
            });
            if (id) menuIds.push(id);
        }

        const settingsId = GM_registerMenuCommand('⚙ Cursor Glide Settings', () => {
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(SETTINGS_URL, { active: true });
            } else {
                window.open(SETTINGS_URL, '_blank');
            }
        });
        if (settingsId) menuIds.push(settingsId);
    }

    function toggleCurrentSiteExclusion(shouldExclude) {
        const host = (location.hostname || '').trim().toLowerCase();
        if (!host) return;

        if (shouldExclude) {
            const exists = activeConfig.exclusions.some(r => {
                const pat = (typeof r === 'string' ? r : r?.pattern || '').trim().toLowerCase();
                return pat === host;
            });
            if (!exists) {
                activeConfig.exclusions.push({ pattern: host });
            }
            saveConfig(activeConfig);
            stopGlide();
            updateMenu();
            showToast(`Cursor Glide disabled on ${host}`);
        } else {
            activeConfig.exclusions = activeConfig.exclusions.filter(r => {
                const pat = (typeof r === 'string' ? r : r?.pattern || '').trim().toLowerCase();
                return pat !== host && !host.endsWith('.' + pat);
            });
            saveConfig(activeConfig);
            startGlide();
            updateMenu();
            showToast(`Cursor Glide enabled on ${host}`);
        }
    }

    function showToast(msg) {
        let toast = document.getElementById('cursor-glide-hud-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cursor-glide-hud-toast';
            toast.style.cssText = `
                all: initial; position: fixed; bottom: 16px; right: 16px;
                background: #1d2021; color: #ebdbb2; border: 1px solid #b8bb26;
                border-radius: 4px; padding: 6px 14px; font-family: 'Maple Mono NF', 'JetBrains Mono', monospace;
                font-size: 11px; z-index: 2147483647; pointer-events: none;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5); opacity: 0;
                transition: opacity 0.15s ease-in-out;
            `;
            (document.documentElement || document.body).appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
    }

    function easeLeading(x) {
        return 1.0 - Math.pow(1.0 - x, 4.0);
    }

    function easeTrailing(x) {
        return Math.pow(x, 2.2);
    }

    let canvas = null;
    let ctx = null;
    let dpr = 1.0;

    let prevRect = null;
    let curRect = null;
    let animStartTime = 0;
    let isAnimating = false;
    let isFocused = false;
    let activeElement = null;
    let cursorColor = 'rgba(255, 255, 255, 0.85)';

    let glideActive = false;
    let glideAbortController = null;
    let docsObserver = null;
    let docsObserverAttached = false;

    function injectStyles() {
        const oldHider = document.getElementById('cursor-glide-hider');
        if (oldHider) oldHider.remove();

        let style = document.getElementById('cursor-glide-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'cursor-glide-styles';
            (document.head || document.documentElement).appendChild(style);
        }
        const customColorProp = activeConfig.customColor ? `--cursor-custom-color: ${activeConfig.customColor};` : '';
        const hideCaretCss = activeConfig.hideNativeCaret ? `
            input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),
            textarea,
            [contenteditable="true"],
            [role="textbox"] {
                caret-color: transparent !important;
            }

            .monaco-editor .cursors-layer .cursor,
            .cm-cursorLayer .cm-cursor,
            .CodeMirror .CodeMirror-cursor,
            .ace_editor .ace_cursor,
            .kix-cursor {
                opacity: 0 !important;
            }
        ` : '';

        style.textContent = `
            :root {
                ${customColorProp}
            }
            ${hideCaretCss}
            .active-cell-border {
                transition: all 80ms ease-out !important;
            }
        `;
    }

    function hideNativeCaret(el) {
        if (!activeConfig.hideNativeCaret) return;
        if (!el || !el.style) return;
        el.style.setProperty('caret-color', 'transparent', 'important');
        const root = el.getRootNode();
        if (root && root instanceof ShadowRoot && !root.getElementById('cursor-glide-shadow-styles')) {
            const style = document.createElement('style');
            style.id = 'cursor-glide-shadow-styles';
            style.textContent = `
                input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),
                textarea,
                [contenteditable="true"],
                [role="textbox"] {
                    caret-color: transparent !important;
                }
            `;
            root.appendChild(style);
        }
    }

    function getDeepActiveElement(root = document) {
        let el = root.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }
        return el;
    }

    function initCanvas() {
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'cursor-glide-canvas';
            canvas.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                pointer-events: none !important;
                z-index: 2147483647 !important;
                display: block !important;
            `;
            ctx = canvas.getContext('2d');
        }
        ensureCanvas();
    }

    function ensureCanvas() {
        if (!canvas) {
            initCanvas();
            return;
        }
        if (!canvas.isConnected) {
            const root = document.documentElement || document.body;
            if (root) {
                root.appendChild(canvas);
                resizeCanvas();
            }
        }
    }

    function resizeCanvas() {
        if (!canvas || !ctx) return;
        dpr = window.devicePixelRatio || 1;
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
        cachedStyleElement = null;
    }

    let mirrorDiv = null;
    let mirrorMarker = null;
    let cachedStyleElement = null;
    let cachedLineHeight = 16;

    const MIRROR_PROPS = [
        'direction', 'boxSizing', 'width', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
        'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
        'letterSpacing', 'wordSpacing'
    ];

    function initMirrorDiv() {
        if (!mirrorDiv) {
            mirrorDiv = document.createElement('div');
            mirrorDiv.id = 'cursor-glide-mirror';
            mirrorDiv.style.cssText = `
                position: fixed !important;
                top: -99999px !important;
                left: -99999px !important;
                contain: strict !important;
                visibility: hidden !important;
                pointer-events: none !important;
                z-index: -9999 !important;
            `;
            mirrorMarker = document.createElement('span');
            mirrorMarker.textContent = '|';
        }
        if (!mirrorDiv.isConnected) {
            const root = document.documentElement || document.body;
            if (root) {
                root.appendChild(mirrorDiv);
            }
        }
        return mirrorDiv;
    }

    function syncMirrorStyles(el) {
        if (cachedStyleElement === el) return;
        cachedStyleElement = el;

        const mirror = initMirrorDiv();
        const style = window.getComputedStyle(el);
        const isInput = el.tagName === 'INPUT';

        for (let i = 0; i < MIRROR_PROPS.length; i++) {
            const prop = MIRROR_PROPS[i];
            mirror.style[prop] = style[prop];
        }

        mirror.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
        mirror.style.wordWrap = isInput ? 'normal' : 'break-word';
        cachedLineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.2) || 16;
    }

    function measureInputCaret(el) {
        syncMirrorStyles(el);
        const mirror = mirrorDiv;

        const pos = el.selectionStart || 0;
        const text = el.value || '';
        mirror.textContent = text.substring(0, pos);
        mirrorMarker.textContent = text.substring(pos) || '|';
        mirror.appendChild(mirrorMarker);

        const elRect = el.getBoundingClientRect();
        const markerLeft = mirrorMarker.offsetLeft;
        const markerTop = mirrorMarker.offsetTop;

        const x = elRect.left + markerLeft - el.scrollLeft;
        const y = elRect.top + markerTop - el.scrollTop;

        return {
            x: Math.max(elRect.left, Math.min(elRect.right, x)),
            y: Math.max(elRect.top, Math.min(elRect.bottom, y)),
            w: activeConfig.cursorWidth,
            h: Math.min(elRect.height, cachedLineHeight)
        };
    }

    function measureContentEditableCaret() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;

        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        if (rect && (rect.width > 0 || rect.height > 0)) {
            return {
                x: rect.left,
                y: rect.top,
                w: activeConfig.cursorWidth,
                h: rect.height || 18
            };
        }

        const container = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer.parentElement;

        if (container) {
            const br = container.querySelector('br');
            if (br) {
                const bRect = br.getBoundingClientRect();
                if (bRect.height > 0 && bRect.top > 0) {
                    return {
                        x: bRect.left,
                        y: bRect.top,
                        w: activeConfig.cursorWidth,
                        h: bRect.height
                    };
                }
            }

            const cRect = container.getBoundingClientRect();
            const cStyle = window.getComputedStyle(container);
            const lh = parseFloat(cStyle.lineHeight) || (parseFloat(cStyle.fontSize) * 1.2) || 18;
            return {
                x: cRect.left + (parseFloat(cStyle.paddingLeft) || 0),
                y: cRect.top + (parseFloat(cStyle.paddingTop) || 0),
                w: activeConfig.cursorWidth,
                h: Math.min(cRect.height || lh, lh)
            };
        }

        return null;
    }

    function findTargetCaretRect() {
        if (isTelegram) {
            const el = getDeepActiveElement();
            if (!el || el === document.body) return null;
            hideNativeCaret(el);
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                return measureInputCaret(el);
            }
            if (el.isContentEditable || el.getAttribute('role') === 'textbox' || el.classList.contains('input-message-input')) {
                return measureContentEditableCaret();
            }
            return null;
        }

        const docsCaret = document.querySelector('.kix-cursor-caret');
        if (docsCaret) {
            const dRect = docsCaret.getBoundingClientRect();
            if (dRect.height > 0 && dRect.top > 0) {
                return {
                    x: dRect.left,
                    y: dRect.top,
                    w: Math.max(dRect.width, activeConfig.cursorWidth),
                    h: dRect.height
                };
            }
        }

        const monacoCursor = document.querySelector('.monaco-editor.focused .cursors-layer .cursor, .monaco-editor .cursors-layer .cursor');
        if (monacoCursor) {
            const mRect = monacoCursor.getBoundingClientRect();
            if (mRect.width > 0 || mRect.height > 0) {
                return {
                    x: mRect.left,
                    y: mRect.top,
                    w: Math.max(mRect.width, activeConfig.cursorWidth),
                    h: mRect.height
                };
            }
        }

        const cmCursor = document.querySelector('.CodeMirror-focused .CodeMirror-cursor, .CodeMirror .CodeMirror-cursor, .cm-focused .cm-cursorLayer .cm-cursor');
        if (cmCursor) {
            const cmRect = cmCursor.getBoundingClientRect();
            if (cmRect.height > 0 && cmRect.top > 0) {
                return {
                    x: cmRect.left,
                    y: cmRect.top,
                    w: Math.max(cmRect.width, activeConfig.cursorWidth),
                    h: cmRect.height
                };
            }
        }

        const aceCursor = document.querySelector('.ace_editor.ace_focus .ace_cursor, .ace_editor .ace_cursor');
        if (aceCursor) {
            const aRect = aceCursor.getBoundingClientRect();
            if (aRect.height > 0 && aRect.top > 0) {
                return {
                    x: aRect.left,
                    y: aRect.top,
                    w: Math.max(aRect.width, activeConfig.cursorWidth),
                    h: aRect.height
                };
            }
        }

        const formulaInput = document.querySelector('.cell-input, #t-formula-bar-input');
        if (formulaInput && (document.activeElement === formulaInput || formulaInput.contains(document.activeElement))) {
            const fRect = formulaInput.getBoundingClientRect();
            return {
                x: fRect.left,
                y: fRect.top,
                w: activeConfig.cursorWidth,
                h: fRect.height
            };
        }

        const el = getDeepActiveElement();
        if (!el) return null;

        hideNativeCaret(el);

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return measureInputCaret(el);
        }

        if (el.isContentEditable || el.getAttribute('role') === 'textbox' || el.classList.contains('cm-content')) {
            return measureContentEditableCaret();
        }

        return null;
    }

    function detectCursorColor(el) {
        if (activeConfig.customColor) return activeConfig.customColor;
        if (!el) return `rgba(255, 255, 255, ${activeConfig.bgOpacity})`;

        try {
            const style = window.getComputedStyle(el);
            const cc = style.caretColor;
            if (cc && cc !== 'auto' && cc !== 'transparent') {
                return cc;
            }
            const color = style.color || style.borderLeftColor;
            if (color && color !== 'rgba(0, 0, 0, 0)') {
                return color;
            }
            return 'rgb(255, 255, 255)';
        } catch {
            return `rgba(255, 255, 255, ${activeConfig.bgOpacity})`;
        }
    }

    function updateCursorTarget() {
        const raw = findTargetCaretRect();
        if (!raw) {
            if (isFocused) {
                isFocused = false;
                clearCanvas();
            }
            return;
        }

        isFocused = true;
        activeElement = getDeepActiveElement();
        cursorColor = detectCursorColor(activeElement);

        const target = {
            cx: raw.x + raw.w * 0.5,
            cy: raw.y + raw.h * 0.5,
            w: raw.w,
            h: raw.h
        };

        if (!curRect) {
            prevRect = { ...target };
            curRect = { ...target };
            animStartTime = performance.now();
            startLoop();
            return;
        }

        const dx = target.cx - curRect.cx;
        const dy = target.cy - curRect.cy;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.5) {
            if (dist > activeConfig.maxGlideDist) {
                prevRect = { ...target };
            } else {
                prevRect = { ...curRect };
            }
            curRect = { ...target };
            animStartTime = performance.now();
            startLoop();
        }
    }

    function clearCanvas() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    }

    function drawCaretShape(leadX, leadY, trailX, trailY, w, h) {
        const r = Math.min(activeConfig.cornerRadius, Math.min(w, h) * 0.5);
        const dx = leadX - trailX;
        const dy = leadY - trailY;

        ctx.beginPath();
        if (Math.hypot(dx, dy) < 0.5) {
            ctx.roundRect(leadX - w * 0.5, leadY - h * 0.5, w, h, r);
        } else if (Math.abs(dy) < 0.5) {
            const minX = Math.min(trailX, leadX) - w * 0.5;
            const maxX = Math.max(trailX, leadX) + w * 0.5;
            ctx.roundRect(minX, leadY - h * 0.5, maxX - minX, h, r);
        } else if (Math.abs(dx) < 0.5) {
            const minY = Math.min(trailY, leadY) - h * 0.5;
            const maxY = Math.max(trailY, leadY) + h * 0.5;
            ctx.roundRect(leadX - w * 0.5, minY, w, maxY - minY, r);
        } else {
            let ax = trailX, ay = trailY, bx = leadX, by = leadY;
            if (ax > bx) {
                ax = leadX; ay = leadY;
                bx = trailX; by = trailY;
            }

            ctx.roundRect(ax - w * 0.5, ay - h * 0.5, w, h, r);
            ctx.roundRect(bx - w * 0.5, by - h * 0.5, w, h, r);

            if (by >= ay) {
                ctx.moveTo(ax - w * 0.5, ay - h * 0.5);
                ctx.lineTo(ax + w * 0.5, ay - h * 0.5);
                ctx.lineTo(bx + w * 0.5, by - h * 0.5);
                ctx.lineTo(bx + w * 0.5, by + h * 0.5);
                ctx.lineTo(bx - w * 0.5, by + h * 0.5);
                ctx.lineTo(ax - w * 0.5, ay + h * 0.5);
            } else {
                ctx.moveTo(ax - w * 0.5, ay - h * 0.5);
                ctx.lineTo(bx - w * 0.5, by - h * 0.5);
                ctx.lineTo(bx + w * 0.5, by - h * 0.5);
                ctx.lineTo(bx + w * 0.5, by + h * 0.5);
                ctx.lineTo(ax + w * 0.5, ay + h * 0.5);
                ctx.lineTo(ax - w * 0.5, ay + h * 0.5);
            }
            ctx.closePath();
        }
        ctx.fill();
    }

    function renderFrame(now) {
        if (!isFocused || !curRect || !prevRect) {
            clearCanvas();
            isAnimating = false;
            return;
        }

        const elapsed = (now - animStartTime) / activeConfig.duration;
        const t = Math.min(Math.max(elapsed, 0.0), 1.0);

        const moveDx = curRect.cx - prevRect.cx;
        const moveDy = curRect.cy - prevRect.cy;
        const moveDist = Math.hypot(moveDx, moveDy);

        clearCanvas();

        let leadX, leadY, trailX, trailY;

        if (t >= 1.0 || moveDist < 1.0) {
            leadX = trailX = curRect.cx;
            leadY = trailY = curRect.cy;
        } else {
            const tLead = easeLeading(t);
            const tTrail = (1.0 - activeConfig.trailSmear) * tLead + activeConfig.trailSmear * easeTrailing(t);

            leadX = prevRect.cx + moveDx * tLead;
            leadY = prevRect.cy + moveDy * tLead;
            trailX = prevRect.cx + moveDx * tTrail;
            trailY = prevRect.cy + moveDy * tTrail;
        }

        ctx.save();
        ctx.fillStyle = cursorColor;
        ctx.globalAlpha = activeConfig.bgOpacity;
        drawCaretShape(leadX, leadY, trailX, trailY, curRect.w, curRect.h);
        ctx.restore();

        if (t < 1.0) {
            requestAnimationFrame(renderFrame);
        } else {
            isAnimating = false;
        }
    }

    function startLoop() {
        if (!isAnimating) {
            isAnimating = true;
            requestAnimationFrame(renderFrame);
        }
    }

    function tryAttachDocsObserver(scheduleUpdate) {
        if (isTelegram || docsObserverAttached) return;
        const docsCursor = document.querySelector('.kix-cursor');
        if (docsCursor) {
            docsObserverAttached = true;
            docsObserver = new MutationObserver(scheduleUpdate);
            docsObserver.observe(docsCursor, { attributes: true, attributeFilter: ['style', 'class'] });
        }
    }

    function setupListeners() {
        if (glideAbortController) glideAbortController.abort();
        glideAbortController = new AbortController();
        const signal = glideAbortController.signal;

        let scheduled = false;
        const scheduleUpdate = () => {
            if (!glideActive) return;
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                if (!glideActive) return;
                ensureCanvas();
                tryAttachDocsObserver(scheduleUpdate);
                updateCursorTarget();
            });
        };

        document.addEventListener('selectionchange', () => {
            if (isTelegram && !isFocused) return;
            scheduleUpdate();
        }, { passive: true, signal });
        document.addEventListener('input', scheduleUpdate, { passive: true, signal });
        document.addEventListener('keydown', scheduleUpdate, { passive: true, capture: true, signal });
        document.addEventListener('keyup', scheduleUpdate, { passive: true, capture: true, signal });
        document.addEventListener('click', scheduleUpdate, { passive: true, capture: true, signal });
        document.addEventListener('focusin', () => {
            cachedStyleElement = null;
            scheduleUpdate();
        }, { passive: true, capture: true, signal });

        document.addEventListener('focusout', () => {
            setTimeout(() => {
                if (!glideActive) return;
                const deep = getDeepActiveElement();
                const docsCaret = !isTelegram && document.querySelector('.kix-cursor-caret');
                if ((!deep || deep === document.body) && !docsCaret) {
                    isFocused = false;
                    clearCanvas();
                } else {
                    scheduleUpdate();
                }
            }, 50);
        }, { passive: true, signal });

        const handleScroll = (e) => {
            if (isTelegram) {
                if (!isFocused || !activeElement) return;
                if (e.target !== activeElement && !activeElement.contains(e.target)) return;
            }
            scheduleUpdate();
        };

        window.addEventListener('scroll', handleScroll, { passive: true, capture: true, signal });
        window.addEventListener('resize', resizeCanvas, { passive: true, signal });
        tryAttachDocsObserver(scheduleUpdate);
    }

    function startGlide() {
        if (glideActive) return;
        if (isUrlExcluded() && !isSettingsPage) return;
        glideActive = true;
        injectStyles();
        initCanvas();
        setupListeners();
    }

    function stopGlide() {
        if (!glideActive) return;
        glideActive = false;
        if (glideAbortController) {
            glideAbortController.abort();
            glideAbortController = null;
        }
        if (docsObserver) {
            docsObserver.disconnect();
            docsObserver = null;
            docsObserverAttached = false;
        }
        const style = document.getElementById('cursor-glide-styles');
        if (style) style.remove();
        if (canvas) {
            canvas.remove();
            canvas = null;
            ctx = null;
        }
        if (mirrorDiv) {
            mirrorDiv.remove();
            mirrorDiv = null;
            mirrorMarker = null;
        }
        cachedStyleElement = null;
        isAnimating = false;
        isFocused = false;
        prevRect = null;
        curRect = null;
    }

    function handleConfigUpdate() {
        updateMenu();
        if (isUrlExcluded() && !isSettingsPage) {
            stopGlide();
        } else {
            if (!glideActive) {
                startGlide();
            } else {
                injectStyles();
                updateCursorTarget();
            }
        }
    }

    function initSettingsPage() {
        const badge = document.getElementById('conn-badge');
        if (badge) {
            badge.textContent = 'Connected (Violentmonkey active)';
            badge.classList.add('connected');
        }

        const cfg = activeConfig;

        const elEnabled = document.getElementById('cfg-enabled');
        const elDuration = document.getElementById('cfg-duration');
        const elDurationRange = document.getElementById('cfg-duration-range');
        const elTrailSmear = document.getElementById('cfg-trail-smear');
        const elTrailSmearRange = document.getElementById('cfg-trail-smear-range');
        const elMaxDist = document.getElementById('cfg-max-dist');
        const elMaxDistRange = document.getElementById('cfg-max-dist-range');
        const elCursorWidth = document.getElementById('cfg-cursor-width');
        const elCursorWidthRange = document.getElementById('cfg-cursor-width-range');
        const elCornerRadius = document.getElementById('cfg-corner-radius');
        const elCornerRadiusRange = document.getElementById('cfg-corner-radius-range');
        const elBgOpacity = document.getElementById('cfg-bg-opacity');
        const elBgOpacityRange = document.getElementById('cfg-bg-opacity-range');
        const elCustomColor = document.getElementById('cfg-custom-color');
        const elCustomColorPicker = document.getElementById('cfg-custom-color-picker');
        const elHideNative = document.getElementById('cfg-hide-native');

        function populateForm(c) {
            if (elEnabled) elEnabled.checked = c.enabled;
            if (elDuration) elDuration.value = c.duration;
            if (elDurationRange) elDurationRange.value = c.duration;
            if (elTrailSmear) elTrailSmear.value = c.trailSmear;
            if (elTrailSmearRange) elTrailSmearRange.value = c.trailSmear;
            if (elMaxDist) elMaxDist.value = c.maxGlideDist;
            if (elMaxDistRange) elMaxDistRange.value = c.maxGlideDist;
            if (elCursorWidth) elCursorWidth.value = c.cursorWidth;
            if (elCursorWidthRange) elCursorWidthRange.value = c.cursorWidth;
            if (elCornerRadius) elCornerRadius.value = c.cornerRadius;
            if (elCornerRadiusRange) elCornerRadiusRange.value = c.cornerRadius;
            if (elBgOpacity) elBgOpacity.value = c.bgOpacity;
            if (elBgOpacityRange) elBgOpacityRange.value = c.bgOpacity;
            if (elCustomColor) elCustomColor.value = c.customColor || '';
            if (elCustomColorPicker && /^#[0-9a-fA-F]{6}$/.test(c.customColor)) {
                elCustomColorPicker.value = c.customColor;
            }
            if (elHideNative) elHideNative.checked = c.hideNativeCaret;

            renderExclusionsTable(c.exclusions);
            updateRawJson(c);
        }

        populateForm(cfg);

        const btnAdd = document.getElementById('btn-add-exclusion');
        const inputNew = document.getElementById('new-exclusion-pattern');
        if (btnAdd && inputNew) {
            btnAdd.onclick = () => {
                const val = inputNew.value.trim();
                if (!val) return;
                cfg.exclusions.push({ pattern: val });
                inputNew.value = '';
                renderExclusionsTable(cfg.exclusions);
                updateRawJson(cfg);
            };
            inputNew.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    btnAdd.click();
                }
            });
        }

        const btnSave = document.getElementById('btn-save');
        if (btnSave) {
            btnSave.onclick = () => {
                collectFormSettings(cfg);
                saveConfig(cfg);
                injectStyles();
                updateRawJson(cfg);
                if (window.GlideSettingsUI?.showToast) {
                    window.GlideSettingsUI.showToast('Settings saved to Violentmonkey');
                }
            };
        }

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.onclick = () => {
                if (!confirm('Reset all Cursor Glide settings to defaults?')) return;
                const fresh = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
                saveConfig(fresh);
                location.reload();
            };
        }

        const btnExport = document.getElementById('btn-export');
        if (btnExport) {
            btnExport.onclick = () => {
                collectFormSettings(cfg);
                const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(cfg, null, 2));
                const dl = document.createElement('a');
                dl.setAttribute('href', dataStr);
                dl.setAttribute('download', 'cursor-glide-config.json');
                dl.click();
            };
        }

        const btnCopyJson = document.getElementById('btn-copy-json');
        if (btnCopyJson) {
            btnCopyJson.onclick = () => {
                const json = document.getElementById('raw-json-editor')?.value || '';
                navigator.clipboard.writeText(json).then(() => {
                    if (window.GlideSettingsUI?.showToast) {
                        window.GlideSettingsUI.showToast('JSON copied to clipboard');
                    }
                });
            };
        }

        const btnApplyJson = document.getElementById('btn-apply-json');
        if (btnApplyJson) {
            btnApplyJson.onclick = () => {
                try {
                    const raw = document.getElementById('raw-json-editor')?.value || '';
                    const parsed = JSON.parse(raw);
                    saveConfig(parsed);
                    populateForm(parsed);
                    injectStyles();
                    if (window.GlideSettingsUI?.showToast) {
                        window.GlideSettingsUI.showToast('Config validated & applied');
                    }
                } catch (err) {
                    alert('Invalid JSON: ' + err.message);
                }
            };
        }
    }

    function renderExclusionsTable(exclusions) {
        const tbody = document.getElementById('exclusions-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (!exclusions || exclusions.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="2" style="text-align: center; color: var(--fg-muted); padding: 16px;">No exclusions added. Cursor glide runs on all websites by default.</td>`;
            tbody.appendChild(tr);
            return;
        }

        exclusions.forEach((rule, idx) => {
            const tr = document.createElement('tr');

            const tdPat = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'table-input';
            input.value = typeof rule === 'string' ? rule : rule.pattern || '';
            input.placeholder = 'e.g. mail.google.com';
            input.oninput = () => {
                if (typeof rule === 'string') {
                    exclusions[idx] = { pattern: input.value.trim() };
                } else {
                    rule.pattern = input.value.trim();
                }
                updateRawJson(activeConfig);
            };
            tdPat.appendChild(input);
            tr.appendChild(tdPat);

            const tdAct = document.createElement('td');
            tdAct.style.textAlign = 'right';
            const delBtn = document.createElement('button');
            delBtn.className = 'danger';
            delBtn.textContent = 'Remove';
            delBtn.onclick = () => {
                exclusions.splice(idx, 1);
                renderExclusionsTable(exclusions);
                updateRawJson(activeConfig);
            };
            tdAct.appendChild(delBtn);
            tr.appendChild(tdAct);

            tbody.appendChild(tr);
        });
    }

    function collectFormSettings(cfg) {
        const elEnabled = document.getElementById('cfg-enabled');
        const elDuration = document.getElementById('cfg-duration');
        const elTrailSmear = document.getElementById('cfg-trail-smear');
        const elMaxDist = document.getElementById('cfg-max-dist');
        const elCursorWidth = document.getElementById('cfg-cursor-width');
        const elCornerRadius = document.getElementById('cfg-corner-radius');
        const elBgOpacity = document.getElementById('cfg-bg-opacity');
        const elCustomColor = document.getElementById('cfg-custom-color');
        const elHideNative = document.getElementById('cfg-hide-native');

        if (elEnabled) cfg.enabled = elEnabled.checked;
        if (elDuration) cfg.duration = parseInt(elDuration.value, 10) || 150;
        if (elTrailSmear) cfg.trailSmear = parseFloat(elTrailSmear.value) || 0.85;
        if (elMaxDist) cfg.maxGlideDist = parseInt(elMaxDist.value, 10) || 350;
        if (elCursorWidth) cfg.cursorWidth = parseFloat(elCursorWidth.value) || 2.5;
        if (elCornerRadius) cfg.cornerRadius = parseFloat(elCornerRadius.value) || 3.0;
        if (elBgOpacity) cfg.bgOpacity = parseFloat(elBgOpacity.value) || 0.85;
        if (elCustomColor) cfg.customColor = elCustomColor.value.trim();
        if (elHideNative) cfg.hideNativeCaret = elHideNative.checked;
    }

    function updateRawJson(cfg) {
        const el = document.getElementById('raw-json-editor');
        if (el) el.value = JSON.stringify(cfg, null, 2);
    }

    const isSettingsPage = location.hostname === 'cursor.lan' || location.pathname.endsWith('/cursor.html');

    if (isSettingsPage) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initSettingsPage();
                startGlide();
            });
        } else {
            initSettingsPage();
            startGlide();
        }
        return;
    }

    updateMenu();

    if (!isUrlExcluded()) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startGlide);
        } else {
            startGlide();
        }
    }
})();
