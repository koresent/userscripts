// ==UserScript==
// @name           ⚙ [Telegram] Redirect t.me to Web K
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Redirects all t.me, telegram.me, and telegram.dog links directly to Telegram Web K
// @author         Koresent
// @license        GPL-3.0
// @icon           https://web.telegram.org/favicon.ico
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/tme-to-webk.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/telegram/tme-to-webk.user.js
//
// @match          *://t.me/*
// @match          *://*.t.me/*
// @match          *://telegram.me/*
// @match          *://*.telegram.me/*
// @match          *://telegram.dog/*
// @match          *://*.telegram.dog/*
//
// @run-at         document-start
// @grant          none
// ==/UserScript==

(function () {
  'use strict';

  const WEB_K_BASE = 'https://web.telegram.org/k/';

  function getTargetUrl(url) {
    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) {
      return null;
    }

    const segments = pathname.split('/');
    const first = segments[0];

    // Ignore Instant View / static assets
    if (first === 'iv' || first === 'static') {
      return null;
    }

    // Case 1: Channel web preview (/s/channel or /s/channel/123)
    if (first === 's' && segments.length > 1) {
      const channel = segments[1];
      const postId = segments[2];
      return postId
        ? `${WEB_K_BASE}#@${channel}/${postId}`
        : `${WEB_K_BASE}#@${channel}`;
    }

    // Case 2: Private invite (+hash or joinchat/hash)
    if (first.startsWith('+')) {
      const inviteHash = first.slice(1);
      const tgScheme = `tg://join?invite=${inviteHash}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }
    if (first === 'joinchat' && segments[1]) {
      const inviteHash = segments[1];
      const tgScheme = `tg://join?invite=${inviteHash}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    // Case 3: Private channel post (/c/channelId/postId)
    if (first === 'c' && segments[1] && segments[2]) {
      const channelId = segments[1];
      const postId = segments[2];
      const formattedChannelId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
      return `${WEB_K_BASE}#${formattedChannelId}/${postId}`;
    }

    // Case 4: Share URL (/share or /share/url)
    if (first === 'share') {
      const tgScheme = `tg://msg_url${url.search}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    // Case 5: Stickers, Emojis, Themes, Languages
    if (first === 'addstickers' && segments[1]) {
      const tgScheme = `tg://addstickers?set=${segments[1]}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }
    if (first === 'addemoji' && segments[1]) {
      const tgScheme = `tg://addemoji?set=${segments[1]}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }
    if (first === 'addtheme' && segments[1]) {
      const tgScheme = `tg://addtheme?slug=${segments[1]}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }
    if (first === 'setlanguage' && segments[1]) {
      const tgScheme = `tg://setlanguage?lang=${segments[1]}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    // Case 6: Proxies
    if (first === 'proxy' || first === 'socks') {
      const tgScheme = `tg://${first}${url.search}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    // Case 7: Invoice
    if (first === 'invoice' && segments[1]) {
      const tgScheme = `tg://invoice?slug=${segments[1]}`;
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    // Case 8: Standard username / channel / post / bot
    const username = first;
    const postId = segments[1];
    const params = new URLSearchParams(url.search);

    // If bot parameters are present (e.g. ?start=..., ?startgroup=..., ?startapp=...)
    if (params.has('start') || params.has('startgroup') || params.has('startapp') || params.has('attach') || params.has('appname')) {
      let tgScheme = `tg://resolve?domain=${username}`;
      if (postId) {
        tgScheme += `&post=${postId}`;
      }
      for (const [key, val] of params.entries()) {
        tgScheme += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
      }
      return `${WEB_K_BASE}#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (postId) {
      return `${WEB_K_BASE}#@${username}/${postId}`;
    }

    return `${WEB_K_BASE}#@${username}`;
  }

  const targetUrl = getTargetUrl(new URL(window.location.href));
  if (targetUrl) {
    window.location.replace(targetUrl);
  }
})();
