// ==UserScript==
// @name           ⚙ [Draw.io] Local Save Bridge
// @namespace      github.com/koresent/userscripts
// @version        1.2.0
// @description    Direct in-place local file saving and opening for Draw.io PWA without Save As dialogs
// @author         Koresent
// @license        GPL-3.0
// @icon           https://app.diagrams.net/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/drawio/local-save.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/drawio/local-save.user.js
//
// @match          *://app.diagrams.net/*
//
// @connect        127.0.0.1
// @connect        localhost
//
// @run-at         document-start
//
// @grant          GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const BRIDGE_BASE = 'http://127.0.0.1:48240';
    let currentSessionId = null;
    let currentFilename = null;
    let lastSyncedXml = null;
    let toastEl = null;
    let toastTimer = null;

    function remoteLog(text) {
        try {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${BRIDGE_BASE}/api/log`,
                data: text
            });
        } catch (e) {}
    }

    function showToast(text, isError = false) {
        try {
            if (!toastEl) {
                toastEl = document.createElement('div');
                toastEl.id = 'drawio-bridge-toast';
                toastEl.style.cssText = `
                    position: fixed;
                    bottom: 18px;
                    right: 22px;
                    padding: 6px 14px;
                    border-radius: 6px;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    font-size: 12px;
                    font-weight: 500;
                    color: #ebdbb2;
                    background: rgba(30, 30, 30, 0.92);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    backdrop-filter: blur(8px);
                    opacity: 0;
                    transition: opacity 0.2s ease-in-out;
                    pointer-events: none;
                    z-index: 9999999;
                `;
                document.body.appendChild(toastEl);
            }
            toastEl.textContent = text;
            toastEl.style.borderColor = isError ? 'rgba(235, 77, 75, 0.7)' : 'rgba(255, 255, 255, 0.14)';
            toastEl.style.color = isError ? '#fb4934' : '#ebdbb2';
            toastEl.style.opacity = '1';
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                if (toastEl) toastEl.style.opacity = '0';
            }, 1800);
        } catch (e) {}
    }

    function openDatabase() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('database', 2);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains('objects')) db.createObjectStore('objects', { keyPath: 'key' });
                if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'title' });
                if (!db.objectStoreNames.contains('filesInfo')) db.createObjectStore('filesInfo', { keyPath: 'title' });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function writeToIdb(filename, xml) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['files', 'filesInfo'], 'readwrite');
            tx.objectStore('files').put({ title: filename, data: xml });
            tx.objectStore('filesInfo').put({
                title: filename,
                size: xml.length,
                lastModified: Date.now(),
                type: 'F'
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function readFromIdb(filename) {
        try {
            const db = await openDatabase();
            if (!db.objectStoreNames.contains('files')) return null;
            return new Promise((resolve) => {
                const tx = db.transaction(['files'], 'readonly');
                const getReq = tx.objectStore('files').get(filename);
                getReq.onsuccess = () => resolve(getReq.result ? getReq.result.data : null);
                getReq.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    function updateHash(filename) {
        const targetHash = '#L' + encodeURIComponent(filename);
        if (window.location.hash.startsWith(targetHash)) {
            try {
                window.dispatchEvent(new HashChangeEvent('hashchange'));
            } catch (err) {
                window.location.hash = '';
                setTimeout(() => { window.location.hash = targetHash; }, 50);
            }
        } else {
            window.location.hash = targetHash;
        }
    }

    async function syncToDisk() {
        if (!currentFilename || !currentSessionId) return;
        try {
            const xml = await readFromIdb(currentFilename);
            if (!xml || xml === lastSyncedXml) return;

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${BRIDGE_BASE}/api/save?session=${encodeURIComponent(currentSessionId)}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ xml: xml }),
                onload: function (res) {
                    if (res.status === 200) {
                        lastSyncedXml = xml;
                        showToast(`Saved: ${currentFilename}`);
                        remoteLog(`syncToDisk: saved ${currentFilename} (${xml.length} bytes)`);
                    } else {
                        showToast('Save failed!', true);
                    }
                },
                onerror: function () {
                    showToast('Save error!', true);
                }
            });
        } catch (e) {}
    }

    function checkActiveSession() {
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${BRIDGE_BASE}/api/active_session`,
                onload: function (res) {
                    if (res.status !== 200) return;
                    try {
                        const data = JSON.parse(res.responseText);
                        if (!data || !data.session || data.session === currentSessionId) return;

                        const newSession = data.session;
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: `${BRIDGE_BASE}/api/file?session=${encodeURIComponent(newSession)}`,
                            onload: async function (fres) {
                                if (fres.status !== 200) return;
                                try {
                                    const fileData = JSON.parse(fres.responseText);
                                    currentSessionId = newSession;
                                    currentFilename = fileData.filename;
                                    lastSyncedXml = fileData.xml;

                                    await writeToIdb(fileData.filename, fileData.xml);
                                    updateHash(fileData.filename);
                                    showToast(`Opened: ${fileData.filename}`);
                                    remoteLog(`checkActiveSession: opened ${fileData.filename}`);
                                } catch (e) {}
                            }
                        });
                    } catch (e) {}
                }
            });
        } catch (e) {}
    }

    window.addEventListener('focus', () => {
        checkActiveSession();
        syncToDisk();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkActiveSession();
            syncToDisk();
        }
    });

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 's') {
            setTimeout(syncToDisk, 300);
        }
    });

    setInterval(checkActiveSession, 1500);
    setInterval(syncToDisk, 2000);

    checkActiveSession();
})();
