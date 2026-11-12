// ==UserScript==
// @name           ⚙ [General] Cursor Glide
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Smooth smear caret animation for web editors and text inputs
// @author         Koresent
// @license        GPL-3.0
// @icon           https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/webtools.png
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
// @match          *://www.google.com/*
// @match          *://google.com/*
// @match          *://www.youtube.com/*
// @match          *://youtube.com/*
// @match          *://discord.com/*
// @match          *://web.telegram.org/k/*
// @match          *://www.reddit.com/*
// @match          *://reddit.com/*
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
    let lastBlinkTime = 0;
    let isFocused = false;
    let activeElement = null;
    let cursorColor = 'rgba(255, 255, 255, 0.85)';

    function injectCursorHiderStyles() {
        const style = document.createElement('style');
        style.id = 'cursor-glide-hider';
        style.textContent = `
            input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]),
            textarea,
            [contenteditable="true"],
            [role="textbox"] {
                caret-color: transparent !important;
            }

            .monaco-editor .cursors-layer .cursor {
                opacity: 0 !important;
            }

            .kix-cursor,
            .kix-cursor-caret,
            .docs-text-ui-cursor,
            .docs-text-ui-cursor-blink {
                opacity: 0 !important;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function initCanvas() {
        if (canvas) return;

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
    }

    let mirrorDiv = null;
    const MIRROR_PROPS = [
        'direction', 'boxSizing', 'width', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
        'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent',
        'letterSpacing', 'wordSpacing', 'whiteSpace', 'wordWrap'
    ];

    function getMirrorDiv() {
        if (!mirrorDiv) {
            mirrorDiv = document.createElement('div');
            mirrorDiv.style.cssText = `
                position: absolute !important;
                visibility: hidden !important;
                pointer-events: none !important;
                top: 0 !important;
                left: 0 !important;
                z-index: -9999 !important;
            `;
            document.body.appendChild(mirrorDiv);
        }
        return mirrorDiv;
    }

    function measureInputCaret(el) {
        const mirror = getMirrorDiv();
        const style = window.getComputedStyle(el);
        const isInput = el.tagName === 'INPUT';

        MIRROR_PROPS.forEach(prop => {
            mirror.style[prop] = style[prop];
        });

        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
        mirror.style.wordWrap = isInput ? 'normal' : 'break-word';

        const pos = el.selectionStart || 0;
        const textBefore = el.value.substring(0, pos);
        mirror.textContent = textBefore;

        const marker = document.createElement('span');
        marker.textContent = el.value.substring(pos) || '|';
        mirror.appendChild(marker);

        const elRect = el.getBoundingClientRect();
        const markerLeft = marker.offsetLeft;
        const markerTop = marker.offsetTop;

        const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) * 1.2) || 16;
        const x = elRect.left + markerLeft - el.scrollLeft;
        const y = elRect.top + markerTop - el.scrollTop;

        return {
            x: Math.max(elRect.left, Math.min(elRect.right, x)),
            y: Math.max(elRect.top, Math.min(elRect.bottom, y)),
            w: CONFIG.cursorWidth,
            h: Math.min(elRect.height, lineHeight)
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

        const docsCursor = document.querySelector('.kix-cursor, .kix-cursor-caret, .docs-text-ui-cursor');
        if (docsCursor) {
            const dRect = docsCursor.getBoundingClientRect();
            if (dRect.height > 0) {
                return {
                    x: dRect.left,
                    y: dRect.top,
                    w: Math.max(dRect.width, CONFIG.cursorWidth),
                    h: dRect.height
                };
            }
        }

        const formulaInput = document.querySelector('.cell-input, #t-formula-bar-input');
        if (formulaInput && document.activeElement === formulaInput) {
            const fRect = formulaInput.getBoundingClientRect();
            return {
                x: fRect.left,
                y: fRect.top,
                w: CONFIG.cursorWidth,
                h: fRect.height
            };
        }

        const el = document.activeElement;
        if (!el) return null;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            return measureInputCaret(el);
        }

        if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
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
            const color = style.color || 'rgb(255, 255, 255)';
            return color;
        } catch {
            return `rgba(255, 255, 255, ${CONFIG.bgOpacity})`;
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
        activeElement = document.activeElement;
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
            lastBlinkTime = performance.now();
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
            lastBlinkTime = performance.now();
            startLoop();
        }
    }

    function clearCanvas() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
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
        let smearAlpha = CONFIG.bgOpacity;

        if (t >= 1.0 || moveDist < 1.0) {
            leadX = trailX = curRect.cx;
            leadY = trailY = curRect.cy;

            const blinkElapsed = (now - lastBlinkTime) % 1000;
            const blinkVal = 0.5 + 0.5 * Math.cos((blinkElapsed / 1000) * 2 * Math.PI);
            smearAlpha = CONFIG.bgOpacity * (0.35 + 0.65 * blinkVal);
        } else {
            const tLead = easeLeading(t);
            const tTrail = (1.0 - CONFIG.trailSmear) * tLead + CONFIG.trailSmear * easeTrailing(t);

            leadX = prevRect.cx + moveDx * tLead;
            leadY = prevRect.cy + moveDy * tLead;
            trailX = prevRect.cx + moveDx * tTrail;
            trailY = prevRect.cy + moveDy * tTrail;

            smearAlpha = CONFIG.bgOpacity;
            lastBlinkTime = now;
        }

        ctx.save();
        ctx.fillStyle = cursorColor;
        ctx.globalAlpha = smearAlpha;

        const w = curRect.w;
        const h = curRect.h;
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
        ctx.restore();

        if (t < 1.0 || (isFocused && document.hasFocus())) {
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
        const scheduleUpdate = () => {
            requestAnimationFrame(updateCursorTarget);
        };

        document.addEventListener('selectionchange', scheduleUpdate, { passive: true });
        document.addEventListener('input', scheduleUpdate, { passive: true });
        document.addEventListener('keydown', scheduleUpdate, { passive: true });
        document.addEventListener('keyup', scheduleUpdate, { passive: true });
        document.addEventListener('click', scheduleUpdate, { passive: true });
        document.addEventListener('focusin', scheduleUpdate, { passive: true });
        document.addEventListener('focusout', () => {
            setTimeout(() => {
                if (!document.activeElement || document.activeElement === document.body) {
                    isFocused = false;
                    clearCanvas();
                } else {
                    scheduleUpdate();
                }
            }, 50);
        }, { passive: true });

        window.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });

        const observer = new MutationObserver(scheduleUpdate);
        observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['style', 'class']
        });
    }

    injectCursorHiderStyles();

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
