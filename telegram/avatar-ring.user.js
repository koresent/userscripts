// ==UserScript==
// @name           ⚙ [Telegram Web K] Avatar online ring indicator
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Avatar online ring indicator instead of online dot
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/avatar-ring.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/avatar-ring.user.js
//
// @match          https://web.telegram.org/k/*
//
// @run-at         document-start
// ==/UserScript==

(function () {
  "use strict";

  const CSS_STYLES = `
    :root {
      --avatar-ring-color: var(--avatar-online-color, #0ac630);
      --avatar-ring-width: 2.5px;
      --avatar-ring-gap: 2px;
      --avatar-ring-active-color: #ffffff;
    }

    /* Hide native online dot */
    .avatar.is-online::after,
    .dialog-avatar.is-online::after {
      display: none !important;
      content: none !important;
    }

    /* Online ring indicator */
    .avatar.is-online,
    .dialog-avatar.is-online {
      outline: var(--avatar-ring-width) solid var(--avatar-ring-color) !important;
      outline-offset: var(--avatar-ring-gap) !important;
      border-radius: 50% !important;
      transition: outline-color 0.2s ease, outline-offset 0.2s ease !important;
    }

    /* Active chat item */
    .chatlist-chat.active .avatar.is-online,
    .chatlist-chat.active .dialog-avatar.is-online {
      outline-color: var(--avatar-ring-active-color) !important;
    }

    /* Chat bubble avatars */
    .bubbles-group-avatar.is-online,
    .bubbles-group-avatar-container .avatar.is-online {
      outline-width: 2px !important;
      outline-offset: 1.5px !important;
    }

    /* Group member list avatars */
    .chatlist-chat-abitbigger .avatar.is-online,
    .chatlist-chat-abitbigger .dialog-avatar.is-online {
      outline-width: var(--avatar-ring-width) !important;
      outline-offset: var(--avatar-ring-gap) !important;
    }

    /* Chat header avatar */
    .chat-topbar .avatar.is-online,
    .person-avatar.is-online {
      outline-width: 2.5px !important;
      outline-offset: 2px !important;
    }

    /* Offset when stories ring is active */
    .avatar.has-stories.is-online,
    .dialog-avatar.has-stories.is-online {
      outline-offset: calc(var(--avatar-ring-gap) + 3px) !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById("tweb-avatar-ring-style")) return;
    const style = document.createElement("style");
    style.id = "tweb-avatar-ring-style";
    style.textContent = CSS_STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyles);
  } else {
    injectStyles();
  }

  const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

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
      if (user.status?._ === "userStatusOnline") {
        const now = (Date.now() / 1000) | 0;
        if (!user.status.expires || user.status.expires >= now) {
          return true;
        }
      }
    }
    return false;
  }

  function checkAvatarOnline(avatar) {
    // Retain Telegram's native is-online flag if already applied
    if (avatar.classList.contains("is-online")) {
      return true;
    }

    const peerId = avatar.dataset.peerId;
    if (!peerId) return false;
    const numId = Number(peerId);
    if (!numId || numId <= 0) return false;

    if (isUserOnline(numId)) {
      return true;
    }

    // Text status fallback for contact and member rows
    const row = avatar.closest(".chatlist-chat, .selector-user, .chatlist-chat-abitbigger");
    if (row) {
      const subtitle = row.querySelector(".dialog-subtitle, .row-subtitle");
      if (subtitle) {
        const text = subtitle.textContent.trim().toLowerCase();
        if (
          text === "online" ||
          text === "в сети" ||
          text === "en ligne" ||
          text === "en línea" ||
          text === "conectado"
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function updateAvatar(avatar) {
    const peerId = avatar.dataset.peerId;
    if (!peerId || Number(peerId) <= 0) return;

    const isChatlistAvatar =
      avatar.classList.contains("dialog-avatar") ||
      !!avatar.closest(".chatlist-chat-bigger, #chatlist-container");

    if (isChatlistAvatar) {
      // In the chat list, Telegram manages is-online on dialog avatars; do not strip it.
      if (avatar.classList.contains("is-online")) {
        return;
      }
      if (isUserOnline(peerId)) {
        avatar.classList.add("is-online");
      }
      return;
    }

    // Non-chatlist avatars (group members, contacts, header)
    const online = checkAvatarOnline(avatar);
    if (avatar.classList.contains("is-online") !== online) {
      avatar.classList.toggle("is-online", online);
    }
  }

  function updatePeerAvatars(peerId) {
    if (!peerId) return;
    const avatars = document.querySelectorAll(
      `.avatar[data-peer-id="${peerId}"], .dialog-avatar[data-peer-id="${peerId}"]`,
    );
    avatars.forEach(updateAvatar);
  }

  let scanRafId = null;
  function scheduleScan() {
    if (scanRafId) return;
    scanRafId = requestAnimationFrame(() => {
      scanRafId = null;
      const avatars = document.querySelectorAll(
        '.avatar[data-peer-id]:not([data-peer-id^="-"]), .dialog-avatar[data-peer-id]:not([data-peer-id^="-"])',
      );
      avatars.forEach(updateAvatar);
    });
  }

  let hooked = false;
  function hookTweb() {
    if (hooked) return;
    if (win.rootScope) {
      win.rootScope.addEventListener("user_update", (userId) => {
        updatePeerAvatars(userId);
      });
      hooked = true;
    } else {
      setTimeout(hookTweb, 300);
    }
  }

  hookTweb();

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (let i = 0; i < mutations.length; i++) {
      const mutation = mutations[i];
      if (mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        const target = mutation.target;
        // Skip dialog avatars to avoid re-triggering scans on native transitions
        if (target.classList.contains("dialog-avatar")) {
          continue;
        }
        if (
          target.classList.contains("avatar") ||
          target.classList.contains("chatlist-chat")
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

  function startObserver() {
    const root = document.getElementById("main-columns") || document.body;
    if (root) {
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "data-peer-id"],
      });
      scheduleScan();
    } else {
      setTimeout(startObserver, 200);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startObserver);
  } else {
    startObserver();
  }

  // Periodic scan to clear expired online statuses
  setInterval(scheduleScan, 15000);
})();
