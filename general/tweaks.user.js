// ==UserScript==
// @name           ⚙ [General] Tweaks
// @namespace      github.com/koresent/userscripts
// @version        2.2.0
// @description    AIO script: Code font changer, Scroll progress bar, Link text selection, Absolute Access, and Bouncy Edge
// @author         Koresent
// @license        GPL-3.0
// @icon           https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/webtools.png
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/tweaks.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/tweaks.user.js
//
// @match          *://*/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          GM_addValueChangeListener
// ==/UserScript==

(function () {
    'use strict';

    const config = {
        fontEnabled: GM_getValue('fontEnabled', true),
        customFont: GM_getValue('customFont', 'Maple Mono NF'),
        progressEnabled: GM_getValue('progressEnabled', true),
        linksEnabled: GM_getValue('linksEnabled', true),
        aaDomains: GM_getValue('aa_enabled_domains', []),
        bounceEnabled: GM_getValue('bounceEnabled', true),
        bounceConfig: GM_getValue('bounceConfig', {
            edgeSize: 45,
            edgeTime: 850,
            enableWheel: true,
            enableKeyboard: true,
            enableScrollImpact: true,
            allowInnerContainers: true
        })
    };

    let menuIds = [];

    function getMatchedRule(hostname, domains) {
        let parts = hostname.split(".");
        for (let i = 0; i < parts.length - 1; i++) {
            let checkDomain = parts.slice(i).join(".");
            if (domains.includes(checkDomain)) return checkDomain;
        }
        return null;
    }

    function updateConfig(key, value) {
        config[key] = value;
        const storageKey = key === 'aaDomains' ? 'aa_enabled_domains' : key;
        GM_setValue(storageKey, value);
        renderMenu();
        applySpecificModule(key);
    }

    function applySpecificModule(key) {
        if (key === 'fontEnabled' || key === 'customFont') applyFontModule();
        if (key === 'progressEnabled') applyProgressModule();
        if (key === 'linksEnabled') applyLinksModule();
        if (key === 'aaDomains') applyAbsoluteAccessModule();
        if (key === 'bounceEnabled' || key === 'bounceConfig') applyBounceModule();
    }

    function renderMenu() {
        if (window.self !== window.top) return;

        menuIds.forEach(id => GM_unregisterMenuCommand(id));
        menuIds = [];

        menuIds.push(GM_registerMenuCommand(
            `${config.fontEnabled ? '✅' : '❌'} Code blocks font changer`,
            () => updateConfig('fontEnabled', !config.fontEnabled)
        ));

        menuIds.push(GM_registerMenuCommand(
            `    ↳ Set Font (${config.customFont})`,
            () => {
                const userInput = prompt('Enter the font family name:', config.customFont);
                if (userInput !== null && userInput.trim() !== '') {
                    updateConfig('customFont', userInput.trim());
                }
            }
        ));

        menuIds.push(GM_registerMenuCommand(
            `${config.progressEnabled ? '✅' : '❌'} Scroll progress bar`,
            () => updateConfig('progressEnabled', !config.progressEnabled)
        ));

        menuIds.push(GM_registerMenuCommand(
            `${config.linksEnabled ? '✅' : '❌'} Select links as text`,
            () => updateConfig('linksEnabled', !config.linksEnabled)
        ));

        menuIds.push(GM_registerMenuCommand(
            `${config.bounceEnabled ? '✅' : '❌'} Bouncy edge effect`,
            () => updateConfig('bounceEnabled', !config.bounceEnabled)
        ));

        menuIds.push(GM_registerMenuCommand(
            `    ↳ Configure Bounce (${config.bounceConfig.edgeSize}px, ${config.bounceConfig.edgeTime}ms)`,
            () => {
                const current = config.bounceConfig;
                const defaultStr = `${current.edgeSize}, ${current.edgeTime}, ${current.enableWheel}, ${current.enableKeyboard}, ${current.enableScrollImpact}, ${current.allowInnerContainers}`;
                const promptMsg = 'Format: edgeSize, edgeTime, wheel, keyboard, scrollImpact, innerContainers\n\nExample: 45, 850, true, true, true, true';
                const userInput = prompt(promptMsg, defaultStr);

                if (userInput !== null && userInput.trim() !== '') {
                    const parts = userInput.split(',').map(s => s.trim().toLowerCase());
                    const newConfig = {
                        edgeSize: !isNaN(parseFloat(parts[0])) ? parseFloat(parts[0]) : current.edgeSize,
                        edgeTime: !isNaN(parseFloat(parts[1])) ? parseFloat(parts[1]) : current.edgeTime,
                        enableWheel: parts[2] !== undefined ? parts[2] === 'true' : current.enableWheel,
                        enableKeyboard: parts[3] !== undefined ? parts[3] === 'true' : current.enableKeyboard,
                        enableScrollImpact: parts[4] !== undefined ? parts[4] === 'true' : current.enableScrollImpact,
                        allowInnerContainers: parts[5] !== undefined ? parts[5] === 'true' : current.allowInnerContainers
                    };
                    updateConfig('bounceConfig', newConfig);
                }
            }
        ));

        const isAAEnabled = !!getMatchedRule(location.hostname, config.aaDomains);
        menuIds.push(GM_registerMenuCommand(
            `${isAAEnabled ? '✅' : '❌'} Absolute Access (Unlock this domain)`,
            () => {
                let domains = [...config.aaDomains];
                const matched = getMatchedRule(location.hostname, domains);
                if (matched) {
                    domains = domains.filter((d) => d !== matched);
                } else {
                    domains.push(location.hostname);
                }
                updateConfig('aaDomains', domains);
                location.reload();
            }
        ));
    }

    ['fontEnabled', 'customFont', 'progressEnabled', 'linksEnabled', 'aa_enabled_domains', 'bounceEnabled', 'bounceConfig'].forEach(key => {
        GM_addValueChangeListener(key, (name, oldValue, newValue, remote) => {
            if (remote) {
                const configKey = name === 'aa_enabled_domains' ? 'aaDomains' : name;
                config[configKey] = newValue;
                applySpecificModule(configKey);
                renderMenu();
            }
        });
    });

    function manageStyle(id, css, enable) {
        let el = document.getElementById(id);
        if (enable) {
            if (!el) {
                el = document.createElement('style');
                el.id = id;
                const append = () => {
                    const target = document.head || document.documentElement;
                    if (target) target.appendChild(el);
                };
                if (document.head || document.documentElement) append();
                else document.addEventListener('DOMContentLoaded', append, { once: true });
            }
            el.textContent = css;
        } else if (el) {
            el.remove();
        }
    }

    function applyFontModule() {
        const css = `
            pre, code, textarea, tt, kbd, samp,
            .highlight, .code, .blob-code,
            .language-text, .language-javascript, .language-python,
            .language-html, .language-css, .language-json,
            .react-code-text, .react-code-line-contents-no-virtualization,
            .react-file-line, .react-blob-textarea {
                font-family: '${config.customFont}', monospace !important;
            }
        `;
        manageStyle('tm-custom-font-style', css, config.fontEnabled);
    }

    let barEl = null;
    let progressTicking = false;
    let progressActive = false;
    let resizeObserver = null;

    function updateProgress() {
        if (!config.progressEnabled || !barEl) return;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const percentage = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
        barEl.style.width = `${percentage}%`;
        progressTicking = false;
    }

    const onScrollOrDOMChange = () => {
        if (!progressTicking && config.progressEnabled) {
            requestAnimationFrame(updateProgress);
            progressTicking = true;
        }
    };

    function initProgressBar() {
        if (!document.body || barEl) return;

        barEl = document.createElement('div');
        barEl.id = 'scroll-progress-bar';
        Object.assign(barEl.style, {
            position: 'fixed', top: '0', left: '0', zIndex: '2147483647',
            width: '0', height: '5px', backgroundColor: '#b8bb26',
            opacity: '0.7', borderRadius: '0 2px 2px 0',
            transition: 'width 0.1s linear', pointerEvents: 'none', willChange: 'width'
        });
        document.body.appendChild(barEl);

        window.addEventListener('scroll', onScrollOrDOMChange, { passive: true });
        window.addEventListener('resize', onScrollOrDOMChange, { passive: true });

        resizeObserver = new ResizeObserver(onScrollOrDOMChange);
        resizeObserver.observe(document.documentElement);

        updateProgress();
    }

    function applyProgressModule() {
        if (config.progressEnabled && !progressActive) {
            progressActive = true;
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initProgressBar, { once: true });
            } else {
                initProgressBar();
            }
        } else if (!config.progressEnabled && progressActive) {
            progressActive = false;
            if (barEl) { barEl.remove(); barEl = null; }
            window.removeEventListener('scroll', onScrollOrDOMChange);
            window.removeEventListener('resize', onScrollOrDOMChange);
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
        }
    }

    const STATES = { WAITING: 0, STARTING: 1, STARTED: 2, ENDING: 3 };
    let linkState = STATES.WAITING, preState, mousemoves = 0, linkTarget = null, selectType, cachedInitPos = null;
    const moves = [[0, 0], [0, 0], [0, 0]];
    let moveIndex = 0;
    let linksActive = false;

    function getCaretPosition(x, y) {
        if (document.caretPositionFromPoint) return document.caretPositionFromPoint(x, y);
        if (document.caretRangeFromPoint) {
            const r = document.caretRangeFromPoint(x, y);
            return r ? { offsetNode: r.startContainer, offset: r.startOffset } : null;
        }
        return { offsetNode: document.body, offset: 0 };
    }

    function inSelect(caretPos, selection) {
        if (!caretPos || !caretPos.offsetNode) return false;
        for (let i = 0; i < selection.rangeCount; i++) {
            if (selection.getRangeAt(i).isPointInRange(caretPos.offsetNode, caretPos.offset)) return true;
        }
        return false;
    }

    function getLinkTarget(target) {
        const el = target.nodeType === 3 ? target.parentElement : target;
        return el ? el.closest('a[href]') : null;
    }

    function handleMouseMove(e) {
        moves[moveIndex][0] = e.pageX; moves[moveIndex][1] = e.pageY;
        moveIndex = (moveIndex + 1) % 3;

        if (linkState === STATES.STARTING) {
            mousemoves++;
            if (mousemoves >= 3) {
                const dx = Math.abs(moves[moveIndex][0] - moves[(moveIndex + 1) % 3][0]) + Math.abs(moves[(moveIndex + 1) % 3][0] - moves[(moveIndex + 2) % 3][0]);
                const dy = Math.abs(moves[moveIndex][1] - moves[(moveIndex + 1) % 3][1]) + Math.abs(moves[(moveIndex + 1) % 3][1] - moves[(moveIndex + 2) % 3][1]);
                if (dx >= dy) startSelecting(e);
                else resetState();
            }
        } else if (linkState === STATES.STARTED) {
            const caretPos = getCaretPosition(e.clientX, e.clientY);
            if (caretPos && caretPos.offsetNode) window.getSelection().extend(caretPos.offsetNode, caretPos.offset);
        }
    }

    function startSelecting(e) {
        if (e.type === "dragstart") e.preventDefault();
        const selection = window.getSelection();
        if (selectType === "new" && cachedInitPos?.offsetNode) {
            selection.collapse(cachedInitPos.offsetNode, cachedInitPos.offset);
        } else if (selectType === "add" && cachedInitPos?.offsetNode) {
            const range = new Range();
            range.setStart(cachedInitPos.offsetNode, cachedInitPos.offset);
            selection.addRange(range);
        }
        linkState = STATES.STARTED;
    }

    function resetState() {
        if (linkTarget) linkTarget.classList.remove("select-text-inside-a-link");
        document.removeEventListener("mousemove", handleMouseMove, true);
        linkState = STATES.WAITING; linkTarget = null; cachedInitPos = null;
    }

    const linkEvts = {
        mousedown: (e) => {
            if (linkState !== STATES.WAITING || e.altKey || e.button !== 0 || /img/i.test(e.target.nodeName)) return;
            const target = getLinkTarget(e.target);
            if (!target) return;
            const selection = window.getSelection();
            selectType = e.ctrlKey ? "add" : e.shiftKey ? "extend" : "new";
            cachedInitPos = getCaretPosition(e.clientX, e.clientY);
            if (selectType === "new" && !selection.isCollapsed && inSelect(cachedInitPos, selection)) return;

            mousemoves = 0; linkState = STATES.STARTING; linkTarget = target;
            linkTarget.classList.add("select-text-inside-a-link");
            document.addEventListener("mousemove", handleMouseMove, true);
        },
        mouseup: () => {
            if (linkState !== STATES.WAITING) {
                preState = linkState; linkState = STATES.ENDING;
                setTimeout(resetState, 0);
            }
        },
        click: (e) => {
            if (linkState === STATES.ENDING && preState === STATES.STARTED) {
                if (getLinkTarget(e.target) === linkTarget) {
                    e.preventDefault(); e.stopImmediatePropagation();
                }
            }
            resetState();
        },
        dragstart: (e) => {
            if (linkState === STATES.STARTED || linkState === STATES.STARTING) {
                e.preventDefault();
                if (linkState === STATES.STARTING) startSelecting(e);
            }
        }
    };

    function applyLinksModule() {
        const isXML = document.contentType && document.contentType.endsWith("/xml");
        const css = `.select-text-inside-a-link { -moz-user-select: text !important; -webkit-user-select: text !important; user-select: text !important; }`;

        if (config.linksEnabled && !linksActive) {
            linksActive = true;
            if (!isXML) manageStyle('tm-select-links-style', css, true);
            Object.entries(linkEvts).forEach(([type, fn]) => document.addEventListener(type, fn, true));
        } else if (!config.linksEnabled && linksActive) {
            linksActive = false;
            manageStyle('tm-select-links-style', css, false);
            Object.entries(linkEvts).forEach(([type, fn]) => document.removeEventListener(type, fn, true));
            resetState();
        }
    }

    function applyAbsoluteAccessModule() {
        if (window.__absoluteAccessEnabled) return;
        if (!getMatchedRule(location.hostname, config.aaDomains)) return;

        window.__absoluteAccessEnabled = true;

        const eventsToUnlock = ["copy", "cut", "paste", "selectstart", "contextmenu", "dragstart", "mousedown", "mouseup", "keydown", "keyup"];
        const forcePropagation = (e) => e.stopImmediatePropagation();

        eventsToUnlock.forEach((event) => {
            window.addEventListener(event, forcePropagation, true);
        });

        const css = `
            *, *::before, *::after {
                -webkit-user-select: auto !important;
                -moz-user-select: auto !important;
                -ms-user-select: auto !important;
                user-select: auto !important;
                pointer-events: auto !important;
            }
        `;
        manageStyle('tm-absolute-access-style', css, true);
    }

    let bounceActive = false;
    let activeAnimation = null;
    let activeTarget = null;
    let isBouncing = false;
    let bounceDirection = 0;
    let lastBounceEndTime = 0;

    let speedLog = [];
    let lastWheelTime = 0;
    let lastScrollY = window.scrollY;
    let lastScrollTime = performance.now();
    let scrollVelocity = 0;
    let peakScrollVelocity = 0;
    let lastUserInteractionTime = 0;

    function clampRange(t, min, max) {
        return (t < min) ? min : ((t > max) ? max : t);
    }

    function bouncingAnimationCurve(speed, edgeSize, edgeTime) {
        speed = (isNaN(speed) || speed <= 0) ? 0.0001 : speed;

        let offsetBackward = clampRange(0.3 / speed + 0.1, 0.30, 0.45);
        let f = (Math.max(0.1, speed) / ((edgeSize * 2) / (edgeTime * offsetBackward)));
        let fedge = Math.min(1.0, f);
        let ftime = clampRange(fedge / f, 0.8, 1.3);

        return {
            edgeSize: edgeSize * fedge,
            duration: edgeTime * ftime,
            offsetBackward: offsetBackward,
            easingForward: "cubic-bezier(0.12, 0.8, 0.32, 1)",
            easingBackward: "cubic-bezier(0.2, 0.9, 0.2, 1)"
        };
    }

    function cancelBounce() {
        if (activeAnimation) {
            activeAnimation.cancel();
            activeAnimation = null;
        }
        isBouncing = false;
        bounceDirection = 0;
        activeTarget = null;
    }

    function triggerBounce(target, direction, speed) {
        if (!target) target = document.documentElement;

        let now = performance.now();

        if (isBouncing && bounceDirection === direction) return;
        if (!isBouncing && (now - lastBounceEndTime < 80) && bounceDirection === direction) return;

        cancelBounce();

        let containerHeight = (target === document.body || target === document.documentElement)
            ? window.innerHeight
            : target.clientHeight;
        let maxEdge = Math.min(containerHeight * 0.2, config.bounceConfig.edgeSize);

        let animInfo = bouncingAnimationCurve(speed, maxEdge, config.bounceConfig.edgeTime);

        isBouncing = true;
        bounceDirection = direction;
        activeTarget = target;

        let anim = target.animate([
            { transform: "translate3d(0, 0, 0)", easing: animInfo.easingForward },
            { transform: `translate3d(0, ${direction * animInfo.edgeSize}px, 0)`, easing: animInfo.easingBackward, offset: animInfo.offsetBackward },
            { transform: "translate3d(0, 0, 0)" }
        ], {
            duration: animInfo.duration,
            fill: "none"
        });

        activeAnimation = anim;

        anim.onfinish = () => {
            cancelBounce();
            lastBounceEndTime = performance.now();
        };

        anim.oncancel = () => {
            isBouncing = false;
            bounceDirection = 0;
            activeTarget = null;
        };
    }

    function getScrollContext(orig, deltaY) {
        if (!config.bounceConfig.allowInnerContainers) {
            return { scroller: document.scrollingElement || document.documentElement, target: document.documentElement, isRoot: true };
        }

        let path = orig?.composedPath ? orig.composedPath() : [];
        if (!path.length && orig) {
            for (let n = orig; n; n = n.parentNode) path.push(n);
        }

        for (let node of path) {
            if (!(node instanceof Element)) continue;
            if (node === document.documentElement || node === document.body) break;

            let name = node.nodeName.toLowerCase();
            if (/^(select|option|optgroup)$/.test(name)) return null;

            let style = getComputedStyle(node);
            let overflowY = style.getPropertyValue("overflow-y");
            if (name === "textarea") overflowY = "auto";

            if (node.clientHeight && (overflowY === "auto" || overflowY === "scroll")) {
                let maxScroll = node.scrollHeight - node.clientHeight;
                if (maxScroll > 1) {
                    if (deltaY < 0 && node.scrollTop > 1) return null;
                    if (deltaY > 0 && node.scrollTop < maxScroll - 1) return null;

                    let overscroll = style.getPropertyValue("overscroll-behavior-y");
                    if (overscroll === "contain" || overscroll === "none") {
                        return { scroller: node, target: node, isRoot: false };
                    }
                }
            }
        }

        return { scroller: document.scrollingElement || document.documentElement, target: document.documentElement, isRoot: true };
    }

    const onWheelBounce = (ev) => {
        if (!config.bounceConfig.enableWheel) return;
        if (ev.ctrlKey || ev.altKey || ev.metaKey) return;

        let now = performance.now();
        lastUserInteractionTime = now;

        let mult = [1.0, 28.0, 500.0][ev.deltaMode] || 1.0;
        let deltaY = ev.deltaY * mult;
        let deltaX = ev.deltaX * mult;

        if (Math.abs(deltaY) < Math.abs(deltaX) || Math.abs(deltaY) < 1) return;

        if (isBouncing) {
            if ((bounceDirection === 1 && deltaY > 0) || (bounceDirection === -1 && deltaY < 0)) {
                cancelBounce();
                return;
            }
        }

        let interval = clampRange(now - (lastWheelTime || now - 50), 10, 150);
        lastWheelTime = now;
        speedLog.push([interval, Math.abs(deltaY)]);
        if (speedLog.length > 6) speedLog.shift();

        let ctx = getScrollContext(ev.target, deltaY);
        if (!ctx) return;

        let { scroller, target, isRoot } = ctx;

        let scrollTop = isRoot ? window.scrollY : scroller.scrollTop;
        let clientHeight = isRoot ? window.innerHeight : scroller.clientHeight;
        let scrollHeight = isRoot ? (document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight) : scroller.scrollHeight;
        let maxScroll = Math.max(0, scrollHeight - clientHeight);

        if (maxScroll <= 0) return;

        let atTop = scrollTop <= 3;
        let atBottom = scrollTop >= maxScroll - 3;

        let direction = 0;
        if (atTop && deltaY < 0) direction = 1;
        else if (atBottom && deltaY > 0) direction = -1;

        if (direction !== 0) {
            let totalTime = speedLog.reduce((acc, cur) => acc + cur[0], 0);
            let totalDist = speedLog.reduce((acc, cur) => acc + cur[1], 0);
            let speed = totalTime > 0 ? (totalDist / totalTime) : (Math.abs(deltaY) / 50);

            triggerBounce(target, direction, speed);
        }
    };

    const onScrollBounce = () => {
        let now = performance.now();
        let dt = now - lastScrollTime;
        let currentY = window.scrollY;

        if (dt > 4 && dt < 120) {
            scrollVelocity = (currentY - lastScrollY) / dt;
            if (Math.abs(scrollVelocity) > Math.abs(peakScrollVelocity)) {
                peakScrollVelocity = scrollVelocity;
            }
        } else {
            peakScrollVelocity = 0;
        }

        lastScrollY = currentY;
        lastScrollTime = now;

        if (!config.bounceConfig.enableScrollImpact) return;
        if (isBouncing) return;

        if (now - lastUserInteractionTime > 1200) {
            peakScrollVelocity = 0;
            return;
        }

        let maxScroll = Math.max(0, (document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight) - window.innerHeight);
        if (maxScroll <= 0) return;

        let effectiveSpeed = Math.max(Math.abs(scrollVelocity), Math.abs(peakScrollVelocity));

        if (currentY <= 2 && (scrollVelocity < -0.08 || peakScrollVelocity < -0.08)) {
            triggerBounce(document.documentElement, 1, effectiveSpeed);
            scrollVelocity = 0;
            peakScrollVelocity = 0;
        } else if (currentY >= maxScroll - 3 && (scrollVelocity > 0.08 || peakScrollVelocity > 0.08)) {
            triggerBounce(document.documentElement, -1, effectiveSpeed);
            scrollVelocity = 0;
            peakScrollVelocity = 0;
        }
    };

    const onKeyDownBounce = (ev) => {
        if (!config.bounceConfig.enableKeyboard) return;
        if (ev.altKey || ev.ctrlKey || ev.metaKey) return;

        let target = ev.composedPath?.().shift() ?? ev.target;
        let tag = target?.tagName?.toLowerCase();
        if (target?.isContentEditable || /^(input|textarea|select)$/.test(tag)) return;

        let maxScroll = Math.max(0, (document.scrollingElement?.scrollHeight || document.documentElement.scrollHeight) - window.innerHeight);
        if (maxScroll <= 0) return;

        let atTop = window.scrollY <= 2;
        let atBottom = window.scrollY >= maxScroll - 3;
        let direction = 0;
        let speed = 0.5;

        switch (ev.key) {
            case "ArrowUp":
                if (atTop) { direction = 1; speed = 0.5; }
                break;
            case "ArrowDown":
                if (atBottom) { direction = -1; speed = 0.5; }
                break;
            case "PageUp":
                if (atTop) { direction = 1; speed = 1.3; }
                break;
            case "PageDown":
            case " ":
                if (atBottom && !ev.shiftKey) { direction = -1; speed = 1.3; }
                else if (atTop && ev.shiftKey) { direction = 1; speed = 1.3; }
                break;
            case "Home":
                if (atTop) { direction = 1; speed = 2.0; }
                break;
            case "End":
                if (atBottom) { direction = -1; speed = 2.0; }
                break;
        }

        if (direction !== 0) {
            lastUserInteractionTime = performance.now();
            triggerBounce(document.documentElement, direction, speed);
        }
    };

    function applyBounceModule() {
        if (config.bounceConfig && config.bounceEnabled && !bounceActive) {
            bounceActive = true;
            window.addEventListener("wheel", onWheelBounce, { passive: true, capture: true });
            window.addEventListener("scroll", onScrollBounce, { passive: true });
            window.addEventListener("keydown", onKeyDownBounce, { passive: true, capture: true });
        } else if (!config.bounceEnabled && bounceActive) {
            bounceActive = false;
            cancelBounce();
            window.removeEventListener("wheel", onWheelBounce, { capture: true });
            window.removeEventListener("scroll", onScrollBounce);
            window.removeEventListener("keydown", onKeyDownBounce, { capture: true });
        }
    }

    function applyAllModules() {
        applyFontModule();
        applyProgressModule();
        applyLinksModule();
        applyAbsoluteAccessModule();
        applyBounceModule();
    }

    renderMenu();
    applyAllModules();

})();
