// ==UserScript==
// @name           ⚙ [General] Cursor Glide
// @namespace      github.com/koresent/userscripts
// @version        1.1.0
// @description    Smooth smear caret animation for web editors and text inputs
// @author         Koresent
// @license        GPL-3.0
// @icon           https://img.icons8.com/?size=100&id=18711&format=png&color=000000
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/cursor-glide.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/cursor-glide.user.js
//
// @match          *://docs.google.com/document/*
// @match          *://docs.google.com/spreadsheets/*
// @match          *://leetcode.com/*
// @match          *://*.leetcode.com/*
// @match          *://github.dev/*
// @match          *://vscode.dev/*
// @match          *://stackblitz.com/*
// @match          *://github.com/*
// @match          *://*.github.com/*
// @match          *://gitlab.com/*
// @match          *://*.gitlab.com/*
// @match          *://www.google.com/*
// @match          *://google.com/*
// @match          *://www.youtube.com/*
// @match          *://youtube.com/*
// @match          *://discord.com/*
// @match          *://web.telegram.org/k/*
// @match          *://www.reddit.com/*
// @match          *://*.reddit.com/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        duration: GM_getValue('duration', 150),
        cornerRadius: GM_getValue('cornerRadius', 3.0),
        bgOpacity: GM_getValue('bgOpacity', 0.85),
        trailSmear: GM_getValue('trailSmear', 0.85),
        cursorWidth: GM_getValue('cursorWidth', 2.5),
        maxGlideDist: GM_getValue('maxGlideDist', 350),
        customColor: GM_getValue('customColor', ''),
    };

    GM_registerMenuCommand('⚙ Configure Glide Duration', () => {
        const val = prompt('Enter cursor glide duration (ms):', CONFIG.duration);
        if (val !== null) {
            const num = parseInt(val, 10);
            if (!isNaN(num) && num > 0) {
                GM_setValue('duration', num);
                CONFIG.duration = num;
            }
        }
    });

    GM_registerMenuCommand('🎨 Configure Cursor Color (leave empty for auto)', () => {
        const val = prompt('CSS Color (e.g. #7aa2f7 or empty for auto):', CONFIG.customColor);
        if (val !== null) {
            GM_setValue('customColor', val.trim());
            CONFIG.customColor = val.trim();
        }
    });

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

    const isGoogleDocs = window.location.hostname === 'docs.google.com' && window.location.pathname.startsWith('/document/');

    function injectStyles() {
        const style = document.createElement('style');
        style.id = 'cursor-glide-styles';
        style.textContent = `
            input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),
            textarea,
            [contenteditable="true"],
            [role="textbox"] {
                caret-color: transparent !important;
            }

            .monaco-editor .cursors-layer .cursor,
            .cm-cursorLayer .cm-cursor {
                opacity: 0 !important;
            }

            .kix-cursor,
            .kix-cursor-caret {
                transition: left 80ms ease-out, top 80ms ease-out !important;
            }

            .active-cell-border {
                transition: all 80ms ease-out !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function hideNativeCaret(el) {
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
        if (canvas || isGoogleDocs) return;

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
        resizeCanvas();

        window.addEventListener('resize', resizeCanvas, { passive: true });
        (document.body || document.documentElement).appendChild(canvas);
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
            (document.body || document.documentElement).appendChild(mirrorDiv);
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
            w: CONFIG.cursorWidth,
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
                w: CONFIG.cursorWidth,
                h: rect.height || 18
            };
        }

        const container = range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer.parentElement;

        if (container) {
            const cRect = container.getBoundingClientRect();
            const cStyle = window.getComputedStyle(container);
            const lh = parseFloat(cStyle.lineHeight) || (parseFloat(cStyle.fontSize) * 1.2) || 18;
            return {
                x: cRect.left + (parseFloat(cStyle.paddingLeft) || 0),
                y: cRect.top + (parseFloat(cStyle.paddingTop) || 0),
                w: CONFIG.cursorWidth,
                h: lh
            };
        }

        return null;
    }

    function findTargetCaretRect() {
        if (isGoogleDocs) return null;

        const monacoCursor = document.querySelector('.monaco-editor.focused .cursors-layer .cursor, .monaco-editor .cursors-layer .cursor');
        if (monacoCursor) {
            const mRect = monacoCursor.getBoundingClientRect();
            if (mRect.width > 0 || mRect.height > 0) {
                return {
                    x: mRect.left,
                    y: mRect.top,
                    w: Math.max(mRect.width, CONFIG.cursorWidth),
                    h: mRect.height
                };
            }
        }

        const formulaInput = document.querySelector('.cell-input, #t-formula-bar-input');
        if (formulaInput && (document.activeElement === formulaInput || formulaInput.contains(document.activeElement))) {
            const fRect = formulaInput.getBoundingClientRect();
            return {
                x: fRect.left,
                y: fRect.top,
                w: CONFIG.cursorWidth,
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
        if (CONFIG.customColor) return CONFIG.customColor;
        if (!el) return `rgba(255, 255, 255, ${CONFIG.bgOpacity})`;

        try {
            const style = window.getComputedStyle(el);
            const cc = style.caretColor;
            if (cc && cc !== 'auto' && cc !== 'transparent') {
                return cc;
            }
            return style.color || 'rgb(255, 255, 255)';
        } catch {
            return `rgba(255, 255, 255, ${CONFIG.bgOpacity})`;
        }
    }

    function updateCursorTarget() {
        if (isGoogleDocs) return;

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
            if (dist > CONFIG.maxGlideDist) {
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
        const r = Math.min(CONFIG.cornerRadius, Math.min(w, h) * 0.5);

        ctx.beginPath();
        if (Math.hypot(leadX - trailX, leadY - trailY) < 0.5) {
            ctx.roundRect(leadX - w * 0.5, leadY - h * 0.5, w, h, r);
        } else {
            ctx.roundRect(trailX - w * 0.5, trailY - h * 0.5, w, h, r);
            ctx.roundRect(leadX - w * 0.5, leadY - h * 0.5, w, h, r);

            const dx = leadX - trailX;
            const dy = leadY - trailY;
            let c1, c2, c3, c4;

            if (dx * dy >= 0) {
                c1 = { x: trailX - w * 0.5, y: trailY + h * 0.5 };
                c2 = { x: trailX + w * 0.5, y: trailY - h * 0.5 };
                c3 = { x: leadX + w * 0.5, y: leadY - h * 0.5 };
                c4 = { x: leadX - w * 0.5, y: leadY + h * 0.5 };
            } else {
                c1 = { x: trailX - w * 0.5, y: trailY - h * 0.5 };
                c2 = { x: trailX + w * 0.5, y: trailY + h * 0.5 };
                c3 = { x: leadX + w * 0.5, y: leadY + h * 0.5 };
                c4 = { x: leadX - w * 0.5, y: leadY - h * 0.5 };
            }

            ctx.moveTo(c1.x, c1.y);
            ctx.lineTo(c2.x, c2.y);
            ctx.lineTo(c3.x, c3.y);
            ctx.lineTo(c4.x, c4.y);
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

        const elapsed = (now - animStartTime) / CONFIG.duration;
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
            const tTrail = (1.0 - CONFIG.trailSmear) * tLead + CONFIG.trailSmear * easeTrailing(t);

            leadX = prevRect.cx + moveDx * tLead;
            leadY = prevRect.cy + moveDy * tLead;
            trailX = prevRect.cx + moveDx * tTrail;
            trailY = prevRect.cy + moveDy * tTrail;
        }

        ctx.save();
        ctx.fillStyle = cursorColor;
        ctx.globalAlpha = CONFIG.bgOpacity;
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

    function setupListeners() {
        if (isGoogleDocs) return;

        let scheduled = false;
        const scheduleUpdate = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                updateCursorTarget();
            });
        };

        document.addEventListener('selectionchange', scheduleUpdate, { passive: true });
        document.addEventListener('input', scheduleUpdate, { passive: true });
        document.addEventListener('keydown', scheduleUpdate, { passive: true });
        document.addEventListener('keyup', scheduleUpdate, { passive: true });
        document.addEventListener('click', scheduleUpdate, { passive: true });
        document.addEventListener('focusin', () => {
            cachedStyleElement = null;
            scheduleUpdate();
        }, { passive: true });

        document.addEventListener('focusout', () => {
            setTimeout(() => {
                const deep = getDeepActiveElement();
                if (!deep || deep === document.body) {
                    isFocused = false;
                    clearCanvas();
                } else {
                    scheduleUpdate();
                }
            }, 50);
        }, { passive: true });

        window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
    }

    injectStyles();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initCanvas();
            setupListeners();
        });
    } else {
        initCanvas();
        setupListeners();
    }
})();
