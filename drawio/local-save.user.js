// ==UserScript==
// @name           ⚙ [Draw.io] Local Save Bridge
// @namespace      github.com/koresent/userscripts
// @version        1.0.2
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
                        console.error('[drawio-bridge] Post-save error:', err);
                    }
                    showToast('Saved to disk');
                    if (typeof success === 'function') success();
                } else {
                    showToast('Save failed!', true);
                }
            },
            onerror: function (err) {
                showToast('Save error!', true);
                console.error('[drawio-bridge] Network error on save:', err);
            }
        });
    }

    function loadFile(ui, session) {
        if (!ui || !session) return;
        loadedSessionId = session;
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${BRIDGE_BASE}/api/file?session=${encodeURIComponent(session)}`,
            onload: function (res) {
                if (res.status === 200) {
                    try {
                        const data = JSON.parse(res.responseText);
                        if (typeof ui.hideDialog === 'function') ui.hideDialog();
                        document.title = (data.filename || 'Diagram') + ' - draw.io';

                        ui.openLocalFile(data.xml, data.filename, false, null, null, true, () => {
                            try {
                                const file = ui.getCurrentFile();
                                if (file) file.setModified(false);
                                if (ui.editor) ui.editor.setModified(false);
                                if (ui.editor && typeof ui.editor.setStatus === 'function') {
                                    ui.editor.setStatus('Loaded from disk');
                                }
                            } catch (e) {}
                            showToast(`Opened: ${data.filename}`);
                        });
                    } catch (e) {
                        console.error('[drawio-bridge] Parse file error:', e);
                    }
                }
            },
            onerror: function (err) {
                console.error('[drawio-bridge] Network error loading file:', err);
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
                                loadFile(activeUi, data.session);
                            }
                        }
                    } catch (e) {}
                }
            }
        });
    }

    function patchSaveDialog() {
        if (win.SaveDialog && !win.SaveDialog.__bridgePatched) {
            const OrigSaveDialog = win.SaveDialog;
            win.SaveDialog = function (ui, filename, fn, showSaveAs) {
                if (sessionId && (activeUi || ui)) {
                    doSave(ui || activeUi);
                    return {
                        container: document.createElement('div'),
                        init: function () {
                            if (ui && ui.hideDialog) ui.hideDialog();
                        }
                    };
                }
                return new OrigSaveDialog(ui, filename, fn, showSaveAs);
            };
            win.SaveDialog.__bridgePatched = true;
        }
    }

    function patchPrototypes() {
        if (win.App && win.App.prototype && !win.App.prototype.__bridgePatched) {
            const origAppSaveFile = win.App.prototype.saveFile;
            win.App.prototype.saveFile = function (forceDialog, success) {
                if (sessionId) {
                    doSave(this, success);
                    return;
                }
                return origAppSaveFile.apply(this, arguments);
            };

            const origAppSave = win.App.prototype.save;
            win.App.prototype.save = function (name, success) {
                if (sessionId) {
                    doSave(this, success);
                    return;
                }
                return origAppSave.apply(this, arguments);
            };
            win.App.prototype.__bridgePatched = true;
        }

        if (win.EditorUi && win.EditorUi.prototype && !win.EditorUi.prototype.__bridgePatched) {
            const origUiSaveFile = win.EditorUi.prototype.saveFile;
            win.EditorUi.prototype.saveFile = function (forceDialog, success) {
                if (sessionId) {
                    doSave(this, success);
                    return;
                }
                return origUiSaveFile.apply(this, arguments);
            };

            const origUiSave = win.EditorUi.prototype.save;
            win.EditorUi.prototype.save = function (name, success) {
                if (sessionId) {
                    doSave(this, success);
                    return;
                }
                return origUiSave.apply(this, arguments);
            };
            win.EditorUi.prototype.__bridgePatched = true;
        }

        if (win.LocalFile && win.LocalFile.prototype && !win.LocalFile.prototype.__bridgePatched) {
            const origLocalSaveFile = win.LocalFile.prototype.saveFile;
            win.LocalFile.prototype.saveFile = function (title, revision, success) {
                if (sessionId) {
                    doSave(this.ui || activeUi, success);
                    return;
                }
                return origLocalSaveFile.apply(this, arguments);
            };

            const origLocalSave = win.LocalFile.prototype.save;
            win.LocalFile.prototype.save = function (revision, success) {
                if (sessionId) {
                    doSave(this.ui || activeUi, success);
                    return;
                }
                return origLocalSave.apply(this, arguments);
            };
            win.LocalFile.prototype.__bridgePatched = true;
        }

        patchSaveDialog();
    }

    function hookUiInstance(ui) {
        if (!ui) return;
        activeUi = ui;

        if (ui.actions) {
            const saveAct = ui.actions.get('save');
            if (saveAct) {
                saveAct.funct = function () {
                    doSave(ui);
                };
            }
            const saveAsAct = ui.actions.get('saveAs') || ui.actions.get('saveAs...');
            if (saveAsAct) {
                saveAsAct.funct = function () {
                    doSave(ui);
                };
            }
        }

        if (ui.editor && ui.editor.graph && ui.editor.graph.model && win.mxEvent) {
            let debounce = null;
            ui.editor.graph.model.addListener(win.mxEvent.CHANGE, () => {
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    if (ui.editor && ui.editor.modified && sessionId) {
                        doSave(ui);
                    }
                }, 1500);
            });
        }

        if (sessionId && loadedSessionId !== sessionId) {
            loadFile(ui, sessionId);
        }
    }

    function hookAppLifecycle() {
        patchPrototypes();

        if (win.App && win.App.prototype && !win.App.prototype.__initHooked) {
            const origInit = win.App.prototype.init;
            win.App.prototype.init = function () {
                origInit.apply(this, arguments);
                patchPrototypes();
                hookUiInstance(this);
            };
            win.App.prototype.__initHooked = true;
        }

        if (win.App && win.App.main && !win.App.main.__hooked) {
            const origMain = win.App.main;
            win.App.main = function (callback, createUi) {
                return origMain.call(this, function (ui) {
                    patchPrototypes();
                    hookUiInstance(ui);
                    if (callback) callback(ui);
                }, createUi);
            };
            win.App.main.__hooked = true;
        }
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

    win.addEventListener('focus', () => {
        checkActiveSession();
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            checkActiveSession();
        }
    });

    setInterval(checkActiveSession, 1500);

    hookAppLifecycle();

    const pollTimer = setInterval(() => {
        hookAppLifecycle();
        if (activeUi) {
            hookUiInstance(activeUi);
            clearInterval(pollTimer);
        }
    }, 25);

    setTimeout(() => clearInterval(pollTimer), 10000);
})();
