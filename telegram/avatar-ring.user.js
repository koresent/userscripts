// ==UserScript==
// @name           ⚙ [Telegram Web K] Avatar online ring indicator
// @namespace      github.com/koresent/userscripts
// @version        1.1.0
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

    /* Base ring state kept transparent and tucked inward so enter/exit transitions interpolate smoothly */
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

    /* Preserve Telegram native sticky bottom transition alongside ring animation */
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
    const peerId = avatar.dataset.peerId;
    if (!peerId) return false;
    const numId = Number(peerId);
    if (!numId || numId <= 0) return false;

    const user = getApiUser(numId);
    if (user) {
      return isUserOnline(numId);
    }

    // Text status fallback for contact and member rows when API user is unavailable
    const row = avatar.closest(".chatlist-chat, .selector-user, .chatlist-chat-abitbigger");
    if (row) {
      const subtitle = row.querySelector(".dialog-subtitle, .row-subtitle");
      if (subtitle) {
        const text = subtitle.textContent.trim().toLowerCase();
        return (
          text === "online" ||
          text === "в сети" ||
          text === "en ligne" ||
          text === "en línea" ||
          text === "conectado"
        );
      }
    }

    // Retain Telegram's native flag when neither API user nor subtitle is available
    if (!avatar.dataset.twebRingManaged && avatar.classList.contains("is-online")) {
      return true;
    }

    return false;
  }

  function updateAvatar(avatar) {
    const peerId = avatar.dataset.peerId;
    if (!peerId || Number(peerId) <= 0) return;

    const isChatlistAvatar = !!avatar.closest(".chatlist-chat-bigger, #chatlist-container");

    if (isChatlistAvatar) {
      // In the chat list, let Telegram manage its own native is-online flag
      if (!avatar.dataset.twebRingManaged && avatar.classList.contains("is-online")) {
        return;
      }
      if (isUserOnline(peerId)) {
        if (!avatar.classList.contains("is-online")) {
          avatar.classList.add("is-online");
          avatar.dataset.twebRingManaged = "1";
        }
      } else if (avatar.dataset.twebRingManaged === "1") {
        avatar.classList.remove("is-online");
        delete avatar.dataset.twebRingManaged;
      }
      return;
    }

    // Non-chatlist avatars (group members, contacts, header, bubbles)
    const online = checkAvatarOnline(avatar);
    if (online) {
      if (!avatar.classList.contains("is-online")) {
        avatar.classList.add("is-online");
        avatar.dataset.twebRingManaged = "1";
      }
    } else if (avatar.classList.contains("is-online")) {
      avatar.classList.remove("is-online");
      delete avatar.dataset.twebRingManaged;
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
