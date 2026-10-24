// ==UserScript==
// @name           ⚙ [Gemini] Timeline
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Adds an interactive scroll timeline with tooltips to Google Gemini
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/gemini/timeline.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/gemini/timeline.user.js
//
// @match          https://gemini.google.com/*
// @match          https://aistudio.google.com/*
//
// @run-at         document-end
//
// @grant          GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .timeline-bar {
            position: fixed;
            right: 16px;
            top: 15%;
            bottom: 15%;
            width: 24px;
            z-index: 9999;
            background: transparent;
            display: flex;
            justify-content: center;
        }
        .timeline-bar::before {
            content: '';
            position: absolute;
            top: 0; bottom: 0;
            width: 4px;
            background: #504945;
            border-radius: 4px;
        }
        .timeline-track {
            position: relative;
            width: 100%;
            height: 100%;
        }
        .timeline-dot {
            position: absolute;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #7c6f64;
            left: 50%;
            transform: translate(-50%, -50%);
            border: 2px solid #282828;
            cursor: pointer;
            transition: all 0.2s ease;
            padding: 0;
        }
        .timeline-dot:hover {
            background: #a89984;
            transform: translate(-50%, -50%) scale(1.2);
        }
        .timeline-dot.active {
            background: #b8bb26;
            transform: translate(-50%, -50%) scale(1.3);
            box-shadow: 0 0 0 3px rgba(184, 187, 38, 0.3);
            z-index: 2;
        }

        .timeline-tooltip {
            position: fixed;
            background: #282828;
            color: #ebdbb2;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 13px;
            line-height: 1.4;
            max-width: 280px;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.15s ease, visibility 0.15s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            border: 1px solid #504945;
            z-index: 10000;
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: system-ui, -apple-system, sans-serif;
        }
        .timeline-tooltip.visible {
            opacity: 1;
            visibility: visible;
        }

        @media (prefers-color-scheme: dark) {
            .timeline-dot { border-color: #131314; }
        }
        @media (prefers-color-scheme: light) {
            .timeline-bar::before { background: #d5c4a1; }
            .timeline-dot {
                background: #bdae93;
                border-color: #ffffff;
            }
            .timeline-dot:hover { background: #928374; }
            .timeline-tooltip {
                background: #fbf1c7;
                color: #3c3836;
                border: 1px solid #d5c4a1;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
        }
    `);

    class TimelineManager {
        constructor() {
            this.markers = [];
            this.scrollContainer = null;
            this.conversationContainer = null;
            this.timelineBar = null;
            this.track = null;
            this.tooltip = null;
            this.activeTurnId = null;
            this.scrollListener = null;

            this.userTurnSelector = [
                '.user-query-bubble-with-background',
                '.user-query-bubble-container',
                '.user-query-container',
                'user-query-content .user-query-bubble-with-background',
                'user-query-content',
                'user-query',
                'div[aria-label="User message"]',
                'article[data-author="user"]',
                'article[data-turn="user"]',
                '[data-message-author-role="user"]',
                'div[role="listitem"][data-user="true"]'
            ].join(', ');

            this.init();
        }

        init() {
            this.createUI();
            this.setupObservers();
            this.debounceRender();
        }

        createUI() {
            this.timelineBar = document.createElement('div');
            this.timelineBar.className = 'timeline-bar';

            this.track = document.createElement('div');
            this.track.className = 'timeline-track';

            this.timelineBar.appendChild(this.track);
            document.body.appendChild(this.timelineBar);

            this.tooltip = document.createElement('div');
            this.tooltip.className = 'timeline-tooltip';
            document.body.appendChild(this.tooltip);

            this.timelineBar.addEventListener('click', (e) => {
                const dot = e.target.closest('.timeline-dot');
                if (!dot) return;

                const index = parseInt(dot.dataset.index, 10);
                const marker = this.markers[index];
                if (marker && marker.element) {
                    marker.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    this.setActiveDot(index);
                }
            });

            this.timelineBar.addEventListener('mouseover', (e) => {
                const dot = e.target.closest('.timeline-dot');
                if (!dot) return;

                const index = parseInt(dot.dataset.index, 10);
                const marker = this.markers[index];
                if (marker) {
                    this.showTooltip(dot, marker);
                }
            });

            this.timelineBar.addEventListener('mouseout', (e) => {
                if (e.target.closest('.timeline-dot')) {
                    this.hideTooltip();
                }
            });
        }

        showTooltip(dotElement, marker) {
            const rect = dotElement.getBoundingClientRect();
            let text = (marker.element.textContent || '').trim().replace(/\s+/g, ' ');

            // Strip service prefixes from accessibility labels
            text = text.replace(/^(?:you said|you wrote|user message|your prompt|you asked|ваш запрос|вы сказали|вы написали|запрос пользователя)[:\s]*/i, '');

            if (text.length > 180) {
                text = text.substring(0, 177) + '...';
            }

            this.tooltip.textContent = text;
            this.tooltip.style.visibility = 'hidden';
            this.tooltip.style.opacity = '0';
            this.tooltip.classList.add('visible');

            const tooltipRect = this.tooltip.getBoundingClientRect();
            const gap = 12;
            const top = Math.max(10, rect.top + (rect.height / 2) - (tooltipRect.height / 2));
            const left = rect.left - tooltipRect.width - gap;

            this.tooltip.style.top = top + 'px';
            this.tooltip.style.left = left + 'px';
            this.tooltip.style.visibility = '';
            this.tooltip.style.opacity = '';
        }

        hideTooltip() {
            this.tooltip.classList.remove('visible');
        }

        setupObservers() {
            this.mutationObserver = new MutationObserver(() => this.debounceRender());
            this.mutationObserver.observe(document.body, { childList: true, subtree: true });

            window.addEventListener('resize', () => {
                this.debounceRender();
                this.hideTooltip();
            });
        }

        debounceRender() {
            if (this.renderTimer) clearTimeout(this.renderTimer);
            this.renderTimer = setTimeout(() => this.renderMarkers(), 300);
        }

        renderMarkers() {
            if (!this.track) return;

            let userTurns = Array.from(document.querySelectorAll(this.userTurnSelector));

            if (userTurns.length === 0) {
                if (this.markers.length !== 0) {
                    this.track.textContent = '';
                    this.markers = [];
                }
                return;
            }

            userTurns = userTurns.filter(el => {
                let parent = el.parentElement;
                while (parent && parent !== document.body) {
                    if (parent.matches(this.userTurnSelector)) return false;
                    parent = parent.parentElement;
                }
                return true;
            });

            if (userTurns.length === 0) return;

            if (!this.scrollContainer || !document.body.contains(this.scrollContainer)) {
                let p = userTurns[0];
                let foundScroll = false;

                while (p && p !== document.body) {
                    const st = window.getComputedStyle(p);
                    if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
                        this.scrollContainer = p;
                        foundScroll = true;
                        break;
                    }
                    p = p.parentElement;
                }

                if (!foundScroll) {
                    this.scrollContainer = document.scrollingElement || document.documentElement;
                }

                if (this.scrollListener) {
                    this.scrollContainer.removeEventListener('scroll', this.scrollListener);
                }

                this.scrollListener = () => {
                    if (!this.scrollRafId) {
                        this.scrollRafId = requestAnimationFrame(() => {
                            this.updateActiveByScroll();
                            this.scrollRafId = null;
                            this.hideTooltip();
                        });
                    }
                };

                this.scrollContainer.addEventListener('scroll', this.scrollListener, { passive: true });
            }

            const containerRect = this.scrollContainer.getBoundingClientRect();
            const scrollTop = this.scrollContainer.scrollTop;

            const markerTops = userTurns.map(el => {
                return el.getBoundingClientRect().top - containerRect.top + scrollTop;
            });

            const currentTopsSignature = markerTops.join(',');
            const hasDetachedElements = this.markers.some(m => !m.element || !m.element.isConnected);

            if (!hasDetachedElements && this.lastTopsSignature === currentTopsSignature) {
                return;
            }
            this.lastTopsSignature = currentTopsSignature;

            this.track.textContent = '';

            const firstOffset = markerTops[0];
            const lastOffset = markerTops[markerTops.length - 1];
            const span = Math.max(1, lastOffset - firstOffset);

            this.markers = userTurns.map((el, idx) => {
                const offsetFromStart = markerTops[idx] - firstOffset;
                let n = offsetFromStart / span;
                n = Math.max(0, Math.min(1, n));

                const dot = document.createElement('button');
                dot.className = 'timeline-dot';
                dot.dataset.index = idx;

                dot.style.top = 'calc(12px + ' + n + ' * (100% - 24px))';
                this.track.appendChild(dot);

                return { element: el, dotElement: dot, n, top: markerTops[idx] };
            });

            this.updateActiveByScroll();
        }

        updateActiveByScroll() {
            if (!this.scrollContainer || this.markers.length === 0) return;

            const scrollTop = this.scrollContainer.scrollTop;
            const refLine = scrollTop + (this.scrollContainer.clientHeight * 0.45);

            let activeIndex = 0;
            for (let i = 0; i < this.markers.length; i++) {
                if (this.markers[i].top <= refLine) {
                    activeIndex = i;
                } else {
                    break;
                }
            }

            this.setActiveDot(activeIndex);
        }

        setActiveDot(index) {
            if (this.activeTurnId === index) return;
            this.activeTurnId = index;

            this.markers.forEach((m, i) => {
                m.dotElement.classList.toggle('active', i === index);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new TimelineManager());
    } else {
        new TimelineManager();
    }
})();
