// ==UserScript==
// @name           ⚙ [Draw.io] Local Save Bridge
// @namespace      github.com/koresent/userscripts
// @version        1.0.4
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
// @grant          unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const BRIDGE_BASE = 'http://127.0.0.1:48240';

    const urlParams = new URLSearchParams(win.location.search);
    let sessionId = urlParams.get('bridge_session');

    let activeUi = null;
    let loadedSessionId = null;
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

    remoteLog(`Userscript started (sessionId=${sessionId})`);

    function safeExport(fn) {
        if (typeof exportFunction === 'function') {
            try {
                return exportFunction(fn, win, { allowCrossOriginArguments: true });
            } catch (e) {
                remoteLog(`exportFunction error: ${e}`);
            }
        }
        return fn;
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

    function doSave(ui, success) {
        ui = ui || activeUi;
        if (!ui || !sessionId) return;
        const xml = ui.getFileData(true);
        if (!xml) return;

        showToast('Saving to disk...');
        remoteLog(`doSave: saving ${xml.length} bytes for session ${sessionId}`);

        GM_xmlhttpRequest({
            method: 'POST',
            url: `${BRIDGE_BASE}/api/save?session=${encodeURIComponent(sessionId)}`,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ xml: xml }),
            onload: function (res) {
                if (res.status === 200) {
                    try {
                        const file = ui.getCurrentFile();
                        if (file) {
                            file.setModified(false);
                            if (typeof file.contentChanged === 'function') file.contentChanged();
                        }
                        if (ui.editor) ui.editor.setModified(false);
                        if (typeof ui.clearStatus === 'function') ui.clearStatus();
                        if (ui.editor && typeof ui.editor.setStatus === 'function') {
                            const msg = win.mxResources ? win.mxResources.get('allChangesSaved') : 'All changes saved to disk';
                            ui.editor.setStatus(msg);
                        }
                    } catch (err) {
                        remoteLog(`post-save UI update error: ${err}`);
                    }
                    showToast('Saved to disk');
                    remoteLog('doSave: successfully saved');
                    if (typeof success === 'function') success();
                } else {
                    showToast('Save failed!', true);
                    remoteLog(`doSave: server returned status ${res.status}`);
                }
            },
            onerror: function (err) {
                showToast('Save error!', true);
                remoteLog(`doSave: network error ${err}`);
            }
        });
    }

    function loadFile(ui, session) {
        ui = ui || activeUi;
        if (!ui || !session) {
            remoteLog(`loadFile called without ui (${!!ui}) or session (${session})`);
            return;
        }
        loadedSessionId = session;
        remoteLog(`loadFile: requesting file for session ${session}`);

        GM_xmlhttpRequest({
            method: 'GET',
            url: `${BRIDGE_BASE}/api/file?session=${encodeURIComponent(session)}`,
            onload: function (res) {
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (typeof ui.hideDialog === 'function') ui.hideDialog();
                        document.title = (data.filename || 'Diagram') + ' - draw.io';

                        const FileClass = win.LocalFile || (win.App && win.App.prototype ? win.LocalFile : null);
                        if (FileClass) {
                            const file = new FileClass(ui, data.xml, data.filename);
                            ui.fileLoaded(file);
                        } else {
                            ui.openLocalFile(data.xml, data.filename, false, null, null, true);
                        }

                        if (ui.editor) ui.editor.setModified(false);
                        if (ui.editor && typeof ui.editor.setStatus === 'function') {
                            ui.editor.setStatus('Loaded from disk');
                        }
                        showToast(`Opened: ${data.filename}`);
                        remoteLog(`loadFile: successfully loaded ${data.filename} (${(data.xml || '').length} bytes)`);
                    } catch (e) {
                        remoteLog(`loadFile parse/render error: ${e}`);
                    }
                } else {
                    remoteLog(`loadFile: server returned ${res.status}`);
                }
            },
            onerror: function (err) {
                remoteLog(`loadFile network error: ${err}`);
            }
        });
    }

    function checkActiveSession() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${BRIDGE_BASE}/api/active_session`,
            onload: function (res) {
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (data && data.session) {
                            sessionId = data.session;
                            if (activeUi && loadedSessionId !== data.session) {
                                remoteLog(`checkActiveSession: new session detected: ${data.session}`);
                                loadFile(activeUi, data.session);
                            }
                        }
                    } catch (e) {}
                }
            }
        });
    }

    function hookUiInstance(ui) {
        if (!ui || ui.__bridgeInstanceHooked) return;
        ui.__bridgeInstanceHooked = true;
        activeUi = ui;
        remoteLog('hookUiInstance: UI instance attached');

        const origSaveFile = ui.saveFile;
        ui.saveFile = safeExport(function (forceDialog, success) {
            if (sessionId) {
                doSave(ui, success);
                return;
            }
            origSaveFile.apply(this, arguments);
        });

        if (ui.actions) {
            const saveAct = ui.actions.get('save');
            if (saveAct) {
                saveAct.funct = safeExport(function () {
                    doSave(ui);
                });
            }
            const saveAsAct = ui.actions.get('saveAs') || ui.actions.get('saveAs...');
            if (saveAsAct) {
                saveAsAct.funct = safeExport(function () {
                    doSave(ui);
                });
            }
        }

        if (ui.editor && ui.editor.graph && ui.editor.graph.model && win.mxEvent) {
            let debounce = null;
            const listener = safeExport(() => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    if (ui.editor && ui.editor.modified && sessionId) {
                        doSave(ui);
                    }
                }, 1500);
            });
            ui.editor.graph.model.addListener(win.mxEvent.CHANGE, listener);
        }

        if (sessionId && loadedSessionId !== sessionId) {
            loadFile(ui, sessionId);
        }
    }

    function registerPlugin() {
        if (win.Draw && typeof win.Draw.loadPlugin === 'function') {
            remoteLog('registerPlugin: Draw.loadPlugin found, registering callback');
            win.Draw.loadPlugin(safeExport(function (ui) {
                remoteLog('Draw.loadPlugin callback triggered!');
                hookUiInstance(ui);
            }));
            return true;
        }
        return false;
    }

    function hookAppClass() {
        if (win.App && win.App.prototype && !win.App.prototype.__initBridgeHooked) {
            remoteLog('hookAppClass: hooking App.prototype.init');
            const origInit = win.App.prototype.init;
            win.App.prototype.init = safeExport(function () {
                remoteLog('App.prototype.init invoked!');
                const res = origInit.apply(this, arguments);
                hookUiInstance(this);
                return res;
            });
            win.App.prototype.__initBridgeHooked = true;
        }
    }

    if (win.SaveDialog && !win.SaveDialog.__bridgePatched) {
        const OrigSaveDialog = win.SaveDialog;
        win.SaveDialog = safeExport(function (ui, filename, fn, showSaveAs) {
            if (sessionId && (activeUi || ui)) {
                doSave(ui || activeUi);
                return {
                    container: document.createElement('div'),
                    init: safeExport(function () {
                        if (ui && ui.hideDialog) ui.hideDialog();
                    })
                };
            }
            return new OrigSaveDialog(ui, filename, fn, showSaveAs);
        });
        win.SaveDialog.__bridgePatched = true;
    }

    win.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 's') {
            if (sessionId) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                doSave(activeUi);
            }
        }
    }, true);

    win.addEventListener('focus', checkActiveSession);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkActiveSession();
    });

    setInterval(checkActiveSession, 1500);

    hookAppClass();
    if (!registerPlugin()) {
        const pluginTimer = setInterval(() => {
            hookAppClass();
            if (registerPlugin()) clearInterval(pluginTimer);
        }, 20);
        setTimeout(() => clearInterval(pluginTimer), 10000);
    }

    checkActiveSession();
})();
