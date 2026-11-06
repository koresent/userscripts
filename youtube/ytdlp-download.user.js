// ==UserScript==
// @name           ⚙ [YouTube] yt-dlp Bridge Downloader
// @namespace      github.com/koresent/userscripts
// @version        1.2.0
// @description    Download YouTube videos and audio directly to ~/Downloads via local zen-bridge and yt-dlp
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/youtube/ytdlp-download.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/youtube/ytdlp-download.user.js
//
// @match          *://*.youtube.com/*
// @match          *://*.youtu.be/*
//
// @connect        127.0.0.1
// @connect        localhost
// @connect        zen-bridge.lan
//
// @run-at         document-start
//
// @grant          GM_xmlhttpRequest
// @grant          GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const BRIDGE_URLS = [
        'http://127.0.0.1:48240',
        'https://zen-bridge.lan'
    ];

    const FORMAT_PRESETS = [
        { id: 'best', label: '🎬 Download Video (Best Quality)', format: 'bestvideo+bestaudio/best', audioOnly: false },
        { id: '1080p', label: '🎬 Download Video (1080p)', quality: '1080p', audioOnly: false },
        { id: '720p', label: '🎬 Download Video (720p)', quality: '720p', audioOnly: false },
        { id: '480p', label: '🎬 Download Video (480p)', quality: '480p', audioOnly: false },
        { id: 'audio_mp3', label: '🎵 Download Audio (MP3)', format: 'audio', audioOnly: true, audioFormat: 'mp3' }
    ];

    function getCurrentVideoUrl() {
        const url = new URL(window.location.href);
        if (url.pathname.startsWith('/shorts/')) {
            const shortId = url.pathname.split('/')[2];
            return `https://www.youtube.com/watch?v=${shortId}`;
        }
        const v = url.searchParams.get('v');
        if (v) {
            return `https://www.youtube.com/watch?v=${v}`;
        }
        return null;
    }

    function sendDownloadRequest(preset, customOptions = {}) {
        const videoUrl = getCurrentVideoUrl();
        if (!videoUrl) {
            console.warn('[yt-dlp-bridge] Not on a valid YouTube video or Shorts page.');
            return;
        }

        const payload = {
            url: videoUrl,
            format: preset?.format || customOptions.format || 'bestvideo+bestaudio/best',
            quality: preset?.quality || customOptions.quality,
            audio_only: preset?.audioOnly ?? customOptions.audio_only ?? false,
            audio_format: preset?.audioFormat || customOptions.audio_format || 'mp3',
            path: '~/Downloads'
        };

        const tryBridge = (bridgeIdx) => {
            if (bridgeIdx >= BRIDGE_URLS.length) {
                console.error('[yt-dlp-bridge] Failed to connect: zen-bridge daemon is not running.');
                return;
            }
            const base = BRIDGE_URLS[bridgeIdx];
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${base}/api/download`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify(payload),
                timeout: 5000,
                onload: (res) => {
                    if (res.status !== 200) {
                        console.error('[yt-dlp-bridge] Bridge returned error:', res.status, res.responseText);
                    }
                },
                ontimeout: () => tryBridge(bridgeIdx + 1),
                onerror: () => tryBridge(bridgeIdx + 1)
            });
        };

        tryBridge(0);
    }

    function promptCustomDownload() {
        const customFormat = prompt(
            'Enter format or parameters for yt-dlp (e.g. bestaudio or bestvideo[height<=1080]):',
            'best'
        );
        if (customFormat === null) return;
        sendDownloadRequest(null, { format: customFormat.trim() });
    }

    function registerMenuCommands() {
        FORMAT_PRESETS.forEach(preset => {
            GM_registerMenuCommand(preset.label, () => {
                sendDownloadRequest(preset);
            });
        });

        GM_registerMenuCommand('⚙️ Download with Custom Format...', () => {
            promptCustomDownload();
        });
    }

    function registerHotkeys() {
        window.addEventListener('keydown', (e) => {
            if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'd' || e.code === 'KeyD')) {
                const targetTag = e.target?.tagName?.toLowerCase();
                if (targetTag === 'input' || targetTag === 'textarea' || e.target?.isContentEditable) {
                    return;
                }
                e.preventDefault();
                sendDownloadRequest(FORMAT_PRESETS[0]);
            }
        });
    }

    registerMenuCommands();
    registerHotkeys();
})();
