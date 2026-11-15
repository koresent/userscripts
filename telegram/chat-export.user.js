// ==UserScript==
// @name           ⚙ [Telegram Web K] Chat Exporter
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
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
    btnContainerId: 'tg-export-actions',
    btnJsonId: 'tg-export-json-btn',
    btnToonId: 'tg-export-toon-btn'
  };

  let activeAbortController = null;

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
    const signal = activeAbortController.signal;

    const btnJson = document.getElementById(CONFIG.btnJsonId);
    const btnToon = document.getElementById(CONFIG.btnToonId);
    const activeBtn = format === 'toon' ? btnToon : btnJson;
    const inactiveBtn = format === 'toon' ? btnJson : btnToon;

    if (inactiveBtn) inactiveBtn.disabled = true;
    if (activeBtn) activeBtn.textContent = 'Stop (0)';

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

        if (activeBtn) {
          activeBtn.textContent = `Stop (${resultMessages.length})`;
        }

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
      if (btnJson) {
        btnJson.textContent = 'JSON';
        btnJson.disabled = false;
      }
      if (btnToon) {
        btnToon.textContent = 'TOON';
        btnToon.disabled = false;
      }
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
    }
  }

  function handleButtonClick(format) {
    if (activeAbortController) {
      activeAbortController.abort();
    } else {
      exportChat(format);
    }
  }

  function injectInterface() {
    if (document.getElementById(CONFIG.btnContainerId)) return;

    const topBar = document.querySelector('.top') || document.querySelector('.chat-info');
    if (!topBar) return;

    const container = document.createElement('div');
    container.id = CONFIG.btnContainerId;
    container.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-left: auto;
      margin-right: 12px;
      z-index: 100;
      user-select: none;
    `;

    const label = document.createElement('span');
    label.textContent = 'Export:';
    label.style.cssText = `
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      opacity: 0.65;
    `;

    const btnStyle = `
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
      border-radius: 6px;
      border: 1px solid var(--border-color, rgba(127, 127, 127, 0.25));
      background: var(--surface-color, rgba(127, 127, 127, 0.1));
      color: var(--text-color, inherit);
      cursor: pointer;
      transition: background 0.15s ease, opacity 0.15s ease;
    `;

    const btnJson = document.createElement('button');
    btnJson.id = CONFIG.btnJsonId;
    btnJson.textContent = 'JSON';
    btnJson.style.cssText = btnStyle;
    btnJson.onclick = () => handleButtonClick('json');

    const btnToon = document.createElement('button');
    btnToon.id = CONFIG.btnToonId;
    btnToon.textContent = 'TOON';
    btnToon.style.cssText = btnStyle;
    btnToon.onclick = () => handleButtonClick('toon');

    container.appendChild(label);
    container.appendChild(btnJson);
    container.appendChild(btnToon);
    topBar.appendChild(container);
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById(CONFIG.btnContainerId) && (document.querySelector('.top') || document.querySelector('.chat-info'))) {
      injectInterface();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
