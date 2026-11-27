// ==UserScript==
// @name           ⚙ [Avito] Hide & Filter Chats
// @namespace      github.com/koresent/userscripts
// @version        1.0.1
// @description    Hide unwanted Avito chats and filter hidden chats with a single click
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.avito.ru/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/avito/hide-chats.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/avito/hide-chats.user.js
//
// @match          https://www.avito.ru/profile/messenger*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'avito_hidden_chats';

  const ICONS = {
    eyeOff: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`,
    eye: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    undo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
  };

  const State = {
    showOnlyHidden: false,
    hiddenChats: {},
    menuIds: []
  };

  function loadHiddenChats() {
    try {
      State.hiddenChats = GM_getValue(STORAGE_KEY, {});
      if (typeof State.hiddenChats !== 'object' || State.hiddenChats === null) {
        State.hiddenChats = {};
      }
    } catch (e) {
      State.hiddenChats = {};
    }
  }

  function saveHiddenChats() {
    try {
      GM_setValue(STORAGE_KEY, State.hiddenChats);
    } catch (e) {
      console.error('[Avito Hide Chats] Failed to save storage:', e);
    }
    updateMenu();
    updateFilterPillCount();
  }

  function isChatHidden(chatId) {
    return Boolean(chatId && State.hiddenChats[chatId]);
  }

  function hideChat(chatId, info) {
    if (!chatId) return;
    State.hiddenChats[chatId] = {
      id: chatId,
      title: info.title || 'Чат',
      itemTitle: info.itemTitle || '',
      hiddenAt: Date.now()
    };
    saveHiddenChats();
    applyChatVisibility();
  }

  function unhideChat(chatId) {
    if (!chatId || !State.hiddenChats[chatId]) return;
    delete State.hiddenChats[chatId];
    saveHiddenChats();
    applyChatVisibility();
  }

  function clearAllHidden() {
    const count = Object.keys(State.hiddenChats).length;
    if (count === 0) {
      alert('Список скрытых чатов уже пуст.');
      return;
    }
    const confirmed = confirm(`Восстановить все скрытые чаты (${count} шт.) в общий список?`);
    if (confirmed) {
      State.hiddenChats = {};
      saveHiddenChats();
      applyChatVisibility();
    }
  }

  function extractChatId(linkEl) {
    const channelDiv = linkEl.querySelector('[data-marker="channels/channel"]');
    if (channelDiv) {
      const dataId = channelDiv.getAttribute('data-id');
      if (dataId) return dataId;
    }

    const href = linkEl.getAttribute('href') || '';
    const match = href.match(/\/profile\/messenger\/channel\/([^?#/]+)/);
    return match ? match[1] : null;
  }

  function extractChatInfo(linkEl) {
    const userTitleEl = linkEl.querySelector('[data-marker="channels/user-title"]');
    const itemTitleEl = linkEl.querySelector('[data-marker="channels/item-title"]');

    return {
      title: userTitleEl ? userTitleEl.innerText.trim() : 'Чат',
      itemTitle: itemTitleEl ? itemTitleEl.innerText.trim() : ''
    };
  }

  function injectStyles() {
    if (document.getElementById('avito-hide-chats-styles')) return;

    const style = document.createElement('style');
    style.id = 'avito-hide-chats-styles';
    style.textContent = `
      /* Chat list items visibility */
      a[data-marker="channels/channelLink"].avito-chat-is-hidden {
        display: none !important;
      }

      /* Chat action button */
      .avito-chat-action-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 8px;
        border: none;
        background: rgba(128, 128, 128, 0.12);
        color: inherit;
        cursor: pointer;
        padding: 0;
        margin-left: 6px;
        opacity: 0.45;
        transition: opacity 0.15s ease, background 0.15s ease, transform 0.15s ease;
        flex-shrink: 0;
        position: relative;
        z-index: 10;
        pointer-events: auto;
      }

      .avito-chat-action-btn.avito-chat-action-btn-fallback {
        position: absolute;
        right: 12px;
        top: 50%;
        transform: translateY(-50%);
        margin-left: 0;
      }

      .avito-chat-action-btn svg,
      .avito-chat-action-btn svg * {
        pointer-events: none !important;
      }

      a[data-marker="channels/channelLink"]:hover .avito-chat-action-btn,
      .avito-chat-action-btn:hover {
        opacity: 1;
        background: rgba(128, 128, 128, 0.25);
        transform: scale(1.08);
      }

      .avito-chat-action-btn.avito-chat-action-btn-fallback:hover {
        transform: translateY(-50%) scale(1.08);
      }

      .avito-chat-action-btn.avito-restore-btn {
        opacity: 0.85;
        background: rgba(0, 132, 255, 0.15);
        color: #0084ff;
      }

      .avito-chat-action-btn.avito-restore-btn:hover {
        opacity: 1;
        background: rgba(0, 132, 255, 0.28);
      }

      /* Filter bar pill */
      .avito-hidden-filter-pill {
        display: inline-flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
        margin-left: 2px;
        flex-shrink: 0;
        position: relative;
        z-index: 5;
      }

      .avito-hidden-filter-pill svg,
      .avito-hidden-filter-pill svg *,
      .avito-hidden-filter-pill span {
        pointer-events: none !important;
      }

      .avito-hidden-filter-pill input {
        display: none;
      }

      .avito-hidden-filter-pill-wrapper {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 12px;
        border-radius: 12px;
        background: rgba(128, 128, 128, 0.1);
        color: inherit;
        font-size: 13px;
        font-weight: 500;
        font-family: inherit;
        border: 1px solid rgba(140, 130, 115, 0.15);
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }

      .avito-hidden-filter-pill:hover .avito-hidden-filter-pill-wrapper {
        background: rgba(128, 128, 128, 0.18);
      }

      .avito-hidden-filter-pill.is-active .avito-hidden-filter-pill-wrapper {
        background: #0084ff;
        color: #ffffff;
        border-color: #0084ff;
      }

      .avito-hidden-filter-pill-count {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        border-radius: 9px;
        font-size: 11px;
        font-weight: 600;
        background: rgba(128, 128, 128, 0.2);
        color: inherit;
      }

      .avito-hidden-filter-pill.is-active .avito-hidden-filter-pill-count {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
      }

      /* Empty state inside chat list */
      .avito-empty-hidden-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        text-align: center;
        color: #888;
        font-family: inherit;
      }

      .avito-empty-hidden-icon {
        margin-bottom: 12px;
        opacity: 0.6;
      }

      .avito-empty-hidden-title {
        font-size: 15px;
        font-weight: 600;
        color: inherit;
        margin-bottom: 6px;
      }

      .avito-empty-hidden-desc {
        font-size: 13px;
        line-height: 1.4;
        max-width: 280px;
        opacity: 0.8;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function updateFilterPillCount() {
    const pill = document.getElementById('avito-hidden-filter-pill');
    if (!pill) return;

    const countEl = pill.querySelector('.avito-filter-pill-count');
    const newCount = String(Object.keys(State.hiddenChats).length);
    if (countEl && countEl.textContent !== newCount) {
      countEl.textContent = newCount;
    }

    if (State.showOnlyHidden && !pill.classList.contains('is-active')) {
      pill.classList.add('is-active');
    } else if (!State.showOnlyHidden && pill.classList.contains('is-active')) {
      pill.classList.remove('is-active');
    }
  }

  function ensureFilterPill() {
    const filtersContainer = document.querySelector('[data-marker="channels-filters"]');
    if (!filtersContainer) return;

    let pill = document.getElementById('avito-hidden-filter-pill');
    if (!pill) {
      pill = document.createElement('label');
      pill.id = 'avito-hidden-filter-pill';
      pill.className = `avito-hidden-filter-pill ${State.showOnlyHidden ? 'is-active' : ''}`;
      pill.title = 'Переключить показ скрытых чатов';

      pill.innerHTML = `
        <input type="checkbox" ${State.showOnlyHidden ? 'checked' : ''}>
        <span class="avito-hidden-filter-pill-wrapper">
          ${ICONS.eyeOff}
          <span>Скрытые</span>
          <span class="avito-filter-pill-count">${Object.keys(State.hiddenChats).length}</span>
        </span>
      `;

      const stopCapture = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };

      pill.addEventListener('pointerdown', stopCapture, true);
      pill.addEventListener('mousedown', stopCapture, true);
      pill.addEventListener('pointerup', stopCapture, true);
      pill.addEventListener('mouseup', stopCapture, true);

      pill.addEventListener('click', (e) => {
        stopCapture(e);
        State.showOnlyHidden = !State.showOnlyHidden;
        updateFilterPillCount();
        applyChatVisibility();
      }, true);

      filtersContainer.appendChild(pill);
    } else {
      updateFilterPillCount();
    }
  }

  function ensureChatButton(linkEl) {
    const chatId = extractChatId(linkEl);
    if (!chatId) return;

    const hidden = isChatHidden(chatId);
    let container = linkEl.querySelector('[class*="asideBottom"]');
    let isFallback = false;

    if (!container) {
      container = linkEl.querySelector('[class*="aside"]');
    }
    if (!container) {
      container = linkEl.querySelector('[data-marker="channels/channel"]') || linkEl;
      isFallback = true;
    }

    let btn = linkEl.querySelector('.avito-chat-action-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'avito-chat-action-btn' + (isFallback ? ' avito-chat-action-btn-fallback' : '');
      btn.type = 'button';

      const stopCapture = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };

      btn.addEventListener('pointerdown', stopCapture, true);
      btn.addEventListener('mousedown', stopCapture, true);
      btn.addEventListener('pointerup', stopCapture, true);
      btn.addEventListener('mouseup', stopCapture, true);

      btn.addEventListener('click', (e) => {
        stopCapture(e);
        const currentHidden = isChatHidden(chatId);
        if (currentHidden) {
          unhideChat(chatId);
        } else {
          const info = extractChatInfo(linkEl);
          hideChat(chatId, info);
        }
      }, true);

      container.appendChild(btn);
    }

    const targetState = hidden ? 'restore' : 'hide';
    if (btn.dataset.state !== targetState) {
      btn.dataset.state = targetState;
      if (hidden) {
        btn.className = 'avito-chat-action-btn avito-restore-btn' + (isFallback ? ' avito-chat-action-btn-fallback' : '');
        btn.title = 'Вернуть чат в общий список';
        btn.innerHTML = ICONS.undo;
      } else {
        btn.className = 'avito-chat-action-btn' + (isFallback ? ' avito-chat-action-btn-fallback' : '');
        btn.title = 'Скрыть этот чат';
        btn.innerHTML = ICONS.eyeOff;
      }
    }
  }

  function applyChatVisibility() {
    const chatLinks = document.querySelectorAll('a[data-marker="channels/channelLink"]');
    let visibleCount = 0;

    chatLinks.forEach((linkEl) => {
      const chatId = extractChatId(linkEl);
      if (!chatId) return;

      const hidden = isChatHidden(chatId);
      ensureChatButton(linkEl);

      const isHiddenClass = linkEl.classList.contains('avito-chat-is-hidden');

      if (State.showOnlyHidden) {
        if (hidden) {
          if (isHiddenClass) linkEl.classList.remove('avito-chat-is-hidden');
          visibleCount++;
        } else {
          if (!isHiddenClass) linkEl.classList.add('avito-chat-is-hidden');
        }
      } else {
        if (hidden) {
          if (!isHiddenClass) linkEl.classList.add('avito-chat-is-hidden');
        } else {
          if (isHiddenClass) linkEl.classList.remove('avito-chat-is-hidden');
          visibleCount++;
        }
      }
    });

    updateEmptyState(visibleCount);
  }

  function updateEmptyState(visibleCount) {
    const chatList = document.querySelector('[data-marker="channels/list"]');
    if (!chatList) return;

    let emptyContainer = document.getElementById('avito-empty-hidden-chats');

    if (State.showOnlyHidden && visibleCount === 0) {
      if (!emptyContainer) {
        emptyContainer = document.createElement('div');
        emptyContainer.id = 'avito-empty-hidden-chats';
        emptyContainer.className = 'avito-empty-hidden-container';

        const totalHidden = Object.keys(State.hiddenChats).length;
        const descText = totalHidden === 0
          ? 'Вы еще не скрыли ни одного чата. Нажмите на иконку глаза на любом чате в общем списке.'
          : 'Скрытые чаты находятся дальше по списку. Прокрутите страницу вниз для загрузки.';

        emptyContainer.innerHTML = `
          <div class="avito-empty-hidden-icon">${ICONS.eyeOff}</div>
          <div class="avito-empty-hidden-title">Нет скрытых чатов</div>
          <div class="avito-empty-hidden-desc">${descText}</div>
        `;

        const scrollContainer = chatList.querySelector('[class*="innerWrap"]') || chatList;
        scrollContainer.appendChild(emptyContainer);
      }
    } else if (emptyContainer) {
      emptyContainer.remove();
    }
  }

  let rafId = null;
  function scheduleUpdate() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      ensureFilterPill();
      applyChatVisibility();
    });
  }

  function setupObserver() {
    const observer = new MutationObserver(() => {
      scheduleUpdate();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function setupHistoryHook() {
    const notifyState = () => {
      setTimeout(() => {
        scheduleUpdate();
      }, 100);
    };

    window.addEventListener('popstate', notifyState);

    const originalPushState = history.pushState;
    if (originalPushState) {
      history.pushState = function (...args) {
        const ret = originalPushState.apply(this, args);
        notifyState();
        return ret;
      };
    }

    const originalReplaceState = history.replaceState;
    if (originalReplaceState) {
      history.replaceState = function (...args) {
        const ret = originalReplaceState.apply(this, args);
        notifyState();
        return ret;
      };
    }
  }

  function updateMenu() {
    if (window.self !== window.top) return;

    if (typeof GM_unregisterMenuCommand === 'function') {
      State.menuIds.forEach((id) => GM_unregisterMenuCommand(id));
      State.menuIds = [];
    }

    if (typeof GM_registerMenuCommand !== 'function') return;

    const count = Object.keys(State.hiddenChats).length;

    State.menuIds.push(
      GM_registerMenuCommand(
        `${State.showOnlyHidden ? '👁 Показать обычные чаты' : '👁‍🗨 Показать скрытые чаты'} (${count})`,
        () => {
          State.showOnlyHidden = !State.showOnlyHidden;
          updateFilterPillCount();
          applyChatVisibility();
        }
      )
    );

    if (count > 0) {
      State.menuIds.push(
        GM_registerMenuCommand(`🗑 Восстановить все скрытые чаты (${count})`, clearAllHidden)
      );
    }
  }

  function init() {
    loadHiddenChats();
    injectStyles();
    updateMenu();
    setupObserver();
    setupHistoryHook();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', scheduleUpdate);
    } else {
      scheduleUpdate();
    }
  }

  init();
})();
