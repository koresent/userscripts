// ==UserScript==
// @name           ⚙ [Telegram Web K] Kanban Board
// @namespace      github.com/koresent/userscripts
// @version        1.3.0
// @description    Native Kanban board inside Telegram Web K backed by a dedicated Telegram group
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @match          https://web.telegram.org/k/*
// @run-at         document-idle
// @grant          unsafeWindow
// @grant          GM_getValue
// @grant          GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const STORAGE_KEYS = {
    peerId: 'tg_kanban_peer_id',
    columns: 'tg_kanban_columns',
    priorities: 'tg_kanban_priorities',
    outbox: 'tg_kanban_outbox',
    configMid: 'tg_kanban_config_mid'
  };

  const DEFAULT_PEER_ID = -2358826579;

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
  const KANBAN_CONFIG_REGEX = /<!--kanban-config:(.*?)-->/s;

  function normalizePeerId(id) {
    if (!id) return DEFAULT_PEER_ID;
    let str = String(id).trim();
    if (str.startsWith('-100')) {
      str = '-' + str.slice(4);
    }
    const num = Number(str);
    return Number.isFinite(num) ? num : DEFAULT_PEER_ID;
  }

  function getTargetPeerId() {
    const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEYS.peerId, DEFAULT_PEER_ID) : DEFAULT_PEER_ID;
    return normalizePeerId(raw);
  }

  function setTargetPeerId(peerId) {
    const norm = normalizePeerId(peerId);
    if (typeof GM_setValue === 'function') {
      GM_setValue(STORAGE_KEYS.peerId, norm);
    }
    state.peerId = norm;
  }

  function getStoredColumns() {
    if (typeof GM_getValue === 'function') {
      const stored = GM_getValue(STORAGE_KEYS.columns, null);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (_) {}
      }
    }
    return DEFAULT_COLUMNS;
  }

  function setStoredColumns(cols) {
    if (typeof GM_setValue === 'function') {
      GM_setValue(STORAGE_KEYS.columns, JSON.stringify(cols));
    }
    state.columns = cols;
    api.syncBoardConfigToGroup();
  }

  function getStoredPriorities() {
    if (typeof GM_getValue === 'function') {
      const stored = GM_getValue(STORAGE_KEYS.priorities, null);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch (_) {}
      }
    }
    return DEFAULT_PRIORITIES;
  }

  function setStoredPriorities(prios) {
    if (typeof GM_setValue === 'function') {
      GM_setValue(STORAGE_KEYS.priorities, JSON.stringify(prios));
    }
    state.priorities = prios;
    api.syncBoardConfigToGroup();
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
    peerId: getTargetPeerId(),
    columns: getStoredColumns(),
    priorities: getStoredPriorities(),
    outbox: getStoredOutbox(),
    configMid: typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEYS.configMid, null) : null,
    tasks: new Map(),
    isLoading: false,
    filterText: '',
    isKanbanActive: false,
    draggedMid: null,
    draggedColId: null,
    activeInlineCol: null,
    activeMenuColId: null,
    isProcessingOutbox: false
  };

  const ICONS = {
    kanban: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 4h4v16H4V4zm6 0h4v11h-4V4zm6 0h4v7h-4V4z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    more: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`,
    textDesc: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 18h12v-2H3v2zM3 6v2h18V6H3zm0 7h18v-2H3v2z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    image: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`
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

  function parseTaskFromMessage(msg) {
    if (!msg || !msg.message) return null;
    const text = msg.message;

    // Check if this is the board config message
    if (KANBAN_CONFIG_REGEX.test(text)) {
      try {
        const match = text.match(KANBAN_CONFIG_REGEX);
        if (match) {
          const parsed = JSON.parse(match[1]);
          if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
            state.columns = parsed.columns;
          }
          if (Array.isArray(parsed.priorities) && parsed.priorities.length > 0) {
            state.priorities = parsed.priorities;
          }
          state.configMid = msg.mid || msg.id;
          if (typeof GM_setValue === 'function') {
            GM_setValue(STORAGE_KEYS.configMid, state.configMid);
          }
        }
      } catch (err) {
        // Ignore JSON parse errors for corrupted config messages
      }
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

    const cleanContent = text.slice(0, match.index).trim();
    const lines = cleanContent.split('\n');
    const title = lines[0] || 'Untitled';
    const description = lines.slice(1).join('\n').trim();

    const photo = msg.media?._ === 'messageMediaPhoto' ? msg.media.photo : null;
    let hasRealCover = false;
    let coverThumb = null;

    if (photo && photo.sizes && photo.sizes.length > 0) {
      for (const s of photo.sizes) {
        if (s.w > 1 || s.h > 1 || (s.size && s.size > 500)) {
          hasRealCover = true;
          coverThumb = s;
          break;
        }
      }
      if (!coverThumb) coverThumb = photo.sizes[photo.sizes.length - 1];
    }

    return {
      mid: msg.mid || msg.id,
      id: msg.id,
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
      syncStatus: 'synced' // 'synced' | 'syncing' | 'error'
    };
  }

  function serializeTaskCaption(title, description, meta) {
    const jsonStr = JSON.stringify(meta);
    const body = description ? `${title.trim()}\n${description.trim()}` : title.trim();
    return `${body}\n\n---\n<!--kanban:${jsonStr}-->`;
  }

  const api = {
    getManagers() {
      const mm = win.rootScope?.managers?.appMessagesManager;
      const apiProxy = win.apiManagerProxy;
      const afm = win.rootScope?.managers?.apiFileManager;
      return { mm, apiProxy, afm };
    },

    async loadBoardConfig(peerId) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !apiProxy) return;

      try {
        const pinned = await mm.getPinnedMessage(peerId);
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
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed.columns) && parsed.columns.length > 0) {
              state.columns = parsed.columns;
            }
            if (Array.isArray(parsed.priorities) && parsed.priorities.length > 0) {
              state.priorities = parsed.priorities;
            }
            state.configMid = configMsg.mid || configMsg.id;
            if (typeof GM_setValue === 'function') {
              GM_setValue(STORAGE_KEYS.configMid, state.configMid);
            }
          }
        }
      } catch (err) {
        console.warn('[Kanban] Could not load board config from pinned message:', err);
      }
    },

    async syncBoardConfigToGroup() {
      const { mm, apiProxy } = this.getManagers();
      if (!mm) return;

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
            text: text
          });
          if (sent?.message) {
            state.configMid = sent.message.mid || sent.message.id;
            if (typeof GM_setValue === 'function') {
              GM_setValue(STORAGE_KEYS.configMid, state.configMid);
            }
            if (mm.updatePinnedMessage) {
              await mm.updatePinnedMessage(state.peerId, state.configMid, false, true);
            }
          }
        }
      } catch (err) {
        console.warn('[Kanban] Sync config to group error:', err);
      }
    },

    async loadHistory(peerId) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !apiProxy) return;

      state.isLoading = true;
      renderKanbanView();

      await this.loadBoardConfig(peerId);

      const collectedTasks = new Map();
      let offsetId = 0;
      const limit = 100;

      try {
        while (true) {
          const res = await mm.getHistory({
            peerId: peerId,
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

        state.tasks = collectedTasks;
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
              const imgEl = document.querySelector(`[data-card-mid="${task.mid}"] .kanban-card-cover`);
              if (imgEl) {
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
      if (!mm) return;

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
          payload: { title, description, col, prio }
        });
        setStoredOutbox(outbox);
      }
    },

    async updateTaskMeta(task, newMeta, newTitle, newDescription) {
      const { mm } = this.getManagers();
      if (!mm) return;

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
        setTimeout(() => api.loadHistory(state.peerId), 800);
      } catch (err) {
        console.error('[Kanban] Update cover error:', err);
        task.syncStatus = 'error';
        renderKanbanView();
      }
    },

    async deleteTask(task) {
      const { mm } = this.getManagers();
      if (!mm || !task.mid) return;

      try {
        await mm.deleteMessages(state.peerId, [task.mid], true);
        state.tasks.delete(task.mid);
        renderKanbanView();
      } catch (err) {
        console.error('[Kanban] Delete task error, queueing into outbox:', err);
        const outbox = getStoredOutbox();
        outbox.push({
          id: 'op_' + Date.now(),
          type: 'delete',
          mid: task.mid
        });
        setStoredOutbox(outbox);
      }
    },

    async processOutbox() {
      if (state.isProcessingOutbox) return;
      const outbox = getStoredOutbox();
      if (outbox.length === 0) return;

      state.isProcessingOutbox = true;
      const remaining = [];

      for (const op of outbox) {
        try {
          if (op.type === 'create') {
            await api.createTask(op.payload.title, op.payload.description, op.payload.col, op.payload.prio);
          } else if (op.type === 'update_meta') {
            const task = state.tasks.get(op.mid);
            if (task && task.rawMsg) {
              await api.updateTaskMeta(task, op.payload.meta, op.payload.title, op.payload.desc);
            }
          } else if (op.type === 'delete') {
            const { mm } = api.getManagers();
            if (mm) await mm.deleteMessages(state.peerId, [op.mid], true);
          }
        } catch (err) {
          remaining.push(op);
        }
      }

      setStoredOutbox(remaining);
      state.isProcessingOutbox = false;
    }
  };

  const STYLES = `
    #main-columns.is-kanban #column-left,
    #main-columns.is-kanban #column-center,
    #main-columns.is-kanban #column-right {
      display: none !important;
    }

    #main-columns.is-kanban #kanban-board-container {
      display: flex !important;
    }

    #kanban-board-container {
      display: none;
      flex: 1 1 0%;
      height: calc(100% - 2 * var(--page-chats-padding, 8px));
      min-width: 0;
      flex-direction: column;
      background: transparent !important;
      color: var(--primary-text-color, var(--text-color, #ffffff));
      position: relative;
      overflow: hidden;
      font-family: inherit;
      margin-block: var(--page-chats-padding, 8px);
      margin-inline-start: calc(var(--page-chats-padding, 8px) + var(--folders-sidebar-offset, 72px));
      margin-inline-end: var(--page-chats-padding, 8px);
      z-index: 1;
    }

    .kanban-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4px 12px 4px;
      height: auto;
      background: transparent !important;
      border-bottom: none !important;
      flex-shrink: 0;
      gap: 16px;
      box-sizing: border-box;
    }

    .kanban-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .kanban-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .kanban-search-input {
      background: var(--surface-color, #282828);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
      color: var(--primary-text-color, var(--text-color, #ffffff));
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 13px;
      outline: none;
      width: 180px;
      transition: width 0.2s, border-color 0.2s;
    }
    .kanban-search-input:focus {
      width: 240px;
      border-color: var(--primary-color, #b8bb26);
    }

    .kanban-btn {
      background: var(--primary-color, #b8bb26);
      color: var(--background-color, #1d2021);
      border: none;
      border-radius: 8px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: filter 0.15s, opacity 0.15s;
    }
    .kanban-btn:hover {
      filter: brightness(1.1);
    }

    .kanban-btn-secondary {
      background: var(--surface-color, #282828);
      color: var(--primary-text-color, var(--text-color, #ffffff));
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .kanban-columns-container {
      display: flex;
      flex: 1;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0 4px 12px 4px;
      gap: 16px;
      align-items: flex-start;
      box-sizing: border-box;
    }

    .kanban-column {
      width: 320px;
      min-width: 320px;
      max-height: 100%;
      background: var(--surface-color, #282828);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      position: relative;
    }

    .kanban-column-header {
      padding: 12px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
      cursor: grab;
      user-select: none;
    }
    .kanban-column-header:active {
      cursor: grabbing;
    }

    .kanban-column-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--primary-text-color, var(--text-color, #ffffff));
    }

    .kanban-column-title {
      font-size: 14px;
      font-weight: 700;
    }

    .kanban-column-badge {
      background: var(--hover-color, rgba(255, 255, 255, 0.1));
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.7));
      font-size: 11px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 10px;
    }

    .kanban-column-menu-btn {
      background: transparent;
      border: none;
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .kanban-column-menu-btn:hover {
      background: var(--hover-color, rgba(255, 255, 255, 0.08));
      color: var(--primary-text-color, var(--text-color, #ffffff));
    }

    .kanban-column-dropdown {
      position: absolute;
      top: 44px;
      right: 12px;
      background: var(--surface-color, #282828);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      padding: 4px 0;
      min-width: 140px;
      z-index: 100;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    }

    .kanban-dropdown-item {
      padding: 8px 12px;
      font-size: 13px;
      color: var(--primary-text-color, var(--text-color, #ffffff));
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .kanban-dropdown-item:hover {
      background: var(--hover-color, rgba(255, 255, 255, 0.08));
    }
    .kanban-dropdown-item.is-danger {
      color: #ff595a;
    }

    .kanban-column-cards {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 80px;
    }

    .kanban-column-cards.is-drag-over {
      background: rgba(184, 187, 38, 0.06);
      outline: 2px dashed var(--primary-color, #b8bb26);
      outline-offset: -4px;
      border-radius: 8px;
    }

    .kanban-card {
      background: var(--surface-color, #282828);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      border-radius: 8px;
      overflow: hidden;
      cursor: grab;
      display: flex;
      flex-direction: column;
      transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
      user-select: none;
      position: relative;
    }
    .kanban-card:hover {
      border-color: rgba(255, 255, 255, 0.2);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      transform: translateY(-1px);
    }
    .kanban-card:active {
      cursor: grabbing;
    }
    .kanban-card.is-dragging {
      opacity: 0.35;
      transform: scale(0.98);
    }

    .kanban-card-cover {
      width: 100%;
      height: 140px;
      object-fit: cover;
      display: none;
      background: var(--background-color, #1d2021);
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.06));
    }

    .kanban-card-body {
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .kanban-card-title {
      font-size: 13.5px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--primary-text-color, var(--text-color, #ffffff));
      word-break: break-word;
    }

    .kanban-card-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .kanban-priority-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .kanban-priority-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
    }

    .kanban-card-icon-indicator {
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.5));
      display: inline-flex;
      align-items: center;
    }

    .kanban-card-date {
      font-size: 11px;
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.4));
    }

    /* Sync Indicator Dot */
    .kanban-sync-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
      margin-left: auto;
      transition: background-color 0.2s, opacity 0.2s;
    }
    .kanban-sync-dot.synced {
      background: var(--primary-color, #b8bb26);
      opacity: 0.75;
    }
    .kanban-sync-dot.syncing {
      background: var(--secondary-text-color, #a89984);
      opacity: 0.9;
      animation: kanbanPulse 1s infinite alternate;
    }
    .kanban-sync-dot.error {
      background: #ff595a;
      opacity: 1;
      box-shadow: 0 0 6px rgba(255, 89, 90, 0.6);
    }
    @keyframes kanbanPulse {
      from { opacity: 0.3; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1.15); }
    }

    .kanban-column-footer {
      padding: 8px 12px 12px;
    }

    .kanban-add-card-btn {
      width: 100%;
      padding: 6px;
      background: transparent;
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.5));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .kanban-add-card-btn:hover {
      background: var(--hover-color, rgba(255, 255, 255, 0.06));
      color: var(--primary-text-color, var(--text-color, #ffffff));
      border-color: rgba(255, 255, 255, 0.25);
    }

    .kanban-inline-composer {
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: var(--surface-color, #282828);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
      border-radius: 8px;
      padding: 8px;
    }

    .kanban-inline-input {
      background: var(--background-color, #1d2021);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
      border-radius: 6px;
      color: var(--primary-text-color, var(--text-color, #ffffff));
      padding: 8px 10px;
      font-size: 13px;
      outline: none;
      font-family: inherit;
      resize: none;
      min-height: 48px;
    }
    .kanban-inline-input:focus {
      border-color: var(--primary-color, #b8bb26);
    }

    .kanban-inline-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
    }

    .kanban-new-col-btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
      background: var(--surface-color, #282828);
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.15));
      border-radius: 10px;
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, border-color 0.15s, color 0.15s;
    }
    .kanban-new-col-btn:hover {
      background: var(--hover-color, rgba(255, 255, 255, 0.1));
      color: var(--primary-text-color, var(--text-color, #ffffff));
      border-color: rgba(255, 255, 255, 0.3);
    }

    .kanban-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .kanban-modal {
      width: 520px;
      max-width: 100%;
      background: var(--surface-color, #282828);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: kanbanPopIn 0.16s cubic-bezier(0, 0, 0.2, 1);
    }

    @keyframes kanbanPopIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    .kanban-modal-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 15px;
      font-weight: 700;
      color: var(--primary-text-color, var(--text-color, #ffffff));
    }

    .kanban-modal-close {
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.6;
      border: none;
      background: transparent;
      color: inherit;
      padding: 4px;
      border-radius: 4px;
    }
    .kanban-modal-close:hover {
      opacity: 1;
      background: var(--hover-color, rgba(255, 255, 255, 0.08));
    }

    .kanban-modal-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow-y: auto;
      max-height: 70vh;
    }

    .kanban-form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .kanban-form-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .kanban-form-input, .kanban-form-textarea, .kanban-form-select {
      background: var(--background-color, #1d2021);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
      color: var(--primary-text-color, var(--text-color, #ffffff));
      border-radius: 6px;
      padding: 8px 10px;
      font-size: 13.5px;
      font-family: inherit;
      outline: none;
    }
    .kanban-form-input:focus, .kanban-form-textarea:focus, .kanban-form-select:focus {
      border-color: var(--primary-color, #b8bb26);
    }

    .kanban-form-textarea {
      min-height: 90px;
      resize: vertical;
    }

    .kanban-cover-preview-box {
      width: 100%;
      height: 120px;
      border-radius: 6px;
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.2));
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: hidden;
      position: relative;
      background: var(--background-color, #1d2021);
      color: var(--secondary-text-color, rgba(255, 255, 255, 0.6));
      font-size: 12px;
      gap: 6px;
    }

    .kanban-cover-preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .kanban-modal-footer {
      padding: 12px 18px;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .kanban-btn-danger {
      background: #ff595a;
      color: #ffffff;
    }

    .kanban-prio-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
    }
    .kanban-prio-color-box {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      cursor: pointer;
      flex-shrink: 0;
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

  function injectSidebarTab() {
    const scrollable = document.querySelector('#folders-sidebar .folders-sidebar__scrollable');
    if (!scrollable || document.getElementById('folders-sidebar-kanban-tab')) return;

    const tab = document.createElement('div');
    tab.id = 'folders-sidebar-kanban-tab';
    tab.className = 'folders-sidebar__folder-item rp';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('tabindex', '0');

    const iconWrap = document.createElement('div');
    iconWrap.className = 'folders-sidebar__folder-item-icon';
    iconWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;';
    iconWrap.innerHTML = ICONS.kanban;

    const nameEl = document.createElement('div');
    nameEl.className = 'folders-sidebar__folder-item-name';
    nameEl.textContent = 'Kanban';

    tab.appendChild(iconWrap);
    tab.appendChild(nameEl);

    tab.onclick = (e) => {
      e.stopPropagation();
      activateKanbanView();
    };

    scrollable.addEventListener('click', (e) => {
      const clickedItem = e.target.closest('.folders-sidebar__folder-item');
      if (clickedItem && clickedItem !== tab) {
        deactivateKanbanView();
      }
    });

    scrollable.appendChild(tab);
  }

  function activateKanbanView() {
    state.isKanbanActive = true;
    const mainCols = document.getElementById('main-columns');
    if (mainCols) mainCols.classList.add('is-kanban');

    document.querySelectorAll('#folders-sidebar .folders-sidebar__folder-item--selected').forEach((el) => {
      el.classList.remove('folders-sidebar__folder-item--selected');
    });

    const tab = document.getElementById('folders-sidebar-kanban-tab');
    if (tab) tab.classList.add('folders-sidebar__folder-item--selected');

    ensureKanbanDOM();
    if (state.tasks.size === 0) {
      api.loadHistory(state.peerId);
    } else {
      renderKanbanView();
    }
  }

  function deactivateKanbanView() {
    state.isKanbanActive = false;
    const mainCols = document.getElementById('main-columns');
    if (mainCols) mainCols.classList.remove('is-kanban');

    const tab = document.getElementById('folders-sidebar-kanban-tab');
    if (tab) tab.classList.remove('folders-sidebar__folder-item--selected');
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
    const container = document.getElementById('kanban-board-container');
    if (!container || !state.isKanbanActive) return;

    container.innerHTML = `
      <div class="kanban-header">
        <div class="kanban-header-left">
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
            const coverStyle = task.coverUrl ? `display:block;` : `display:none;`;
            const coverSrc = task.coverUrl || '';
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
                <img class="kanban-card-cover" src="${coverSrc}" style="${coverStyle}" alt="Cover">
                <div class="kanban-card-body">
                  <div class="kanban-card-title">${escapeHtml(task.title)}</div>
                  <div class="kanban-card-badges">
                    ${prioBadgeHtml}
                    ${hasDesc ? `<span class="kanban-card-icon-indicator" title="Has description">${ICONS.textDesc}</span>` : ''}
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
            <div class="kanban-column-footer">
              ${inlineComposerHtml}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
          columnsWrap.innerHTML =
            renderColumnsHtml() +
            `<button class="kanban-new-col-btn" id="kanban-add-col-btn" title="Add column">${ICONS.plus}</button>`;
        }
        bindKanbanEvents();
      };
    }

    const refreshBtn = container.querySelector('#kanban-refresh-btn');
    if (refreshBtn) refreshBtn.onclick = () => api.loadHistory(state.peerId);

    const settingsBtn = container.querySelector('#kanban-settings-btn');
    if (settingsBtn) settingsBtn.onclick = () => showSettingsModal();

    const addColBtn = container.querySelector('#kanban-add-col-btn');
    if (addColBtn) {
      addColBtn.onclick = () => {
        const title = prompt('Enter new column name:');
        if (title && title.trim()) {
          const newCols = [...state.columns, { id: 'col_' + Date.now(), title: title.trim() }];
          setStoredColumns(newCols);
          renderKanbanView();
        }
      };
    }

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
          const newTitle = prompt('Rename column:', col?.title || '');
          if (newTitle && newTitle.trim()) {
            col.title = newTitle.trim();
            setStoredColumns([...state.columns]);
            renderKanbanView();
          }
        } else if (action === 'delete') {
          if (state.columns.length <= 1) {
            alert('Cannot delete the only column.');
            return;
          }
          if (confirm('Delete this column? Tasks will be moved to the first column.')) {
            const fallbackCol = state.columns.find((c) => c.id !== colId)?.id;
            state.tasks.forEach((t) => {
              if (t.col === colId) {
                t.col = fallbackCol;
                api.updateTaskMeta(t, { col: fallbackCol });
              }
            });
            const newCols = state.columns.filter((c) => c.id !== colId);
            setStoredColumns(newCols);
            renderKanbanView();
          }
        }
      };
    });

    document.addEventListener(
      'click',
      (e) => {
        if (state.activeMenuColId && !e.target.closest('.kanban-column-dropdown') && !e.target.closest('[data-col-menu]')) {
          state.activeMenuColId = null;
          renderKanbanView();
        }
      },
      { once: true }
    );

    container.querySelectorAll('[data-inline-open]').forEach((btn) => {
      btn.onclick = () => {
        const colId = btn.getAttribute('data-inline-open');
        openInlineComposer(colId);
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
        submitInlineComposer(colId);
      };
    });

    if (state.activeInlineCol) {
      const input = container.querySelector(`#inline-input-${state.activeInlineCol}`);
      if (input) {
        input.focus();
        input.onkeydown = (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitInlineComposer(state.activeInlineCol);
          } else if (e.key === 'Escape') {
            state.activeInlineCol = null;
            renderKanbanView();
          }
        };
      }
    }

    bindDragAndDrop();
    bindColumnDragAndDrop();
    bindCardClicks();
  }

  function openInlineComposer(colId) {
    state.activeInlineCol = colId;
    renderKanbanView();
  }

  function submitInlineComposer(colId) {
    const container = document.getElementById('kanban-board-container');
    const input = container?.querySelector(`#inline-input-${colId}`);
    const text = input?.value?.trim();
    if (!text) {
      state.activeInlineCol = null;
      renderKanbanView();
      return;
    }

    const lines = text.split('\n');
    const title = lines[0];
    const desc = lines.slice(1).join('\n').trim();

    state.activeInlineCol = null;
    api.createTask(title, desc, colId, null);
  }

  function bindCardClicks() {
    const container = document.getElementById('kanban-board-container');
    if (!container) return;

    container.querySelectorAll('.kanban-card').forEach((cardEl) => {
      cardEl.onclick = () => {
        if (cardEl.classList.contains('is-dragging')) return;
        const mid = cardEl.getAttribute('data-card-mid');
        const numMid = Number(mid);
        const task = state.tasks.get(Number.isFinite(numMid) ? numMid : mid);
        if (task) showTaskModal(task);
      };
    });
  }

  function bindDragAndDrop() {
    const container = document.getElementById('kanban-board-container');
    if (!container) return;

    const cards = container.querySelectorAll('.kanban-card');
    const dropzones = container.querySelectorAll('.kanban-column-cards');

    cards.forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        e.stopPropagation();
        const rawMid = card.getAttribute('data-card-mid');
        const numMid = Number(rawMid);
        state.draggedMid = Number.isFinite(numMid) ? numMid : rawMid;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(state.draggedMid));
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        state.draggedMid = null;
        dropzones.forEach((dz) => dz.classList.remove('is-drag-over'));
      });
    });

    dropzones.forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        if (!state.draggedMid) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('is-drag-over');

        const afterElement = getDragAfterElement(zone, e.clientY);
        const draggingCard = container.querySelector('.kanban-card.is-dragging');
        if (draggingCard) {
          if (afterElement == null) {
            zone.appendChild(draggingCard);
          } else {
            zone.insertBefore(draggingCard, afterElement);
          }
        }
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('is-drag-over');
      });

      zone.addEventListener('drop', async (e) => {
        if (!state.draggedMid) return;
        e.preventDefault();
        zone.classList.remove('is-drag-over');

        const mid = state.draggedMid;
        const task = state.tasks.get(mid);
        if (!task) return;

        const targetColId = zone.getAttribute('data-col-cards');
        const cardElements = Array.from(zone.querySelectorAll('.kanban-card'));
        const dropIndex = cardElements.findIndex((el) => {
          const raw = el.getAttribute('data-card-mid');
          const num = Number(raw);
          return (Number.isFinite(num) ? num : raw) === mid;
        });

        let newPos = 1000;
        const prevCardEl = cardElements[dropIndex - 1];
        const nextCardEl = cardElements[dropIndex + 1];

        const getCardPos = (el) => {
          if (!el) return null;
          const raw = el.getAttribute('data-card-mid');
          const num = Number(raw);
          return state.tasks.get(Number.isFinite(num) ? num : raw)?.pos;
        };

        const prevPos = getCardPos(prevCardEl);
        const nextPos = getCardPos(nextCardEl);

        if (prevPos != null && nextPos != null) {
          newPos = Math.round((prevPos + nextPos) / 2);
        } else if (prevPos != null) {
          newPos = prevPos + 1000;
        } else if (nextPos != null) {
          newPos = Math.round(nextPos / 2) || 500;
        }

        task.col = targetColId;
        task.pos = newPos;

        await api.updateTaskMeta(task, { col: targetColId, pos: newPos });
      });
    });
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kanban-card:not(.is-dragging)')];
    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  }

  function bindColumnDragAndDrop() {
    const container = document.getElementById('kanban-board-container');
    if (!container) return;

    const colHeaders = container.querySelectorAll('.kanban-column-header[draggable="true"]');
    const colsWrap = container.querySelector('#kanban-columns-wrap');

    colHeaders.forEach((header) => {
      header.addEventListener('dragstart', (e) => {
        state.draggedColId = header.getAttribute('data-drag-col');
        header.closest('.kanban-column').style.opacity = '0.4';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/column', state.draggedColId);
      });

      header.addEventListener('dragend', () => {
        header.closest('.kanban-column').style.opacity = '1';
        state.draggedColId = null;
      });
    });

    if (colsWrap) {
      colsWrap.addEventListener('dragover', (e) => {
        if (!state.draggedColId) return;
        e.preventDefault();
        const targetCol = e.target.closest('.kanban-column');
        if (!targetCol) return;
        const targetColId = targetCol.getAttribute('data-col-id');
        if (targetColId && targetColId !== state.draggedColId) {
          const colIds = state.columns.map((c) => c.id);
          const fromIdx = colIds.indexOf(state.draggedColId);
          const toIdx = colIds.indexOf(targetColId);
          if (fromIdx !== -1 && toIdx !== -1) {
            const reordered = [...state.columns];
            const [moved] = reordered.splice(fromIdx, 1);
            reordered.splice(toIdx, 0, moved);
            setStoredColumns(reordered);
            renderKanbanView();
          }
        }
      });
    }
  }

  function showTaskModal(task = null, defaultCol = null) {
    closeActiveModal();

    const isEdit = !!task;
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
            <label class="kanban-form-label">Description</label>
            <textarea class="kanban-form-textarea" id="task-desc-input" placeholder="Task details, links, acceptance criteria...">${escapeHtml(task?.description || '')}</textarea>
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
                task?.coverUrl
                  ? `<img class="kanban-cover-preview-img" src="${task.coverUrl}">`
                  : `<span>${ICONS.image} Click to upload cover image</span>`
              }
              <input type="file" id="task-cover-file-input" accept="image/*" style="display:none;">
            </div>
          </div>
        </div>
        <div class="kanban-modal-footer">
          ${isEdit ? `<button class="kanban-btn kanban-btn-danger" id="task-delete-btn">${ICONS.trash} Delete</button>` : '<div></div>'}
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
    }

    modalBackdrop.querySelector('#task-save-btn').onclick = async () => {
      const title = modalBackdrop.querySelector('#task-title-input').value.trim();
      const desc = modalBackdrop.querySelector('#task-desc-input').value.trim();
      const col = modalBackdrop.querySelector('#task-col-select').value;
      const prio = modalBackdrop.querySelector('#task-prio-select').value || null;

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

    function renderPriorityRows() {
      return state.priorities
        .map(
          (p, idx) => `
          <div class="kanban-prio-row" data-prio-idx="${idx}">
            <input type="color" class="kanban-prio-color-box" value="${p.color}" data-color-idx="${idx}">
            <input type="text" class="kanban-form-input" style="flex:1;padding:4px 8px;font-size:13px;" value="${escapeHtml(p.label)}" data-label-idx="${idx}">
            <button class="kanban-column-menu-btn" data-delete-prio="${idx}" title="Delete priority">${ICONS.trash}</button>
          </div>
        `
        )
        .join('');
    }

    modalBackdrop.innerHTML = `
      <div class="kanban-modal" onclick="event.stopPropagation()">
        <div class="kanban-modal-header">
          <span>Kanban Board Settings</span>
          <button class="kanban-modal-close" id="kanban-modal-close-btn">${ICONS.close}</button>
        </div>
        <div class="kanban-modal-body">
          <div class="kanban-form-group">
            <label class="kanban-form-label">Telegram Database Group (Peer ID)</label>
            <input type="text" class="kanban-form-input" id="settings-peer-input" value="${state.peerId}">
            <div style="font-size:11.5px;color:var(--secondary-text-color, rgba(255,255,255,0.5));line-height:1.4;">
              Specify Telegram group Peer ID (e.g. <code>-1002358826579</code> or <code>-2358826579</code>).
            </div>
          </div>
          <div class="kanban-form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <label class="kanban-form-label">Priority Levels</label>
              <button class="kanban-btn kanban-btn-secondary" style="padding:2px 8px;font-size:11px;" id="settings-add-prio-btn">${ICONS.plus} Add Priority</button>
            </div>
            <div id="settings-prios-list">
              ${renderPriorityRows()}
            </div>
          </div>
        </div>
        <div class="kanban-modal-footer">
          <div></div>
          <div style="display:flex;gap:8px;">
            <button class="kanban-btn kanban-btn-secondary" id="settings-cancel-btn">Cancel</button>
            <button class="kanban-btn" id="settings-save-btn">Save Settings</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    modalBackdrop.onclick = closeActiveModal;
    modalBackdrop.querySelector('#kanban-modal-close-btn').onclick = closeActiveModal;
    modalBackdrop.querySelector('#settings-cancel-btn').onclick = closeActiveModal;

    const priosList = modalBackdrop.querySelector('#settings-prios-list');
    modalBackdrop.querySelector('#settings-add-prio-btn').onclick = () => {
      const name = prompt('Priority label (e.g. Low, Critical):');
      if (name && name.trim()) {
        state.priorities.push({
          id: 'prio_' + Date.now(),
          label: name.trim(),
          color: '#3390ec'
        });
        priosList.innerHTML = renderPriorityRows();
        bindPrioEvents();
      }
    };

    function bindPrioEvents() {
      priosList.querySelectorAll('[data-delete-prio]').forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-delete-prio'));
          if (state.priorities.length <= 1) {
            alert('At least one priority level is required.');
            return;
          }
          state.priorities.splice(idx, 1);
          priosList.innerHTML = renderPriorityRows();
          bindPrioEvents();
        };
      });

      priosList.querySelectorAll('[data-color-idx]').forEach((input) => {
        input.onchange = (e) => {
          const idx = Number(input.getAttribute('data-color-idx'));
          if (state.priorities[idx]) state.priorities[idx].color = e.target.value;
        };
      });

      priosList.querySelectorAll('[data-label-idx]').forEach((input) => {
        input.oninput = (e) => {
          const idx = Number(input.getAttribute('data-label-idx'));
          if (state.priorities[idx]) state.priorities[idx].label = e.target.value;
        };
      });
    }

    bindPrioEvents();

    modalBackdrop.querySelector('#settings-save-btn').onclick = () => {
      const peerRaw = modalBackdrop.querySelector('#settings-peer-input').value.trim();
      setTargetPeerId(peerRaw);
      setStoredPriorities([...state.priorities]);
      closeActiveModal();
      api.loadHistory(state.peerId);
    };
  }

  function closeActiveModal() {
    const modal = document.getElementById('kanban-active-modal');
    if (modal) modal.remove();
  }

  function setupRealtimeListeners() {
    const rootScope = win.rootScope;
    if (!rootScope || !rootScope.addEventListener) return;

    rootScope.addEventListener('message_edit', (e) => {
      if (!state.isKanbanActive) return;
      const detail = e.detail || e;
      if (detail?.peerId === state.peerId) {
        const msg = win.apiManagerProxy?.getMessageByPeer(state.peerId, detail.mid);
        if (msg?.message && KANBAN_CONFIG_REGEX.test(msg.message)) {
          const match = msg.message.match(KANBAN_CONFIG_REGEX);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              if (Array.isArray(parsed.columns)) state.columns = parsed.columns;
              if (Array.isArray(parsed.priorities)) state.priorities = parsed.priorities;
              renderKanbanView();
            } catch (_) {}
          }
          return;
        }

        const task = parseTaskFromMessage(msg);
        if (task) {
          const existing = state.tasks.get(task.mid);
          if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
          task.syncStatus = 'synced';
          state.tasks.set(task.mid, task);
          renderKanbanView();
          if (task.hasRealCover && !task.coverUrl) {
            api.resolveCovers();
          }
        }
      }
    });

    rootScope.addEventListener('message_sent', (e) => {
      if (!state.isKanbanActive) return;
      const detail = e.detail || e;
      if (detail?.message?.peerId === state.peerId) {
        const task = parseTaskFromMessage(detail.message);
        if (task) {
          if (detail.tempId) {
            const existing = state.tasks.get(detail.tempId);
            if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
            state.tasks.delete(detail.tempId);
          }
          task.syncStatus = 'synced';
          state.tasks.set(task.mid, task);
          renderKanbanView();
          if (task.hasRealCover && !task.coverUrl) {
            api.resolveCovers();
          }
        }
      }
    });

    rootScope.addEventListener('history_append', (e) => {
      if (!state.isKanbanActive) return;
      const detail = e.detail || e;
      if (detail?.message?.peerId === state.peerId) {
        const task = parseTaskFromMessage(detail.message);
        if (task) {
          const existing = state.tasks.get(task.mid);
          if (existing?.coverUrl) task.coverUrl = existing.coverUrl;
          task.syncStatus = 'synced';
          state.tasks.set(task.mid, task);
          renderKanbanView();
          if (task.hasRealCover && !task.coverUrl) {
            api.resolveCovers();
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
          if (state.tasks.has(mid)) {
            state.tasks.delete(mid);
            changed = true;
          }
        }
        if (changed) renderKanbanView();
      }
    });
  }

  function init() {
    injectStyles();

    // Check for pending outbox retry every 5 seconds
    setInterval(() => {
      if (state.isKanbanActive && !state.isProcessingOutbox && state.outbox.length > 0) {
        api.processOutbox();
      }
    }, 5000);

    window.addEventListener('online', () => {
      api.processOutbox();
    });

    const interval = setInterval(() => {
      if (win.rootScope?.managers?.appMessagesManager && win.apiManagerProxy) {
        injectSidebarTab();
        setupRealtimeListeners();
      }
    }, 1000);

    const observer = new MutationObserver(() => {
      injectSidebarTab();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
