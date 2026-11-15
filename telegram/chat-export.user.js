// ==UserScript==
// @name           ⚙ [Telegram Web K] Chat Exporter
// @namespace      github.com/koresent/userscripts
// @version        1.1.0
// @description    Export chat history to JSON and TOON directly via native MTProto layer
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/chat-export.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/chat-export.user.js
//
// @match          https://web.telegram.org/k/*
//
// @run-at         document-idle
// @grant          unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const CONFIG = {
    batchLimit: 100,
    requestDelayMs: 400,
    progressToastId: 'tg-export-progress-toast',
    itemJsonId: 'tg-export-item-json',
    itemToonId: 'tg-export-item-toon',
    itemStopId: 'tg-export-item-stop'
  };

  let activeAbortController = null;
  let activeFormat = null;
  let activeExportCount = 0;

  const ESCAPES = {
    '\\': '\\\\',
    '"': '\\"',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t'
  };
  const NEEDS_ESCAPE = /[\\"\x00-\x1f]/g;
  const STRUCTURAL = /[:"\\\[\]{}\x00-\x1f]/;
  const NUMERIC_LIKE = /^[+-]?[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
  const UNQUOTED_KEY = /^[A-Za-z_][A-Za-z0-9_.]*$/;

  function quoteToonString(val) {
    return (
      '"' +
      val.replace(NEEDS_ESCAPE, (c) =>
        ESCAPES[c] !== undefined
          ? ESCAPES[c]
          : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')
      ) +
      '"'
    );
  }

  function needsToonQuotes(val, delimiter = ',') {
    if (!val) return true;
    if (/^[\s\t\-\#]/.test(val) || /[\s\t]$/.test(val)) return true;
    if (val === 'true' || val === 'false' || val === 'null') return true;
    if (val.includes(delimiter)) return true;
    if (STRUCTURAL.test(val)) return true;
    if (NUMERIC_LIKE.test(val)) return true;
    return false;
  }

  function encodeToonKey(key) {
    return UNQUOTED_KEY.test(key) ? key : quoteToonString(key);
  }

  function encodeToonPrimitive(val, delimiter = ',') {
    if (val === null || val === undefined) return 'null';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : 'null';
    const str = String(val);
    return needsToonQuotes(str, delimiter) ? quoteToonString(str) : str;
  }

  function serializeToon(obj) {
    const lines = [];
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        if (val.length === 0) {
          lines.push(`${encodeToonKey(key)}[0]:`);
          continue;
        }
        const first = val[0];
        if (typeof first === 'object' && first !== null) {
          const fields = Object.keys(first);
          lines.push(`${encodeToonKey(key)}[${val.length}]{${fields.map(encodeToonKey).join(',')}}:`);
          for (const item of val) {
            const row = fields.map((f) => encodeToonPrimitive(item[f], ','));
            lines.push('  ' + row.join(','));
          }
        }
      } else if (typeof val === 'object' && val !== null) {
        lines.push(`${encodeToonKey(key)}:`);
        for (const [k, v] of Object.entries(val)) {
          lines.push(`  ${encodeToonKey(k)}: ${encodeToonPrimitive(v)}`);
        }
      } else {
        lines.push(`${encodeToonKey(key)}: ${encodeToonPrimitive(val)}`);
      }
    }
    return lines.join('\n');
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Export aborted by user', 'AbortError'));
        });
      }
    });
  }

  function getMediaPlaceholder(media) {
    if (!media) return null;
    const type = media._;

    if (type === 'messageMediaPhoto') return '<photo>';
    if (type === 'messageMediaGeo' || type === 'messageMediaVenue') return '<location>';
    if (type === 'messageMediaContact') return '<contact>';
    if (type === 'messageMediaPoll') return '<poll>';
    if (type === 'messageMediaDice') return '<dice>';

    if (type === 'messageMediaDocument') {
      const doc = media.document;
      if (!doc) return '<document>';

      const attrs = doc.attributes || [];
      const isSticker = attrs.some((a) => a._ === 'documentAttributeSticker');
      if (isSticker) return '<sticker>';

      const isVoice = attrs.some((a) => a._ === 'documentAttributeAudio' && a.voice);
      if (isVoice) return '<voice message>';

      const isRound = attrs.some((a) => a._ === 'documentAttributeVideo' && a.round_message);
      if (isRound) return '<video message>';

      const isVideo = attrs.some((a) => a._ === 'documentAttributeVideo');
      if (isVideo) return '<video>';

      const isAudio = attrs.some((a) => a._ === 'documentAttributeAudio');
      if (isAudio) return '<audio>';

      const fileNameAttr = attrs.find((a) => a._ === 'documentAttributeFilename');
      return fileNameAttr ? `<file: ${fileNameAttr.file_name}>` : '<document>';
    }

    return '<attachment>';
  }

  function getPeerTitle(peerId) {
    const peer = win.apiManagerProxy?.mirrors?.peers?.[peerId];
    if (!peer) return `ID ${peerId}`;
    if (peer.title) return peer.title;
    const parts = [peer.first_name, peer.last_name].filter(Boolean);
    return parts.join(' ') || peer.username || `ID ${peerId}`;
  }

  function formatMessage(msg, peerId) {
    const myId = win.rootScope?.myId;
    const fromId = msg.from_id?.user_id || msg.from_id?.channel_id || msg.peer_id?.user_id || peerId;
    const isOut = fromId === myId;

    let text = msg.message || '';
    if (!text && msg.media) {
      text = getMediaPlaceholder(msg.media) || '';
    }

    return {
      id: msg.mid || msg.id,
      date_unixtime: msg.date,
      date: new Date(msg.date * 1000).toISOString(),
      from: getPeerTitle(fromId),
      from_id: fromId,
      is_outgoing: isOut,
      text: text,
      reply_to_message_id: msg.reply_to?.reply_to_msg_id || null
    };
  }

  function triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function updateProgressToast(count, isFinished = false) {
    let toast = document.getElementById(CONFIG.progressToastId);

    if (isFinished) {
      if (toast) {
        toast.textContent = `Export complete: ${count} messages saved`;
        setTimeout(() => toast?.remove(), 2500);
      }
      return;
    }

    if (!toast) {
      toast = document.createElement('div');
      toast.id = CONFIG.progressToastId;
      toast.style.cssText = `
        position: fixed;
        bottom: 72px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--surface-color, #242424);
        color: var(--text-color, #ffffff);
        border: 1px solid var(--border-color, rgba(127, 127, 127, 0.25));
        border-radius: 20px;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 10000;
        backdrop-filter: blur(8px);
      `;

      const textSpan = document.createElement('span');
      textSpan.className = 'tg-export-progress-text';

      const stopBtn = document.createElement('button');
      stopBtn.textContent = 'Stop & Save';
      stopBtn.style.cssText = `
        background: var(--primary-color, #3390ec);
        color: #ffffff;
        border: none;
        border-radius: 12px;
        padding: 3px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      `;
      stopBtn.onclick = () => {
        if (activeAbortController) {
          activeAbortController.abort();
        }
      };

      toast.appendChild(textSpan);
      toast.appendChild(stopBtn);
      document.body.appendChild(toast);
    }

    const textSpan = toast.querySelector('.tg-export-progress-text');
    if (textSpan) {
      textSpan.textContent = `Exporting (${activeFormat.toUpperCase()}): ${count} messages...`;
    }
  }

  function closeActiveMenu() {
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  async function exportChat(format) {
    const chat = win.appImManager?.chat;
    const peerId = chat?.peerId;

    if (!peerId) {
      alert('Open a conversation first.');
      return;
    }

    const messagesManager = win.rootScope?.managers?.appMessagesManager;
    const apiProxy = win.apiManagerProxy;

    if (!messagesManager || !apiProxy) {
      alert('Telegram Web K MTProto layer is not available.');
      return;
    }

    activeAbortController = new AbortController();
    activeFormat = format;
    activeExportCount = 0;
    const signal = activeAbortController.signal;

    updateProgressToast(0);

    const chatTitle = getPeerTitle(peerId);
    const collectedMids = new Set();
    const resultMessages = [];

    let offsetId = 0;

    try {
      while (!signal.aborted) {
        const res = await messagesManager.getHistory({
          peerId: peerId,
          threadId: chat.threadId,
          limit: CONFIG.batchLimit,
          offsetId: offsetId,
          addOffset: 0
        });

        const history = res.history || [];
        if (history.length === 0) break;

        let addedInBatch = 0;
        let minMid = Infinity;

        for (const mid of history) {
          minMid = Math.min(minMid, mid);
          if (!collectedMids.has(mid)) {
            collectedMids.add(mid);
            const rawMsg = apiProxy.getMessageByPeer(peerId, mid);
            if (rawMsg) {
              resultMessages.push(formatMessage(rawMsg, peerId));
              addedInBatch++;
            }
          }
        }

        activeExportCount = resultMessages.length;
        updateProgressToast(activeExportCount);

        if (res.isEnd?.top || res.isEnd?.both || addedInBatch === 0 || minMid === offsetId) {
          break;
        }

        offsetId = minMid;
        await sleep(CONFIG.requestDelayMs, signal);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Chat Exporter Error]', err);
        alert(`Export failed: ${err.message}`);
      }
    } finally {
      activeAbortController = null;
      activeFormat = null;
    }

    if (resultMessages.length > 0) {
      resultMessages.sort((a, b) => a.id - b.id);
      const payload = {
        chat_title: chatTitle,
        peer_id: peerId,
        exported_at: new Date().toISOString(),
        total_messages: resultMessages.length,
        messages: resultMessages
      };

      const safeTitle = chatTitle.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

      if (format === 'toon') {
        triggerDownload(serializeToon(payload), `tg_${safeTitle}_${timestamp}.toon`, 'text/plain;charset=utf-8');
      } else {
        triggerDownload(JSON.stringify(payload, null, 2), `tg_${safeTitle}_${timestamp}.json`, 'application/json;charset=utf-8');
      }

      updateProgressToast(resultMessages.length, true);
    } else {
      const toast = document.getElementById(CONFIG.progressToastId);
      if (toast) toast.remove();
    }
  }

  function createMenuItem(id, iconChar, labelText, onClick) {
    const item = document.createElement('div');
    item.id = id;
    item.className = 'btn-menu-item rp-overflow';
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '0');

    const icon = document.createElement('span');
    icon.className = 'tgico btn-menu-item-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconChar;

    const label = document.createElement('span');
    label.className = 'i18n btn-menu-item-text';
    label.textContent = labelText;

    item.appendChild(icon);
    item.appendChild(label);

    item.onclick = (e) => {
      e.stopPropagation();
      closeActiveMenu();
      onClick();
    };

    return item;
  }

  function injectIntoMenu(menu) {
    if (menu.querySelector(`#${CONFIG.itemJsonId}`) || menu.querySelector(`#${CONFIG.itemStopId}`)) {
      return;
    }

    const items = Array.from(menu.querySelectorAll('.btn-menu-item'));
    const isChatMenu = items.some((it) => {
      const text = it.innerText || '';
      return text.includes('Select Messages') || text.includes('Clear history') || text.includes('Change Wallpaper') || text.includes('Mute');
    });

    if (!isChatMenu) return;

    const anchorItem = items.find((it) => it.innerText.includes('Select Messages')) || items[0];
    if (!anchorItem) return;

    if (activeAbortController) {
      const stopItem = createMenuItem(
        CONFIG.itemStopId,
        '',
        `Stop Export (${activeExportCount})`,
        () => {
          if (activeAbortController) {
            activeAbortController.abort();
          }
        }
      );
      anchorItem.after(stopItem);
      return;
    }

    const itemToon = createMenuItem(CONFIG.itemToonId, '', 'Export Chat (TOON)', () => exportChat('toon'));
    const itemJson = createMenuItem(CONFIG.itemJsonId, '', 'Export Chat (JSON)', () => exportChat('json'));

    anchorItem.after(itemToon);
    anchorItem.after(itemJson);
  }

  const observer = new MutationObserver(() => {
    const activeMenus = document.querySelectorAll('.btn-menu.active');
    activeMenus.forEach(injectIntoMenu);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
