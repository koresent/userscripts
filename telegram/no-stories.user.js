// ==UserScript==
// @name           ⚙ [Telegram Web K] No Stories
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Completely removes stories from Telegram Web K interface
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/no-stories.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/no-stories.user.js
//
// @match          https://web.telegram.org/k/*
//
// @run-at         document-start
// @grant          none
// ==/UserScript==

(function () {
  "use strict";

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

  function injectStyles() {
    if (document.getElementById("tweb-no-stories-style")) return;
    const style = document.createElement("style");
    style.id = "tweb-no-stories-style";
    style.textContent = CSS_STYLES;
    (document.head || document.documentElement).appendChild(style);
  }

  injectStyles();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectStyles);
  }

  const STORY_TEXT_REGEX = /stories|истори/i;
  const STORY_ICON_CODE = "\uea3b";

  function purgeMenuItems(root = document) {
    const items = root.querySelectorAll(".btn-menu-item");
    for (const item of items) {
      const icon = item.querySelector(".btn-menu-item-icon");
      const text = item.textContent || "";
      if (icon?.textContent?.includes(STORY_ICON_CODE) || STORY_TEXT_REGEX.test(text)) {
        item.remove();
      }
    }
  }

  function purgeSharedMediaTabs(root = document) {
    const tabs = root.querySelectorAll(".search-super-tabs-scrollable .menu-horizontal-div-item");
    for (const tab of tabs) {
      if (STORY_TEXT_REGEX.test(tab.textContent || "")) {
        tab.remove();
      }
    }
  }

  function stripStoryClasses(root = document) {
    const elements = root.querySelectorAll(".has-stories, [class*='_hasStories_']");
    for (const el of elements) {
      el.classList.remove("has-stories");
    }
  }

  function setupViewerGuard() {
    const viewer = document.getElementById("stories-viewer");
    if (!viewer) return;

    const observer = new MutationObserver(() => {
      if (viewer.childNodes.length > 0) {
        viewer.querySelectorAll("video, audio").forEach((media) => {
          media.pause();
          media.src = "";
        });
        viewer.replaceChildren();
      }
    });

    observer.observe(viewer, { childList: true });
  }

  function observeDOM() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;

          if (node.classList?.contains("btn-menu") || node.querySelector?.(".btn-menu-item")) {
            purgeMenuItems(node);
          }

          if (
            node.classList?.contains("search-super-tabs-scrollable") ||
            node.querySelector?.(".search-super-tabs-scrollable")
          ) {
            purgeSharedMediaTabs(node);
          }

          if (node.classList?.contains("has-stories") || node.querySelector?.(".has-stories")) {
            stripStoryClasses(node);
          }

          if (node.id === "stories-viewer") {
            setupViewerGuard();
          }
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  document.addEventListener(
    "click",
    (e) => {
      const trigger = e.target.closest(
        '.stories-list, .avatar-stories-svg, .avatar-stories-simple, .profile-story-preview, .bubble-story-mention-wrapper, [aria-label*="STORY" i], [aria-label*="ИСТОРИ" i]'
      );
      if (trigger) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true
  );

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupViewerGuard();
      observeDOM();
      purgeMenuItems();
      purgeSharedMediaTabs();
      stripStoryClasses();
    });
  } else {
    setupViewerGuard();
    observeDOM();
    purgeMenuItems();
    purgeSharedMediaTabs();
    stripStoryClasses();
  }
})();
