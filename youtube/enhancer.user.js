// ==UserScript==
// @name           ⚙ [YouTube] Enhancer (RYD, SB, Redirects, Auto-expand, Speed)
// @namespace      github.com/koresent/userscripts
// @version        1.1.0
// @description    A modular all-in-one script for Return YouTube Dislike, SponsorBlock, redirects, auto-expanding descriptions, and custom speed controls.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/youtube/enhancer.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/youtube/enhancer.user.js
//
// @match          *://www.youtube.com/*
//
// @run-at         document-start
//
// @connect        api.sponsor.ajay.app
// @connect        returnyoutubedislikeapi.com
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const Config = {
        rydEnabled: true,
        redirectsEnabled: true,
        autoExpandEnabled: true,
        sbEnabled: true,
        sbDraw: true,
        speedControlsEnabled: true,
        sbCategories: {
            sponsor: true, selfpromo: true, interaction: true,
            intro: true, outro: true, preview: true,
            music_offtopic: true, poi_highlight: false
        },
        debugLog: false
    };

    const State = {
        currentVideoId: null,
        vidElement: null,
        menuIds: []
    };

    const log = (...args) => Config.debugLog && console.log('[YT Enhancer]', ...args);

    const Utils = {
        getVideoId: () => {
            const url = new URL(window.location.href);
            if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2];
            return url.searchParams.get('v');
        },
        loadConfig: () => {
            const saved = GM_getValue('yte_config', {});
            Object.assign(Config, saved);
            if (saved.sbCategories) Object.assign(Config.sbCategories, saved.sbCategories);
        },
        saveConfig: () => {
            GM_setValue('yte_config', Config);
            Menu.build();
        },
        debounce: (func, wait) => {
            let timeout;
            return function (...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        }
    };

    const Menu = {
        build() {
            State.menuIds.forEach(id => GM_unregisterMenuCommand(id));
            State.menuIds = [];

            const addToggle = (label, isChecked, toggleFn) => {
                const mark = isChecked ? '✅' : '❌';
                const id = GM_registerMenuCommand(`${mark} ${label}`, toggleFn);
                State.menuIds.push(id);
            };

            addToggle('[Player] Custom Speed Controls', Config.speedControlsEnabled, () => {
                Config.speedControlsEnabled = !Config.speedControlsEnabled;
                Utils.saveConfig();
                if (Config.speedControlsEnabled) {
                    SpeedManager.attach();
                } else {
                    SpeedManager.removeUI();
                }
            });

            addToggle('[RYD] Return Dislikes', Config.rydEnabled, () => {
                Config.rydEnabled = !Config.rydEnabled;
                Utils.saveConfig();
                if (Config.rydEnabled && State.currentVideoId) RYD.inject(State.currentVideoId);
                else if (!Config.rydEnabled) RYD.clear();
            });

            addToggle('[UI] Redirects & Link Patching', Config.redirectsEnabled, () => {
                Config.redirectsEnabled = !Config.redirectsEnabled;
                Utils.saveConfig();
            });

            addToggle('[UI] Auto Expand Description', Config.autoExpandEnabled, () => {
                Config.autoExpandEnabled = !Config.autoExpandEnabled;
                Utils.saveConfig();
                if (Config.autoExpandEnabled && State.currentVideoId) AutoExpand.trigger(State.currentVideoId);
            });

            addToggle('[SB] Enable Skipping', Config.sbEnabled, () => {
                Config.sbEnabled = !Config.sbEnabled;
                Utils.saveConfig();
            });

            addToggle('[SB] Show Segments', Config.sbDraw, () => {
                Config.sbDraw = !Config.sbDraw;
                Utils.saveConfig();
                if (!Config.sbDraw) SB.removeMarkers();
                else if (State.vidElement && SB.currentSegments.length) {
                    SB.renderMarkers(State.vidElement, SB.currentSegments);
                }
            });

            const sbLabels = {
                sponsor: 'Sponsors', selfpromo: 'Unpaid/Self Promo',
                interaction: 'Interaction', intro: 'Intro/Intermission',
                outro: 'Outro/Credits', preview: 'Previews',
                music_offtopic: 'Non-Music', poi_highlight: 'Highlight'
            };

            for (const cat in Config.sbCategories) {
                addToggle(`  ↳ ${sbLabels[cat] || cat}`, Config.sbCategories[cat], () => {
                    Config.sbCategories[cat] = !Config.sbCategories[cat];
                    SB.cache.clear();
                    Utils.saveConfig();
                    if (State.currentVideoId && Config.sbEnabled) {
                        SB.removeMarkers();
                        SB.attach(State.currentVideoId);
                    }
                });
            }

            addToggle('Enable Debug Logging', Config.debugLog, () => {
                Config.debugLog = !Config.debugLog;
                Utils.saveConfig();
            });
        }
    };

    const SpeedManager = {
        rates: [1, 1.25, 1.5, 2],
        containerId: 'yte-speed-controls',

        get player() {
            return document.getElementById('movie_player');
        },

        attach() {
            if (!Config.speedControlsEnabled) {
                this.removeUI();
                return;
            }

            const player = this.player;
            if (!player) {
                setTimeout(() => this.attach(), 500);
                return;
            }

            const savedRate = GM_getValue('yte_speed_rate', 1.0);
            const progressState = typeof player.getProgressState === 'function' ? player.getProgressState() : null;
            const isLiveHead = progressState && progressState.isAtLiveHead;

            if (savedRate !== 1.0 && !isLiveHead && typeof player.setPlaybackRate === 'function') {
                player.setPlaybackRate(savedRate);
            }

            this.injectUI();

            if (!player._yteSpeedListenerAttached) {
                player.addEventListener('onPlaybackRateChange', () => {
                    const currentRate = player.getPlaybackRate();
                    GM_setValue('yte_speed_rate', currentRate);
                    this.updateUIHighlight(currentRate);
                });
                player._yteSpeedListenerAttached = true;
            }
        },

        removeUI() {
            const container = document.getElementById(this.containerId);
            if (container) container.remove();
        },

        injectUI() {
            const player = this.player;
            if (!player) return;

            const controls = player.querySelector('.ytp-right-controls') || player.querySelector('.ytp-chrome-controls');
            if (!controls) {
                setTimeout(() => this.injectUI(), 500);
                return;
            }

            let container = document.getElementById(this.containerId);
            if (!container) {
                container = document.createElement('div');
                container.id = this.containerId;
                container.className = 'ytp-button';

                Object.assign(container.style, {
                    width: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    gap: '10px',
                    verticalAlign: 'top',
                    userSelect: 'none'
                });

                this.rates.forEach(r => {
                    const btn = document.createElement('span');
                    btn.textContent = r + 'x';
                    btn.dataset.rate = r;

                    Object.assign(btn.style, {
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600',
                        opacity: '0.5',
                        transition: 'opacity 0.2s, color 0.2s',
                        fontFamily: 'Roboto, Arial, sans-serif'
                    });

                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (typeof player.setPlaybackRate === 'function') {
                            player.setPlaybackRate(r);
                        }
                    });

                    btn.addEventListener('mouseover', () => {
                        btn.style.opacity = '1';
                    });

                    btn.addEventListener('mouseout', () => {
                        if (btn.dataset.active !== 'true') btn.style.opacity = '0.5';
                    });

                    container.appendChild(btn);
                });

                let insertBeforeTarget = controls.querySelector('.ytp-right-controls-left')?.firstChild || controls.firstChild || null;
                if (insertBeforeTarget) {
                    insertBeforeTarget.parentElement.insertBefore(container, insertBeforeTarget);
                } else {
                    controls.appendChild(container);
                }
            }

            if (typeof player.getPlaybackRate === 'function') {
                this.updateUIHighlight(player.getPlaybackRate());
            }
        },

        updateUIHighlight(currentRate) {
            const container = document.getElementById(this.containerId);
            if (!container) return;

            const closestRate = this.rates.reduce((prev, curr) =>
                Math.abs(curr - currentRate) < Math.abs(prev - currentRate) ? curr : prev
            );

            container.querySelectorAll('span').forEach(btn => {
                const r = parseFloat(btn.dataset.rate);
                if (r === closestRate) {
                    btn.dataset.active = 'true';
                    btn.style.opacity = '1';
                    btn.style.color = '#ff0000';
                } else {
                    btn.dataset.active = 'false';
                    btn.style.opacity = '0.5';
                    btn.style.color = 'inherit';
                }
            });
        }
    };

    const Redirector = {
        SUBS_PATH: '/feed/subscriptions',
        SUBS_URL: 'https://www.youtube.com/feed/subscriptions',

        navigateSpa(url) {
            const app = document.querySelector('ytd-app');
            if (app && typeof app.navigate === 'function') {
                app.navigate({ commandMetadata: { webCommandMetadata: { url: url } } });
            } else {
                window.location.assign(url);
            }
        },

        hardRedirect() {
            if (!Config.redirectsEnabled) return;
            if (window.location.pathname === '/' && !window.location.search) {
                window.location.replace(Redirector.SUBS_URL);
            }
        },

        patchDOM() {
            if (!Config.redirectsEnabled) return;

            const logoLink = document.querySelector('ytd-topbar-logo-renderer a#logo');
            if (logoLink && logoLink.getAttribute('href') !== Redirector.SUBS_PATH) {
                logoLink.setAttribute('href', Redirector.SUBS_PATH);
                logoLink.setAttribute('title', 'YouTube Subscriptions');
                logoLink.setAttribute('aria-label', 'YouTube Subscriptions');
            }

            const channelLinks = document.querySelectorAll('a[href^="/@"]');
            channelLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (/^\/@[^/]+$/.test(href)) {
                    link.setAttribute('href', href + '/videos');
                }
            });
        },

        handleGlobalClick(e) {
            if (!Config.redirectsEnabled) return;
            if (e.type === 'click' && e.button !== 0) return;
            if (e.type === 'auxclick' && e.button !== 1) return;

            const targetNode = e.target;
            if (!targetNode || targetNode.nodeType !== Node.ELEMENT_NODE) return;

            const logoLink = targetNode.closest('a#logo');
            if (logoLink && logoLink.closest('ytd-topbar-logo-renderer')) {
                if (e.type === 'click') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    Redirector.navigateSpa(Redirector.SUBS_PATH);
                }
                return;
            }

            let channelUrl = null;
            const anchor = targetNode.closest('a[href^="/@"]');

            if (anchor) {
                channelUrl = anchor.getAttribute('href');
            } else {
                const avatar = targetNode.closest('yt-avatar-shape, yt-img-shadow');
                if (avatar) {
                    const container = targetNode.closest('yt-lockup-metadata-view-model, ytd-video-owner-renderer, ytd-rich-grid-media, ytd-comment-renderer, ytd-channel-name');
                    if (container) {
                        const innerAnchor = container.querySelector('a[href^="/@"]');
                        if (innerAnchor) channelUrl = innerAnchor.getAttribute('href');
                    }
                }
            }

            if (channelUrl) {
                const match = channelUrl.match(/^\/(@[^/]+)(\/videos)?$/);
                if (match) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    const targetUrl = `/${match[1]}/videos`;

                    if (e.type === 'auxclick') window.open(targetUrl, '_blank');
                    else Redirector.navigateSpa(targetUrl);
                }
            }
        },

        init() {
            Redirector.hardRedirect();

            const attachEvents = () => {
                if (document.body) {
                    document.addEventListener('click', Redirector.handleGlobalClick, { capture: true });
                    document.addEventListener('auxclick', Redirector.handleGlobalClick, { capture: true });

                    const debouncedPatch = Utils.debounce(() => Redirector.patchDOM(), 150);
                    const observer = new MutationObserver(debouncedPatch);
                    observer.observe(document.documentElement, { childList: true, subtree: true });
                } else {
                    requestAnimationFrame(attachEvents);
                }
            };
            attachEvents();
        }
    };

    const AutoExpand = {
        trigger(videoId) {
            if (!Config.autoExpandEnabled || !window.location.pathname.startsWith('/watch')) return;

            const tryExpand = (attempts = 0) => {
                if (State.currentVideoId !== videoId) return;

                const expander = document.querySelector('ytd-text-inline-expander');
                const expandButton = document.querySelector('ytd-text-inline-expander #expand');

                if (expander && expandButton) {
                    if (!expander.hasAttribute('expanded')) {
                        expandButton.click();
                        log('Description automatically expanded');
                    }
                } else if (attempts < 10) {
                    setTimeout(() => tryExpand(attempts + 1), 200);
                }
            };

            tryExpand();
        }
    };

    const RYD = {
        formatter: new Intl.NumberFormat(document.documentElement.lang || "ru", {
            notation: "compact",
            compactDisplay: "short",
        }),
        observer: null,

        clear() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            document.querySelectorAll(".ryd-injected").forEach(el => {
                const btn = el.closest('button');
                if (btn) {
                    btn.classList.add("ytSpecButtonShapeNextIconButton");
                    btn.classList.remove("ytSpecButtonShapeNextIconLeading");
                }
                el.remove();
            });
        },

        async inject(videoId) {
            if (!Config.rydEnabled) return;
            this.clear();

            try {
                const res = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`);
                if (!res.ok) return;
                const data = await res.json();

                const updateDOM = () => {
                    if (!Config.rydEnabled || State.currentVideoId !== videoId) return;

                    const buttons = document.querySelectorAll("dislike-button-view-model button, #segmented-dislike-button button");

                    buttons.forEach(dislikeBtn => {
                        let textNode = dislikeBtn.querySelector(".ryd-injected");

                        if (!textNode) {
                            textNode = document.createElement("div");
                            textNode.className = "ytSpecButtonShapeNextButtonTextContent ryd-injected";

                            dislikeBtn.classList.remove("ytSpecButtonShapeNextIconButton");
                            dislikeBtn.classList.add("ytSpecButtonShapeNextIconLeading");

                            const touchFeedback = dislikeBtn.querySelector("yt-touch-feedback-shape");
                            if (touchFeedback) dislikeBtn.insertBefore(textNode, touchFeedback);
                            else dislikeBtn.appendChild(textNode);
                        }

                        const formattedText = RYD.formatter.format(data.dislikes);
                        if (textNode.textContent !== formattedText) {
                            textNode.textContent = formattedText;
                        }

                        textNode.removeAttribute("is-empty");
                        dislikeBtn.style.width = 'auto';
                    });
                };

                updateDOM();

                const appNode = document.querySelector('ytd-app') || document.body;
                this.observer = new MutationObserver((mutations) => {
                    if (!Config.rydEnabled || State.currentVideoId !== videoId) return;

                    const needsUpdate = mutations.some(m =>
                        Array.from(m.addedNodes).some(n =>
                            n.nodeType === Node.ELEMENT_NODE &&
                            (n.tagName === 'BUTTON' || n.querySelector('button'))
                        )
                    );

                    if (needsUpdate) {
                        const btn = document.querySelector("dislike-button-view-model button");
                        if (btn && !btn.querySelector(".ryd-injected")) updateDOM();
                    }
                });

                this.observer.observe(appNode, { childList: true, subtree: true });

            } catch (err) {
                console.error("[RYD] Fetch Error:", err);
            }
        }
    };

    const SB = {
        API: 'https://api.sponsor.ajay.app/api/skipSegments',
        cache: new Map(),
        currentSegments: [],
        listenerAttachedFor: null,

        colors: {
            sponsor: '#fb4934', selfpromo: '#fabd2f', interaction: '#d3869b',
            intro: '#8ec07c', outro: '#83a598', preview: '#458588',
            music_offtopic: '#fe8019', poi_highlight: '#b8bb26'
        },

        fetchSegments(videoId, cb) {
            if (SB.cache.has(videoId)) return cb(SB.cache.get(videoId));

            const activeCats = Object.entries(Config.sbCategories).filter(([_, v]) => v).map(([k]) => k);
            const cats = activeCats.length ? activeCats : ['sponsor'];
            const url = `${SB.API}?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent(JSON.stringify(cats))}`;

            GM_xmlhttpRequest({
                method: 'GET', url, headers: { 'Accept': 'application/json' },
                onload: (res) => {
                    try {
                        const data = JSON.parse(res.responseText);
                        const segments = (Array.isArray(data) ? data : []).map(item => {
                            const seg = item.segment || item.segments || [];
                            const cat = item.category || (item.categories && item.categories[0]) || 'sponsor';
                            const start = Number(seg[0]) || 0, end = Number(seg[1]) || 0;
                            return end > start ? { start, end, category: cat } : null;
                        }).filter(Boolean).sort((a,b) => a.start - b.start);

                        const merged = [];
                        for (const s of segments) {
                            const last = merged[merged.length-1];
                            if (!last || s.start > last.end || last.category !== s.category) merged.push({ ...s });
                            else last.end = Math.max(last.end, s.end);
                        }
                        SB.cache.set(videoId, merged);
                        cb(merged);
                    } catch { cb([]); }
                },
                onerror: () => cb([]), ontimeout: () => cb([])
            });
        },

        removeMarkers() {
            document.querySelectorAll('.ytsb-marker').forEach(el => el.remove());
        },

        renderMarkers(vid, segments) {
            if (!Config.sbDraw) return;
            if (isNaN(vid.duration) || vid.duration === 0) {
                vid.addEventListener('loadedmetadata', () => SB.renderMarkers(vid, segments), { once: true });
                return;
            }

            const progressList = document.querySelector('.ytp-progress-list');
            if (!progressList) {
                setTimeout(() => SB.renderMarkers(vid, segments), 1000);
                return;
            }

            SB.removeMarkers();
            segments.forEach(s => {
                const marker = document.createElement('div');
                marker.className = 'ytsb-marker';

                const leftPercent = (s.start / vid.duration) * 100;
                const widthPercent = ((s.end - s.start) / vid.duration) * 100;

                Object.assign(marker.style, {
                    position: 'absolute',
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                    height: '100%',
                    backgroundColor: SB.colors[s.category] || '#ebdbb2',
                    opacity: '0.7',
                    zIndex: '40',
                    pointerEvents: 'none'
                });
                progressList.appendChild(marker);
            });
        },

        attach(videoId) {
            if (!Config.sbEnabled) return;
            const vid = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (!vid || !videoId) return;

            if (SB.listenerAttachedFor !== vid) SB.removeMarkers();

            SB.fetchSegments(videoId, (segments) => {
                State.vidElement = vid;
                SB.currentSegments = segments;

                if (segments?.length) SB.renderMarkers(vid, segments);

                const onTimeUpdate = () => {
                    if (!Config.sbEnabled || !segments?.length) return;
                    const t = vid.currentTime || 0;

                    const activeSegment = segments.find(s => t >= s.start && t < s.end);
                    if (activeSegment) {
                        try {
                            vid.currentTime = activeSegment.end + 0.05;
                            log('SB skip', activeSegment.category);
                        } catch {}
                    }
                };

                if (vid._sbListener) vid.removeEventListener('timeupdate', vid._sbListener);
                vid._sbListener = onTimeUpdate;
                vid.addEventListener('timeupdate', onTimeUpdate);
                SB.listenerAttachedFor = vid;
            });
        }
    };

    const handleNavigation = Utils.debounce(() => {
        Redirector.patchDOM();
        Redirector.hardRedirect();

        const videoId = Utils.getVideoId();
        if (!videoId || videoId === State.currentVideoId) return;

        log(`Navigated to video: ${videoId}`);
        State.currentVideoId = videoId;

        SpeedManager.attach();
        RYD.inject(videoId);
        SB.attach(videoId);
        AutoExpand.trigger(videoId);
    }, 300);

    function bootstrap() {
        Utils.loadConfig();
        Menu.build();

        Redirector.init();

        window.addEventListener('yt-navigate-finish', handleNavigation, { passive: true });
        window.addEventListener('yt-page-data-updated', handleNavigation, { passive: true });

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', handleNavigation);
        } else {
            handleNavigation();
        }
    }

    bootstrap();
})();
