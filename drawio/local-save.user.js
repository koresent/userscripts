// ==UserScript==
// @name           ⚙ [Draw.io] Local Save Bridge
// @namespace      github.com/koresent/userscripts
// @version        1.1.0
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
// @match          *://embed.diagrams.net/*
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
                data: `[${location.hostname}] ${text}`
            });
        } catch (e) {}
    }

    remoteLog('v1.1.0 (IndexedDB Native) started');

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

    function writeToIdb(filename, xml) {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('database', 2);
            req.onupgradeneeded = () => {
                try {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('objects')) db.createObjectStore('objects', { keyPath: 'key' });
                    if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'title' });
                    if (!db.objectStoreNames.contains('filesInfo')) db.createObjectStore('filesInfo', { keyPath: 'title' });
                } catch (e) {
                    reject(e);
                }
            };
            req.onsuccess = () => {
                try {
                    const db = req.result;
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
                } catch (e) {
                    reject(e);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    function readFromIdb(filename) {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open('database', 2);
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        if (!db.objectStoreNames.contains('files')) return resolve(null);
                        const tx = db.transaction(['files'], 'readonly');
                        const getReq = tx.objectStore('files').get(filename);
                        getReq.onsuccess = () => resolve(getReq.result ? getReq.result.data : null);
                        getReq.onerror = () => resolve(null);
                    } catch (e) {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function syncToDisk() {
        if (!currentFilename || !currentSessionId) return;
        try {
            const xml = await readFromIdb(currentFilename);
            if (!xml || xml === lastSyncedXml) return;

            showToast('Saving to disk...');
            remoteLog(`syncToDisk: saving ${xml.length} bytes to ${currentFilename}`);

            GM_xmlhttpRequest({
                method: 'POST',
                url: `${BRIDGE_BASE}/api/save?session=${encodeURIComponent(currentSessionId)}`,
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ xml: xml }),
                onload: function (res) {
                    if (res.status === 200) {
                        lastSyncedXml = xml;
                        showToast('Saved to disk');
                        remoteLog(`syncToDisk: successfully saved ${currentFilename}`);
                    } else {
                        showToast('Save failed!', true);
                        remoteLog(`syncToDisk error: status ${res.status}`);
                    }
                },
                onerror: function (err) {
                    showToast('Save error!', true);
                    remoteLog(`syncToDisk network error: ${err}`);
                }
            });
        } catch (e) {
            remoteLog(`syncToDisk exception: ${e.message}`);
        }
    }

    function checkActiveSession() {
        try {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${BRIDGE_BASE}/api/active_session`,
                onload: function (res) {
                    if (res.status === 200) {
                        try {
                            const data = JSON.parse(res.responseText);
                            if (data && data.session && data.session !== currentSessionId) {
                                const newSession = data.session;
                                remoteLog(`checkActiveSession: new session detected ${newSession}`);

                                GM_xmlhttpRequest({
                                    method: 'GET',
                                    url: `${BRIDGE_BASE}/api/file?session=${encodeURIComponent(newSession)}`,
                                    onload: async function (fres) {
                                        if (fres.status === 200) {
                                            try {
                                                const fileData = JSON.parse(fres.responseText);
                                                currentSessionId = newSession;
                                                currentFilename = fileData.filename;
                                                lastSyncedXml = fileData.xml;

                                                remoteLog(`checkActiveSession: writing ${fileData.filename} to IndexedDB`);
                                                await writeToIdb(fileData.filename, fileData.xml);

                                                window.location.hash = '#L' + encodeURIComponent(fileData.filename);
                                                showToast(`Opened: ${fileData.filename}`);
                                                remoteLog(`checkActiveSession: hash updated to #L${fileData.filename}`);
                                            } catch (e) {
                                                remoteLog(`checkActiveSession IDB write error: ${e.message}`);
                                            }
                                        }
                                    }
                                });
                            }
                        } catch (e) {}
                    }
                }
            });
        } catch (e) {
            remoteLog(`checkActiveSession error: ${e.message}`);
        }
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
            setTimeout(syncToDisk, 350);
        }
    });

    setInterval(checkActiveSession, 1500);
    setInterval(syncToDisk, 2000);

    checkActiveSession();
})();
