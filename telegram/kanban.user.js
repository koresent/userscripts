// ==UserScript==
// @name           ⚙ [Telegram Web K] Kanban Board
// @namespace      github.com/koresent/userscripts
// @version        2.5.0
// @description    Native multi-board Kanban inside Telegram Web K backed by Saved Messages registry, forum topics, and MTProto
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/kanban.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/kanban.user.js
//
// @match          https://web.telegram.org/k/*
//
// @run-at         document-idle
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const STORAGE_KEYS = {
    activeBoardId: 'tg_kanban_active_board',
    outbox: 'tg_kanban_outbox'
  };

  const DEFAULT_COLUMNS = [
    { id: 'todo', title: 'To Do' },
    { id: 'in_progress', title: 'In Progress' },
    { id: 'done', title: 'Done' }
  ];

  const DEFAULT_PRIORITIES = [
    { id: 'urgent', label: 'Urgent', color: '#ff595a' },
    { id: 'high', label: 'High', color: '#ff8a48' },
    { id: 'medium', label: 'Medium', color: '#f5c518' },
    { id: 'low', label: 'Low', color: '#4caf50' }
  ];

  const KANBAN_BLOCK_REGEX = /\n*---\n*<!--kanban:(.*?)-->\s*$/s;
  const KANBAN_CONFIG_REGEX = /<!--kanban-config:(.*?)(?:-->|$)/s;
  const KANBAN_BOARDS_REGEX = /<!--kanban-boards:(.*?)-->/s;

  function parseConfigJson(rawJson) {
    if (!rawJson) return null;
    let str = rawJson.trim();
    if (str.endsWith('-->')) str = str.slice(0, -3).trim();

    try {
      return JSON.parse(str);
    } catch (_) {}

    try {
      let repaired = str;
      let inQuote = false;
      for (let i = 0; i < repaired.length; i++) {
        const c = repaired[i];
        if (c === '\\' && inQuote) {
          i++;
          continue;
        }
        if (c === '"') inQuote = !inQuote;
      }
      if (inQuote) repaired += '"';

      const stack = [];
      inQuote = false;
      for (let i = 0; i < repaired.length; i++) {
        const c = repaired[i];
        if (c === '\\' && inQuote) {
          i++;
          continue;
        }
        if (c === '"') {
          inQuote = !inQuote;
          continue;
        }
        if (!inQuote) {
          if (c === '{' || c === '[') stack.push(c);
          else if (c === '}' && stack.length && stack[stack.length - 1] === '{') stack.pop();
          else if (c === ']' && stack.length && stack[stack.length - 1] === '[') stack.pop();
        }
      }
      while (stack.length > 0) {
        const open = stack.pop();
        if (open === '{') repaired += '}';
        else if (open === '[') repaired += ']';
      }
      return JSON.parse(repaired);
    } catch (_) {
      return null;
    }
  }

  const ICONS = {
    kanban: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 4h4v16H4V4zm6 0h4v11h-4V4zm6 0h4v7h-4V4z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    more: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`,
    textDesc: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z"/></svg>`,
    checklist: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    move: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    image: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`
  };

  function normalizePeerId(id) {
    if (!id) return null;
    let str = String(id).trim();
    if (str.startsWith('-100')) {
      str = '-' + str.slice(4);
    }
    const num = Number(str);
    return Number.isFinite(num) ? num : null;
  }

  function parseBoardTarget(input) {
    if (!input) return null;
    const str = String(input).trim();

    // Link format: https://t.me/c/<channel_id>/<topic_id> or t.me/c/...
    const matchC = str.match(/(?:https?:\/\/)?t\.me\/c\/(\d+)(?:\/(\d+))?/i);
    if (matchC) {
      const peerId = -Number(matchC[1]);
      const topicId = matchC[2] ? Number(matchC[2]) : null;
      return { peerId, topicId };
    }

    // Raw format: -100...:topic, -..., or bare peerId
    const matchRaw = str.match(/(-100\d+|\b-?\d{7,14}\b)(?:[:_/](\d+))?/);
    if (matchRaw) {
      let peerStr = matchRaw[1];
      if (peerStr.startsWith('-100')) {
        peerStr = '-' + peerStr.slice(4);
      }
      const peerId = Number(peerStr);
      const topicId = matchRaw[2] ? Number(matchRaw[2]) : null;
      return { peerId, topicId };
    }

    return null;
  }

  function getMessageThreadId(msg, peerId) {
    if (!msg) return null;
    if (msg.saved_peer_id) return msg.saved_peer_id;
    const replyTo = msg.reply_to;
    if (replyTo?._ === 'messageReplyHeader') {
      const topMid = replyTo.reply_to_top_id || replyTo.reply_to_msg_id;
      if (topMid) {
        if (peerId && win.apiManagerProxy) {
          const topMsg = win.apiManagerProxy.getMessageByPeer(peerId, topMid);
          if (topMsg?.id) return topMsg.id;
        }
        return topMid;
      }
    }
    if (msg._ === 'messageService' && msg.action?._ === 'messageActionTopicCreate') {
      return msg.id || msg.mid || null;
    }
    return null;
  }

  function getStoredOutbox() {
    if (typeof GM_getValue === 'function') {
      const stored = GM_getValue(STORAGE_KEYS.outbox, null);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
      }
    }
    return [];
  }

  function setStoredOutbox(items) {
    if (typeof GM_setValue === 'function') {
      GM_setValue(STORAGE_KEYS.outbox, JSON.stringify(items));
    }
    state.outbox = items;
  }

  const state = {
    myId: null,
    boardsRegistryMid: null,
    boards: [],
    activeBoardId: null,
    peerId: null,
    topicId: null,
    columns: DEFAULT_COLUMNS,
    priorities: DEFAULT_PRIORITIES,
    configMid: null,
    outbox: getStoredOutbox(),
    tasks: new Map(),
    isLoading: false,
    filterText: '',
    isKanbanActive: false,
    draggedMid: null,
    draggedColId: null,
    activeInlineCol: null,
    activeMenuColId: null,
    isProcessingOutbox: false,
    isSyncingRegistry: false
  };

  function create1x1PixelBlob() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, 1, 1);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  function getPriorityById(id) {
    if (!id) return null;
    return state.priorities.find((p) => p.id === id) || null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatInlineMarkdown(escapedText) {
    if (!escapedText) return '';
    return escapedText
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<em>$1</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\|\|(.+?)\|\|/g, '<span class="kanban-inline-spoiler">$1</span>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/_(.+?)_/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code class="kanban-inline-code">$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="kanban-md-link">$1</a>');
  }

  function renderMarkdownLine(lineText, lineIdx) {
    if (!lineText) return '<div class="kanban-row-empty">&nbsp;</div>';

    const checkMatch = lineText.match(/^(\s*[-*]\s+)\[([ xX])\]\s*(.*)$/);
    if (checkMatch) {
      const isChecked = checkMatch[2].toLowerCase() === 'x';
      const itemText = formatInlineMarkdown(escapeHtml(checkMatch[3]));
      return `
        <div class="kanban-row-checklist ${isChecked ? 'is-checked' : ''}">
          <input type="checkbox" class="kanban-row-checkbox" data-check-line="${lineIdx}" ${isChecked ? 'checked' : ''} />
          <span class="kanban-row-checktext ${isChecked ? 'strikethrough' : ''}">${itemText || '<span class="kanban-empty-placeholder">Empty item</span>'}</span>
        </div>
      `;
    }

    if (lineText.startsWith('### ')) {
      return `<h3 class="kanban-row-h3">${formatInlineMarkdown(escapeHtml(lineText.slice(4)))}</h3>`;
    }
    if (lineText.startsWith('## ')) {
      return `<h2 class="kanban-row-h2">${formatInlineMarkdown(escapeHtml(lineText.slice(3)))}</h2>`;
    }
    if (lineText.startsWith('# ')) {
      return `<h1 class="kanban-row-h1">${formatInlineMarkdown(escapeHtml(lineText.slice(2)))}</h1>`;
    }

    if (lineText.startsWith('> ')) {
      return `<blockquote class="kanban-row-quote">${formatInlineMarkdown(escapeHtml(lineText.slice(2)))}</blockquote>`;
    }

    const bulletMatch = lineText.match(/^(\s*[-*]\s+)(.*)$/);
    if (bulletMatch) {
      return `<div class="kanban-row-bullet"><span class="kanban-bullet-dot">•</span> ${formatInlineMarkdown(escapeHtml(bulletMatch[2]))}</div>`;
    }

    const numMatch = lineText.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
    if (numMatch) {
      return `<div class="kanban-row-num"><span class="kanban-num-badge">${numMatch[2]}.</span> ${formatInlineMarkdown(escapeHtml(numMatch[4]))}</div>`;
    }

    if (lineText.trim().startsWith('```')) {
      return `<div class="kanban-row-code-fence"><code>${escapeHtml(lineText)}</code></div>`;
    }

    return `<div class="kanban-row-text">${formatInlineMarkdown(escapeHtml(lineText))}</div>`;
  }

  function renderMarkdown(mdText, taskMid = null) {
    if (!mdText) return '';
    const lines = mdText.split('\n');
    return lines.map((l, i) => renderMarkdownLine(l, i)).join('');
  }

  function renderCardChecklists(task) {
    if (!task.description) return '';
    const lines = task.description.split('\n');
    const items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^(\s*[-*]\s+)\[([ xX])\]\s*(.*)$/);
      if (m) {
        const isChecked = m[2].toLowerCase() === 'x';
        const text = m[3] || '';
        items.push({ lineIdx: i, isChecked, text });
      }
    }
    if (items.length === 0) return '';

    const maxItems = 4;
    const visible = items.slice(0, maxItems);
    const remaining = items.length - maxItems;

    return `
      <div class="kanban-card-checklists">
        ${visible.map((it) => `
          <div class="kanban-card-checklist-item ${it.isChecked ? 'is-checked' : ''}" data-task-mid="${task.mid}" data-line-index="${it.lineIdx}">
            <input type="checkbox" class="kanban-checklist-checkbox" ${it.isChecked ? 'checked' : ''} />
            <span class="kanban-card-checktext ${it.isChecked ? 'strikethrough' : ''}">${formatInlineMarkdown(escapeHtml(it.text))}</span>
          </div>
        `).join('')}
        ${remaining > 0 ? `<div class="kanban-card-checklist-more">+${remaining} more items...</div>` : ''}
      </div>
    `;
  }

  function createLiveMarkdownEditor({ container, initialText, onChange }) {
    let lines = (initialText || '').split('\n');
    if (lines.length === 0) lines = [''];
    let activeLineIdx = 0;
    let cursorCol = lines[0].length;

    function parseChecklistLine(str) {
      if (!str) return null;
      const m = str.match(/^(\s*[-*]\s+)\[([ xX])\]\s*(.*)$/);
      if (!m) return null;
      return {
        prefix: m[1],
        isChecked: m[2].toLowerCase() === 'x',
        itemText: m[3] || ''
      };
    }

    function autoResize(el) {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }

    function syncActiveLineValue() {
      const activeInput = container.querySelector('.kanban-line-input');
      if (!activeInput) return;
      const idx = Number(activeInput.dataset.lineIdx);
      if (isNaN(idx) || lines[idx] === undefined) return;
      lines[idx] = activeInput.value;
    }

    function render() {
      container.innerHTML = '';
      const frag = document.createDocumentFragment();

      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i];
        const row = document.createElement('div');
        row.dataset.lineIdx = String(i);

        if (i === activeLineIdx) {
          row.className = 'kanban-editor-row is-active';
          const input = document.createElement('textarea');
          input.rows = 1;
          input.className = 'kanban-line-input';
          input.value = lineText;
          input.dataset.lineIdx = String(i);
          input.placeholder = i === 0 && lines.length === 1 ? 'Task details, - [ ] checklist, **bold**, __italic__...' : '';
          row.appendChild(input);
        } else {
          row.className = 'kanban-editor-row is-rendered';
          row.innerHTML = renderMarkdownLine(lineText, i);
        }

        frag.appendChild(row);
      }

      container.appendChild(frag);

      if (activeLineIdx !== null) {
        const activeInput = container.querySelector(`.kanban-line-input[data-line-idx="${activeLineIdx}"]`);
        if (activeInput) {
          autoResize(activeInput);
          activeInput.focus();
          const pos = Math.min(cursorCol, activeInput.value.length);
          activeInput.setSelectionRange(pos, pos);
          activeInput.closest('.kanban-editor-row')?.scrollIntoView({ block: 'nearest' });
        }
      }
    }

    function toggleChecklistLine(idx) {
      if (lines[idx] === undefined) return;
      const cur = lines[idx];
      const checkInfo = parseChecklistLine(cur);
      if (!checkInfo) return;

      const nextChecked = !checkInfo.isChecked;
      lines[idx] = `${checkInfo.prefix}[${nextChecked ? 'x' : ' '}] ${checkInfo.itemText}`;

      const row = container.querySelector(`.kanban-editor-row[data-line-idx="${idx}"]`);
      if (row) {
        const checkRow = row.querySelector('.kanban-row-checklist');
        if (checkRow) checkRow.classList.toggle('is-checked', nextChecked);
        const cb = row.querySelector('.kanban-row-checkbox');
        if (cb) cb.checked = nextChecked;
        const textSpan = row.querySelector('.kanban-row-checktext');
        if (textSpan) textSpan.classList.toggle('strikethrough', nextChecked);
      }
      onChange();
    }

    container.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.kanban-row-checkbox');
      if (checkbox) {
        e.stopPropagation();
        const idx = Number(checkbox.dataset.checkLine);
        if (!isNaN(idx)) {
          toggleChecklistLine(idx);
        }
        return;
      }

      const renderedRow = e.target.closest('.kanban-editor-row.is-rendered');
      if (renderedRow) {
        const idx = Number(renderedRow.dataset.lineIdx);
        if (!isNaN(idx)) {
          syncActiveLineValue();
          activeLineIdx = idx;
          cursorCol = lines[idx].length;
          render();
        }
        return;
      }

      if (e.target === container) {
        syncActiveLineValue();
        if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
          lines.push('');
          activeLineIdx = lines.length - 1;
          cursorCol = 0;
          render();
          onChange();
        } else {
          activeLineIdx = lines.length - 1;
          cursorCol = lines[activeLineIdx].length;
          render();
        }
      }
    });

    container.addEventListener('input', (e) => {
      const input = e.target.closest('.kanban-line-input');
      if (!input) return;
      autoResize(input);
      const idx = Number(input.dataset.lineIdx);
      if (isNaN(idx) || lines[idx] === undefined) return;
      lines[idx] = input.value;
      cursorCol = input.selectionStart;
      onChange();
    });

    container.addEventListener('paste', (e) => {
      const input = e.target.closest('.kanban-line-input');
      if (!input) return;
      const pasted = (e.clipboardData || window.clipboardData)?.getData('text');
      if (pasted && pasted.includes('\n')) {
        e.preventDefault();
        syncActiveLineValue();
        const idx = Number(input.dataset.lineIdx);
        const selStart = input.selectionStart;
        const selEnd = input.selectionEnd;
        const left = input.value.slice(0, selStart);
        const right = input.value.slice(selEnd);
        const pastedLines = pasted.split('\n');

        pastedLines[0] = left + pastedLines[0];
        const lastIdx = pastedLines.length - 1;
        cursorCol = pastedLines[lastIdx].length;
        pastedLines[lastIdx] = pastedLines[lastIdx] + right;

        lines.splice(idx, 1, ...pastedLines);
        activeLineIdx = idx + lastIdx;
        render();
        onChange();
      } else {
        setTimeout(() => autoResize(input), 0);
      }
    });

    function wrapSelection(input, before, after) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const val = input.value;
      const selected = val.slice(start, end);
      input.value = val.slice(0, start) + before + selected + after + val.slice(end);
      const newPos = selected ? end + before.length + after.length : start + before.length;
      input.setSelectionRange(newPos, newPos);
      autoResize(input);
    }

    container.addEventListener('keydown', (e) => {
      const input = e.target.closest('.kanban-line-input');
      if (!input) return;

      const idx = Number(input.dataset.lineIdx);
      const val = input.value;
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const left = val.slice(0, start);
      const right = val.slice(end);
      const selected = val.slice(start, end);

      // --- Checklist auto-expansion ---
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (left.endsWith('- ') || left.endsWith('* ')) {
          e.preventDefault();
          input.value = left + '[ ] ' + right;
          const newPos = start + 4;
          input.setSelectionRange(newPos, newPos);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }

      // --- Autopair: * (bold / italic) ---
      if (e.key === '*' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, '*', '*');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const isEmptyPair = /(^|\s)\*+$/.test(left) && /^\*+($|\s|[.,!?;:])/.test(right);
        if (isEmptyPair) {
          e.preventDefault();
          input.value = left + '**' + right;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith('*')) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + '**' + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Autopair: _ (italic) ---
      if (e.key === '_' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, '_', '_');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const isEmptyPair = /(^|\s)_+$/.test(left) && /^_+($|\s|[.,!?;:])/.test(right);
        if (isEmptyPair) {
          e.preventDefault();
          input.value = left + '__' + right;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith('_')) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + '__' + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Autopair: ~ (strikethrough) ---
      if (e.key === '~' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, '~~', '~~');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const isEmptyPair = /(^|\s)~+$/.test(left) && /^~+($|\s|[.,!?;:])/.test(right);
        if (isEmptyPair) {
          e.preventDefault();
          input.value = left + '~~' + right;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith('~')) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + '~~' + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Autopair: | (spoiler) ---
      if (e.key === '|' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, '||', '||');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const isEmptyPair = /(^|\s)\|+$|^\|+$/.test(left) && /^\|+($|\s|[.,!?;:])/.test(right);
        if (isEmptyPair) {
          e.preventDefault();
          input.value = left + '||' + right;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith('|')) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + '||' + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Autopair: ` (code) ---
      if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, '`', '`');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (left.endsWith('``') && right.startsWith('``')) {
          e.preventDefault();
          input.value = left + '`' + '`' + right;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (left.endsWith('`') && right.startsWith('`')) {
          e.preventDefault();
          input.value = left + '``' + right;
          input.setSelectionRange(start + 1, start + 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith('`')) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + '``' + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Autopair: [ (brackets) ---
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, '[', ']');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith(']')) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + '[]' + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Autopair: ( or { ---
      if ((e.key === '(' || e.key === '{') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const closer = e.key === '(' ? ')' : '}';
        if (selected.length > 0) {
          e.preventDefault();
          wrapSelection(input, e.key, closer);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (right.startsWith(closer)) {
          e.preventDefault();
          input.setSelectionRange(start + 1, start + 1);
          return;
        }
        e.preventDefault();
        input.value = left + e.key + closer + right;
        input.setSelectionRange(start + 1, start + 1);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // --- Skip over closing bracket / quote ---
      if (['*', '`', '_', '~', '|', ']', ')', '}'].includes(e.key) && right.startsWith(e.key)) {
        e.preventDefault();
        input.setSelectionRange(start + 1, start + 1);
        return;
      }

      // --- Backspace between empty pairs ---
      if (e.key === 'Backspace' && start === end && start > 0) {
        if (start >= 2 && val.slice(start - 2, start) === '**' && val.slice(start, start + 2) === '**') {
          e.preventDefault();
          input.value = val.slice(0, start - 2) + val.slice(start + 2);
          input.setSelectionRange(start - 2, start - 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (start >= 2 && val.slice(start - 2, start) === '__' && val.slice(start, start + 2) === '__') {
          e.preventDefault();
          input.value = val.slice(0, start - 2) + val.slice(start + 2);
          input.setSelectionRange(start - 2, start - 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (start >= 2 && val.slice(start - 2, start) === '~~' && val.slice(start, start + 2) === '~~') {
          e.preventDefault();
          input.value = val.slice(0, start - 2) + val.slice(start + 2);
          input.setSelectionRange(start - 2, start - 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        if (start >= 2 && val.slice(start - 2, start) === '||' && val.slice(start, start + 2) === '||') {
          e.preventDefault();
          input.value = val.slice(0, start - 2) + val.slice(start + 2);
          input.setSelectionRange(start - 2, start - 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
        const charBefore = val[start - 1];
        const charAfter = val[start];
        const pairs = { '*': '*', '`': '`', '_': '_', '~': '~', '|': '|', '[': ']', '(': ')', '{': '}' };
        if (charBefore && pairs[charBefore] === charAfter) {
          e.preventDefault();
          input.value = val.slice(0, start - 1) + val.slice(start + 1);
          input.setSelectionRange(start - 1, start - 1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }

      // Shortcuts: Ctrl+B / Cmd+B (Bold)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        wrapSelection(input, '**', '**');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Shortcuts: Ctrl+I / Cmd+I (Italic)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        wrapSelection(input, '__', '__');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Shortcuts: Ctrl+K / Cmd+K (Link)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        wrapSelection(input, '[', '](url)');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Indent: Tab / Shift+Tab
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (input.value.startsWith('  ')) {
            input.value = input.value.slice(2);
            cursorCol = Math.max(0, start - 2);
            input.setSelectionRange(cursorCol, cursorCol);
          }
        } else {
          input.value = '  ' + input.value;
          cursorCol = start + 2;
          input.setSelectionRange(cursorCol, cursorCol);
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Enter key
      if (e.key === 'Enter') {
        e.preventDefault();
        syncActiveLineValue();

        const checkInfo = parseChecklistLine(val);
        if (checkInfo) {
          if (!checkInfo.itemText.trim()) {
            lines[idx] = '';
            activeLineIdx = idx;
            cursorCol = 0;
            render();
            onChange();
            return;
          }
          lines[idx] = left;
          const nextPrefix = `${checkInfo.prefix}[ ] `;
          lines.splice(idx + 1, 0, nextPrefix + right);
          activeLineIdx = idx + 1;
          cursorCol = nextPrefix.length;
          render();
          onChange();
          return;
        }

        const bulletMatch = left.match(/^(\s*[-*]\s+)(.*)$/);
        if (bulletMatch) {
          const prefix = bulletMatch[1];
          const content = bulletMatch[2];
          if (!content.trim() && !right.trim()) {
            lines[idx] = '';
            activeLineIdx = idx;
            cursorCol = 0;
            render();
            onChange();
            return;
          } else {
            lines[idx] = left;
            lines.splice(idx + 1, 0, prefix + right);
            activeLineIdx = idx + 1;
            cursorCol = prefix.length;
            render();
            onChange();
            return;
          }
        }

        const numMatch = left.match(/^(\s*)(\d+)(\.\s+)(.*)$/);
        if (numMatch) {
          const indent = numMatch[1];
          const num = parseInt(numMatch[2], 10);
          const after = numMatch[3];
          const content = numMatch[4];
          if (!content.trim() && !right.trim()) {
            lines[idx] = '';
            activeLineIdx = idx;
            cursorCol = 0;
            render();
            onChange();
            return;
          } else {
            lines[idx] = left;
            const newPrefix = `${indent}${num + 1}${after}`;
            lines.splice(idx + 1, 0, newPrefix + right);
            activeLineIdx = idx + 1;
            cursorCol = newPrefix.length;
            render();
            onChange();
            return;
          }
        }

        lines[idx] = left;
        lines.splice(idx + 1, 0, right);
        activeLineIdx = idx + 1;
        cursorCol = 0;
        render();
        onChange();
        return;
      }

      // Backspace at position 0
      if (e.key === 'Backspace' && start === 0 && end === 0) {
        if (idx > 0) {
          e.preventDefault();
          syncActiveLineValue();
          const prevLen = lines[idx - 1].length;
          lines[idx - 1] += lines[idx];
          lines.splice(idx, 1);
          activeLineIdx = idx - 1;
          cursorCol = prevLen;
          render();
          onChange();
          return;
        }
      }

      // ArrowUp
      if (e.key === 'ArrowUp') {
        if (idx > 0) {
          e.preventDefault();
          syncActiveLineValue();
          activeLineIdx = idx - 1;
          cursorCol = Math.min(start, lines[idx - 1].length);
          render();
          return;
        }
      }

      // ArrowDown
      if (e.key === 'ArrowDown') {
        if (idx < lines.length - 1) {
          e.preventDefault();
          syncActiveLineValue();
          activeLineIdx = idx + 1;
          cursorCol = Math.min(start, lines[idx + 1].length);
          render();
          return;
        }
      }
    });

    render();

    return {
      getValue() {
        syncActiveLineValue();
        return lines.join('\n');
      }
    };
  }

  function getChecklistStats(desc) {
    if (!desc) return null;
    const lines = desc.split('\n');
    let total = 0;
    let done = 0;
    for (const l of lines) {
      if (l.match(/^\s*[-*]\s+\[([ xX])\]\s+/)) {
        total++;
        if (l.match(/^\s*[-*]\s+\[[xX]\]\s+/)) {
          done++;
        }
      }
    }
    return total > 0 ? { total, done } : null;
  }

  function entitiesToMarkdown(text, entities) {
    if (!text || !Array.isArray(entities) || entities.length === 0) return text || '';
    const sorted = [...entities].sort((a, b) => {
      if (a.offset !== b.offset) return b.offset - a.offset;
      return a.length - b.length;
    });

    let res = text;
    for (const ent of sorted) {
      const start = ent.offset;
      const end = ent.offset + ent.length;
      if (typeof start !== 'number' || typeof end !== 'number' || start < 0 || end > res.length) continue;

      let prefix = '';
      let suffix = '';
      switch (ent._) {
        case 'messageEntityBold':
          prefix = '**';
          suffix = '**';
          break;
        case 'messageEntityItalic':
          prefix = '__';
          suffix = '__';
          break;
        case 'messageEntityStrike':
          prefix = '~~';
          suffix = '~~';
          break;
        case 'messageEntityCode':
          prefix = '`';
          suffix = '`';
          break;
        case 'messageEntityPre':
          prefix = '```\n';
          suffix = '\n```';
          break;
        case 'messageEntityTextUrl':
          prefix = '[';
          suffix = `](${ent.url || ''})`;
          break;
        case 'messageEntitySpoiler':
          prefix = '||';
          suffix = '||';
          break;
      }
      if (prefix && suffix) {
        res = res.slice(0, start) + prefix + res.slice(start, end) + suffix + res.slice(end);
      }
    }
    return res;
  }

  function parseTaskFromMessage(msg) {
    if (!msg || !msg.message) return null;
    const text = entitiesToMarkdown(msg.message, msg.entities);

    if (KANBAN_CONFIG_REGEX.test(text)) {
      try {
        const match = text.match(KANBAN_CONFIG_REGEX);
        if (match) {
          const parsed = parseConfigJson(match[1]);
          if (parsed) {
            if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
              state.columns = parsed.columns;
            }
            if (Array.isArray(parsed.priorities) && parsed.priorities.length > 0) {
              state.priorities = parsed.priorities;
            }
            state.configMid = msg.mid || msg.id;
          }
        }
      } catch (_) {}
      return null;
    }

    const match = text.match(KANBAN_BLOCK_REGEX);
    if (!match) return null;

    let meta = {};
    try {
      meta = JSON.parse(match[1]);
    } catch (_) {
      return null;
    }

    const body = text.replace(KANBAN_BLOCK_REGEX, '').trim();
    const firstLineEnd = body.indexOf('\n');
    let title = '';
    let description = '';

    if (firstLineEnd === -1) {
      title = body;
    } else {
      title = body.slice(0, firstLineEnd).trim();
      description = body.slice(firstLineEnd + 1).trim();
    }

    const photo = msg.media?.photo;
    let coverThumb = null;
    let hasRealCover = false;

    if (photo && Array.isArray(photo.sizes) && photo.sizes.length > 0) {
      const maxDim = photo.sizes.reduce((max, s) => {
        const w = s.w || s.width || 0;
        const h = s.h || s.height || 0;
        return Math.max(max, w, h);
      }, 0);

      if (maxDim > 1) {
        hasRealCover = true;
        coverThumb =
          photo.sizes.find((s) => ((s.w || 0) > 1 || (s.h || 0) > 1) && s.type === 'm') ||
          photo.sizes.find((s) => ((s.w || 0) > 1 || (s.h || 0) > 1) && s.type === 'x') ||
          photo.sizes.find((s) => (s.w || 0) > 1 || (s.h || 0) > 1) ||
          photo.sizes[0];
      }
    }

    const threadId = getMessageThreadId(msg, msg.peer_id || state.peerId);

    return {
      mid: msg.mid || msg.id,
      id: msg.id,
      threadId,
      rawMsg: msg,
      title,
      description,
      col: meta.col || state.columns[0]?.id || 'todo',
      pos: typeof meta.pos === 'number' ? meta.pos : 1000,
      prio: meta.prio && getPriorityById(meta.prio) ? meta.prio : null,
      date: msg.date,
      photo,
      coverThumb,
      hasRealCover,
      coverUrl: null,
      syncStatus: 'synced'
    };
  }

  function serializeTaskCaption(title, description, meta) {
    const jsonStr = JSON.stringify(meta);
    const body = description ? `${title.trim()}\n${description.trim()}` : title.trim();
    return `${body}\n\n---\n<!--kanban:${jsonStr}-->`;
  }

  async function ensureChatLoaded(peerId) {
    if (!peerId || peerId > 0) return;
    const chatId = Math.abs(peerId);
    const cm = win.rootScope?.managers?.appChatsManager;
    if (cm && typeof cm.getChat === 'function') {
      try {
        await cm.getChat(chatId);
      } catch (_) {}
    }
  }

  function getTelegramLimitInfo() {
    const isPrem = !!(win.rootScope?.premium || win.rootScope?.currentUser?.is_premium);
    const appCfg = win.apiManagerProxy?.getAppConfig?.() || {};
    const defaultLimit = appCfg.caption_length_limit_default || 1024;
    const premiumLimit = appCfg.caption_length_limit_premium || 4096;
    const maxLimit = isPrem ? premiumLimit : defaultLimit;
    return { isPrem, maxLimit, defaultLimit, premiumLimit };
  }

  const api = {
    getManagers() {
      const mm = win.rootScope?.managers?.appMessagesManager;
      const apiProxy = win.apiManagerProxy;
      const afm = win.rootScope?.managers?.apiFileManager;
      return { mm, apiProxy, afm };
    },

    async loadBoardsRegistry() {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !apiProxy) return;

      const myId = win.rootScope?.myId || win.rootScope?.managers?.appUsersManager?.getSelf()?.id;
      if (!myId) return;
      state.myId = myId;

      try {
        const res = await mm.getHistory({
          peerId: myId,
          limit: 50,
          offsetId: 0
        });

        const history = res.history || [];
        let foundBoards = [];

        for (const mid of history) {
          const raw = apiProxy.getMessageByPeer(myId, mid);
          if (raw?.message) {
            const hasTag = KANBAN_BOARDS_REGEX.test(raw.message);

            if (hasTag) {
              state.boardsRegistryMid = raw.mid || raw.id;

              let jsonBoards = [];
              try {
                const match = raw.message.match(KANBAN_BOARDS_REGEX);
                const parsed = JSON.parse(match[1]);
                if (Array.isArray(parsed)) {
                  jsonBoards = parsed;
                }
              } catch (_) {}

              const lines = raw.message.split('\n');

              for (const line of lines) {
                const target = parseBoardTarget(line);
                if (target) {
                  const id = 'board_' + (target.topicId ? `${target.peerId}_${target.topicId}` : target.peerId);
                  if (!foundBoards.some((b) => b.id === id)) {
                    let title = null;
                    const jsonMatch = jsonBoards.find(
                      (jb) => normalizePeerId(jb.peerId) === target.peerId && (jb.topicId ? Number(jb.topicId) : null) === target.topicId
                    );
                    if (jsonMatch?.title) {
                      title = jsonMatch.title;
                    } else {
                      const mPre = line.match(/^[•\-*]?\s*([^:]+):\s*https?:\/\//i);
                      const mMd = line.match(/^[•\-*]?\s*\[([^\]]+)\]\(https?:\/\//i);
                      const mSuf = line.match(/https?:\/\/\S+\s*[-–—]\s*(.+)$/i);
                      if (mPre) title = mPre[1].trim();
                      else if (mMd) title = mMd[1].trim();
                      else if (mSuf) title = mSuf[1].trim();
                    }

                    foundBoards.push({
                      id,
                      peerId: target.peerId,
                      topicId: target.topicId,
                      title: title,
                      iconEmojiId: jsonMatch?.iconEmojiId || null,
                      emojiRaw: jsonMatch?.emojiRaw || null
                    });
                  }
                }
              }

              for (const jb of jsonBoards) {
                const normPeer = normalizePeerId(jb.peerId);
                const normTopic = jb.topicId ? Number(jb.topicId) : null;
                const id = jb.id || 'board_' + (normTopic ? `${normPeer}_${normTopic}` : normPeer);
                if (normPeer !== null && !foundBoards.some((b) => b.id === id)) {
                  foundBoards.push({
                    id,
                    peerId: normPeer,
                    topicId: normTopic,
                    title: jb.title || null,
                    iconEmojiId: jb.iconEmojiId || null,
                    emojiRaw: jb.emojiRaw || null
                  });
                }
              }

              if (foundBoards.length > 0 || hasTag) {
                break;
              }
            }
          }
        }

        state.boards = foundBoards;

        const pm = win.rootScope?.managers?.appPeersManager;
        const am = win.rootScope?.managers?.apiManager;
        const em = win.rootScope?.managers?.appEmojiManager;

        for (const b of state.boards) {
          if (b.peerId) {
            await ensureChatLoaded(b.peerId);
          }
        }

        const peerTopicMap = new Map();
        for (const b of state.boards) {
          if (b.peerId && b.topicId) {
            if (!peerTopicMap.has(b.peerId)) {
              peerTopicMap.set(b.peerId, []);
            }
            peerTopicMap.get(b.peerId).push(b);
          }
        }

        if (pm && am) {
          for (const [peerId, topicBoards] of peerTopicMap.entries()) {
            try {
              const inputPeer = await pm.getInputPeerById(peerId);
              if (inputPeer) {
                const topicIds = topicBoards.map((b) => b.topicId);
                const res = await am.invokeApi('messages.getForumTopicsByID', {
                  peer: inputPeer,
                  topics: topicIds
                });
                for (const t of res?.topics || []) {
                  const b = topicBoards.find((tb) => tb.topicId === t.id);
                  if (b) {
                    if (t.title) b.title = t.title;
                    if (t.icon_emoji_id) {
                      b.iconEmojiId = String(t.icon_emoji_id);
                      if (em) {
                        try {
                          const doc = await em.getCustomEmojiDocument(b.iconEmojiId);
                          b.emojiRaw = doc?.stickerEmojiRaw || null;
                        } catch (_) {}
                      }
                    }
                  }
                }
              }
            } catch (topicErr) {
              console.warn('[Kanban] Failed to fetch forum topics for peer:', peerId, topicErr);
            }
          }
        }

        for (const b of state.boards) {
          if (!b.title) {
            b.title = await this.resolveBoardTitle(b.peerId, b.topicId);
          }
        }

        if (state.boards.length > 0) {
          const savedActiveId = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEYS.activeBoardId, null) : null;
          const initialBoard = state.boards.find((b) => b.id === savedActiveId) || state.boards[0];
          if (initialBoard) {
            await this.selectBoard(initialBoard.id);
          }
        } else {
          state.activeBoardId = null;
          state.peerId = null;
          state.topicId = null;
        }

        renderSidebarTabs();
      } catch (err) {
        // Silently ignore to avoid console spam
      }
    },

    async resolveBoardTitle(peerId, topicId) {
      const chatId = Math.abs(peerId);
      const cm = win.rootScope?.managers?.appChatsManager;
      if (cm) {
        try {
          const chat = await cm.getChat(chatId);
          if (chat?.title) {
            return topicId ? `${chat.title} (#${topicId})` : chat.title;
          }
        } catch (_) {}
      }
      return topicId ? `Topic #${topicId}` : `Board ${chatId}`;
    },

    async selectBoard(boardId) {
      const board = state.boards.find((b) => b.id === boardId);
      if (!board) return;

      const isSameBoard = state.activeBoardId === board.id;
      state.activeBoardId = board.id;
      state.peerId = board.peerId;
      state.topicId = board.topicId || null;

      if (!isSameBoard) {
        state.configMid = null;
        state.tasks.clear();
      }

      if (typeof GM_setValue === 'function') {
        GM_setValue(STORAGE_KEYS.activeBoardId, board.id);
      }

      renderSidebarTabs();

      if (state.isKanbanActive) {
        await this.loadHistory(state.peerId, state.topicId);
      }
    },

    async syncBoardsRegistryToSavedMessages(boards = state.boards) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !state.myId) return;

      state.isSyncingRegistry = true;
      try {
        const payload = boards.map((b) => ({
          id: b.id,
          peerId: b.peerId,
          topicId: b.topicId || null,
          title: b.title || null
        }));

        const linksList = boards
          .map((b) => {
            const rawId = Math.abs(b.peerId);
            const link = b.topicId ? `https://t.me/c/${rawId}/${b.topicId}` : `https://t.me/c/${rawId}`;
            return `• ${b.title || 'Kanban'}: ${link}`;
          })
          .join('\n');

        const text = `📋 Telegram Kanban Boards Registry\nThis message maintains your active Kanban boards and topics.\n\n${linksList}\n\n---\n<!--kanban-boards:${JSON.stringify(payload)}-->`;

        let msgToEdit = null;
        if (state.boardsRegistryMid && apiProxy) {
          msgToEdit = apiProxy.getMessageByPeer(state.myId, state.boardsRegistryMid);
        }

        if (msgToEdit) {
          await mm.editMessage(msgToEdit, text);
        } else {
          const sent = await mm.sendText({
            peerId: state.myId,
            text: text
          });
          if (sent?.message) {
            state.boardsRegistryMid = sent.message.mid || sent.message.id;
          }
        }
      } catch (err) {
        console.warn('[Kanban] Sync boards registry error:', err);
      } finally {
        setTimeout(() => {
          state.isSyncingRegistry = false;
        }, 1000);
      }
    },

    async loadBoardConfig(peerId, topicId) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !apiProxy || !peerId) return;

      await ensureChatLoaded(peerId);
      try {
        const pinned = await mm.getPinnedMessage(peerId, topicId || undefined);
        let configMsg = null;

        if (pinned?.maxId) {
          const msg = apiProxy.getMessageByPeer(peerId, pinned.maxId);
          if (msg?.message && KANBAN_CONFIG_REGEX.test(msg.message)) {
            configMsg = msg;
          }
        }

        if (configMsg) {
          const match = configMsg.message.match(KANBAN_CONFIG_REGEX);
          if (match) {
            const parsed = parseConfigJson(match[1]);
            if (parsed) {
              if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
                state.columns = parsed.columns;
              }
              if (Array.isArray(parsed.priorities) && parsed.priorities.length > 0) {
                state.priorities = parsed.priorities;
              }
              state.configMid = configMsg.mid || configMsg.id;
            }
          }
        }
      } catch (err) {
        console.warn('[Kanban] Could not load board config from pinned message:', err);
      }
    },

    async syncBoardConfigToGroup() {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !state.peerId) return;

      await ensureChatLoaded(state.peerId);
      const payload = {
        columns: state.columns,
        priorities: state.priorities,
        updatedAt: Math.floor(Date.now() / 1000)
      };
      const text = `Kanban Board Manifest\nThis pinned message maintains columns and board configuration.\n\n---\n<!--kanban-config:${JSON.stringify(payload)}-->`;

      try {
        let msgToEdit = null;
        if (state.configMid && apiProxy) {
          msgToEdit = apiProxy.getMessageByPeer(state.peerId, state.configMid);
        }

        if (msgToEdit) {
          await mm.editMessage(msgToEdit, text);
        } else {
          const sent = await mm.sendText({
            peerId: state.peerId,
            threadId: state.topicId || undefined,
            text: text
          });
          if (sent?.message) {
            state.configMid = sent.message.mid || sent.message.id;
            if (mm.updatePinnedMessage) {
              await mm.updatePinnedMessage(state.peerId, state.configMid, false, true);
            }
          }
        }
      } catch (err) {
        console.warn('[Kanban] Sync config error:', err);
      }
    },

    async loadHistory(peerId = state.peerId, topicId = state.topicId) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !apiProxy || !peerId) return;

      await ensureChatLoaded(peerId);
      state.isLoading = true;
      renderKanbanView();

      await this.loadBoardConfig(peerId, topicId);

      const collectedTasks = new Map();
      let offsetId = 0;
      const limit = 100;

      try {
        while (true) {
          const res = await mm.getHistory({
            peerId: peerId,
            threadId: topicId || undefined,
            limit: limit,
            offsetId: offsetId,
            addOffset: 0
          });

          const history = res.history || [];
          if (history.length === 0) break;

          let minMid = Infinity;
          for (const mid of history) {
            minMid = Math.min(minMid, mid);
            const rawMsg = apiProxy.getMessageByPeer(peerId, mid);
            const task = parseTaskFromMessage(rawMsg);
            if (task) {
              if (topicId && task.threadId && task.threadId !== topicId) {
                const topMsg = apiProxy.getMessageByPeer(peerId, task.threadId);
                if (topMsg && topMsg.id !== topicId) {
                  continue;
                }
              }
              const existing = state.tasks.get(task.mid);
              if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
              collectedTasks.set(task.mid, task);
            }
          }

          if (res.isEnd?.top || res.isEnd?.both || history.length < limit || minMid === offsetId) {
            break;
          }
          offsetId = minMid;
        }

        if (state.tasks.size === 0) {
          state.tasks = collectedTasks;
        } else {
          for (const [mid, task] of collectedTasks) {
            const existing = state.tasks.get(mid);
            if (existing) {
              if (existing.coverUrl) task.coverUrl = existing.coverUrl;
              if (existing.syncStatus === 'syncing') continue;
            }
            state.tasks.set(mid, task);
          }
        }
      } catch (err) {
        console.error('[Kanban] Load history error:', err);
      } finally {
        state.isLoading = false;
        renderKanbanView();
        api.resolveCovers();
        api.processOutbox();
      }
    },

    async resolveCovers() {
      const { afm } = this.getManagers();
      if (!afm) return;

      for (const task of state.tasks.values()) {
        if (task.hasRealCover && !task.coverUrl && task.photo && task.coverThumb) {
          try {
            const url = await afm.downloadMediaURL({ media: task.photo, thumb: task.coverThumb });
            if (url) {
              task.coverUrl = url;
              const cardEl = document.querySelector(`[data-card-mid="${task.mid}"]`);
              if (cardEl) {
                let imgEl = cardEl.querySelector('.kanban-card-cover');
                if (!imgEl) {
                  imgEl = document.createElement('img');
                  imgEl.className = 'kanban-card-cover';
                  imgEl.alt = 'Cover';
                  const body = cardEl.querySelector('.kanban-card-body');
                  if (body) {
                    body.before(imgEl);
                  } else {
                    cardEl.prepend(imgEl);
                  }
                }
                imgEl.src = url;
                imgEl.style.display = 'block';
              }
            }
          } catch (_) {}
        }
      }
    },

    async createTask(title, description, col, prio = null, coverFile = null) {
      const { mm } = this.getManagers();
      if (!mm || !state.peerId) return;

      await ensureChatLoaded(state.peerId);
      const colTasks = Array.from(state.tasks.values())
        .filter((t) => t.col === col)
        .sort((a, b) => a.pos - b.pos);
      const lastPos = colTasks.length > 0 ? colTasks[colTasks.length - 1].pos : 0;
      const nextPos = lastPos + 1000;

      const meta = { col, pos: nextPos };
      if (prio) meta.prio = prio;

      const caption = serializeTaskCaption(title, description, meta);

      let fileToUpload = coverFile;
      if (!fileToUpload) {
        const blob = await create1x1PixelBlob();
        fileToUpload = new File([blob], 'cover_1x1.png', { type: 'image/png' });
      }

      const tempMid = 'temp_' + Date.now();
      const optimisticTask = {
        mid: tempMid,
        id: null,
        threadId: state.topicId,
        title,
        description,
        col,
        pos: nextPos,
        prio,
        date: Math.floor(Date.now() / 1000),
        photo: null,
        hasRealCover: !!coverFile,
        coverUrl: coverFile ? URL.createObjectURL(coverFile) : null,
        syncStatus: 'syncing'
      };

      state.tasks.set(tempMid, optimisticTask);
      renderKanbanView();

      try {
        const sendResult = await mm.sendFile({
          peerId: state.peerId,
          threadId: state.topicId || undefined,
          file: fileToUpload,
          caption: caption,
          isMedia: true
        });

        if (sendResult?.message) {
          state.tasks.delete(tempMid);
          optimisticTask.mid = sendResult.message.mid;
          optimisticTask.rawMsg = sendResult.message;
          state.tasks.set(sendResult.message.mid, optimisticTask);

          if (mm.invokeAfterMessageIsSent) {
            mm.invokeAfterMessageIsSent(state.peerId, sendResult.message.mid, 'kanban_create', (finalMsg) => {
              const confirmedTask = parseTaskFromMessage(finalMsg);
              if (confirmedTask) {
                if (optimisticTask.coverUrl) confirmedTask.coverUrl = optimisticTask.coverUrl;
                confirmedTask.syncStatus = 'synced';
                state.tasks.delete(sendResult.message.mid);
                state.tasks.set(confirmedTask.mid, confirmedTask);
                renderKanbanView();
              }
            });
          }
        }
      } catch (err) {
        console.error('[Kanban] Create task error, queueing into outbox:', err);
        optimisticTask.syncStatus = 'error';
        renderKanbanView();

        const outbox = getStoredOutbox();
        outbox.push({
          id: 'op_' + Date.now(),
          type: 'create',
          peerId: state.peerId,
          topicId: state.topicId,
          payload: { title, description, col, prio }
        });
        setStoredOutbox(outbox);
      }
    },

    async updateTaskMeta(task, newMeta, newTitle, newDescription) {
      const { mm } = this.getManagers();
      if (!mm) return;

      await ensureChatLoaded(state.peerId);
      const title = newTitle !== undefined ? newTitle : task.title;
      const desc = newDescription !== undefined ? newDescription : task.description;
      const meta = {
        col: newMeta.col !== undefined ? newMeta.col : task.col,
        pos: newMeta.pos !== undefined ? newMeta.pos : task.pos
      };

      const finalPrio = newMeta.prio !== undefined ? newMeta.prio : task.prio;
      if (finalPrio) meta.prio = finalPrio;

      task.title = title;
      task.description = desc;
      task.col = meta.col;
      task.pos = meta.pos;
      task.prio = finalPrio;
      task.syncStatus = 'syncing';
      renderKanbanView();

      const newCaption = serializeTaskCaption(title, desc, meta);

      try {
        if (!task.rawMsg) {
          throw new Error('Message not yet confirmed by server');
        }
        await mm.editMessage(task.rawMsg, newCaption);
        task.syncStatus = 'synced';
        renderKanbanView();
      } catch (err) {
        console.error('[Kanban] Edit message error, queueing into outbox:', err);
        task.syncStatus = 'error';
        renderKanbanView();

        const outbox = getStoredOutbox();
        outbox.push({
          id: 'op_' + Date.now(),
          type: 'update_meta',
          peerId: state.peerId,
          mid: task.mid,
          payload: { meta, title, desc }
        });
        setStoredOutbox(outbox);
      }
    },

    async updateTaskCover(task, file) {
      const { mm } = this.getManagers();
      if (!mm || !task.rawMsg) return;

      task.syncStatus = 'syncing';
      renderKanbanView();

      const meta = { col: task.col, pos: task.pos };
      if (task.prio) meta.prio = task.prio;
      const caption = serializeTaskCaption(task.title, task.description, meta);

      try {
        await mm.editMessageMedia({
          message: task.rawMsg,
          text: caption,
          sendFileDetails: { file, isMedia: true },
          options: { isMedia: true }
        });
        task.syncStatus = 'synced';
        setTimeout(() => api.loadHistory(state.peerId, state.topicId), 800);
      } catch (err) {
        console.error('[Kanban] Update cover error:', err);
        task.syncStatus = 'error';
        renderKanbanView();
      }
    },

    async deleteTask(task) {
      const { mm } = this.getManagers();
      if (!mm || !task.mid || !state.peerId) return;

      try {
        await mm.deleteMessages(state.peerId, [task.mid], true);
        state.tasks.delete(task.mid);
        state.tasks.delete(String(task.mid));
        state.tasks.delete(Number(task.mid));
        renderKanbanView();
      } catch (err) {
        console.error('[Kanban] Delete task error, queueing into outbox:', err);
        const outbox = getStoredOutbox();
        outbox.push({
          id: 'op_' + Date.now(),
          type: 'delete',
          peerId: state.peerId,
          mid: task.mid
        });
        setStoredOutbox(outbox);
      }
    },

    async moveTaskToBoard(task, targetBoardId) {
      const targetBoard = state.boards.find((b) => b.id === targetBoardId);
      if (!targetBoard || !task || !state.peerId) return;

      const { mm, apiProxy, afm } = this.getManagers();
      if (!mm || !apiProxy) return;

      task.syncStatus = 'syncing';
      renderKanbanView();

      try {
        await ensureChatLoaded(targetBoard.peerId);

        let targetCol = DEFAULT_COLUMNS[0].id;
        try {
          const pinned = await mm.getPinnedMessage(targetBoard.peerId, targetBoard.topicId || undefined);
          if (pinned?.maxId) {
            const msg = apiProxy.getMessageByPeer(targetBoard.peerId, pinned.maxId);
            if (msg?.message && KANBAN_CONFIG_REGEX.test(msg.message)) {
              const match = msg.message.match(KANBAN_CONFIG_REGEX);
              const parsed = parseConfigJson(match[1]);
              if (Array.isArray(parsed?.columns) && parsed.columns.length > 0) {
                targetCol = parsed.columns[0].id;
              }
            }
          }
        } catch (_) {}

        let topPos = 1000;
        try {
          const res = await mm.getHistory({
            peerId: targetBoard.peerId,
            threadId: targetBoard.topicId || undefined,
            limit: 40,
            offsetId: 0
          });
          if (Array.isArray(res?.history)) {
            let minPos = Infinity;
            for (const mid of res.history) {
              const rawMsg = apiProxy.getMessageByPeer(targetBoard.peerId, mid);
              const parsed = parseTaskFromMessage(rawMsg);
              if (parsed && parsed.col === targetCol) {
                if (typeof parsed.pos === 'number' && parsed.pos < minPos) {
                  minPos = parsed.pos;
                }
              }
            }
            if (minPos !== Infinity) {
              topPos = minPos - 1000;
            }
          }
        } catch (_) {}

        const meta = { col: targetCol, pos: topPos };
        if (task.prio) meta.prio = task.prio;
        const caption = serializeTaskCaption(task.title, task.description, meta);

        let fileToUpload = null;
        if (task.hasRealCover) {
          if (!task.coverUrl && task.photo && task.coverThumb && afm) {
            try {
              task.coverUrl = await afm.downloadMediaURL({ media: task.photo, thumb: task.coverThumb });
            } catch (_) {}
          }
          if (task.coverUrl) {
            try {
              const res = await fetch(task.coverUrl);
              const blob = await res.blob();
              fileToUpload = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' });
            } catch (_) {}
          }
        }

        if (!fileToUpload) {
          const blob = await create1x1PixelBlob();
          fileToUpload = new File([blob], 'cover_1x1.png', { type: 'image/png' });
        }

        const sendResult = await mm.sendFile({
          peerId: targetBoard.peerId,
          threadId: targetBoard.topicId || undefined,
          file: fileToUpload,
          caption: caption,
          isMedia: true
        });

        if (sendResult?.message) {
          closeActiveModal();
          await this.deleteTask(task);
        } else {
          throw new Error('Message sending returned no confirmation');
        }
      } catch (err) {
        console.error('[Kanban] Move task error:', err);
        task.syncStatus = 'error';
        renderKanbanView();
        alert('Could not move task to target board: ' + (err.message || err));
      }
    },

    async processOutbox() {
      if (state.isProcessingOutbox) return;
      const outbox = getStoredOutbox();
      if (outbox.length === 0) return;

      state.isProcessingOutbox = true;
      const remaining = [];
      const { mm, apiProxy } = this.getManagers();

      for (const op of outbox) {
        try {
          if (!mm) throw new Error('Managers unavailable');

          if (op.type === 'create') {
            const { title, description, col, prio } = op.payload;
            const meta = { col, pos: Date.now() };
            if (prio) meta.prio = prio;
            const caption = serializeTaskCaption(title, description, meta);
            const blob = await create1x1PixelBlob();
            const file = new File([blob], 'cover_1x1.png', { type: 'image/png' });
            await mm.sendFile({
              peerId: op.peerId || state.peerId,
              threadId: op.topicId || undefined,
              file: file,
              caption: caption,
              isMedia: true
            });
          } else if (op.type === 'update_meta') {
            const raw = apiProxy.getMessageByPeer(op.peerId || state.peerId, op.mid);
            if (raw) {
              const caption = serializeTaskCaption(op.payload.title, op.payload.desc, op.payload.meta);
              await mm.editMessage(raw, caption);
            }
          } else if (op.type === 'delete') {
            await mm.deleteMessages(op.peerId || state.peerId, [op.mid], true);
          }
        } catch (err) {
          console.warn('[Kanban] Outbox op failed, will keep for next retry:', op, err);
          remaining.push(op);
        }
      }

      setStoredOutbox(remaining);
      state.isProcessingOutbox = false;

      if (remaining.length === 0 && state.isKanbanActive) {
        for (const task of state.tasks.values()) {
          if (task.syncStatus === 'error') task.syncStatus = 'synced';
        }
        renderKanbanView();
      }
    }
  };

  const STYLES = `
    #main-columns.is-kanban > #column-center,
    #main-columns.is-kanban > #column-left {
      display: none !important;
    }

    #kanban-board-container {
      display: none;
      flex: 1;
      height: 100%;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      position: relative;
      background: transparent !important;
      margin-block: var(--page-chats-padding, 8px);
      margin-inline-start: calc(var(--page-chats-padding, 8px) + var(--folders-sidebar-offset, 72px));
      margin-inline-end: var(--page-chats-padding, 8px);
      box-sizing: border-box;
    }

    #main-columns.is-kanban #kanban-board-container {
      display: flex !important;
    }

    .kanban-header {
      height: 52px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: transparent !important;
      border: none !important;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .kanban-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .kanban-board-title-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-color, #ebdbb2);
      background: rgba(255, 255, 255, 0.05);
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .kanban-search-input {
      max-width: 280px;
      width: 100%;
      height: 34px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      padding: 0 12px;
      color: var(--text-color, #ebdbb2);
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .kanban-search-input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--accent-color, #7daea3);
    }

    .kanban-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kanban-btn {
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      border: none;
      background: var(--accent-color, #7daea3);
      color: #1e1e1e;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: opacity 0.15s ease, transform 0.1s ease;
      user-select: none;
    }

    .kanban-btn:hover {
      opacity: 0.9;
    }

    .kanban-btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-color, #ebdbb2);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .kanban-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .kanban-btn-danger {
      background: #ea6962;
      color: #fff;
    }

    .kanban-columns-container {
      flex: 1;
      min-height: 0;
      display: flex;
      gap: 16px;
      padding: 8px 16px 16px 16px;
      overflow-x: auto;
      overflow-y: hidden;
      align-items: stretch;
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .kanban-columns-container::-webkit-scrollbar {
      height: 8px;
    }

    .kanban-columns-container::-webkit-scrollbar-track {
      background: transparent;
    }

    .kanban-columns-container::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
    }

    .kanban-columns-container::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.35);
    }

    .kanban-column {
      width: 320px;
      min-width: 320px;
      height: 100%;
      max-height: 100%;
      background: var(--surface-color, #282828);
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
      overflow: hidden;
      position: relative;
      box-sizing: border-box;
      flex-shrink: 0;
    }

    .kanban-column-header {
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
      user-select: none;
      cursor: grab;
      position: relative;
      flex-shrink: 0;
    }

    .kanban-column-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kanban-column-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--text-color, #ebdbb2);
    }

    .kanban-column-badge {
      font-size: 11px;
      padding: 2px 7px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--secondary-text-color, #a89984);
      border-radius: 10px;
      font-weight: 500;
    }

    .kanban-column-menu-btn {
      background: transparent;
      border: none;
      color: var(--secondary-text-color, #a89984);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .kanban-column-menu-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color, #ebdbb2);
    }

    .kanban-column-dropdown {
      position: absolute;
      top: 42px;
      right: 12px;
      background: #32302f;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      z-index: 100;
      min-width: 140px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .kanban-dropdown-item {
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-color, #ebdbb2);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kanban-dropdown-item:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .kanban-dropdown-item.is-danger {
      color: #ea6962;
    }

    .kanban-column-cards {
      flex: 1 1 auto;
      min-height: 0;
      padding: 10px;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      box-sizing: border-box;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .kanban-column-cards::-webkit-scrollbar {
      width: 6px;
    }

    .kanban-column-cards::-webkit-scrollbar-track {
      background: transparent;
    }

    .kanban-column-cards::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    .kanban-column-cards::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.35);
    }

    .kanban-card {
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
      border-radius: 8px;
      cursor: pointer;
      user-select: none;
      position: relative;
      transition: transform 0.12s ease, box-shadow 0.12s ease, border-color 0.12s ease;
      overflow: hidden;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .kanban-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .kanban-card-quick-actions {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      align-items: center;
      gap: 4px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s ease;
      z-index: 5;
    }

    .kanban-card:hover .kanban-card-quick-actions {
      opacity: 1;
      pointer-events: auto;
    }

    .kanban-card-quick-btn {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.55);
      border: none;
      color: var(--secondary-text-color, #a89984);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
    }

    .kanban-card-quick-btn:hover {
      background: rgba(0, 0, 0, 0.85);
    }

    .kanban-card-quick-move:hover {
      color: var(--accent-color, #7daea3);
    }

    .kanban-card-quick-del {
      color: #ea6962;
    }

    .kanban-card-quick-del:hover {
      background: rgba(234, 105, 98, 0.25) !important;
      color: #fff !important;
    }

    .kanban-card-move-dropdown {
      background: #32302f;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      min-width: 180px;
      max-width: 260px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .kanban-move-dropdown-header {
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--secondary-text-color, #a89984);
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .kanban-move-board-item {
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-color, #ebdbb2);
      cursor: pointer;
      display: flex;
      align-items: center;
      transition: background 0.1s ease, color 0.1s ease;
    }

    .kanban-move-board-item:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--accent-color, #7daea3);
    }

    .kanban-card-cover {
      width: 100%;
      height: 140px;
      object-fit: cover;
      display: block;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
    }

    .kanban-card-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .kanban-card-title {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--text-color, #ebdbb2);
      line-height: 1.4;
      word-break: break-word;
      padding-right: 56px;
    }

    .kanban-card-checklists {
      display: flex;
      flex-direction: column;
      gap: 3px;
      margin: 4px 0 2px 0;
    }

    .kanban-card-checklist-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-color, #ebdbb2);
      line-height: 1.35;
      cursor: default;
    }

    .kanban-card-checkbox,
    .kanban-checklist-checkbox,
    .kanban-row-checkbox {
      opacity: 1 !important;
      position: static !important;
      visibility: visible !important;
      z-index: 1 !important;
      appearance: auto !important;
      -webkit-appearance: auto !important;
      width: 15px !important;
      height: 15px !important;
      margin: 0 !important;
      cursor: pointer !important;
      accent-color: var(--accent-color, #7daea3);
      flex-shrink: 0;
    }

    .kanban-card-checktext {
      word-break: break-word;
    }

    .kanban-card-checktext.strikethrough {
      text-decoration: line-through;
      opacity: 0.55;
    }

    .kanban-card-checklist-more {
      font-size: 11px;
      color: var(--secondary-text-color, #a89984);
      font-style: italic;
      margin-top: 2px;
    }

    .kanban-editor-row.is-checklist {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kanban-line-input.has-check {
      flex: 1;
    }

    .kanban-line-input.strikethrough {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .kanban-card-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .kanban-priority-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 5px;
      letter-spacing: 0.2px;
    }

    .kanban-priority-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .kanban-badge-checklist {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: var(--secondary-text-color, #a89984);
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 6px;
      border-radius: 5px;
    }

    .kanban-badge-checklist.all-done {
      color: #a9b665;
    }

    .kanban-card-date {
      font-size: 11px;
      color: var(--secondary-text-color, #a89984);
      margin-left: auto;
    }

    .kanban-sync-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      margin-left: 2px;
      flex-shrink: 0;
    }

    .kanban-sync-dot.synced {
      background: var(--accent-color, #7daea3);
      opacity: 0.5;
    }

    .kanban-sync-dot.syncing {
      background: #e78a4e;
      animation: kanban-pulse 1s infinite alternate;
    }

    .kanban-sync-dot.error {
      background: #ea6962;
    }

    @keyframes kanban-pulse {
      0% { opacity: 0.3; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1.15); }
    }

    .kanban-checklist-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin: 4px 0;
      font-size: 13px;
      color: var(--text-color, #ebdbb2);
      line-height: 1.45;
    }

    .kanban-checklist-text.strikethrough {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .kanban-inline-code {
      background: rgba(255, 255, 255, 0.08);
      padding: 2px 5px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }

    .kanban-inline-spoiler {
      background: rgba(255, 255, 255, 0.2);
      color: transparent;
      border-radius: 3px;
      padding: 0 4px;
      cursor: pointer;
      user-select: none;
      transition: color 0.15s ease, background 0.15s ease;
    }

    .kanban-inline-spoiler:hover {
      color: inherit;
      background: rgba(255, 255, 255, 0.08);
      user-select: auto;
    }

    .kanban-code-block {
      background: rgba(0, 0, 0, 0.3);
      padding: 8px 10px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
      overflow-x: auto;
      margin: 6px 0;
    }

    .kanban-md-link {
      color: var(--accent-color, #7daea3);
      text-decoration: underline;
    }

    .kanban-md-gap {
      height: 8px;
    }

    .kanban-add-card-btn {
      width: 32px;
      height: 32px;
      margin: 8px auto 10px auto;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.1));
      color: var(--secondary-text-color, #a89984);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      flex-shrink: 0;
    }

    .kanban-add-card-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color, #ebdbb2);
      border-color: var(--accent-color, #7daea3);
    }

    .kanban-inline-composer {
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      margin: 6px 10px 10px 10px;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      flex-shrink: 0;
    }

    .kanban-inline-input {
      width: 100%;
      height: 60px;
      background: transparent;
      border: none;
      color: var(--text-color, #ebdbb2);
      font-size: 13px;
      resize: none;
      outline: none;
      font-family: inherit;
    }

    .kanban-inline-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .kanban-new-col-btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color, #a89984);
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      flex-shrink: 0;
    }

    .kanban-new-col-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color, #ebdbb2);
      border-color: var(--accent-color, #7daea3);
    }

    .kanban-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 999;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      animation: kanban-fade 0.15s ease-out;
    }

    .kanban-modal {
      width: 580px;
      max-width: 90vw;
      background: #282828;
      border-radius: 14px;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      max-height: 90vh;
    }

    .kanban-modal-header {
      padding: 16px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color, #ebdbb2);
    }

    .kanban-modal-close {
      background: transparent;
      border: none;
      color: var(--secondary-text-color, #a89984);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: 6px;
    }

    .kanban-modal-close:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color, #ebdbb2);
    }

    .kanban-modal-body {
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .kanban-form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .kanban-form-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .kanban-tab-toggle {
      display: inline-flex;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 2px;
      gap: 2px;
    }

    .kanban-tab-btn {
      padding: 2px 8px;
      font-size: 11px;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--secondary-text-color, #a89984);
      cursor: pointer;
    }

    .kanban-tab-btn.is-active {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-color, #ebdbb2);
      font-weight: 600;
    }

    .kanban-form-label {
      font-size: 12px;
      font-weight: 500;
      color: var(--secondary-text-color, #a89984);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kanban-form-input,
    .kanban-form-select {
      height: 38px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      padding: 0 12px;
      color: var(--text-color, #ebdbb2);
      font-size: 13.5px;
      outline: none;
    }

    .kanban-form-input:focus,
    .kanban-form-select:focus {
      border-color: var(--accent-color, #7daea3);
    }

    .kanban-char-counter {
      font-size: 12px;
      font-family: inherit;
      color: var(--secondary-text-color, #a89984);
      transition: color 0.15s ease;
    }

    .kanban-char-counter.is-overflow {
      color: #ea6962;
      font-weight: 700;
    }

    .kanban-live-editor {
      width: 100%;
      min-height: 220px;
      max-height: 340px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      box-sizing: border-box;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 1px;
      cursor: text;
      transition: border-color 0.15s ease;
    }

    .kanban-live-editor:focus-within {
      border-color: var(--accent-color, #7daea3);
    }

    .kanban-live-editor.has-overflow {
      border-color: #ea6962 !important;
    }

    .kanban-editor-row {
      min-height: 24px;
      display: flex;
      align-items: flex-start;
      box-sizing: border-box;
      width: 100%;
    }

    .kanban-editor-row.is-active {
      background: rgba(255, 255, 255, 0.04);
      border-radius: 4px;
    }

    .kanban-line-input {
      width: 100%;
      min-height: 24px;
      height: auto;
      border: none;
      outline: none;
      background: transparent;
      color: var(--text-color, #ebdbb2);
      font-size: 13.5px;
      font-family: inherit;
      line-height: 1.5;
      padding: 0 4px;
      box-sizing: border-box;
      resize: none;
      overflow: hidden;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .kanban-editor-row.is-rendered {
      width: 100%;
      cursor: text;
      padding: 1px 4px;
      border-radius: 4px;
      user-select: text;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .kanban-editor-row.is-rendered:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .kanban-row-checklist {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      width: 100%;
    }

    .kanban-row-text,
    .kanban-row-checktext,
    .kanban-row-quote,
    .kanban-row-bullet,
    .kanban-row-num {
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .kanban-row-checktext {
      font-size: 13.5px;
      color: var(--text-color, #ebdbb2);
      line-height: 1.5;
    }

    .kanban-row-checktext.strikethrough {
      text-decoration: line-through;
      opacity: 0.55;
    }

    .kanban-row-h1 {
      font-size: 17px;
      font-weight: 700;
      color: #fabd2f;
      margin: 2px 0;
    }

    .kanban-row-h2 {
      font-size: 15.5px;
      font-weight: 600;
      color: #8ec07c;
      margin: 2px 0;
    }

    .kanban-row-h3 {
      font-size: 14px;
      font-weight: 600;
      color: #83a598;
      margin: 2px 0;
    }

    .kanban-row-quote {
      border-left: 3px solid var(--accent-color, #7daea3);
      margin: 0;
      padding-left: 8px;
      color: var(--secondary-text-color, #a89984);
      font-style: italic;
      font-size: 13px;
    }

    .kanban-row-bullet,
    .kanban-row-num {
      font-size: 13.5px;
      color: var(--text-color, #ebdbb2);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .kanban-bullet-dot {
      color: var(--accent-color, #7daea3);
      font-size: 14px;
    }

    .kanban-num-badge {
      color: var(--accent-color, #7daea3);
      font-weight: 600;
      font-size: 13px;
    }

    .kanban-row-code-fence {
      font-family: monospace;
      font-size: 12.5px;
      color: #d3869b;
      background: rgba(0, 0, 0, 0.2);
      padding: 1px 6px;
      border-radius: 4px;
    }

    .kanban-row-empty {
      height: 16px;
    }

    .kanban-row-text {
      font-size: 13.5px;
      color: var(--text-color, #ebdbb2);
      line-height: 1.5;
    }

    .kanban-cover-preview-box {
      width: 100%;
      height: 120px;
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.15));
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.02);
      color: var(--secondary-text-color, #a89984);
      font-size: 13px;
    }

    .kanban-cover-preview-box:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: var(--accent-color, #7daea3);
    }

    .kanban-cover-preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .kanban-modal-footer {
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    @keyframes kanban-fade {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }
  `;

  function injectStyles() {
    let style = document.getElementById('tg-kanban-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tg-kanban-styles';
      document.head.appendChild(style);
    }
    style.textContent = STYLES;
  }

  function renderSidebarTabs() {
    const scrollable = document.querySelector('#folders-sidebar .folders-sidebar__scrollable');
    if (!scrollable) return;

    let group = document.getElementById('folders-sidebar-kanban-group');
    if (!group || !scrollable.contains(group)) {
      if (!group) {
        group = document.createElement('div');
        group.id = 'folders-sidebar-kanban-group';
        group.className = 'folders-sidebar-kanban-group';
      }
      scrollable.appendChild(group);

      if (!group.dataset.hasClickListener) {
        group.dataset.hasClickListener = '1';
        scrollable.addEventListener('click', (e) => {
          const clickedItem = e.target.closest('.folders-sidebar__folder-item');
          if (clickedItem && !clickedItem.classList.contains('kanban-board-tab')) {
            deactivateKanbanView();
          }
        });
      }
    }

    const displayBoards = (Array.isArray(state.boards) && state.boards.length > 0)
      ? state.boards
      : [{ id: 'default', title: 'Kanban', emojiRaw: null }];

    const renderedKey = displayBoards.map((b) => `${b.id}:${b.title}:${b.emojiRaw || ''}`).join('|') + `|active:${state.activeBoardId}|isKanban:${state.isKanbanActive}`;
    if (group.dataset.renderedKey === renderedKey && group.children.length > 0) {
      group.querySelectorAll('.kanban-board-tab').forEach((tab) => {
        const bId = tab.getAttribute('data-board-id');
        const isSelected = state.isKanbanActive && (state.activeBoardId === bId || (!state.activeBoardId && bId === 'default'));
        tab.classList.toggle('folders-sidebar__folder-item--selected', isSelected);
      });
      return;
    }
    group.dataset.renderedKey = renderedKey;

    const tabsHtml = displayBoards
      .map((b) => {
        const isSelected = state.isKanbanActive && (state.activeBoardId === b.id || (!state.activeBoardId && b.id === 'default'));
        const shortTitle = b.title ? (b.title.length > 8 ? b.title.slice(0, 7) + '…' : b.title) : 'Kanban';
        const iconHtml = b.emojiRaw
          ? `<span style="font-size:20px;line-height:24px;display:flex;align-items:center;justify-content:center;">${b.emojiRaw}</span>`
          : ICONS.kanban;
        return `
          <div class="folders-sidebar__folder-item rp kanban-board-tab ${isSelected ? 'folders-sidebar__folder-item--selected' : ''}"
               role="tab" tabindex="0" data-board-id="${b.id}" title="${escapeHtml(b.title || 'Kanban')}">
            <div class="folders-sidebar__folder-item-icon" style="display:flex;align-items:center;justify-content:center;">
              ${iconHtml}
            </div>
            <div class="folders-sidebar__folder-item-name">${escapeHtml(shortTitle)}</div>
          </div>
        `;
      })
      .join('');

    group.innerHTML = tabsHtml;

    group.querySelectorAll('.kanban-board-tab').forEach((tab) => {
      tab.onclick = async (e) => {
        e.stopPropagation();
        const boardId = tab.getAttribute('data-board-id');
        activateKanbanView();
        if (boardId && boardId !== 'default') {
          await api.selectBoard(boardId);
        } else {
          renderKanbanView();
        }
      };
    });
  }

  function activateKanbanView() {
    state.isKanbanActive = true;
    ensureOutboxProcessor();
    const mainCols = document.getElementById('main-columns');
    if (mainCols) {
      mainCols.classList.remove('is-wishlist');
      mainCols.classList.add('is-kanban');
    }

    document.querySelectorAll('#folders-sidebar .folders-sidebar__folder-item--selected').forEach((el) => {
      el.classList.remove('folders-sidebar__folder-item--selected');
    });

    renderSidebarTabs();
    ensureKanbanDOM();

    if (state.tasks.size === 0 && state.peerId) {
      api.loadHistory(state.peerId, state.topicId);
    } else {
      renderKanbanView();
    }
  }

  function deactivateKanbanView() {
    closeMoveBoardMenu();
    state.isKanbanActive = false;
    const mainCols = document.getElementById('main-columns');
    if (mainCols) mainCols.classList.remove('is-kanban');

    document.querySelectorAll('.kanban-board-tab').forEach((el) => {
      el.classList.remove('folders-sidebar__folder-item--selected');
    });
    renderSidebarTabs();
  }

  function ensureKanbanDOM() {
    let container = document.getElementById('kanban-board-container');
    if (!container) {
      const mainCols = document.getElementById('main-columns');
      if (!mainCols) return;

      container = document.createElement('div');
      container.id = 'kanban-board-container';
      mainCols.appendChild(container);
    }
  }

  function renderKanbanView() {
    closeMoveBoardMenu();
    const container = document.getElementById('kanban-board-container');
    if (!container || !state.isKanbanActive) return;

    if (!state.boards || state.boards.length === 0) {
      container.innerHTML = `
        <div style="margin:auto;display:flex;flex-direction:column;align-items:center;gap:12px;opacity:0.7;max-width:380px;text-align:center;">
          ${ICONS.kanban}
          <div style="font-size:15px;font-weight:600;color:var(--text-color, #ebdbb2);">No Kanban Boards</div>
          <div style="font-size:13px;line-height:1.5;color:var(--secondary-text-color, #a89984);">
            Add board links to your Saved Messages registry to display boards.
          </div>
        </div>
      `;
      return;
    }

    const currentBoard = state.boards.find((b) => b.id === state.activeBoardId);
    const boardTitle = currentBoard?.title || 'Kanban';
    const headerIcon = currentBoard?.emojiRaw
      ? `<span style="font-size:16px;line-height:1;display:inline-flex;align-items:center;">${currentBoard.emojiRaw}</span>`
      : ICONS.kanban;

    container.innerHTML = `
      <div class="kanban-header">
        <div class="kanban-header-left">
          <div class="kanban-board-title-badge" title="Active Kanban Board">
            ${headerIcon}
            <span>${escapeHtml(boardTitle)}</span>
          </div>
          <input type="text" class="kanban-search-input" id="kanban-search" placeholder="Search tasks..." value="${escapeHtml(state.filterText)}">
        </div>
        <div class="kanban-header-actions">
          <button class="kanban-btn kanban-btn-secondary" id="kanban-refresh-btn" title="Refresh">${ICONS.refresh}</button>
          <button class="kanban-btn kanban-btn-secondary" id="kanban-settings-btn" title="Settings">${ICONS.settings}</button>
        </div>
      </div>
      <div class="kanban-columns-container" id="kanban-columns-wrap">
        ${renderColumnsHtml()}
        <button class="kanban-new-col-btn" id="kanban-add-col-btn" title="Add column">
          ${ICONS.plus}
        </button>
      </div>
    `;

    bindKanbanEvents();
  }

  function renderColumnsHtml() {
    if (state.isLoading && state.tasks.size === 0) {
      return `<div style="margin:auto;display:flex;flex-direction:column;align-items:center;gap:12px;opacity:0.6;">
        <div class="preloader"></div>
        <span>Syncing tasks with Telegram...</span>
      </div>`;
    }

    const filtered = Array.from(state.tasks.values()).filter((t) => {
      if (!state.filterText) return true;
      const q = state.filterText.toLowerCase();
      return t.title.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q));
    });

    return state.columns
      .map((col) => {
        const colTasks = filtered.filter((t) => t.col === col.id).sort((a, b) => a.pos - b.pos);
        const isInlineOpen = state.activeInlineCol === col.id;
        const isMenuOpen = state.activeMenuColId === col.id;

        const hasOtherBoards = Array.isArray(state.boards) && state.boards.length > 1;

        const cardsHtml = colTasks
          .map((task) => {
            const prio = task.prio ? getPriorityById(task.prio) : null;
            const prioBadgeHtml = prio
              ? `<span class="kanban-priority-badge" style="background:rgba(255,255,255,0.06);color:${prio.color}">
                  <span class="kanban-priority-dot" style="background:${prio.color}"></span>
                  ${escapeHtml(prio.label)}
                </span>`
              : '';

            const hasDesc = task.description && task.description.length > 0;
            const checklistStats = getChecklistStats(task.description);
            const checklistBadgeHtml = checklistStats
              ? `<span class="kanban-badge-checklist ${checklistStats.done === checklistStats.total ? 'all-done' : ''}" title="Checklist items completed">
                  ${ICONS.checklist} ${checklistStats.done}/${checklistStats.total}
                </span>`
              : '';

            const showCover = task.hasRealCover && !!task.coverUrl;
            const displayId = typeof task.id === 'number' && task.id < 100000000 ? `#${task.id}` : '';

            const syncStatus = task.syncStatus || 'synced';
            const syncTitle =
              syncStatus === 'synced'
                ? 'Saved to Telegram'
                : syncStatus === 'syncing'
                ? 'Syncing with Telegram...'
                : 'Sync failed (saved locally, will retry)';

            return `
              <div class="kanban-card" draggable="true" data-card-mid="${task.mid}">
                <div class="kanban-card-quick-actions">
                  ${hasOtherBoards ? `<button class="kanban-card-quick-btn kanban-card-quick-move" data-quick-move="${task.mid}" title="Move task to another board">${ICONS.move}</button>` : ''}
                  <button class="kanban-card-quick-btn kanban-card-quick-del" data-quick-del="${task.mid}" title="Delete task">${ICONS.trash}</button>
                </div>
                ${showCover ? `<img class="kanban-card-cover" src="${task.coverUrl}" alt="Cover">` : ''}
                <div class="kanban-card-body">
                  <div class="kanban-card-title">${escapeHtml(task.title)}</div>
                  ${renderCardChecklists(task)}
                  <div class="kanban-card-badges">
                    ${prioBadgeHtml}
                    ${checklistBadgeHtml}
                    ${hasDesc && !checklistStats ? `<span class="kanban-card-icon-indicator" title="Has description">${ICONS.textDesc}</span>` : ''}
                    ${displayId ? `<span class="kanban-card-date">${displayId}</span>` : ''}
                    <span class="kanban-sync-dot ${syncStatus}" title="${syncTitle}"></span>
                  </div>
                </div>
              </div>
            `;
          })
          .join('');

        const inlineComposerHtml = isInlineOpen
          ? `
            <div class="kanban-inline-composer">
              <textarea class="kanban-inline-input" id="inline-input-${col.id}" placeholder="What needs to be done? (Enter to save, Esc to cancel)"></textarea>
              <div class="kanban-inline-actions">
                <button class="kanban-btn kanban-btn-secondary" style="padding:4px 10px;font-size:12px;" data-inline-cancel="${col.id}">Cancel</button>
                <button class="kanban-btn" style="padding:4px 10px;font-size:12px;" data-inline-save="${col.id}">Add</button>
              </div>
            </div>
          `
          : `
            <button class="kanban-add-card-btn" data-inline-open="${col.id}" title="Add task">
              ${ICONS.plus}
            </button>
          `;

        const dropdownHtml = isMenuOpen
          ? `
            <div class="kanban-column-dropdown" data-col-dropdown="${col.id}">
              <div class="kanban-dropdown-item" data-col-action="rename" data-col-id="${col.id}">
                ${ICONS.edit} Rename
              </div>
              <div class="kanban-dropdown-item is-danger" data-col-action="delete" data-col-id="${col.id}">
                ${ICONS.trash} Delete
              </div>
            </div>
          `
          : '';

        return `
          <div class="kanban-column" data-col-id="${col.id}">
            <div class="kanban-column-header" draggable="true" data-drag-col="${col.id}">
              <div class="kanban-column-title-wrap">
                <span class="kanban-column-title">${escapeHtml(col.title)}</span>
                <span class="kanban-column-badge">${colTasks.length}</span>
              </div>
              <button class="kanban-column-menu-btn" data-col-menu="${col.id}" title="Column options">
                ${ICONS.more}
              </button>
              ${dropdownHtml}
            </div>
            <div class="kanban-column-cards" data-col-cards="${col.id}">
              ${cardsHtml}
            </div>
            ${inlineComposerHtml}
          </div>
        `;
      })
      .join('');
  }

  function bindKanbanEvents() {
    const container = document.getElementById('kanban-board-container');
    if (!container) return;

    const searchInput = container.querySelector('#kanban-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        state.filterText = e.target.value;
        const columnsWrap = container.querySelector('#kanban-columns-wrap');
        if (columnsWrap) {
          columnsWrap.innerHTML = `${renderColumnsHtml()}<button class="kanban-new-col-btn" id="kanban-add-col-btn" title="Add column">${ICONS.plus}</button>`;
          bindColumnEvents();
        }
      };
    }

    const refreshBtn = container.querySelector('#kanban-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        api.processOutbox();
        api.loadBoardsRegistry();
        if (state.peerId) {
          api.loadHistory(state.peerId, state.topicId);
        }
      };
    }

    const settingsBtn = container.querySelector('#kanban-settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = showSettingsModal;
    }

    const addColBtn = container.querySelector('#kanban-add-col-btn');
    if (addColBtn) {
      addColBtn.onclick = () => {
        const title = prompt('Enter new column title:');
        if (title && title.trim()) {
          const id = 'col_' + Date.now();
          state.columns.push({ id, title: title.trim() });
          api.syncBoardConfigToGroup();
          renderKanbanView();
        }
      };
    }

    bindColumnEvents();
  }

  function bindColumnEvents() {
    const container = document.getElementById('kanban-board-container');
    if (!container) return;

    container.querySelectorAll('[data-col-menu]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const colId = btn.getAttribute('data-col-menu');
        state.activeMenuColId = state.activeMenuColId === colId ? null : colId;
        renderKanbanView();
      };
    });

    container.querySelectorAll('[data-col-action]').forEach((item) => {
      item.onclick = (e) => {
        e.stopPropagation();
        const action = item.getAttribute('data-col-action');
        const colId = item.getAttribute('data-col-id');
        state.activeMenuColId = null;

        if (action === 'rename') {
          const col = state.columns.find((c) => c.id === colId);
          if (col) {
            const newTitle = prompt('Rename column:', col.title);
            if (newTitle && newTitle.trim()) {
              col.title = newTitle.trim();
              api.syncBoardConfigToGroup();
              renderKanbanView();
            }
          }
        } else if (action === 'delete') {
          if (state.columns.length <= 1) {
            alert('Cannot delete the only column.');
            return;
          }
          if (confirm('Delete this column? Tasks inside will be moved to the first column.')) {
            const firstCol = state.columns.find((c) => c.id !== colId);
            for (const task of state.tasks.values()) {
              if (task.col === colId) {
                task.col = firstCol.id;
                api.updateTaskMeta(task, { col: firstCol.id });
              }
            }
            state.columns = state.columns.filter((c) => c.id !== colId);
            api.syncBoardConfigToGroup();
            renderKanbanView();
          }
        }
      };
    });

    container.querySelectorAll('[data-inline-open]').forEach((btn) => {
      btn.onclick = () => {
        const colId = btn.getAttribute('data-inline-open');
        state.activeInlineCol = colId;
        renderKanbanView();
        setTimeout(() => {
          const input = document.getElementById(`inline-input-${colId}`);
          if (input) input.focus();
        }, 50);
      };
    });

    container.querySelectorAll('[data-inline-cancel]').forEach((btn) => {
      btn.onclick = () => {
        state.activeInlineCol = null;
        renderKanbanView();
      };
    });

    container.querySelectorAll('[data-inline-save]').forEach((btn) => {
      btn.onclick = () => {
        const colId = btn.getAttribute('data-inline-save');
        saveInlineTask(colId);
      };
    });

    container.querySelectorAll('.kanban-inline-input').forEach((input) => {
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const colId = input.id.replace('inline-input-', '');
          saveInlineTask(colId);
        } else if (e.key === 'Escape') {
          state.activeInlineCol = null;
          renderKanbanView();
        }
      };
    });

    container.querySelectorAll('[data-quick-move]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const mid = btn.getAttribute('data-quick-move');
        const task = state.tasks.get(Number(mid)) || state.tasks.get(mid);
        if (task) {
          showMoveBoardMenu(btn, task);
        }
      };
    });

    container.querySelectorAll('[data-quick-del]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const mid = btn.getAttribute('data-quick-del');
        const task = state.tasks.get(Number(mid)) || state.tasks.get(mid);
        if (task) {
          if (confirm(`Delete task "${task.title}"?`)) {
            await api.deleteTask(task);
          }
        }
      };
    });

    container.querySelectorAll('.kanban-card').forEach((card) => {
      card.onclick = (e) => {
        if (
          e.target.closest('.kanban-checklist-checkbox') ||
          e.target.closest('.kanban-card-quick-del') ||
          e.target.closest('.kanban-card-quick-move') ||
          e.target.closest('.kanban-card-quick-actions')
        ) return;
        const mid = card.getAttribute('data-card-mid');
        const task = state.tasks.get(Number(mid)) || state.tasks.get(mid);
        if (task) showTaskModal(task);
      };

      card.ondragstart = (e) => {
        state.draggedMid = card.getAttribute('data-card-mid');
        e.dataTransfer.setData('text/plain', state.draggedMid);
        card.style.opacity = '0.4';
      };

      card.ondragend = () => {
        card.style.opacity = '1';
        state.draggedMid = null;
      };
    });

    container.querySelectorAll('.kanban-column-cards').forEach((colCards) => {
      colCards.ondragover = (e) => {
        e.preventDefault();
        colCards.style.background = 'rgba(255, 255, 255, 0.03)';
      };

      colCards.ondragleave = () => {
        colCards.style.background = 'transparent';
      };

      colCards.ondrop = (e) => {
        e.preventDefault();
        colCards.style.background = 'transparent';
        const targetColId = colCards.getAttribute('data-col-cards');
        const mid = state.draggedMid || e.dataTransfer.getData('text/plain');

        if (!mid || !targetColId) return;

        const task = state.tasks.get(Number(mid)) || state.tasks.get(mid);
        if (!task) return;

        const colTasks = Array.from(state.tasks.values())
          .filter((t) => t.col === targetColId && String(t.mid) !== String(mid))
          .sort((a, b) => a.pos - b.pos);

        const cardEls = Array.from(colCards.querySelectorAll('.kanban-card'));
        let insertIndex = colTasks.length;

        for (let i = 0; i < cardEls.length; i++) {
          const rect = cardEls[i].getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            insertIndex = i;
            break;
          }
        }

        let newPos = 1000;
        if (colTasks.length === 0) {
          newPos = 1000;
        } else if (insertIndex === 0) {
          newPos = colTasks[0].pos / 2;
        } else if (insertIndex >= colTasks.length) {
          newPos = colTasks[colTasks.length - 1].pos + 1000;
        } else {
          newPos = (colTasks[insertIndex - 1].pos + colTasks[insertIndex].pos) / 2;
        }

        task.col = targetColId;
        task.pos = newPos;
        renderKanbanView();

        api.updateTaskMeta(task, { col: targetColId, pos: newPos });
      };
    });

    container.querySelectorAll('[data-drag-col]').forEach((colHeader) => {
      colHeader.ondragstart = (e) => {
        state.draggedColId = colHeader.getAttribute('data-drag-col');
        e.dataTransfer.setData('text/plain', state.draggedColId);
      };

      colHeader.ondragover = (e) => {
        e.preventDefault();
      };

      colHeader.ondrop = (e) => {
        e.preventDefault();
        const targetColId = colHeader.getAttribute('data-drag-col');
        const draggedColId = state.draggedColId;

        if (draggedColId && targetColId && draggedColId !== targetColId) {
          const fromIdx = state.columns.findIndex((c) => c.id === draggedColId);
          const toIdx = state.columns.findIndex((c) => c.id === targetColId);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [moved] = state.columns.splice(fromIdx, 1);
            state.columns.splice(toIdx, 0, moved);
            api.syncBoardConfigToGroup();
            renderKanbanView();
          }
        }
      };
    });
  }

  function saveInlineTask(colId) {
    const input = document.getElementById(`inline-input-${colId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    state.activeInlineCol = null;
    api.createTask(text, '', colId);
  }

  function showTaskModal(task = null, defaultCol = null) {
    closeActiveModal();

    const isEdit = !!task;
    const limitInfo = getTelegramLimitInfo();
    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'kanban-modal-backdrop';
    modalBackdrop.id = 'kanban-active-modal';

    const prioOptionsHtml = `
      <option value="" ${!task?.prio ? 'selected' : ''}>None</option>
      ${state.priorities
        .map((p) => `<option value="${p.id}" ${task?.prio === p.id ? 'selected' : ''}>${p.label}</option>`)
        .join('')}
    `;

    const activeColId = task ? task.col : defaultCol || state.columns[0]?.id;
    const colOptionsHtml = state.columns
      .map((c) => `<option value="${c.id}" ${activeColId === c.id ? 'selected' : ''}>${escapeHtml(c.title)}</option>`)
      .join('');

    let coverFileSelected = null;

    modalBackdrop.innerHTML = `
      <div class="kanban-modal" onclick="event.stopPropagation()">
        <div class="kanban-modal-header">
          <span>${isEdit ? 'Edit Task' : 'New Task'}</span>
          <button class="kanban-modal-close" id="kanban-modal-close-btn">${ICONS.close}</button>
        </div>
        <div class="kanban-modal-body">
          <div class="kanban-form-group">
            <label class="kanban-form-label">Task Title</label>
            <input type="text" class="kanban-form-input" id="task-title-input" placeholder="What needs to be done?" value="${escapeHtml(task?.title || '')}">
          </div>
          <div class="kanban-form-group">
            <div class="kanban-form-header-row">
              <label class="kanban-form-label" style="margin-bottom:0;">Description</label>
              <span class="kanban-char-counter" id="kanban-char-counter">0 / 0 (0)</span>
            </div>
            <div class="kanban-live-editor" id="kanban-live-editor"></div>
          </div>
          <div style="display:flex;gap:12px;">
            <div class="kanban-form-group" style="flex:1;">
              <label class="kanban-form-label">Column</label>
              <select class="kanban-form-select" id="task-col-select">
                ${colOptionsHtml}
              </select>
            </div>
            <div class="kanban-form-group" style="flex:1;">
              <label class="kanban-form-label">Priority</label>
              <select class="kanban-form-select" id="task-prio-select">
                ${prioOptionsHtml}
              </select>
            </div>
          </div>
          <div class="kanban-form-group">
            <label class="kanban-form-label">Card Cover</label>
            <div class="kanban-cover-preview-box" id="task-cover-box" title="Click to upload cover image">
              ${
                task?.hasRealCover && task?.coverUrl
                  ? `<img class="kanban-cover-preview-img" src="${task.coverUrl}">`
                  : `<span>${ICONS.image} Click to upload cover image</span>`
              }
              <input type="file" id="task-cover-file-input" accept="image/*" style="display:none;">
            </div>
          </div>
        </div>
        <div class="kanban-modal-footer">
          <div style="display:flex;gap:8px;align-items:center;">
            ${isEdit ? `<button class="kanban-btn kanban-btn-danger" id="task-delete-btn">${ICONS.trash} Delete</button>` : ''}
            ${isEdit && state.boards && state.boards.length > 1 ? `<button class="kanban-btn kanban-btn-secondary" id="task-modal-move-btn">${ICONS.move} Move</button>` : ''}
          </div>
          <div style="display:flex;gap:8px;">
            <button class="kanban-btn kanban-btn-secondary" id="task-cancel-btn">Cancel</button>
            <button class="kanban-btn" id="task-save-btn">${isEdit ? 'Save Changes' : 'Create Task'}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    modalBackdrop.onclick = closeActiveModal;
    modalBackdrop.querySelector('#kanban-modal-close-btn').onclick = closeActiveModal;
    modalBackdrop.querySelector('#task-cancel-btn').onclick = closeActiveModal;

    const titleInput = modalBackdrop.querySelector('#task-title-input');
    const editorContainer = modalBackdrop.querySelector('#kanban-live-editor');
    const charCounter = modalBackdrop.querySelector('#kanban-char-counter');
    const colSelect = modalBackdrop.querySelector('#task-col-select');
    const prioSelect = modalBackdrop.querySelector('#task-prio-select');
    const saveBtn = modalBackdrop.querySelector('#task-save-btn');

    let liveEditor = null;

    function updateCounterAndHighlight() {
      const titleVal = titleInput.value.trim();
      const descVal = liveEditor ? liveEditor.getValue() : (task?.description || '');
      const colVal = colSelect.value;
      const prioVal = prioSelect.value;

      const metaSample = { col: colVal, pos: task?.pos || 1000 };
      if (prioVal) metaSample.prio = prioVal;

      const overhead = serializeTaskCaption(titleVal || 'Task', '', metaSample).length + 1;
      const maxDesc = Math.max(0, limitInfo.maxLimit - overhead);
      const currentLen = descVal.length;
      const remaining = maxDesc - currentLen;

      charCounter.textContent = `${currentLen} / ${maxDesc} (${remaining})`;

      if (remaining < 0) {
        charCounter.classList.add('is-overflow');
        editorContainer.classList.add('has-overflow');
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.title = `Description exceeds Telegram caption limit by ${-remaining} characters`;
      } else {
        charCounter.classList.remove('is-overflow');
        editorContainer.classList.remove('has-overflow');
        saveBtn.disabled = false;
        saveBtn.style.opacity = '';
        saveBtn.style.cursor = '';
        saveBtn.removeAttribute('title');
      }
    }

    liveEditor = createLiveMarkdownEditor({
      container: editorContainer,
      initialText: task?.description || '',
      onChange: () => updateCounterAndHighlight()
    });

    titleInput.addEventListener('input', updateCounterAndHighlight);
    colSelect.addEventListener('change', updateCounterAndHighlight);
    prioSelect.addEventListener('change', updateCounterAndHighlight);

    updateCounterAndHighlight();

    const coverBox = modalBackdrop.querySelector('#task-cover-box');
    const fileInput = modalBackdrop.querySelector('#task-cover-file-input');
    coverBox.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      if (fileInput.files && fileInput.files[0]) {
        coverFileSelected = fileInput.files[0];
        const previewUrl = URL.createObjectURL(coverFileSelected);
        coverBox.innerHTML = `<img class="kanban-cover-preview-img" src="${previewUrl}">`;
      }
    };

    if (isEdit) {
      modalBackdrop.querySelector('#task-delete-btn').onclick = async () => {
        if (confirm(`Delete task "${task.title}"?`)) {
          closeActiveModal();
          await api.deleteTask(task);
        }
      };

      const moveBtn = modalBackdrop.querySelector('#task-modal-move-btn');
      if (moveBtn) {
        moveBtn.onclick = (e) => {
          e.stopPropagation();
          showMoveBoardMenu(moveBtn, task);
        };
      }
    }

    saveBtn.onclick = async () => {
      if (saveBtn.disabled) return;

      const title = titleInput.value.trim();
      const desc = liveEditor ? liveEditor.getValue().trim() : '';
      const col = colSelect.value;
      const prio = prioSelect.value || null;

      if (!title) {
        alert('Please specify a task title.');
        return;
      }

      closeActiveModal();

      if (isEdit) {
        await api.updateTaskMeta(task, { col, prio }, title, desc);
        if (coverFileSelected) {
          await api.updateTaskCover(task, coverFileSelected);
        } else {
          renderKanbanView();
        }
      } else {
        await api.createTask(title, desc, col, prio, coverFileSelected);
      }
    };
  }

  function showSettingsModal() {
    closeActiveModal();

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'kanban-modal-backdrop';
    modalBackdrop.id = 'kanban-active-modal';

    modalBackdrop.innerHTML = `
      <div class="kanban-modal" style="width:480px;" onclick="event.stopPropagation()">
        <div class="kanban-modal-header">
          <span>Board Settings</span>
          <button class="kanban-modal-close" id="settings-close-btn">${ICONS.close}</button>
        </div>
        <div class="kanban-modal-body">
          <div class="kanban-form-group">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <label class="kanban-form-label">Custom Priorities</label>
              <button class="kanban-btn kanban-btn-secondary" id="settings-add-prio-btn" style="padding:2px 8px;font-size:11px;height:24px;">+ Add Priority</button>
            </div>
            <div id="settings-priorities-list" style="display:flex;flex-direction:column;gap:8px;margin-top:6px;"></div>
          </div>

          <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid var(--border-color, rgba(255,255,255,0.06));font-size:12px;color:var(--secondary-text-color, #a89984);line-height:1.5;">
            Kanban boards and topics are managed automatically via links in your Saved Messages.
          </div>
        </div>
        <div class="kanban-modal-footer">
          <div></div>
          <button class="kanban-btn" id="settings-save-btn">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    modalBackdrop.onclick = closeActiveModal;
    modalBackdrop.querySelector('#settings-close-btn').onclick = closeActiveModal;
    modalBackdrop.querySelector('#settings-save-btn').onclick = closeActiveModal;

    function renderPrioritiesList() {
      const priosList = modalBackdrop.querySelector('#settings-priorities-list');
      if (!priosList) return;

      priosList.innerHTML = state.priorities
        .map(
          (p, idx) => `
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="color" value="${p.color}" data-color-idx="${idx}" style="width:34px;height:34px;border:none;background:transparent;cursor:pointer;border-radius:4px;">
            <input type="text" class="kanban-form-input" value="${escapeHtml(p.label)}" data-label-idx="${idx}" style="flex:1;height:34px;">
            <button class="kanban-btn kanban-btn-danger" style="padding:4px 8px;height:34px;" data-del-prio="${idx}">${ICONS.trash}</button>
          </div>
        `
        )
        .join('');

      priosList.querySelectorAll('[data-del-prio]').forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-del-prio'));
          state.priorities.splice(idx, 1);
          api.syncBoardConfigToGroup();
          renderPrioritiesList();
        };
      });

      priosList.querySelectorAll('[data-color-idx]').forEach((input) => {
        input.onchange = (e) => {
          const idx = Number(input.getAttribute('data-color-idx'));
          if (state.priorities[idx]) {
            state.priorities[idx].color = e.target.value;
            api.syncBoardConfigToGroup();
          }
        };
      });

      priosList.querySelectorAll('[data-label-idx]').forEach((input) => {
        input.oninput = (e) => {
          const idx = Number(input.getAttribute('data-label-idx'));
          if (state.priorities[idx]) {
            state.priorities[idx].label = e.target.value;
            api.syncBoardConfigToGroup();
          }
        };
      });
    }

    renderPrioritiesList();

    modalBackdrop.querySelector('#settings-add-prio-btn').onclick = () => {
      const label = prompt('Priority label:');
      if (label && label.trim()) {
        state.priorities.push({
          id: 'prio_' + Date.now(),
          label: label.trim(),
          color: '#7daea3'
        });
        api.syncBoardConfigToGroup();
        renderPrioritiesList();
      }
    };
  }

  function closeMoveBoardMenu() {
    const existing = document.getElementById('kanban-move-board-menu');
    if (existing) existing.remove();
  }

  function showMoveBoardMenu(btn, task) {
    closeMoveBoardMenu();
    const otherBoards = (state.boards || []).filter((b) => b.id !== state.activeBoardId);
    if (otherBoards.length === 0) return;

    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'kanban-move-board-menu';
    menu.className = 'kanban-card-move-dropdown';
    menu.style.position = 'fixed';
    menu.style.zIndex = '9999';

    const menuWidth = 190;
    const left = Math.min(Math.max(8, rect.left - (menuWidth - rect.width)), window.innerWidth - menuWidth - 8);
    const top = rect.bottom + 4 > window.innerHeight - 150 ? Math.max(8, rect.top - 4 - (otherBoards.length * 36 + 32)) : rect.bottom + 4;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const itemsHtml = otherBoards
      .map((b) => {
        const icon = b.emojiRaw
          ? `<span style="font-size:16px;line-height:1;margin-right:8px;flex-shrink:0;">${b.emojiRaw}</span>`
          : `<span style="margin-right:8px;display:flex;align-items:center;flex-shrink:0;">${ICONS.kanban}</span>`;
        return `
          <div class="kanban-dropdown-item kanban-move-board-item" data-board-id="${b.id}" title="${escapeHtml(b.title || 'Kanban')}">
            ${icon}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;">${escapeHtml(b.title || 'Kanban')}</span>
          </div>
        `;
      })
      .join('');

    menu.innerHTML = `
      <div class="kanban-move-dropdown-header">Move to board:</div>
      ${itemsHtml}
    `;

    document.body.appendChild(menu);

    menu.querySelectorAll('.kanban-move-board-item').forEach((item) => {
      item.onclick = async (e) => {
        e.stopPropagation();
        const targetBoardId = item.getAttribute('data-board-id');
        closeMoveBoardMenu();
        if (targetBoardId) {
          await api.moveTaskToBoard(task, targetBoardId);
        }
      };
    });

    const onDocClick = (e) => {
      if (!menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
        closeMoveBoardMenu();
        document.removeEventListener('click', onDocClick, true);
      }
    };
    setTimeout(() => document.addEventListener('click', onDocClick, true), 0);
  }

  function closeActiveModal() {
    closeMoveBoardMenu();
    const modal = document.getElementById('kanban-active-modal');
    if (modal) modal.remove();
  }

  function setupRealtimeListeners() {
    const rootScope = win.rootScope;
    if (!rootScope || !rootScope.addEventListener) return;

    let registryDebounce = null;

    rootScope.addEventListener('message_edit', (e) => {
      const detail = e.detail || e;
      if (state.myId && detail?.peerId === state.myId) {
        if (state.isSyncingRegistry) return;
        clearTimeout(registryDebounce);
        registryDebounce = setTimeout(() => api.loadBoardsRegistry(), 800);
        return;
      }

      if (!state.isKanbanActive) return;

      if (detail?.peerId === state.peerId) {
        const msg = win.apiManagerProxy?.getMessageByPeer(state.peerId, detail.mid);
        if (!msg) return;

        const msgThreadId = getMessageThreadId(msg, state.peerId);
        if (state.topicId && msgThreadId && msgThreadId !== state.topicId) return;

        if (msg.message && KANBAN_CONFIG_REGEX.test(msg.message)) {
          const match = msg.message.match(KANBAN_CONFIG_REGEX);
          if (match) {
            try {
              const parsed = parseConfigJson(match[1]);
              if (parsed) {
                if (Array.isArray(parsed.columns)) state.columns = parsed.columns;
                if (Array.isArray(parsed.priorities)) state.priorities = parsed.priorities;
                if (state.isKanbanActive) renderKanbanView();
              }
            } catch (_) {}
          }
          return;
        }

        const task = parseTaskFromMessage(msg);
        if (task) {
          const existing = state.tasks.get(task.mid) || state.tasks.get(String(task.mid)) || state.tasks.get(Number(task.mid));
          if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
          task.syncStatus = 'synced';
          state.tasks.set(task.mid, task);
          if (state.isKanbanActive) {
            renderKanbanView();
            if (task.hasRealCover && !task.coverUrl) {
              api.resolveCovers();
            }
          }
        }
      }
    });

    rootScope.addEventListener('message_sent', (e) => {
      if (!state.isKanbanActive) return;
      const detail = e.detail || e;
      if (detail?.message?.peerId === state.peerId) {
        const msg = detail.message;
        const msgThreadId = getMessageThreadId(msg, state.peerId);
        if (state.topicId && msgThreadId && msgThreadId !== state.topicId) return;

        const task = parseTaskFromMessage(msg);
        if (task) {
          if (detail.tempId) {
            const existing = state.tasks.get(detail.tempId) || state.tasks.get(String(detail.tempId)) || state.tasks.get(Number(detail.tempId));
            if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
            state.tasks.delete(detail.tempId);
            state.tasks.delete(String(detail.tempId));
            state.tasks.delete(Number(detail.tempId));
          }
          task.syncStatus = 'synced';
          state.tasks.set(task.mid, task);
          if (state.isKanbanActive) {
            renderKanbanView();
            if (task.hasRealCover && !task.coverUrl) {
              api.resolveCovers();
            }
          }
        }
      }
    });

    rootScope.addEventListener('history_append', (e) => {
      if (!state.isKanbanActive) return;
      const detail = e.detail || e;
      if (detail?.message?.peerId === state.peerId) {
        const msg = detail.message;
        const msgThreadId = getMessageThreadId(msg, state.peerId);
        if (state.topicId && msgThreadId && msgThreadId !== state.topicId) return;

        const task = parseTaskFromMessage(msg);
        if (task) {
          const existing = state.tasks.get(task.mid) || state.tasks.get(String(task.mid)) || state.tasks.get(Number(task.mid));
          if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
          task.syncStatus = 'synced';
          state.tasks.set(task.mid, task);
          if (state.isKanbanActive) {
            renderKanbanView();
            if (task.hasRealCover && !task.coverUrl) {
              api.resolveCovers();
            }
          }
        }
      }
    });

    rootScope.addEventListener('history_delete', (e) => {
      if (!state.isKanbanActive) return;
      const detail = e.detail || e;
      if (detail?.peerId === state.peerId && Array.isArray(detail.msgs)) {
        let changed = false;
        for (const mid of detail.msgs) {
          if (state.tasks.has(mid) || state.tasks.has(String(mid)) || state.tasks.has(Number(mid))) {
            state.tasks.delete(mid);
            state.tasks.delete(String(mid));
            state.tasks.delete(Number(mid));
            changed = true;
          }
        }
        if (changed && state.isKanbanActive) renderKanbanView();
      }
    });
  }

  function setupGlobalChecklistListener() {
    document.addEventListener('click', (e) => {
      if (!state.isKanbanActive) return;
      const checkbox = e.target.closest('.kanban-checklist-checkbox, .kanban-row-checkbox');
      if (!checkbox) return;
      if (checkbox.closest('#kanban-live-editor')) return;

      e.stopPropagation();

      const row = checkbox.closest('.kanban-card-checklist-item, .kanban-checklist-row, .kanban-row-checklist');
      if (!row) return;

      const taskMid = row.dataset.taskMid;
      const lineIdx = Number(row.dataset.lineIndex || row.dataset.checkLine);
      if (!taskMid || isNaN(lineIdx)) return;

      const task = state.tasks.get(Number(taskMid)) || state.tasks.get(taskMid);
      if (!task || !task.description) return;

      const lines = task.description.split('\n');
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const curLine = lines[lineIdx];
        let isNowChecked = false;
        if (/^(\s*[-*]\s+\[) \](.*)$/.test(curLine)) {
          lines[lineIdx] = curLine.replace(/^(\s*[-*]\s+\[) \](.*)$/, '$1x]$2');
          isNowChecked = true;
        } else if (/^(\s*[-*]\s+\[)[xX]\](.*)$/.test(curLine)) {
          lines[lineIdx] = curLine.replace(/^(\s*[-*]\s+\[)[xX]\](.*)$/, '$1 ]$2');
          isNowChecked = false;
        }

        const newDesc = lines.join('\n');
        task.description = newDesc;
        api.updateTaskMeta(task, {}, undefined, newDesc);

        checkbox.checked = isNowChecked;
        row.classList.toggle('is-checked', isNowChecked);
        const textSpan = row.querySelector('.kanban-card-checktext, .kanban-checklist-text, .kanban-row-checktext');
        if (textSpan) {
          textSpan.classList.toggle('strikethrough', isNowChecked);
        }

        const card = row.closest('.kanban-card');
        if (card) {
          const stats = getChecklistStats(newDesc);
          const badge = card.querySelector('.kanban-badge-checklist');
          if (badge && stats) {
            badge.innerHTML = `${ICONS.checklist} ${stats.done}/${stats.total}`;
            badge.classList.toggle('all-done', stats.done === stats.total);
          }
        }
      }
    });
  }

  let outboxInterval = null;
  function ensureOutboxProcessor() {
    if (outboxInterval) return;
    outboxInterval = setInterval(() => {
      if (state.isKanbanActive && !state.isProcessingOutbox && state.outbox.length > 0) {
        api.processOutbox();
      } else if (!state.isKanbanActive && state.outbox.length === 0) {
        clearInterval(outboxInterval);
        outboxInterval = null;
      }
    }, 5000);
  }

  function observeSidebarForRemount() {
    const scrollable = document.querySelector('#folders-sidebar .folders-sidebar__scrollable');
    if (!scrollable) return;
    const obs = new MutationObserver(() => {
      if (!document.getElementById('folders-sidebar-kanban-group')) {
        renderSidebarTabs();
      }
    });
    obs.observe(scrollable, { childList: true });
  }

  function init() {
    injectStyles();
    setupGlobalChecklistListener();

    window.addEventListener('online', () => {
      api.processOutbox();
    });

    let isRegistryLoaded = false;
    let sidebarPollInterval = setInterval(() => {
      if (win.rootScope?.managers?.appMessagesManager && win.apiManagerProxy) {
        const currentMyId = win.rootScope?.myId || win.rootScope?.managers?.appUsersManager?.getSelf()?.id;
        if (currentMyId && state.myId && currentMyId !== state.myId) {
          deactivateKanbanView();
          state.myId = currentMyId;
          state.boardsRegistryMid = null;
          state.boards = [];
          state.tasks.clear();
          state.outbox = [];
          state.activeBoardId = null;
          state.configMid = null;
          api.loadBoardsRegistry();
        }

        if (!isRegistryLoaded) {
          isRegistryLoaded = true;
          api.loadBoardsRegistry();
          setupRealtimeListeners();
        }
        renderSidebarTabs();

        const group = document.getElementById('folders-sidebar-kanban-group');
        if (group && isRegistryLoaded) {
          clearInterval(sidebarPollInterval);
          sidebarPollInterval = null;
          observeSidebarForRemount();
        }
      }
    }, 1000);
  }

  init();
})();
