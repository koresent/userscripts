// ==UserScript==
// @name           ⚙ [Telegram Web K] Tweaks
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    All-in-one tweaks for Telegram Web K: Avatar online ring, No Stories, and Chat Exporter
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/tweaks.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/tweaks.user.js
//
// @match          https://web.telegram.org/k/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const config = {
    avatarRing: GM_getValue('avatarRing', true),
    noStories: GM_getValue('noStories', true),
    chatExport: GM_getValue('chatExport', true)
  };

  let menuIds = [];

  function updateConfig(key, value) {
    config[key] = value;
    GM_setValue(key, value);
    renderMenu();
    if (key === 'avatarRing') {
      value ? AvatarRingModule.enable() : AvatarRingModule.disable();
    } else if (key === 'noStories') {
      value ? NoStoriesModule.enable() : NoStoriesModule.disable();
    } else if (key === 'chatExport') {
      value ? ChatExportModule.enable() : ChatExportModule.disable();
    }
  }

  function renderMenu() {
    if (window.self !== window.top) return;

    if (typeof GM_unregisterMenuCommand === 'function') {
      menuIds.forEach((id) => GM_unregisterMenuCommand(id));
    }
    menuIds = [];

    if (typeof GM_registerMenuCommand !== 'function') return;

    menuIds.push(
      GM_registerMenuCommand(
        `${config.avatarRing ? '✅' : '❌'} Avatar online ring`,
        () => updateConfig('avatarRing', !config.avatarRing)
      )
    );

    menuIds.push(
      GM_registerMenuCommand(
        `${config.noStories ? '✅' : '❌'} Hide Stories`,
        () => updateConfig('noStories', !config.noStories)
      )
    );

    menuIds.push(
      GM_registerMenuCommand(
        `${config.chatExport ? '✅' : '❌'} Chat Exporter in menu`,
        () => updateConfig('chatExport', !config.chatExport)
      )
    );

    menuIds.push(
      GM_registerMenuCommand('    ↳ Export Chat (TOON)', () =>
        ChatExportModule.exportChat('toon')
      )
    );

    menuIds.push(
      GM_registerMenuCommand('    ↳ Export Chat (JSON)', () =>
        ChatExportModule.exportChat('json')
      )
    );
  }

  /* -------------------------------------------------------------------------- */
  /* MODULE: Avatar Online Ring                                                 */
  /* -------------------------------------------------------------------------- */
  const AvatarRingModule = (function () {
    const STYLE_ID = 'tweb-avatar-ring-style';

    const CSS_STYLES = `
      :root {
        --avatar-ring-color: var(--avatar-online-color, #0ac630);
        --avatar-ring-width: 2.5px;
        --avatar-ring-gap: 2px;
        --avatar-ring-active-color: #ffffff;
        --avatar-ring-duration-in: 0.3s;
        --avatar-ring-duration-out: 0.28s;
        --avatar-ring-ease: cubic-bezier(0.4, 0, 0.2, 1);
      }

      @media (prefers-reduced-motion: reduce) {
        :root {
          --avatar-ring-duration-in: 0s;
          --avatar-ring-duration-out: 0s;
        }
      }

      /* Hide native online dot */
      .avatar.is-online::after,
      .dialog-avatar.is-online::after {
        display: none !important;
        content: none !important;
      }

      /* Base ring state kept transparent and tucked inward */
      .avatar:not(.is-forum),
      .dialog-avatar:not(.is-forum) {
        --_ring-width: var(--avatar-ring-width);
        --_ring-gap: var(--avatar-ring-gap);
        --_ring-color: var(--avatar-ring-color);
        outline: var(--_ring-width) solid transparent !important;
        outline-offset: calc(var(--_ring-gap) - 2px) !important;
        border-radius: 50% !important;
        transition:
          outline-color var(--avatar-ring-duration-out) var(--avatar-ring-ease),
          outline-offset var(--avatar-ring-duration-out) var(--avatar-ring-ease);
      }

      /* Online ring indicator */
      .avatar:not(.is-forum).is-online,
      .dialog-avatar:not(.is-forum).is-online {
        outline-color: var(--_ring-color) !important;
        outline-offset: var(--_ring-gap) !important;
        transition:
          outline-color var(--avatar-ring-duration-in) var(--avatar-ring-ease),
          outline-offset var(--avatar-ring-duration-in) var(--avatar-ring-ease);
      }

      /* Active chat item */
      .chatlist-chat.active .avatar:not(.is-forum),
      .chatlist-chat.active .dialog-avatar:not(.is-forum) {
        --_ring-color: var(--avatar-ring-active-color);
      }

      /* Chat bubble avatars */
      .bubbles-group-avatar:not(.is-forum),
      .bubbles-group-avatar-container .avatar:not(.is-forum) {
        --_ring-width: 2px;
        --_ring-gap: 1.5px;
      }

      /* Preserve Telegram native sticky bottom transition */
      body.animation-level-2 .bubbles-group-avatar:not(.is-forum) {
        transition:
          bottom var(--transition-standard-out),
          outline-color var(--avatar-ring-duration-out) var(--avatar-ring-ease),
          outline-offset var(--avatar-ring-duration-out) var(--avatar-ring-ease);
      }

      body.animation-level-2 .bubbles-group-avatar:not(.is-forum).is-online {
        transition:
          bottom var(--transition-standard-out),
          outline-color var(--avatar-ring-duration-in) var(--avatar-ring-ease),
          outline-offset var(--avatar-ring-duration-in) var(--avatar-ring-ease);
      }

      /* Group member list avatars */
      .chatlist-chat-abitbigger .avatar:not(.is-forum),
      .chatlist-chat-abitbigger .dialog-avatar:not(.is-forum) {
        --_ring-width: var(--avatar-ring-width);
        --_ring-gap: var(--avatar-ring-gap);
      }

      /* Chat header avatar */
      .chat-topbar .avatar:not(.is-forum),
      .person-avatar:not(.is-forum) {
        --_ring-width: 2.5px;
        --_ring-gap: 2px;
      }

      /* Offset when stories ring is active */
      .avatar.has-stories:not(.is-forum),
      .dialog-avatar.has-stories:not(.is-forum) {
        --_ring-gap: calc(var(--avatar-ring-gap) + 3px);
      }
    `;

    let scanRafId = null;
    let scanIntervalId = null;
    let observer = null;
    let hooked = false;
    let isRunning = false;

    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS_STYLES;
      (document.head || document.documentElement).appendChild(style);
    }

    function removeStyles() {
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
    }

    function getApiUser(numId) {
      try {
        if (win.apiManagerProxy?.getUser) {
          return win.apiManagerProxy.getUser(numId);
        }
      } catch (e) {}

      try {
        const users = win.rootScope?.managers?.appUsersManager?.users;
        if (users && users[numId]) return users[numId];
      } catch (e) {}

      return null;
    }

    function isUserOnline(userId) {
      if (!userId) return false;
      const numId = Number(userId);
      if (!numId || numId <= 0) return false;

      const user = getApiUser(numId);
      if (
        user &&
        !user.pFlags?.bot &&
        !user.pFlags?.deleted &&
        !user.pFlags?.support
      ) {
        if (user.status?._ === 'userStatusOnline') {
          const now = (Date.now() / 1000) | 0;
          if (!user.status.expires || user.status.expires >= now) {
            return true;
          }
        }
      }
      return false;
    }

    function checkAvatarOnline(avatar) {
      const peerId = avatar.dataset.peerId;
      if (!peerId) return false;
      const numId = Number(peerId);
      if (!numId || numId <= 0) return false;

      const user = getApiUser(numId);
      if (user) {
        return isUserOnline(numId);
      }

      const row = avatar.closest(
        '.chatlist-chat, .selector-user, .chatlist-chat-abitbigger'
      );
      if (row) {
        const subtitle = row.querySelector('.dialog-subtitle, .row-subtitle');
        if (subtitle) {
          const text = subtitle.textContent.trim().toLowerCase();
          return (
            text === 'online' ||
            text === 'в сети' ||
            text === 'en ligne' ||
            text === 'en línea' ||
            text === 'conectado'
          );
        }
      }

      if (!avatar.dataset.twebRingManaged && avatar.classList.contains('is-online')) {
        return true;
      }

      return false;
    }

    function updateAvatar(avatar) {
      const peerId = avatar.dataset.peerId;
      if (!peerId || Number(peerId) <= 0) return;

      const isChatlistAvatar = !!avatar.closest(
        '.chatlist-chat-bigger, #chatlist-container'
      );

      if (isChatlistAvatar) {
        if (!avatar.dataset.twebRingManaged && avatar.classList.contains('is-online')) {
          return;
        }
        if (isUserOnline(peerId)) {
          if (!avatar.classList.contains('is-online')) {
            avatar.classList.add('is-online');
            avatar.dataset.twebRingManaged = '1';
          }
        } else if (avatar.dataset.twebRingManaged === '1') {
          avatar.classList.remove('is-online');
          delete avatar.dataset.twebRingManaged;
        }
        return;
      }

      const online = checkAvatarOnline(avatar);
      if (online) {
        if (!avatar.classList.contains('is-online')) {
          avatar.classList.add('is-online');
          avatar.dataset.twebRingManaged = '1';
        }
      } else if (avatar.classList.contains('is-online')) {
        avatar.classList.remove('is-online');
        delete avatar.dataset.twebRingManaged;
      }
    }

    function updatePeerAvatars(peerId) {
      if (!isRunning || !peerId) return;
      const avatars = document.querySelectorAll(
        `.avatar[data-peer-id="${peerId}"], .dialog-avatar[data-peer-id="${peerId}"]`
      );
      avatars.forEach(updateAvatar);
    }

    function scheduleScan() {
      if (!isRunning || scanRafId) return;
      scanRafId = requestAnimationFrame(() => {
        scanRafId = null;
        if (!isRunning) return;
        const avatars = document.querySelectorAll(
          '.avatar[data-peer-id]:not([data-peer-id^="-"]), .dialog-avatar[data-peer-id]:not([data-peer-id^="-"])'
        );
        avatars.forEach(updateAvatar);
      });
    }

    function hookTweb() {
      if (hooked) return;
      if (win.rootScope) {
        win.rootScope.addEventListener('user_update', (userId) => {
          updatePeerAvatars(userId);
        });
        hooked = true;
      } else {
        setTimeout(hookTweb, 300);
      }
    }

    function startObserver() {
      if (observer) observer.disconnect();

      observer = new MutationObserver((mutations) => {
        if (!isRunning) return;
        let shouldScan = false;
        for (let i = 0; i < mutations.length; i++) {
          const mutation = mutations[i];
          if (mutation.addedNodes.length > 0) {
            shouldScan = true;
            break;
          }
          if (
            mutation.type === 'attributes' &&
            mutation.attributeName === 'class'
          ) {
            const target = mutation.target;
            if (target.classList?.contains('dialog-avatar')) {
              continue;
            }
            if (
              target.classList?.contains('avatar') ||
              target.classList?.contains('chatlist-chat')
            ) {
              shouldScan = true;
              break;
            }
          }
        }
        if (shouldScan) {
          scheduleScan();
        }
      });

      const root = document.getElementById('main-columns') || document.body;
      if (root) {
        observer.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-peer-id']
        });
        scheduleScan();
      } else {
        setTimeout(startObserver, 200);
      }
    }

    function enable() {
      if (isRunning) return;
      isRunning = true;
      injectStyles();
      hookTweb();
      startObserver();
      if (!scanIntervalId) {
        scanIntervalId = setInterval(scheduleScan, 15000);
      }
      scheduleScan();
    }

    function disable() {
      if (!isRunning) return;
      isRunning = false;
      removeStyles();

      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (scanIntervalId) {
        clearInterval(scanIntervalId);
        scanIntervalId = null;
      }
      if (scanRafId) {
        cancelAnimationFrame(scanRafId);
        scanRafId = null;
      }

      document
        .querySelectorAll('[data-tweb-ring-managed="1"]')
        .forEach((avatar) => {
          avatar.classList.remove('is-online');
          delete avatar.dataset.twebRingManaged;
        });
    }

    return {
      enable,
      disable
    };
  })();

  /* -------------------------------------------------------------------------- */
  /* MODULE: No Stories                                                         */
  /* -------------------------------------------------------------------------- */
  const NoStoriesModule = (function () {
    const STYLE_ID = 'tweb-no-stories-style';
    const STORY_TEXT_REGEX = /stories|истори/i;
    const STORY_ICON_CODE = '\uea3b';

    const CSS_STYLES = `
      /* --- Stories Header Tray in Sidebar --- */
      .stories-list,
      #column-left .stories-list,
      #chats-archived-container .stories-list,
      #column-left.is-collapsed .item-main .stories-list {
        display: none !important;
        height: 0 !important;
        max-height: 0 !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        overflow: hidden !important;
      }

      /* Prevent downward translation when pulling at the top of the chat list */
      #column-left .connection-status-bottom,
      #chats-archived-container .sidebar-content {
        --stories-scrolled: 92px !important;
        transform: none !important;
      }

      /* --- Avatars: Stories Rings & Canvas Overlays --- */
      canvas.avatar-stories-svg,
      .avatar-stories-svg,
      .avatar-stories-simple,
      .avatar.has-stories canvas,
      .dialog-avatar.has-stories canvas,
      [class*="_hasStories_"] canvas,
      [class*="_hasStories_"] .avatar-stories-simple {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Keep avatars interactive for profile/chat opening */
      .avatar.has-stories,
      .dialog-avatar.has-stories,
      [class*="_hasStories_"] {
        pointer-events: auto !important;
      }

      /* --- Profile: Stories Previews & Fake Stacked Avatars --- */
      .profile-story-previews-container,
      .profile-story-previews,
      .profile-story-preview,
      .profile-avatars-container.has-stories .profile-avatars-avatar-fake {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      .has-stories .profile-avatars-avatar-first {
        transform: none !important;
      }

      /* --- Shared Media: Stories Tabs & Album Grids --- */
      .search-super-container-stories,
      .search-super-content-stories,
      .search-super-content-stories-albums {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* --- My Stories & Archived Stories Containers --- */
      .my-stories-container,
      .archive-stories-container {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* --- Fullscreen Stories Viewer & Modal Overlays --- */
      #stories-viewer,
      [class*="_ViewerStory_"],
      [class*="_Viewer_"] .stories-input {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* --- Chat Bubbles: Mentions, Replies & Expired Stories --- */
      .bubble-story-mention-wrapper,
      .dialog-subtitle-ico-storyreply,
      .expired-story-icon,
      .topbar-search-left-stories,
      .video-recording-stage--over-stories,
      .statistics-post-story,
      clipPath#story-item-clip {
        display: none !important;
      }
    `;

    let observer = null;
    let viewerObserver = null;
    let isRunning = false;

    function injectStyles() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS_STYLES;
      (document.head || document.documentElement).appendChild(style);
    }

    function removeStyles() {
      const style = document.getElementById(STYLE_ID);
      if (style) style.remove();
    }

    function purgeMenuItems(root = document) {
      const items = root.querySelectorAll('.btn-menu-item');
      for (const item of items) {
        const icon = item.querySelector('.btn-menu-item-icon');
        const text = item.textContent || '';
        if (
          icon?.textContent?.includes(STORY_ICON_CODE) ||
          STORY_TEXT_REGEX.test(text)
        ) {
          item.remove();
        }
      }
    }

    function purgeSharedMediaTabs(root = document) {
      const tabs = root.querySelectorAll(
        '.search-super-tabs-scrollable .menu-horizontal-div-item'
      );
      for (const tab of tabs) {
        if (STORY_TEXT_REGEX.test(tab.textContent || '')) {
          tab.remove();
        }
      }
    }

    function stripStoryClasses(root = document) {
      const elements = root.querySelectorAll(
        ".has-stories, [class*='_hasStories_']"
      );
      for (const el of elements) {
        el.classList.remove('has-stories');
      }
    }

    function setupViewerGuard() {
      const viewer = document.getElementById('stories-viewer');
      if (!viewer) return;

      if (viewerObserver) viewerObserver.disconnect();
      viewerObserver = new MutationObserver(() => {
        if (viewer.childNodes.length > 0) {
          viewer.querySelectorAll('video, audio').forEach((media) => {
            media.pause();
            media.src = '';
          });
          viewer.replaceChildren();
        }
      });
      viewerObserver.observe(viewer, { childList: true });
    }

    function observeDOM() {
      if (observer) observer.disconnect();
      observer = new MutationObserver((mutations) => {
        if (!isRunning) return;
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== 1) continue;

            if (
              node.classList?.contains('btn-menu') ||
              node.querySelector?.('.btn-menu-item')
            ) {
              purgeMenuItems(node);
            }

            if (
              node.classList?.contains('search-super-tabs-scrollable') ||
              node.querySelector?.('.search-super-tabs-scrollable')
            ) {
              purgeSharedMediaTabs(node);
            }

            if (
              node.classList?.contains('has-stories') ||
              node.querySelector?.('.has-stories')
            ) {
              stripStoryClasses(node);
            }

            if (node.id === 'stories-viewer') {
              setupViewerGuard();
            }
          }
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
      });
    }

    function isStoryTrigger(el) {
      if (!el || typeof el.closest !== 'function') return null;
      if (el.closest('a[href], input, textarea, select')) return null;

      const mention = el.closest('.bubble-story-mention-wrapper');
      if (mention) return mention;

      if (el.closest('.bubbles-scrollable')) return null;

      const storyComponent = el.closest(
        ".stories-list, .avatar-stories-svg, .avatar-stories-simple, .profile-story-preview, [class*='_ViewerStory_']"
      );
      if (storyComponent) return storyComponent;

      const labeled = el.closest('[aria-label]');
      if (labeled && !labeled.closest('.bubbles-scrollable')) {
        const label = labeled.getAttribute('aria-label') || '';
        const isHistory = /histor|истор.*(сообщ|чат|поиск|звон)|очистить/i.test(
          label
        );
        if (!isHistory) {
          if (
            /\bstor(y|ies)\b/i.test(label) ||
            /(?:^|[^а-яёa-z])истори[ияю](?:$|[^а-яёa-z])/i.test(label)
          ) {
            return labeled;
          }
        }
      }

      return null;
    }

    function onClickCapture(e) {
      if (!isRunning) return;
      const trigger = isStoryTrigger(e.target);
      if (trigger) {
        e.stopPropagation();
        e.preventDefault();
      }
    }

    function enable() {
      if (isRunning) return;
      isRunning = true;
      injectStyles();
      setupViewerGuard();
      observeDOM();
      purgeMenuItems();
      purgeSharedMediaTabs();
      stripStoryClasses();
      document.addEventListener('click', onClickCapture, true);
    }

    function disable() {
      if (!isRunning) return;
      isRunning = false;
      removeStyles();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (viewerObserver) {
        viewerObserver.disconnect();
        viewerObserver = null;
      }
      document.removeEventListener('click', onClickCapture, true);
    }

    return {
      enable,
      disable
    };
  })();

  /* -------------------------------------------------------------------------- */
  /* MODULE: Chat Exporter (Lazy MTProto & UI)                                  */
  /* -------------------------------------------------------------------------- */
  const ChatExportModule = (function () {
    const EXPORT_CONFIG = {
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
    let menuObserver = null;
    let isRunning = false;

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
      if (typeof val === 'number')
        return Number.isFinite(val) ? String(val) : 'null';
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
            lines.push(
              `${encodeToonKey(key)}[${val.length}]{${fields.map(encodeToonKey).join(',')}}:`
            );
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
      if (type === 'messageMediaGeo' || type === 'messageMediaVenue')
        return '<location>';
      if (type === 'messageMediaContact') return '<contact>';
      if (type === 'messageMediaPoll') return '<poll>';
      if (type === 'messageMediaDice') return '<dice>';

      if (type === 'messageMediaDocument') {
        const doc = media.document;
        if (!doc) return '<document>';

        const attrs = doc.attributes || [];
        const isSticker = attrs.some((a) => a._ === 'documentAttributeSticker');
        if (isSticker) return '<sticker>';

        const isVoice = attrs.some(
          (a) => a._ === 'documentAttributeAudio' && a.voice
        );
        if (isVoice) return '<voice message>';

        const isRound = attrs.some(
          (a) => a._ === 'documentAttributeVideo' && a.round_message
        );
        if (isRound) return '<video message>';

        const isVideo = attrs.some((a) => a._ === 'documentAttributeVideo');
        if (isVideo) return '<video>';

        const isAudio = attrs.some((a) => a._ === 'documentAttributeAudio');
        if (isAudio) return '<audio>';

        const fileNameAttr = attrs.find(
          (a) => a._ === 'documentAttributeFilename'
        );
        return fileNameAttr
          ? `<file: ${fileNameAttr.file_name}>`
          : '<document>';
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
      const fromId =
        msg.from_id?.user_id ||
        msg.from_id?.channel_id ||
        msg.peer_id?.user_id ||
        peerId;
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
      let toast = document.getElementById(EXPORT_CONFIG.progressToastId);

      if (isFinished) {
        if (toast) {
          toast.textContent = `Export complete: ${count} messages saved`;
          setTimeout(() => toast?.remove(), 2500);
        }
        return;
      }

      if (!toast) {
        toast = document.createElement('div');
        toast.id = EXPORT_CONFIG.progressToastId;
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
            limit: EXPORT_CONFIG.batchLimit,
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

          if (
            res.isEnd?.top ||
            res.isEnd?.both ||
            addedInBatch === 0 ||
            minMid === offsetId
          ) {
            break;
          }

          offsetId = minMid;
          await sleep(EXPORT_CONFIG.requestDelayMs, signal);
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
        const timestamp = new Date()
          .toISOString()
          .slice(0, 19)
          .replace(/[:T]/g, '-');

        if (format === 'toon') {
          triggerDownload(
            serializeToon(payload),
            `tg_${safeTitle}_${timestamp}.toon`,
            'text/plain;charset=utf-8'
          );
        } else {
          triggerDownload(
            JSON.stringify(payload, null, 2),
            `tg_${safeTitle}_${timestamp}.json`,
            'application/json;charset=utf-8'
          );
        }

        updateProgressToast(resultMessages.length, true);
      } else {
        const toast = document.getElementById(EXPORT_CONFIG.progressToastId);
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
      if (
        menu.querySelector(`#${EXPORT_CONFIG.itemJsonId}`) ||
        menu.querySelector(`#${EXPORT_CONFIG.itemStopId}`)
      ) {
        return;
      }

      const items = Array.from(menu.querySelectorAll('.btn-menu-item'));
      const isChatMenu = items.some((it) => {
        const text = it.innerText || '';
        return (
          text.includes('Select Messages') ||
          text.includes('Clear history') ||
          text.includes('Change Wallpaper') ||
          text.includes('Mute')
        );
      });

      if (!isChatMenu) return;

      const anchorItem =
        items.find((it) => it.innerText.includes('Select Messages')) ||
        items[0];
      if (!anchorItem) return;

      if (activeAbortController) {
        const stopItem = createMenuItem(
          EXPORT_CONFIG.itemStopId,
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

      const itemToon = createMenuItem(
        EXPORT_CONFIG.itemToonId,
        '',
        'Export Chat (TOON)',
        () => exportChat('toon')
      );
      const itemJson = createMenuItem(
        EXPORT_CONFIG.itemJsonId,
        '',
        'Export Chat (JSON)',
        () => exportChat('json')
      );

      anchorItem.after(itemToon);
      anchorItem.after(itemJson);
    }

    function enable() {
      if (isRunning) return;
      isRunning = true;
      if (!menuObserver) {
        menuObserver = new MutationObserver(() => {
          if (!isRunning) return;
          const activeMenus = document.querySelectorAll('.btn-menu.active');
          activeMenus.forEach(injectIntoMenu);
        });
        menuObserver.observe(document.body, { childList: true, subtree: true });
      }
    }

    function disable() {
      if (!isRunning) return;
      isRunning = false;
      if (menuObserver) {
        menuObserver.disconnect();
        menuObserver = null;
      }
      document
        .querySelectorAll(
          `#${EXPORT_CONFIG.itemJsonId}, #${EXPORT_CONFIG.itemToonId}, #${EXPORT_CONFIG.itemStopId}`
        )
        .forEach((el) => el.remove());
    }

    return {
      enable,
      disable,
      exportChat
    };
  })();

  /* -------------------------------------------------------------------------- */
  /* INITIALIZATION                                                             */
  /* -------------------------------------------------------------------------- */
  renderMenu();

  if (config.avatarRing) {
    AvatarRingModule.enable();
  }

  if (config.noStories) {
    NoStoriesModule.enable();
  }

  if (config.chatExport) {
    ChatExportModule.enable();
  }
})();
