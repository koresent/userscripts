// ==UserScript==
// @name         🎁 [Telegram Web K] Wishlist
// @namespace    https://github.com/koresent
// @version      1.0.0
// @description  Interactive Wishlist tables in Telegram Web K stored in your chats
// @author       koresent
// @match        https://web.telegram.org/k/
// @match        https://web.telegram.org/k/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const STORAGE_KEYS = {
    activeWishlistId: 'tg_wishlist_active_id',
    outbox: 'tg_wishlist_outbox'
  };

  const CURRENCIES = [
    { code: 'RUB', symbol: '₽', label: 'RUB (₽)' },
    { code: 'USD', symbol: '$', label: 'USD ($)' },
    { code: 'EUR', symbol: '€', label: 'EUR (€)' },
    { code: 'GBP', symbol: '£', label: 'GBP (£)' },
    { code: 'JPY', symbol: '¥', label: 'JPY (¥)' },
    { code: 'CNY', symbol: '¥', label: 'CNY (¥)' },
    { code: 'KZT', symbol: '₸', label: 'KZT (₸)' },
    { code: 'TRY', symbol: '₺', label: 'TRY (₺)' },
    { code: 'GEL', symbol: '₾', label: 'GEL (₾)' }
  ];

  const CATEGORIES = [
    { id: 'A', code: 'A', label: 'A — Necessity', badgeColor: '#ea6962', bg: 'rgba(234, 105, 98, 0.15)' },
    { id: 'B', code: 'B', label: 'B — Upgrade', badgeColor: '#e78a4e', bg: 'rgba(231, 138, 78, 0.15)' },
    { id: 'C', code: 'C', label: 'C — Leisure', badgeColor: '#a9b665', bg: 'rgba(169, 182, 101, 0.15)' }
  ];

  const WISHLIST_BLOCK_REGEX = /<!--wishlist:(.*?)-->/;
  const WISHLIST_BOARDS_REGEX = /<!--wishlist-boards:(.*?)-->/;

  const ICONS = {
    gift: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.65-.5-.65C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1h-2.22l.8-1.06c.33-.42.84-.94 1.42-.94zm-6 0c.58 0 1.09.52 1.42.94l.8 1.06H9c-.55 0-1-.45-1-1s.45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76V12h2V8.76L15.38 12 17 10.83 14.92 8H20v6z"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    link: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>`,
    externalLink: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`,
    image: `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
    check: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    sortAsc: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 4l-5 5h10l-5-5z"/></svg>`,
    sortDesc: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 20l5-5H7l5 5z"/></svg>`
  };

  function normalizePeerId(id) {
    if (!id) return null;
    let str = String(id).trim();
    if (str.startsWith('-100')) {
      str = '-' + str.slice(4);
    }
    const num = Number(str);
    return isNaN(num) ? null : num;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatPriceNumber(num) {
    if (typeof num !== 'number' || isNaN(num)) return '0';
    return num.toLocaleString('ru-RU');
  }

  function formatDate(timestamp) {
    if (!timestamp) return '—';
    const d = new Date(timestamp * 1000);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function getCurrencySymbol(code) {
    const cur = CURRENCIES.find((c) => c.code === (code || 'RUB'));
    return cur ? cur.symbol : code || '₽';
  }

  function parseBoardTarget(line) {
    if (!line) return null;
    const matchC = line.match(/https?:\/\/t\.me\/c\/(\d+)(?:\/(\d+))?/i);
    if (matchC) {
      const rawPeer = matchC[1];
      const peerId = -Number(rawPeer);
      const topicId = matchC[2] ? Number(matchC[2]) : null;
      return { peerId, topicId };
    }
    return null;
  }

  function create1x1PixelBlob() {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 1, 1);
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  function getMessageThreadId(msg, fallbackPeerId) {
    if (!msg) return null;
    if (msg.reply_to_msg_id) return msg.reply_to_msg_id;
    if (msg.reply_to_top_id) return msg.reply_to_top_id;
    if (msg.reply_to?.reply_to_top_id) return msg.reply_to.reply_to_top_id;
    if (msg.reply_to?.reply_to_msg_id) return msg.reply_to.reply_to_msg_id;
    return null;
  }

  const state = {
    myId: null,
    isWishlistActive: false,
    boardsRegistryMid: null,
    boards: [],
    activeWishlistId: null,
    peerId: null,
    topicId: null,
    items: new Map(),
    isLoading: false,
    filterText: '',
    categoryFilter: 'ALL',
    viewTab: 'active', // 'active' | 'purchased' | 'all'
    sortField: 'pos',  // 'pos' | 'model' | 'price' | 'category' | 'date'
    sortAsc: true,
    isSyncingRegistry: false
  };

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

  function parseItemFromMessage(msg) {
    if (!msg || !msg.message) return null;
    const match = msg.message.match(WISHLIST_BLOCK_REGEX);
    if (!match) return null;

    let meta = {};
    try {
      meta = JSON.parse(match[1]);
    } catch (_) {
      return null;
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
      model: meta.model || '',
      category: meta.category || 'A',
      price: typeof meta.price === 'number' ? meta.price : 0,
      currency: meta.currency || 'RUB',
      link: meta.link || '',
      rationale: meta.rationale || '',
      alternatives: meta.alternatives || '',
      pos: typeof meta.pos === 'number' ? meta.pos : 1000,
      purchased: !!meta.purchased,
      date: meta.createdAt || msg.date || Math.floor(Date.now() / 1000),
      photo,
      coverThumb,
      hasRealCover,
      coverUrl: null,
      syncStatus: 'synced'
    };
  }

  function serializeItemPayload(item) {
    const payload = {
      model: item.model || '',
      category: item.category || 'A',
      price: typeof item.price === 'number' ? item.price : 0,
      currency: item.currency || 'RUB',
      link: item.link || '',
      rationale: item.rationale || '',
      alternatives: item.alternatives || '',
      pos: typeof item.pos === 'number' ? item.pos : 1000,
      purchased: !!item.purchased,
      createdAt: item.date || Math.floor(Date.now() / 1000)
    };
    return `<!--wishlist:${JSON.stringify(payload)}-->`;
  }

  const api = {
    getManagers() {
      const mm = win.rootScope?.managers?.appMessagesManager;
      const apiProxy = win.apiManagerProxy;
      const afm = win.rootScope?.managers?.apiFileManager;
      return { mm, apiProxy, afm };
    },

    async resolveBoardTitle(peerId, topicId) {
      const cm = win.rootScope?.managers?.appChatsManager;
      const chatId = Math.abs(peerId);
      if (cm && typeof cm.getChat === 'function') {
        try {
          const chat = await cm.getChat(chatId);
          if (chat?.title) {
            return topicId ? `${chat.title} (#${topicId})` : chat.title;
          }
        } catch (_) {}
      }
      return topicId ? `Topic #${topicId}` : `Wishlist ${chatId}`;
    },

    async loadWishlistRegistry() {
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
          if (raw?.message && WISHLIST_BOARDS_REGEX.test(raw.message)) {
            state.boardsRegistryMid = raw.mid || raw.id;
            try {
              const match = raw.message.match(WISHLIST_BOARDS_REGEX);
              const parsed = JSON.parse(match[1]);
              if (Array.isArray(parsed)) {
                for (const jb of parsed) {
                  const normPeer = normalizePeerId(jb.peerId);
                  const normTopic = jb.topicId ? Number(jb.topicId) : null;
                  const id = jb.id || 'wishlist_' + (normTopic ? `${normPeer}_${normTopic}` : normPeer);
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
              }
            } catch (_) {}
            break;
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
            } catch (_) {}
          }
        }

        for (const b of state.boards) {
          if (!b.title) {
            b.title = await this.resolveBoardTitle(b.peerId, b.topicId);
          }
        }

        if (state.boards.length > 0) {
          const savedActiveId = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEYS.activeWishlistId, null) : null;
          const initialBoard = state.boards.find((b) => b.id === savedActiveId) || state.boards[0];
          if (initialBoard) {
            await this.selectWishlist(initialBoard.id);
          }
        } else {
          state.activeWishlistId = null;
          state.peerId = null;
          state.topicId = null;
        }

        renderSidebarTabs();
      } catch (_) {}
    },

    async selectWishlist(wishlistId) {
      const board = state.boards.find((b) => b.id === wishlistId);
      if (!board) return;

      const isSame = state.activeWishlistId === board.id;
      state.activeWishlistId = board.id;
      state.peerId = board.peerId;
      state.topicId = board.topicId || null;

      if (!isSame) {
        state.items.clear();
      }

      if (typeof GM_setValue === 'function') {
        GM_setValue(STORAGE_KEYS.activeWishlistId, board.id);
      }

      renderSidebarTabs();

      if (state.isWishlistActive) {
        await this.loadHistory(state.peerId, state.topicId);
      }
    },

    async syncWishlistRegistryToSavedMessages(boards = state.boards) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !state.myId) return;

      state.isSyncingRegistry = true;
      try {
        const payload = boards.map((b) => ({
          id: b.id,
          peerId: b.peerId,
          topicId: b.topicId || null,
          title: b.title || null,
          iconEmojiId: b.iconEmojiId || null,
          emojiRaw: b.emojiRaw || null
        }));

        const linksList = boards
          .map((b) => {
            const rawId = Math.abs(b.peerId);
            const link = b.topicId ? `https://t.me/c/${rawId}/${b.topicId}` : `https://t.me/c/${rawId}`;
            return `• ${b.title || 'Wishlist'}: ${link}`;
          })
          .join('\n');

        const text = `🎁 Telegram Wishlist Registry\nThis message maintains your active Wishlist chats and topics.\n\n${linksList}\n\n---\n<!--wishlist-boards:${JSON.stringify(payload)}-->`;

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
        console.warn('[Wishlist] Sync registry error:', err);
      } finally {
        setTimeout(() => {
          state.isSyncingRegistry = false;
        }, 1000);
      }
    },

    async loadHistory(peerId = state.peerId, topicId = state.topicId) {
      const { mm, apiProxy } = this.getManagers();
      if (!mm || !apiProxy || !peerId) return;

      await ensureChatLoaded(peerId);
      state.isLoading = true;
      renderWishlistView();

      const collected = new Map();
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
            const item = parseItemFromMessage(rawMsg);
            if (item) {
              if (topicId && item.threadId && item.threadId !== topicId) {
                continue;
              }
              const existing = state.items.get(item.mid) || state.items.get(String(item.mid)) || state.items.get(Number(item.mid));
              if (existing?.coverUrl) item.coverUrl = existing.coverUrl;
              collected.set(item.mid, item);
            }
          }

          if (res.isEnd?.top || res.isEnd?.both || history.length < limit || minMid === offsetId) {
            break;
          }
          offsetId = minMid;
        }

        if (state.items.size === 0) {
          state.items = collected;
        } else {
          for (const [mid, item] of collected) {
            const existing = state.items.get(mid) || state.items.get(String(mid)) || state.items.get(Number(mid));
            if (existing) {
              if (existing.coverUrl) item.coverUrl = existing.coverUrl;
              if (existing.syncStatus === 'syncing') continue;
            }
            state.items.set(mid, item);
          }
        }
      } catch (err) {
        console.error('[Wishlist] Load history error:', err);
      } finally {
        state.isLoading = false;
        renderWishlistView();
        api.resolveCovers();
      }
    },

    async resolveCovers() {
      const { afm } = this.getManagers();
      if (!afm) return;

      for (const item of state.items.values()) {
        if (item.hasRealCover && !item.coverUrl && item.photo && item.coverThumb) {
          try {
            const url = await afm.downloadMediaURL({ media: item.photo, thumb: item.coverThumb });
            if (url) {
              item.coverUrl = url;
              const imgEl = document.querySelector(`.wishlist-thumb-img[data-item-mid="${item.mid}"]`);
              if (imgEl) {
                imgEl.src = url;
                imgEl.style.display = 'block';
              }
            }
          } catch (_) {}
        }
      }
    },

    async createItem(model = 'New item', category = 'A', price = 0, currency = 'RUB') {
      const { mm } = this.getManagers();
      if (!mm || !state.peerId) return;

      await ensureChatLoaded(state.peerId);

      const itemsArr = Array.from(state.items.values()).sort((a, b) => a.pos - b.pos);
      const nextPos = itemsArr.length > 0 ? itemsArr[itemsArr.length - 1].pos + 1000 : 1000;

      const tempMid = 'temp_' + Date.now();
      const newItem = {
        mid: tempMid,
        id: null,
        threadId: state.topicId,
        model,
        category,
        price,
        currency,
        link: '',
        rationale: '',
        alternatives: '',
        pos: nextPos,
        purchased: false,
        date: Math.floor(Date.now() / 1000),
        photo: null,
        hasRealCover: false,
        coverUrl: null,
        syncStatus: 'syncing'
      };

      state.items.set(tempMid, newItem);
      renderWishlistView();

      try {
        const caption = serializeItemPayload(newItem);
        const blob = await create1x1PixelBlob();
        const fileToUpload = new File([blob], 'cover_1x1.png', { type: 'image/png' });

        const sendResult = await mm.sendFile({
          peerId: state.peerId,
          threadId: state.topicId || undefined,
          file: fileToUpload,
          caption: caption,
          isMedia: true
        });

        if (sendResult?.message) {
          state.items.delete(tempMid);
          newItem.mid = sendResult.message.mid;
          newItem.rawMsg = sendResult.message;
          state.items.set(sendResult.message.mid, newItem);
        }
      } catch (err) {
        console.error('[Wishlist] Create item error:', err);
        newItem.syncStatus = 'error';
        renderWishlistView();
      }
    },

    async updateItem(item, updates = {}) {
      const { mm } = this.getManagers();
      if (!mm) return;

      Object.assign(item, updates);
      item.syncStatus = 'syncing';
      renderWishlistView();

      const newCaption = serializeItemPayload(item);

      try {
        if (!item.rawMsg) {
          throw new Error('Message not yet confirmed by server');
        }
        await mm.editMessage(item.rawMsg, newCaption);
        item.syncStatus = 'synced';
        renderWishlistView();
      } catch (err) {
        console.error('[Wishlist] Edit message error:', err);
        item.syncStatus = 'error';
        renderWishlistView();
      }
    },

    async updateItemCover(item, file) {
      const { mm } = this.getManagers();
      if (!mm || !item.rawMsg) return;

      item.syncStatus = 'syncing';
      renderWishlistView();

      const caption = serializeItemPayload(item);

      try {
        await mm.editMessageMedia({
          message: item.rawMsg,
          text: caption,
          sendFileDetails: { file, isMedia: true },
          options: { isMedia: true }
        });
        item.syncStatus = 'synced';
        item.hasRealCover = true;
        item.coverUrl = URL.createObjectURL(file);
        renderWishlistView();
        setTimeout(() => api.loadHistory(state.peerId, state.topicId), 800);
      } catch (err) {
        console.error('[Wishlist] Update cover error:', err);
        item.syncStatus = 'error';
        renderWishlistView();
      }
    },

    async deleteItem(item) {
      const { mm } = this.getManagers();
      if (!mm || !item.mid || !state.peerId) return;

      try {
        await mm.deleteMessages(state.peerId, [item.mid], true);
        state.items.delete(item.mid);
        state.items.delete(String(item.mid));
        state.items.delete(Number(item.mid));
        renderWishlistView();
      } catch (err) {
        console.error('[Wishlist] Delete item error:', err);
      }
    }
  };

  const STYLES = `
    #main-columns.is-wishlist > #column-center,
    #main-columns.is-wishlist > #column-left {
      display: none !important;
    }

    #wishlist-container {
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

    #main-columns.is-wishlist #wishlist-container {
      display: flex !important;
    }

    .wishlist-header {
      height: 54px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
      box-sizing: border-box;
    }

    .wishlist-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;
    }

    .wishlist-board-title-badge {
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
      flex-shrink: 0;
    }

    .wishlist-search-input {
      max-width: 260px;
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

    .wishlist-search-input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--accent-color, #7daea3);
    }

    .wishlist-pills-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }

    .wishlist-pill {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.05);
      color: var(--secondary-text-color, #a89984);
      cursor: pointer;
      user-select: none;
      border: 1px solid transparent;
      transition: background 0.15s ease, color 0.15s ease;
      white-space: nowrap;
    }

    .wishlist-pill:hover {
      background: rgba(255, 255, 255, 0.09);
      color: var(--text-color, #ebdbb2);
    }

    .wishlist-pill.is-active {
      background: rgba(125, 174, 163, 0.18);
      color: var(--accent-color, #7daea3);
      border-color: rgba(125, 174, 163, 0.35);
      font-weight: 500;
    }

    .wishlist-header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .wishlist-stats-badge {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--text-color, #ebdbb2);
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      padding: 6px 12px;
      border-radius: 8px;
      white-space: nowrap;
    }

    .wishlist-btn {
      height: 34px;
      padding: 0 12px;
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
      transition: opacity 0.15s ease;
      user-select: none;
    }

    .wishlist-btn:hover {
      opacity: 0.9;
    }

    .wishlist-btn-secondary {
      background: rgba(255, 255, 255, 0.06);
      color: var(--text-color, #ebdbb2);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
    }

    .wishlist-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .wishlist-table-wrapper {
      flex: 1;
      min-height: 0;
      margin: 8px 16px 16px 16px;
      background: var(--surface-color, #282828);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-sizing: border-box;
    }

    .wishlist-table-scroll {
      flex: 1;
      min-height: 0;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    }

    .wishlist-table-scroll::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .wishlist-table-scroll::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    .wishlist-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      color: var(--text-color, #ebdbb2);
      text-align: left;
    }

    .wishlist-table th {
      position: sticky;
      top: 0;
      background: #32302f;
      padding: 10px 12px;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--secondary-text-color, #a89984);
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      user-select: none;
      cursor: pointer;
      white-space: nowrap;
      z-index: 2;
    }

    .wishlist-table th:hover {
      color: var(--text-color, #ebdbb2);
    }

    .wishlist-table td {
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.05));
      vertical-align: middle;
      box-sizing: border-box;
    }

    .wishlist-row {
      transition: background 0.1s ease;
    }

    .wishlist-row:hover {
      background: rgba(255, 255, 255, 0.035);
    }

    .wishlist-row.is-purchased {
      opacity: 0.55;
      background: rgba(0, 0, 0, 0.15);
    }

    .wishlist-row.is-purchased .wishlist-cell-model-text {
      text-decoration: line-through;
    }

    .wishlist-checkbox {
      appearance: auto;
      -webkit-appearance: auto;
      width: 16px;
      height: 16px;
      cursor: pointer;
      accent-color: var(--accent-color, #7daea3);
    }

    .wishlist-thumb-box {
      width: 44px;
      height: 44px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.15));
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      overflow: hidden;
      color: var(--secondary-text-color, #a89984);
      transition: border-color 0.15s ease, background 0.15s ease;
      position: relative;
    }

    .wishlist-thumb-box:hover {
      border-color: var(--accent-color, #7daea3);
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color, #ebdbb2);
    }

    .wishlist-thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .wishlist-inline-input {
      width: 100%;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 4px;
      color: var(--text-color, #ebdbb2);
      font-size: 13px;
      padding: 4px 6px;
      outline: none;
      box-sizing: border-box;
      font-family: inherit;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    .wishlist-inline-input:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .wishlist-inline-input:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--accent-color, #7daea3);
    }

    .wishlist-category-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11.5px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      user-select: none;
      transition: filter 0.12s ease;
      white-space: nowrap;
    }

    .wishlist-category-badge:hover {
      filter: brightness(1.2);
    }

    .wishlist-price-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
    }

    .wishlist-price-input {
      width: 90px;
      text-align: right;
      font-weight: 600;
    }

    .wishlist-currency-select {
      background: transparent;
      border: none;
      color: var(--accent-color, #7daea3);
      font-weight: 600;
      font-size: 13px;
      outline: none;
      cursor: pointer;
      padding: 2px;
    }

    .wishlist-currency-select option {
      background: #32302f;
      color: #ebdbb2;
    }

    .wishlist-link-cell {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .wishlist-link-icon-btn {
      color: var(--accent-color, #7daea3);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      border-radius: 4px;
      text-decoration: none;
    }

    .wishlist-link-icon-btn:hover {
      background: rgba(125, 174, 163, 0.15);
    }

    .wishlist-actions-cell {
      text-align: center;
      white-space: nowrap;
    }

    .wishlist-action-del-btn {
      background: transparent;
      border: none;
      color: var(--secondary-text-color, #a89984);
      padding: 6px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .wishlist-action-del-btn:hover {
      color: #ea6962;
      background: rgba(234, 105, 98, 0.2);
    }

    .wishlist-empty-state {
      padding: 48px 16px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      color: var(--secondary-text-color, #a89984);
      opacity: 0.75;
    }

    .wishlist-modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.65);
      backdrop-filter: blur(4px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: wishlist-fade-in 0.15s ease-out;
    }

    .wishlist-modal {
      background: #282828;
      border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
      border-radius: 12px;
      width: 480px;
      max-width: 90vw;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-sizing: border-box;
    }

    .wishlist-modal-header {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 600;
      font-size: 15px;
      color: var(--text-color, #ebdbb2);
    }

    .wishlist-modal-close {
      background: transparent;
      border: none;
      color: var(--secondary-text-color, #a89984);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .wishlist-modal-close:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-color, #ebdbb2);
    }

    .wishlist-modal-body {
      padding: 16px 18px;
      overflow-y: auto;
      max-height: 70vh;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-sizing: border-box;
    }

    .wishlist-modal-footer {
      padding: 12px 18px;
      border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      background: rgba(0, 0, 0, 0.15);
    }

    @keyframes wishlist-fade-in {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
  `;

  function injectStyles() {
    let style = document.getElementById('tg-wishlist-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tg-wishlist-styles';
      document.head.appendChild(style);
    }
    style.textContent = STYLES;
  }

  function renderSidebarTabs() {
    const scrollable = document.querySelector('#folders-sidebar .folders-sidebar__scrollable');
    if (!scrollable) return;

    let group = document.getElementById('folders-sidebar-wishlist-group');
    if (!group || !scrollable.contains(group)) {
      if (!group) {
        group = document.createElement('div');
        group.id = 'folders-sidebar-wishlist-group';
        group.className = 'folders-sidebar-wishlist-group';
      }
      scrollable.appendChild(group);

      if (!group.dataset.hasClickListener) {
        group.dataset.hasClickListener = '1';
        scrollable.addEventListener('click', (e) => {
          const clickedItem = e.target.closest('.folders-sidebar__folder-item');
          if (clickedItem && !clickedItem.classList.contains('wishlist-tab')) {
            deactivateWishlistView();
          }
        });
      }
    }

    if (!Array.isArray(state.boards) || state.boards.length === 0) {
      group.innerHTML = '';
      delete group.dataset.renderedKey;
      return;
    }

    const renderedKey = state.boards.map((b) => `${b.id}:${b.title}:${b.emojiRaw || ''}`).join('|') + `|active:${state.activeWishlistId}|isWishlist:${state.isWishlistActive}`;
    if (group.dataset.renderedKey === renderedKey && group.children.length > 0) {
      return;
    }
    group.dataset.renderedKey = renderedKey;

    const tabsHtml = state.boards
      .map((b) => {
        const isSelected = state.isWishlistActive && state.activeWishlistId === b.id;
        const shortTitle = b.title ? (b.title.length > 8 ? b.title.slice(0, 7) + '…' : b.title) : 'Wishlist';
        const iconHtml = b.emojiRaw
          ? `<span style="font-size:20px;line-height:24px;display:flex;align-items:center;justify-content:center;">${b.emojiRaw}</span>`
          : ICONS.gift;
        return `
          <div class="folders-sidebar__folder-item rp wishlist-tab ${isSelected ? 'folders-sidebar__folder-item--selected' : ''}"
               role="tab" tabindex="0" data-wishlist-id="${b.id}" title="${escapeHtml(b.title || 'Wishlist')}">
            <div class="folders-sidebar__folder-item-icon" style="display:flex;align-items:center;justify-content:center;">
              ${iconHtml}
            </div>
            <div class="folders-sidebar__folder-item-name">${escapeHtml(shortTitle)}</div>
          </div>
        `;
      })
      .join('');

    group.innerHTML = tabsHtml;

    group.querySelectorAll('.wishlist-tab').forEach((tab) => {
      tab.onclick = async (e) => {
        e.stopPropagation();
        const wishlistId = tab.getAttribute('data-wishlist-id');
        activateWishlistView();
        await api.selectWishlist(wishlistId);
      };
    });
  }

  function activateWishlistView() {
    state.isWishlistActive = true;
    const mainCols = document.getElementById('main-columns');
    if (mainCols) {
      mainCols.classList.remove('is-kanban');
      mainCols.classList.add('is-wishlist');
    }

    document.querySelectorAll('#folders-sidebar .folders-sidebar__folder-item--selected').forEach((el) => {
      el.classList.remove('folders-sidebar__folder-item--selected');
    });

    renderSidebarTabs();
    ensureWishlistDOM();

    if (state.items.size === 0 && state.peerId) {
      api.loadHistory(state.peerId, state.topicId);
    } else {
      renderWishlistView();
    }
  }

  function deactivateWishlistView() {
    state.isWishlistActive = false;
    const mainCols = document.getElementById('main-columns');
    if (mainCols) mainCols.classList.remove('is-wishlist');

    document.querySelectorAll('.wishlist-tab').forEach((el) => {
      el.classList.remove('folders-sidebar__folder-item--selected');
    });
  }

  function ensureWishlistDOM() {
    let container = document.getElementById('wishlist-container');
    if (!container) {
      const mainCols = document.getElementById('main-columns');
      if (!mainCols) return;

      container = document.createElement('div');
      container.id = 'wishlist-container';
      mainCols.appendChild(container);
    }
  }

  function closeActiveModal() {
    const modal = document.getElementById('wishlist-active-modal');
    if (modal) modal.remove();
  }

  function renderWishlistView() {
    const container = document.getElementById('wishlist-container');
    if (!container || !state.isWishlistActive) return;

    if (!state.boards || state.boards.length === 0) {
      container.innerHTML = `
        <div class="wishlist-empty-state" style="margin:auto;">
          ${ICONS.gift}
          <div style="font-size:16px;font-weight:600;color:var(--text-color, #ebdbb2);">No Wishlist Boards</div>
          <div style="max-width:360px;line-height:1.5;">
            Configure your Wishlist chat or topic in Settings to start tracking your wishlist.
          </div>
          <button class="wishlist-btn" id="wishlist-empty-settings-btn" style="margin-top:8px;">${ICONS.settings} Open Settings</button>
        </div>
      `;
      const btn = container.querySelector('#wishlist-empty-settings-btn');
      if (btn) btn.onclick = showSettingsModal;
      return;
    }

    const currentBoard = state.boards.find((b) => b.id === state.activeWishlistId);
    const boardTitle = currentBoard?.title || 'Wishlist';
    const headerIcon = currentBoard?.emojiRaw
      ? `<span style="font-size:16px;line-height:1;display:inline-flex;align-items:center;">${currentBoard.emojiRaw}</span>`
      : ICONS.gift;

    const allItems = Array.from(state.items.values());
    const activeCount = allItems.filter((i) => !i.purchased).length;
    const purchasedCount = allItems.filter((i) => i.purchased).length;

    let filtered = allItems.filter((item) => {
      if (state.viewTab === 'active' && item.purchased) return false;
      if (state.viewTab === 'purchased' && !item.purchased) return false;
      if (state.categoryFilter !== 'ALL' && item.category !== state.categoryFilter) return false;
      if (state.filterText) {
        const q = state.filterText.toLowerCase();
        const inModel = item.model.toLowerCase().includes(q);
        const inRat = item.rationale.toLowerCase().includes(q);
        const inAlt = item.alternatives.toLowerCase().includes(q);
        const inLink = item.link.toLowerCase().includes(q);
        return inModel || inRat || inAlt || inLink;
      }
      return true;
    });

    filtered.sort((a, b) => {
      if (state.sortField === 'model') {
        const res = a.model.localeCompare(b.model);
        return state.sortAsc ? res : -res;
      } else if (state.sortField === 'price') {
        const diff = a.price - b.price;
        return state.sortAsc ? diff : -diff;
      } else if (state.sortField === 'category') {
        const res = a.category.localeCompare(b.category);
        return state.sortAsc ? res : -res;
      } else if (state.sortField === 'date') {
        const diff = (a.date || 0) - (b.date || 0);
        return state.sortAsc ? diff : -diff;
      }
      // default: pos
      const diff = a.pos - b.pos;
      return state.sortAsc ? diff : -diff;
    });

    const currencyTotals = {};
    for (const item of filtered) {
      const cur = item.currency || 'RUB';
      currencyTotals[cur] = (currencyTotals[cur] || 0) + (item.price || 0);
    }
    const totalsStr = Object.entries(currencyTotals)
      .map(([cur, sum]) => `${formatPriceNumber(sum)} ${getCurrencySymbol(cur)}`)
      .join(' + ') || '0 ₽';

    container.innerHTML = `
      <div class="wishlist-header">
        <div class="wishlist-header-left">
          <div class="wishlist-board-title-badge" title="Active Wishlist">
            ${headerIcon}
            <span>${escapeHtml(boardTitle)}</span>
          </div>
          <input type="text" class="wishlist-search-input" id="wishlist-search" placeholder="Search wishlist..." value="${escapeHtml(state.filterText)}">
          <div class="wishlist-pills-bar">
            <div class="wishlist-pill ${state.viewTab === 'active' ? 'is-active' : ''}" data-view-tab="active">Active (${activeCount})</div>
            <div class="wishlist-pill ${state.viewTab === 'purchased' ? 'is-active' : ''}" data-view-tab="purchased">Purchased (${purchasedCount})</div>
            <div class="wishlist-pill ${state.viewTab === 'all' ? 'is-active' : ''}" data-view-tab="all">All (${allItems.length})</div>
            <span style="opacity:0.25;margin:0 2px;">|</span>
            <div class="wishlist-pill ${state.categoryFilter === 'ALL' ? 'is-active' : ''}" data-cat-pill="ALL">All Categories</div>
            ${CATEGORIES.map((cat) => `
              <div class="wishlist-pill ${state.categoryFilter === cat.id ? 'is-active' : ''}" data-cat-pill="${cat.id}">
                ${cat.label}
              </div>
            `).join('')}
          </div>
        </div>
        <div class="wishlist-header-right">
          <div class="wishlist-stats-badge" title="Total sum for visible items">
            ${filtered.length} items • ${totalsStr}
          </div>
          <button class="wishlist-btn" id="wishlist-add-item-btn">${ICONS.plus} Add Item</button>
          <button class="wishlist-btn wishlist-btn-secondary" id="wishlist-refresh-btn" title="Refresh">${ICONS.refresh}</button>
          <button class="wishlist-btn wishlist-btn-secondary" id="wishlist-settings-btn" title="Settings">${ICONS.settings}</button>
        </div>
      </div>
      <div class="wishlist-table-wrapper">
        <div class="wishlist-table-scroll">
          <table class="wishlist-table">
            <thead>
              <tr>
                <th style="width:36px;text-align:center;">✓</th>
                <th style="width:56px;text-align:center;">Preview</th>
                <th data-sort="model">Model ${renderSortIcon('model')}</th>
                <th style="width:140px;" data-sort="category">Category ${renderSortIcon('category')}</th>
                <th style="width:160px;" data-sort="price">Price ${renderSortIcon('price')}</th>
                <th style="width:105px;" data-sort="date">Added ${renderSortIcon('date')}</th>
                <th style="width:180px;">Link</th>
                <th>Rationale</th>
                <th>Alternatives</th>
                <th style="width:40px;text-align:center;"></th>
              </tr>
            </thead>
            <tbody>
              ${renderTableRows(filtered)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bindTableEvents();
  }

  function renderSortIcon(field) {
    if (state.sortField !== field) return '';
    return state.sortAsc ? ICONS.sortAsc : ICONS.sortDesc;
  }

  function renderTableRows(items) {
    if (items.length === 0) {
      return `
        <tr>
          <td colspan="10" style="text-align:center;padding:36px 16px;color:var(--secondary-text-color, #a89984);">
            No wishlist items found. Click "+ Add Item" to create one.
          </td>
        </tr>
      `;
    }

    return items
      .map((item) => {
        const catObj = CATEGORIES.find((c) => c.id === item.category) || CATEGORIES[0];
        const linkUrl = item.link && item.link.trim();
        const hasLink = linkUrl && /^https?:\/\//i.test(linkUrl);

        return `
          <tr class="wishlist-row ${item.purchased ? 'is-purchased' : ''}" data-item-mid="${item.mid}">
            <td style="text-align:center;">
              <input type="checkbox" class="wishlist-checkbox" data-check-mid="${item.mid}" ${item.purchased ? 'checked' : ''} title="Mark as purchased">
            </td>
            <td style="text-align:center;">
              <div class="wishlist-thumb-box" data-upload-mid="${item.mid}" title="Click to upload image">
                ${
                  item.hasRealCover && item.coverUrl
                    ? `<img class="wishlist-thumb-img" data-item-mid="${item.mid}" src="${item.coverUrl}" alt="Preview">`
                    : `${ICONS.image}`
                }
                <input type="file" class="wishlist-cover-input" data-file-mid="${item.mid}" accept="image/*" style="display:none;">
              </div>
            </td>
            <td>
              <input type="text" class="wishlist-inline-input wishlist-cell-model-text" data-field="model" data-mid="${item.mid}" value="${escapeHtml(item.model)}" placeholder="Item name...">
            </td>
            <td>
              <span class="wishlist-category-badge" data-cycle-cat="${item.mid}" style="background:${catObj.bg};color:${catObj.badgeColor};" title="Click to cycle category">
                ${catObj.label}
              </span>
            </td>
            <td>
              <div class="wishlist-price-wrap">
                <input type="number" class="wishlist-inline-input wishlist-price-input" data-field="price" data-mid="${item.mid}" value="${item.price || 0}" min="0" step="any">
                <select class="wishlist-currency-select" data-field="currency" data-mid="${item.mid}">
                  ${CURRENCIES.map((c) => `<option value="${c.code}" ${item.currency === c.code ? 'selected' : ''}>${c.symbol}</option>`).join('')}
                </select>
              </div>
            </td>
            <td style="color:var(--secondary-text-color, #a89984);white-space:nowrap;font-size:12px;">
              ${formatDate(item.date)}
            </td>
            <td>
              <div class="wishlist-link-cell">
                <input type="text" class="wishlist-inline-input" data-field="link" data-mid="${item.mid}" value="${escapeHtml(item.link)}" placeholder="Paste URL...">
                ${
                  hasLink
                    ? `<a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" class="wishlist-link-icon-btn" title="Open external link">${ICONS.externalLink}</a>`
                    : ''
                }
              </div>
            </td>
            <td>
              <input type="text" class="wishlist-inline-input" data-field="rationale" data-mid="${item.mid}" value="${escapeHtml(item.rationale)}" placeholder="Why is it needed?">
            </td>
            <td>
              <input type="text" class="wishlist-inline-input" data-field="alternatives" data-mid="${item.mid}" value="${escapeHtml(item.alternatives)}" placeholder="Considered alternatives...">
            </td>
            <td class="wishlist-actions-cell">
              <button class="wishlist-action-del-btn" data-del-mid="${item.mid}" title="Delete item">${ICONS.trash}</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  function bindTableEvents() {
    const container = document.getElementById('wishlist-container');
    if (!container) return;

    const searchInput = container.querySelector('#wishlist-search');
    if (searchInput) {
      searchInput.oninput = (e) => {
        state.filterText = e.target.value;
        renderWishlistView();
      };
    }

    container.querySelectorAll('[data-view-tab]').forEach((pill) => {
      pill.onclick = () => {
        state.viewTab = pill.getAttribute('data-view-tab');
        renderWishlistView();
      };
    });

    container.querySelectorAll('[data-cat-pill]').forEach((pill) => {
      pill.onclick = () => {
        state.categoryFilter = pill.getAttribute('data-cat-pill');
        renderWishlistView();
      };
    });

    const addBtn = container.querySelector('#wishlist-add-item-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        api.createItem('New item', state.categoryFilter !== 'ALL' ? state.categoryFilter : 'A', 0, 'RUB');
      };
    }

    const refreshBtn = container.querySelector('#wishlist-refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        api.loadWishlistRegistry();
        if (state.peerId) {
          api.loadHistory(state.peerId, state.topicId);
        }
      };
    }

    const settingsBtn = container.querySelector('#wishlist-settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = showSettingsModal;
    }

    container.querySelectorAll('th[data-sort]').forEach((th) => {
      th.onclick = () => {
        const field = th.getAttribute('data-sort');
        if (state.sortField === field) {
          state.sortAsc = !state.sortAsc;
        } else {
          state.sortField = field;
          state.sortAsc = true;
        }
        renderWishlistView();
      };
    });

    container.querySelectorAll('[data-check-mid]').forEach((chk) => {
      chk.onchange = (e) => {
        const mid = chk.getAttribute('data-check-mid');
        const item = state.items.get(Number(mid)) || state.items.get(mid);
        if (item) {
          api.updateItem(item, { purchased: e.target.checked });
        }
      };
    });

    container.querySelectorAll('[data-cycle-cat]').forEach((badge) => {
      badge.onclick = (e) => {
        e.stopPropagation();
        const mid = badge.getAttribute('data-cycle-cat');
        const item = state.items.get(Number(mid)) || state.items.get(mid);
        if (item) {
          const catOrder = ['A', 'B', 'C'];
          const currentIdx = catOrder.indexOf(item.category || 'A');
          const nextCat = catOrder[(currentIdx + 1) % catOrder.length];
          api.updateItem(item, { category: nextCat });
        }
      };
    });

    container.querySelectorAll('.wishlist-inline-input').forEach((input) => {
      input.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      };

      input.onchange = () => {
        const mid = input.getAttribute('data-mid');
        const field = input.getAttribute('data-field');
        const item = state.items.get(Number(mid)) || state.items.get(mid);
        if (!item) return;

        let val = input.value;
        if (field === 'price') {
          val = Number(val) || 0;
        }
        api.updateItem(item, { [field]: val });
      };
    });

    container.querySelectorAll('.wishlist-currency-select').forEach((sel) => {
      sel.onchange = () => {
        const mid = sel.getAttribute('data-mid');
        const item = state.items.get(Number(mid)) || state.items.get(mid);
        if (item) {
          api.updateItem(item, { currency: sel.value });
        }
      };
    });

    container.querySelectorAll('[data-upload-mid]').forEach((box) => {
      const mid = box.getAttribute('data-upload-mid');
      const fileInput = box.querySelector(`input[data-file-mid="${mid}"]`);

      box.onclick = (e) => {
        if (e.target !== fileInput && fileInput) {
          fileInput.click();
        }
      };

      if (fileInput) {
        fileInput.onchange = () => {
          if (fileInput.files && fileInput.files[0]) {
            const item = state.items.get(Number(mid)) || state.items.get(mid);
            if (item) {
              api.updateItemCover(item, fileInput.files[0]);
            }
          }
        };
      }
    });

    container.querySelectorAll('[data-del-mid]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const mid = btn.getAttribute('data-del-mid');
        const item = state.items.get(Number(mid)) || state.items.get(mid);
        if (item && confirm(`Delete "${item.model || 'this item'}" from wishlist?`)) {
          await api.deleteItem(item);
        }
      };
    });
  }

  function showSettingsModal() {
    closeActiveModal();

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'wishlist-modal-backdrop';
    modalBackdrop.id = 'wishlist-active-modal';

    let localBoards = JSON.parse(JSON.stringify(state.boards || []));

    function renderBoardsList() {
      const listContainer = modalBackdrop.querySelector('#settings-boards-list');
      if (!listContainer) return;

      if (localBoards.length === 0) {
        listContainer.innerHTML = `
          <div style="padding:16px;text-align:center;color:var(--secondary-text-color, #a89984);font-size:13px;">
            No wishlists configured yet. Click "+ Add Wishlist" below.
          </div>
        `;
        return;
      }

      listContainer.innerHTML = localBoards
        .map((b, idx) => {
          const rawId = Math.abs(b.peerId);
          const link = b.topicId ? `https://t.me/c/${rawId}/${b.topicId}` : `https://t.me/c/${rawId}`;
          return `
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:10px;">
              <input type="text" class="wishlist-inline-input" style="width:40px;text-align:center;font-size:16px;" data-board-emoji="${idx}" value="${escapeHtml(b.emojiRaw || '🎁')}">
              <div style="flex:1;display:flex;flex-direction:column;gap:4px;">
                <input type="text" class="wishlist-inline-input" style="font-weight:600;" data-board-title="${idx}" value="${escapeHtml(b.title || 'Wishlist')}" placeholder="Wishlist title...">
                <input type="text" class="wishlist-inline-input" style="font-size:12px;color:var(--secondary-text-color, #a89984);" data-board-link="${idx}" value="${escapeHtml(link)}" placeholder="https://t.me/c/<id>/<topic>">
              </div>
              <button class="wishlist-action-del-btn" data-del-board="${idx}" title="Remove wishlist">${ICONS.trash}</button>
            </div>
          `;
        })
        .join('');

      listContainer.querySelectorAll('[data-board-emoji]').forEach((inp) => {
        inp.onchange = (e) => {
          const idx = Number(inp.getAttribute('data-board-emoji'));
          if (localBoards[idx]) localBoards[idx].emojiRaw = e.target.value.trim() || '🎁';
        };
      });

      listContainer.querySelectorAll('[data-board-title]').forEach((inp) => {
        inp.onchange = (e) => {
          const idx = Number(inp.getAttribute('data-board-title'));
          if (localBoards[idx]) localBoards[idx].title = e.target.value.trim();
        };
      });

      listContainer.querySelectorAll('[data-board-link]').forEach((inp) => {
        inp.onchange = (e) => {
          const idx = Number(inp.getAttribute('data-board-link'));
          const target = parseBoardTarget(e.target.value.trim());
          if (target && localBoards[idx]) {
            localBoards[idx].peerId = target.peerId;
            localBoards[idx].topicId = target.topicId;
          }
        };
      });

      listContainer.querySelectorAll('[data-del-board]').forEach((btn) => {
        btn.onclick = () => {
          const idx = Number(btn.getAttribute('data-del-board'));
          localBoards.splice(idx, 1);
          renderBoardsList();
        };
      });
    }

    modalBackdrop.innerHTML = `
      <div class="wishlist-modal" onclick="event.stopPropagation()">
        <div class="wishlist-modal-header">
          <span>Wishlist Settings</span>
          <button class="wishlist-modal-close" id="wishlist-settings-close-btn">${ICONS.close}</button>
        </div>
        <div class="wishlist-modal-body">
          <div style="font-size:13px;line-height:1.5;color:var(--secondary-text-color, #a89984);">
            Add links to Telegram channels or topics where your wishlists are stored. Settings are synchronized with your Saved Messages.
          </div>
          <div id="settings-boards-list" style="display:flex;flex-direction:column;gap:8px;"></div>
          <button class="wishlist-btn wishlist-btn-secondary" id="settings-add-board-btn" style="align-self:flex-start;">
            ${ICONS.plus} Add Wishlist
          </button>
        </div>
        <div class="wishlist-modal-footer">
          <button class="wishlist-btn wishlist-btn-secondary" id="settings-cancel-btn">Cancel</button>
          <button class="wishlist-btn" id="settings-save-btn">Save Changes</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);

    modalBackdrop.onclick = closeActiveModal;
    modalBackdrop.querySelector('#wishlist-settings-close-btn').onclick = closeActiveModal;
    modalBackdrop.querySelector('#settings-cancel-btn').onclick = closeActiveModal;

    renderBoardsList();

    modalBackdrop.querySelector('#settings-add-board-btn').onclick = () => {
      const link = prompt('Enter Telegram channel or topic link (e.g. https://t.me/c/123456789/10):');
      if (link && link.trim()) {
        const target = parseBoardTarget(link.trim());
        if (target) {
          const id = 'wishlist_' + (target.topicId ? `${target.peerId}_${target.topicId}` : target.peerId);
          localBoards.push({
            id,
            peerId: target.peerId,
            topicId: target.topicId,
            title: 'Wishlist',
            emojiRaw: '🎁'
          });
          renderBoardsList();
        } else {
          alert('Invalid link format. Must be a t.me/c/<id>/<topic> link.');
        }
      }
    };

    modalBackdrop.querySelector('#settings-save-btn').onclick = async () => {
      closeActiveModal();
      state.boards = localBoards;
      await api.syncWishlistRegistryToSavedMessages(localBoards);
      if (state.boards.length > 0) {
        if (!state.boards.some((b) => b.id === state.activeWishlistId)) {
          await api.selectWishlist(state.boards[0].id);
        } else {
          renderSidebarTabs();
          renderWishlistView();
        }
      } else {
        state.activeWishlistId = null;
        renderSidebarTabs();
        renderWishlistView();
      }
    };
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
        registryDebounce = setTimeout(() => api.loadWishlistRegistry(), 800);
        return;
      }

      if (detail?.peerId === state.peerId) {
        const msg = win.apiManagerProxy?.getMessageByPeer(state.peerId, detail.mid);
        if (!msg) return;

        const msgThreadId = getMessageThreadId(msg, state.peerId);
        if (state.topicId && msgThreadId && msgThreadId !== state.topicId) return;

        const item = parseItemFromMessage(msg);
        if (item) {
          const existing = state.items.get(item.mid) || state.items.get(String(item.mid)) || state.items.get(Number(item.mid));
          if (existing?.coverUrl) item.coverUrl = existing.coverUrl;
          item.syncStatus = 'synced';
          state.items.set(item.mid, item);
          if (state.isWishlistActive) {
            renderWishlistView();
            if (item.hasRealCover && !item.coverUrl) {
              api.resolveCovers();
            }
          }
        }
      }
    });

    rootScope.addEventListener('message_sent', (e) => {
      const detail = e.detail || e;
      if (detail?.message?.peerId === state.peerId) {
        const msg = detail.message;
        const msgThreadId = getMessageThreadId(msg, state.peerId);
        if (state.topicId && msgThreadId && msgThreadId !== state.topicId) return;

        const item = parseItemFromMessage(msg);
        if (item) {
          if (detail.tempId) {
            const existing = state.items.get(detail.tempId) || state.items.get(String(detail.tempId)) || state.items.get(Number(detail.tempId));
            if (existing?.coverUrl) item.coverUrl = existing.coverUrl;
            state.items.delete(detail.tempId);
            state.items.delete(String(detail.tempId));
            state.items.delete(Number(detail.tempId));
          }
          item.syncStatus = 'synced';
          state.items.set(item.mid, item);
          if (state.isWishlistActive) {
            renderWishlistView();
            if (item.hasRealCover && !item.coverUrl) {
              api.resolveCovers();
            }
          }
        }
      }
    });

    rootScope.addEventListener('history_append', (e) => {
      const detail = e.detail || e;
      if (detail?.message?.peerId === state.peerId) {
        const msg = detail.message;
        const msgThreadId = getMessageThreadId(msg, state.peerId);
        if (state.topicId && msgThreadId && msgThreadId !== state.topicId) return;

        const item = parseItemFromMessage(msg);
        if (item) {
          const existing = state.items.get(item.mid) || state.items.get(String(item.mid)) || state.items.get(Number(item.mid));
          if (existing?.coverUrl) item.coverUrl = existing.coverUrl;
          item.syncStatus = 'synced';
          state.items.set(item.mid, item);
          if (state.isWishlistActive) {
            renderWishlistView();
            if (item.hasRealCover && !item.coverUrl) {
              api.resolveCovers();
            }
          }
        }
      }
    });

    rootScope.addEventListener('history_delete', (e) => {
      const detail = e.detail || e;
      if (detail?.peerId === state.peerId && Array.isArray(detail.msgs)) {
        let changed = false;
        for (const mid of detail.msgs) {
          if (state.items.has(mid) || state.items.has(String(mid)) || state.items.has(Number(mid))) {
            state.items.delete(mid);
            state.items.delete(String(mid));
            state.items.delete(Number(mid));
            changed = true;
          }
        }
        if (changed && state.isWishlistActive) renderWishlistView();
      }
    });
  }

  function init() {
    injectStyles();

    let isRegistryLoaded = false;
    const interval = setInterval(() => {
      if (win.rootScope?.managers?.appMessagesManager && win.apiManagerProxy) {
        const currentMyId = win.rootScope?.myId || win.rootScope?.managers?.appUsersManager?.getSelf()?.id;
        if (currentMyId && state.myId && currentMyId !== state.myId) {
          deactivateWishlistView();
          state.myId = currentMyId;
          state.boardsRegistryMid = null;
          state.boards = [];
          state.items.clear();
          state.activeWishlistId = null;
          api.loadWishlistRegistry();
        }

        if (!isRegistryLoaded) {
          isRegistryLoaded = true;
          api.loadWishlistRegistry();
          setupRealtimeListeners();
        }
        renderSidebarTabs();
      }
    }, 1000);
  }

  init();
})();
