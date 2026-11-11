// ==UserScript==
// @name           ⚙ [Telegram Web K] Gruvbox Dark
// @namespace      github.com/koresent/userscripts
// @version        1.1.2
// @description    Gruvbox Dark theme for Telegram Web K with native carousel tile, wallpaper tiling, and peer wallpaper isolation
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/gruvbox.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/gruvbox.user.js
//
// @match          https://web.telegram.org/k/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          unsafeWindow
// ==/UserScript==

(function () {
  "use strict";

  const win = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  function normalizeWallpaperSource(str) {
    if (!str) return "";
    const clean = str.trim().replace(/^url\(["']?|["']?\)$/gi, "");
    if (!clean) return "";

    if (/^(https?:\/\/|blob:|data:)/i.test(clean)) {
      return clean;
    }

    if (clean.startsWith("iVBORw0KGgo")) {
      return `data:image/png;base64,${clean}`;
    }
    if (clean.startsWith("/9j/")) {
      return `data:image/jpeg;base64,${clean}`;
    }
    if (clean.startsWith("R0lGOD")) {
      return `data:image/gif;base64,${clean}`;
    }
    if (clean.startsWith("UklGR")) {
      return `data:image/webp;base64,${clean}`;
    }
    if (clean.startsWith("PHN2Zy") || clean.startsWith("PD94bW")) {
      return `data:image/svg+xml;base64,${clean}`;
    }

    if (/^[A-Za-z0-9+/=]+$/.test(clean) && clean.length > 50) {
      return `data:image/png;base64,${clean}`;
    }

    return clean;
  }

  const CONFIG = {
    get isGruvbox() {
      return GM_getValue("tg_gruvbox_active", true);
    },
    set isGruvbox(val) {
      GM_setValue("tg_gruvbox_active", !!val);
    },

    get wallpaperUrl() {
      return GM_getValue("tg_gruvbox_wallpaper", "");
    },
    set wallpaperUrl(val) {
      GM_setValue("tg_gruvbox_wallpaper", normalizeWallpaperSource(val));
    },

    get tileWallpaper() {
      return GM_getValue("tg_gruvbox_tile", false);
    },
    set tileWallpaper(val) {
      GM_setValue("tg_gruvbox_tile", !!val);
    },

    get tileSize() {
      return GM_getValue("tg_gruvbox_tile_size", "auto");
    },
    set tileSize(val) {
      GM_setValue("tg_gruvbox_tile_size", val.trim() || "auto");
    },
  };

  const styleEl = document.createElement("style");
  styleEl.id = "tg-gruvbox-styles";

  const GRUVBOX_CSS = `
    /* Deep CSS variable overrides */
    html[data-gruvbox="true"],
    html[data-gruvbox="true"] body,
    html[data-gruvbox="true"] #middle-column,
    html[data-gruvbox="true"] .chat,
    html[data-gruvbox="true"] .bubbles,
    html[data-gruvbox="true"] .sidebar-left,
    html[data-gruvbox="true"] .sidebar-right {
        --primary-color: #b8bb26 !important;
        --primary-color-rgb: 184, 187, 38 !important;
        --secondary-color: #a89984 !important;
        --secondary-color-rgb: 168, 153, 132 !important;
        --surface-color: #282828 !important;
        --surface-color-rgb: 40, 40, 40 !important;
        --background-color: #1d2021 !important;
        --background-color-rgb: 29, 32, 33 !important;
        --body-background-color: #1d2021 !important;
        --border-color: #3c3836 !important;
        --primary-text-color: #ebdbb2 !important;
        --secondary-text-color: #a89984 !important;
        --message-out-background-color: #384323 !important;
        --message-out-gradient-display: none !important;
        --message-out-gradient-under: #384323 !important;
        --message-out-time-color: #a89984 !important;
        --message-out-status-color: #b8bb26 !important;
        --message-time-color: #a89984 !important;
        --message-status-color: #b8bb26 !important;
        --message-in-time-color: #a89984 !important;
        --message-in-status-color: #a89984 !important;
        --message-background-color: #32302f !important;
        --message-highlighting-color: #32302f !important;
        --message-highlighting-color-rgb: 50, 48, 47 !important;
        --link-color: #b8bb26 !important;
        --green-color: #b8bb26 !important;
        --badge-color: #b8bb26 !important;
        --badge-text-color: #1d2021 !important;
        --input-search-background-color: #1d2021 !important;
        --input-label-color: #7c6f64 !important;
        --input-placeholder-color: #7c6f64 !important;
        --theme-background-color: #1d2021 !important;
        --avatar-online-color: #b8bb26 !important;
        --light-filled-primary-color: #3c3836 !important;
        --light-primary-color: rgba(184, 187, 38, 0.15) !important;
    }

    html[data-gruvbox="true"] body {
        background-color: #1d2021 !important;
        color: #ebdbb2 !important;
    }

    /* Sidebars, headers, and tabs - unified #282828 surface */
    html[data-gruvbox="true"] .sidebar-left,
    html[data-gruvbox="true"] #column-left,
    html[data-gruvbox="true"] .sidebar-right,
    html[data-gruvbox="true"] #column-right,
    html[data-gruvbox="true"] .sidebar-slider-item,
    html[data-gruvbox="true"] .item-main,
    html[data-gruvbox="true"] .sidebar-header,
    html[data-gruvbox="true"] .main-search-sidebar-header,
    html[data-gruvbox="true"] .chatlist-selection-header,
    html[data-gruvbox="true"] .chat-search,
    html[data-gruvbox="true"] .chatlist-cover,
    html[data-gruvbox="true"] .chatlist,
    html[data-gruvbox="true"] .sidebar-left-section,
    html[data-gruvbox="true"] .folders-tabs,
    html[data-gruvbox="true"] .folders-tabs-scrollable,
    html[data-gruvbox="true"] .menu-horizontal-scrollable,
    html[data-gruvbox="true"] .menu-horizontal-div,
    html[data-gruvbox="true"] #chatlist-container {
        background-color: #282828 !important;
        color: #ebdbb2 !important;
    }

    /* Remove contrasting shadows and gradients that darken the folders bar */
    html[data-gruvbox="true"] .folders-tabs-scrollable,
    html[data-gruvbox="true"] .menu-horizontal-scrollable {
        box-shadow: none !important;
    }
    html[data-gruvbox="true"] .folders-tabs-gradient,
    html[data-gruvbox="true"] .menu-horizontal-gradient {
        display: none !important;
    }

    /* Active folder tab pill */
    html[data-gruvbox="true"] .menu-horizontal-div-item-background {
        background-color: #3c3836 !important;
    }

    /* Vertical folders sidebar */
    html[data-gruvbox="true"] .folders-sidebar,
    html[data-gruvbox="true"].night .folders-sidebar {
        --folders-sidebar-item-color: #a89984 !important;
        --folders-sidebar-item-selected-color: #b8bb26 !important;
        --folders-sidebar-background: #282828 !important;
        --folders-sidebar-background-hover: #32302f !important;
        --folders-sidebar-item-ripple-color: rgba(184, 187, 38, 0.15) !important;
        background-color: #282828 !important;
        color: #a89984 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__background,
    html[data-gruvbox="true"] .folders-sidebar__background--dark-pattern {
        --folders-sidebar-background: #282828 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__background-gradient {
        display: none !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__background-tint,
    html[data-gruvbox="true"] .folders-sidebar__background--no-gradient .folders-sidebar__background-tint {
        background-color: #282828 !important;
        backdrop-filter: none !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__scrollable,
    html[data-gruvbox="true"].night .folders-sidebar__scrollable {
        --border-color: #3c3836 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__scrollable-position {
        --scrollbar-color: #504945 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__folder-item {
        color: #a89984 !important;
        transition: background-color 0.15s ease, color 0.15s ease;
    }
    html[data-gruvbox="true"].no-touch .folders-sidebar__folder-item:hover,
    html[data-gruvbox="true"].no-touch .folders-sidebar__folder-item:active,
    html[data-gruvbox="true"] .folders-sidebar__folder-item:hover,
    html[data-gruvbox="true"] .folders-sidebar__folder-item.menu-open {
        background-color: #32302f !important;
        color: #ebdbb2 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__folder-item--selected,
    html[data-gruvbox="true"] .folders-sidebar__folder-item--selected:hover {
        background-color: #3c3836 !important;
        color: #b8bb26 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__folder-item--selected .folders-sidebar__folder-item-icon,
    html[data-gruvbox="true"] .folders-sidebar__folder-item--selected .folders-sidebar__folder-item-name {
        color: #b8bb26 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__folder-item .c-ripple__circle {
        background-color: rgba(184, 187, 38, 0.15) !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__folder-item-badge.badge-gray {
        background-color: #504945 !important;
        color: #ebdbb2 !important;
    }
    html[data-gruvbox="true"] .folders-sidebar__add-folders-button {
        background-color: #282828 !important;
        color: #a89984 !important;
        border-inline-start-color: #3c3836 !important;
    }
    html[data-gruvbox="true"].no-touch .folders-sidebar__add-folders-button:hover,
    html[data-gruvbox="true"].no-touch .folders-sidebar__add-folders-button:active,
    html[data-gruvbox="true"] .folders-sidebar__add-folders-button:hover {
        background-color: #32302f !important;
        color: #ebdbb2 !important;
    }

    /* Keep page-chats transparent so chat backgrounds show properly */
    html[data-gruvbox="true"] #page-chats {
        background-color: transparent !important;
    }

    /* Search bar */
    html[data-gruvbox="true"] .input-search {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
    }
    html[data-gruvbox="true"] .input-search-input {
        background-color: #1d2021 !important;
        color: #ebdbb2 !important;
        border-radius: 22px !important;
        border: 1px solid #3c3836 !important;
    }
    html[data-gruvbox="true"] .input-search-placeholder {
        color: #7c6f64 !important;
    }
    html[data-gruvbox="true"] .input-search-input::placeholder {
        color: #7c6f64 !important;
    }
    html[data-gruvbox="true"].no-touch .input-search-input:hover:not(:focus),
    html[data-gruvbox="true"].no-touch .input-search-input:active:not(:focus),
    html[data-gruvbox="true"] .input-search-input:hover:not(:focus),
    html[data-gruvbox="true"] .input-search-input:active:not(:focus) {
        border-color: #504945 !important;
    }
    html[data-gruvbox="true"] .input-search-input:focus,
    html[data-gruvbox="true"] .input-search-input.with-focus-effect:focus {
        border-color: #b8bb26 !important;
        background-color: #1d2021 !important;
    }
    html[data-gruvbox="true"] .input-search-icon,
    html[data-gruvbox="true"] .input-search-clear,
    html[data-gruvbox="true"] .input-search-part {
        color: #a89984 !important;
        fill: #a89984 !important;
    }

    /* Message bubbles */
    html[data-gruvbox="true"] .bubble.is-out {
        --border-start-start-radius: 15px !important;
        --border-start-end-radius: 15px !important;
        --border-end-start-radius: 15px !important;
        --border-end-end-radius: 15px !important;
        --message-out-background-color: #384323 !important;
        --message-out-gradient-display: none !important;
        --message-out-gradient-under: #384323 !important;
    }
    html[data-gruvbox="true"] .bubble.is-out .bubble-content,
    html[data-gruvbox="true"] .bubble.is-out .bubble-content-background {
        background-color: #384323 !important;
        background-image: none !important;
        border-radius: 15px !important;
        border-top-left-radius: 15px !important;
        border-top-right-radius: 15px !important;
        border-bottom-left-radius: 15px !important;
        border-bottom-right-radius: 15px !important;
        color: #ebdbb2 !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
    }
    html[data-gruvbox="true"] .bubble.is-in .bubble-content,
    html[data-gruvbox="true"] .bubble.is-in .bubble-content-background {
        background-color: #32302f !important;
        background-image: none !important;
        border-radius: 15px !important;
        color: #ebdbb2 !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
    }
    /* Tail corner nuances on last bubble in a group */
    html[data-gruvbox="true"] .bubble.is-out.can-have-tail.is-group-last .bubble-content,
    html[data-gruvbox="true"] .bubble.is-out.can-have-tail.is-group-last .bubble-content-background,
    html[data-gruvbox="true"] .bubble.is-out.can-have-tail.is-forced-rounded .bubble-content,
    html[data-gruvbox="true"] .bubble.is-out.can-have-tail.is-forced-rounded .bubble-content-background {
        border-bottom-right-radius: 4px !important;
    }
    html[data-gruvbox="true"] .bubble.is-in.can-have-tail.is-group-last .bubble-content,
    html[data-gruvbox="true"] .bubble.is-in.can-have-tail.is-group-last .bubble-content-background,
    html[data-gruvbox="true"] .bubble.is-in.can-have-tail.is-forced-rounded .bubble-content,
    html[data-gruvbox="true"] .bubble.is-in.can-have-tail.is-forced-rounded .bubble-content-background {
        border-bottom-left-radius: 4px !important;
    }

    /* Outgoing bubble gradient overlays */
    html[data-gruvbox="true"] .bubbles-gradient,
    html[data-gruvbox="true"] .bubbles-remover,
    html[data-gruvbox="true"] .bubble-gradient,
    html[data-gruvbox="true"] .bubble.is-out .bubble-gradient {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
    }

    /* Message timestamp, read checkmarks, and edited state */
    html[data-gruvbox="true"] .bubble .time,
    html[data-gruvbox="true"] .bubble .time-inner,
    html[data-gruvbox="true"] .bubble .time-edited,
    html[data-gruvbox="true"] .bubble .time-inner .time-edited,
    html[data-gruvbox="true"] .bubble .time .i18n {
        color: #a89984 !important;
    }
    html[data-gruvbox="true"] .bubble .time-sending-status,
    html[data-gruvbox="true"] .bubble .time-sending-status .tgico,
    html[data-gruvbox="true"] .bubble .time-inner .time-sending-status,
    html[data-gruvbox="true"] .bubble .time-sending-status.sending-status-is-read {
        color: #b8bb26 !important;
        fill: #b8bb26 !important;
    }
    html[data-gruvbox="true"] .bubble a {
        color: #b8bb26 !important;
    }

    /* Bubble tail colors */
    html[data-gruvbox="true"] .bubble.is-out .bubble-tail {
        background-color: #384323 !important;
    }
    html[data-gruvbox="true"] .bubble.is-in .bubble-tail {
        background-color: #32302f !important;
    }

    /* Send button */
    html[data-gruvbox="true"] .btn-send,
    html[data-gruvbox="true"] .btn-send-container .btn-send,
    html[data-gruvbox="true"] .btn-circle.btn-record {
        background-color: #b8bb26 !important;
        color: #1d2021 !important;
    }
    html[data-gruvbox="true"] .btn-send svg,
    html[data-gruvbox="true"] .btn-send i,
    html[data-gruvbox="true"] .btn-send .tgico {
        color: #1d2021 !important;
        fill: #1d2021 !important;
    }

    /* Pinned message bar */
    html[data-gruvbox="true"] .pinned-message-title,
    html[data-gruvbox="true"] .pinned-message-border-wrapper {
        color: #b8bb26 !important;
    }
    html[data-gruvbox="true"] .pinned-message-border-wrapper-1,
    html[data-gruvbox="true"] .pinned-message-border-wrapper:before {
        background: #b8bb26 !important;
    }

    /* Service messages and date badges */
    html[data-gruvbox="true"] .bubble.service .service-msg,
    html[data-gruvbox="true"] .bubble.has-fake-service .service-msg,
    html[data-gruvbox="true"] .service-msg {
        background-color: #32302f !important;
        color: #ebdbb2 !important;
        border: 1px solid #3c3836 !important;
    }

    /* Chat list items */
    html[data-gruvbox="true"] .chatlist-chat {
        background-color: transparent !important;
    }
    html[data-gruvbox="true"] .chatlist-chat:hover {
        background-color: #32302f !important;
    }
    html[data-gruvbox="true"] .chatlist-chat.active {
        background-color: #3c3836 !important;
    }
    html[data-gruvbox="true"] .chatlist-chat.active,
    html[data-gruvbox="true"] .chatlist-chat.active .row-title,
    html[data-gruvbox="true"] .chatlist-chat.active .peer-title,
    html[data-gruvbox="true"] .chatlist-chat.active .user-title,
    html[data-gruvbox="true"] .chatlist-chat.active .row-subtitle,
    html[data-gruvbox="true"] .chatlist-chat.active .dialog-subtitle,
    html[data-gruvbox="true"] .chatlist-chat.active .dialog-subtitle-parts,
    html[data-gruvbox="true"] .chatlist-chat.active .dialog-subtitle-span,
    html[data-gruvbox="true"] .chatlist-chat.active .message-time,
    html[data-gruvbox="true"] .chatlist-chat.active .dialog-time-pill,
    html[data-gruvbox="true"] .chatlist-chat.active .dialog-title-details,
    html[data-gruvbox="true"] .chatlist-chat.active .i18n,
    html[data-gruvbox="true"] .chatlist-chat.active .tgico,
    html[data-gruvbox="true"] .chatlist-chat.active .message-status {
        color: #fbf1c7 !important;
        fill: #fbf1c7 !important;
    }
    html[data-gruvbox="true"] .unread,
    html[data-gruvbox="true"] .badge {
        background-color: #b8bb26 !important;
        color: #1d2021 !important;
        font-weight: bold !important;
    }

    /* Custom wallpaper layer */
    #gruvbox-wallpaper-layer {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
    }

    /* Theme carousel tile */
    .theme-container.tg-gruvbox-tile {
        background: #1d2021 !important;
        border: 1px solid #3c3836 !important;
        position: relative !important;
        overflow: visible !important;
        cursor: pointer;
    }
    .theme-container.tg-gruvbox-tile:before {
        position: absolute;
        content: " ";
        top: -4px;
        right: -4px;
        bottom: -4px;
        left: -4px;
        border-radius: 14px;
        border: 2px solid #b8bb26 !important;
        opacity: 0;
        transform: scale(0.86);
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s cubic-bezier(0.2, 0, 0, 1);
        pointer-events: none;
    }
    .theme-container.tg-gruvbox-tile.active:before {
        opacity: 1 !important;
        transform: scale(1) !important;
    }

    /* Settings panel */
    .tg-gruvbox-settings-panel {
        margin: 0.75rem 0.5rem 0;
        padding: 12px 14px;
        background: #282828;
        border: 1px solid #3c3836;
        border-radius: 12px;
        font-size: 13px;
    }
    .tg-gruvbox-settings-panel input[type="text"] {
        width: 100%;
        background: #1d2021;
        border: 1px solid #3c3836;
        color: #ebdbb2;
        padding: 6px 10px;
        border-radius: 8px;
        margin-top: 4px;
        margin-bottom: 8px;
        outline: none;
        box-sizing: border-box;
    }
    .tg-gruvbox-settings-panel input[type="text"]::placeholder {
        color: #7c6f64 !important;
    }
    .tg-gruvbox-settings-panel input[type="text"]:focus {
        border-color: #b8bb26 !important;
    }
    .tg-gruvbox-checkbox-label {
        display: inline-flex !important;
        align-items: center !important;
        gap: 8px !important;
        cursor: pointer !important;
        user-select: none !important;
        color: #ebdbb2 !important;
        margin-top: 4px !important;
        margin-bottom: 8px !important;
        font-size: 13px !important;
    }
    .tg-gruvbox-checkbox {
        position: absolute !important;
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
        pointer-events: none !important;
    }
    .tg-gruvbox-checkbox-box {
        position: relative !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 18px !important;
        height: 18px !important;
        border-radius: 4px !important;
        border: 2px solid #504945 !important;
        background-color: #1d2021 !important;
        flex-shrink: 0 !important;
        transition: all 0.15s ease !important;
        box-sizing: border-box !important;
    }
    .tg-gruvbox-checkbox-label:hover .tg-gruvbox-checkbox-box {
        border-color: #b8bb26 !important;
    }
    .tg-gruvbox-checkbox:checked + .tg-gruvbox-checkbox-box {
        background-color: #b8bb26 !important;
        border-color: #b8bb26 !important;
    }
    .tg-gruvbox-checkbox:checked + .tg-gruvbox-checkbox-box::after {
        content: "" !important;
        width: 4px !important;
        height: 8px !important;
        border: solid #1d2021 !important;
        border-width: 0 2px 2px 0 !important;
        transform: rotate(45deg) !important;
        margin-top: -2px !important;
        display: block !important;
    }
    `;

  styleEl.textContent = GRUVBOX_CSS;

  function applyStyle() {
    if (!document.head) {
      document.addEventListener("DOMContentLoaded", applyStyle, { once: true });
      return;
    }
    if (!document.getElementById("tg-gruvbox-styles")) {
      document.head.appendChild(styleEl);
    }
  }
  applyStyle();

  function updateThemeAttribute() {
    if (CONFIG.isGruvbox) {
      document.documentElement.setAttribute("data-gruvbox", "true");
    } else {
      document.documentElement.removeAttribute("data-gruvbox");
    }
  }
  updateThemeAttribute();

  function ensureWallpaperLayer() {
    let layer = document.getElementById("gruvbox-wallpaper-layer");
    if (!layer) {
      const bgContainer =
        win.appChatBackground?.element ||
        document.querySelector(".chat-background") ||
        document.body;
      layer = document.createElement("div");
      layer.id = "gruvbox-wallpaper-layer";
      bgContainer.prepend(layer);
    }
    return layer;
  }

  function updateChatWallpaper() {
    const layer = ensureWallpaperLayer();
    if (!layer) return;

    // If theme is disabled or no custom wallpaper URL set, leave default untouched
    if (!CONFIG.isGruvbox || !CONFIG.wallpaperUrl) {
      layer.style.display = "none";
      return;
    }

    // Check whether current chat has custom peer wallpaper/theme
    const chat = win.appImManager?.chat;
    const peerFull = chat?.fullPeer?.();
    const hasPeerWallpaper = !!(
      chat?.currentWallPaper ||
      chat?.currentTheme ||
      peerFull?.wallpaper ||
      peerFull?.theme ||
      peerFull?.theme_emoticon
    );

    // Also check if Telegram renders an actual custom image wallpaper
    const bgEl = win.appChatBackground?.element;
    const hasCustomImageInSlot = !!(
      bgEl &&
      (bgEl.querySelector("img") || bgEl.querySelector(".IsImage"))
    );

    if (hasPeerWallpaper || hasCustomImageInSlot) {
      // Keep peer custom wallpaper visible, hide our custom layer
      layer.style.display = "none";
    } else {
      // Apply Gruvbox custom wallpaper
      layer.style.display = "block";
      const targetBg = `url("${CONFIG.wallpaperUrl}")`;
      if (layer.style.backgroundImage !== targetBg) {
        layer.style.backgroundImage = targetBg;
      }

      if (CONFIG.tileWallpaper) {
        if (layer.style.backgroundRepeat !== "repeat") layer.style.backgroundRepeat = "repeat";
        if (layer.style.backgroundPosition !== "top left") layer.style.backgroundPosition = "top left";
        if (layer.style.backgroundSize !== CONFIG.tileSize) layer.style.backgroundSize = CONFIG.tileSize;
      } else {
        if (layer.style.backgroundRepeat !== "no-repeat") layer.style.backgroundRepeat = "no-repeat";
        if (layer.style.backgroundPosition !== "center center") layer.style.backgroundPosition = "center center";
        if (layer.style.backgroundSize !== "cover") layer.style.backgroundSize = "cover";
      }
    }
  }

  function findThemesContainer() {
    const containers = document.querySelectorAll(".themes-container");
    for (const el of containers) {
      // Disregard any container inside the onboarding appearance tip card
      if (el.closest('[class*="_card_1bofx"]')) continue;
      return el;
    }
    return null;
  }

  function injectCarouselTile() {
    const container = findThemesContainer();
    if (!container) return;

    let tile = container.querySelector(".tg-gruvbox-tile");
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "theme-container tg-gruvbox-tile";
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", "Gruvbox Dark");

      tile.innerHTML = `
                <div class="tg-gruvbox-tile-inner" style="position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none;">
                    <div class="theme-bubble is-in" style="position: absolute; top: 1.5rem; left: 0.375rem; width: 2.5rem; height: 1.25rem; border-radius: 10px; background-color: #32302f;"></div>
                    <div class="theme-bubble is-out" style="position: absolute; top: 0.5rem; right: 0.375rem; width: 2.5rem; height: 1.25rem; border-radius: 10px; background-color: #384323;"></div>
                    <div style="position: absolute; bottom: 0.375rem; left: 50%; transform: translateX(-50%); font-size: 1.25rem;">🌱</div>
                </div>
            `;

      tile.addEventListener("click", (e) => {
        e.stopPropagation();
        CONFIG.isGruvbox = true;
        updateThemeAttribute();
        updateActiveState();
        updateChatWallpaper();
      });

      container.prepend(tile);

      // Listen for clicks on other native tiles to deactivate Gruvbox
      container.addEventListener("click", (e) => {
        const clickedTile = e.target.closest(".theme-container");
        if (clickedTile && !clickedTile.classList.contains("tg-gruvbox-tile")) {
          CONFIG.isGruvbox = false;
          updateThemeAttribute();
          updateActiveState();
          updateChatWallpaper();
        }
      });
    }

    updateActiveState();
    injectSettingsPanel(container);
  }

  function updateActiveState() {
    const container = findThemesContainer();
    if (!container) return;

    const tile = container.querySelector(".tg-gruvbox-tile");
    if (!tile) return;

    if (CONFIG.isGruvbox) {
      tile.classList.add("active");
      tile.setAttribute("aria-pressed", "true");
      // Remove active class from sibling native tiles
      container
        .querySelectorAll(".theme-container:not(.tg-gruvbox-tile)")
        .forEach((el) => {
          el.classList.remove("active");
          el.setAttribute("aria-pressed", "false");
        });
    } else {
      tile.classList.remove("active");
      tile.setAttribute("aria-pressed", "false");
    }
  }

  function injectSettingsPanel(themesContainer) {
    // Place settings panel below the themes strip in General Settings
    const parentSection =
      themesContainer.closest(".section") || themesContainer.parentElement;
    if (
      !parentSection ||
      parentSection.querySelector(".tg-gruvbox-settings-panel")
    )
      return;

    const panel = document.createElement("div");
    panel.className = "tg-gruvbox-settings-panel";
    panel.innerHTML = `
            <div style="font-weight: 600; color: #b8bb26; margin-bottom: 8px;">Gruvbox Wallpaper Settings</div>
            <div style="color: #a89984; margin-bottom: 2px;">Custom Wallpaper (URL or Base64):</div>
            <input type="text" id="gb-wp-url" placeholder="https://example.com/wallpaper.png or Base64">

            <label class="tg-gruvbox-checkbox-label">
                <input type="checkbox" id="gb-wp-tile" class="tg-gruvbox-checkbox" ${CONFIG.tileWallpaper ? "checked" : ""}>
                <span class="tg-gruvbox-checkbox-box"></span>
                <span>Tile Wallpaper</span>
            </label>

            <div style="color: #a89984; margin-bottom: 2px; margin-top: 6px;">Tile Size:</div>
            <input type="text" id="gb-wp-size" placeholder="auto, 200px, 50%..." value="${CONFIG.tileSize}">
        `;

    const urlInput = panel.querySelector("#gb-wp-url");
    urlInput.value = CONFIG.wallpaperUrl || "";

    const applyUrlInput = () => {
      const normalized = normalizeWallpaperSource(urlInput.value);
      CONFIG.wallpaperUrl = normalized;
      updateChatWallpaper();
    };

    urlInput.addEventListener("change", applyUrlInput);
    urlInput.addEventListener("input", applyUrlInput);
    urlInput.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result;
                urlInput.value = dataUrl;
                CONFIG.wallpaperUrl = dataUrl;
                updateChatWallpaper();
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        }
      }
    });

    const tileCheck = panel.querySelector("#gb-wp-tile");
    tileCheck.addEventListener("change", (e) => {
      CONFIG.tileWallpaper = e.target.checked;
      updateChatWallpaper();
    });

    const sizeInput = panel.querySelector("#gb-wp-size");
    sizeInput.addEventListener("change", (e) => {
      CONFIG.tileSize = e.target.value;
      updateChatWallpaper();
    });

    parentSection.appendChild(panel);
  }

  function init() {
    updateThemeAttribute();
    updateChatWallpaper();

    // Observe DOM for settings opening and chat switches
    const observer = new MutationObserver(() => {
      injectCarouselTile();
      updateChatWallpaper();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    setInterval(updateChatWallpaper, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
