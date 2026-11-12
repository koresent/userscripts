// ==UserScript==
// @name           ⚙ [Telegram] Redirect t.me to Web K
// @namespace      github.com/koresent/userscripts
// @version        1.1.1
// @description    Redirects all t.me links into the active Telegram Web K PWA window
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
// @match          https://web.telegram.org/k/*
//
// @run-at         document-start
// @grant          none
// ==/UserScript==

(function () {
  'use strict';

  const CHANNEL_NAME = 'telegram_pwa_bridge';
  const BRIDGE_FOCUS_URL = 'https://zen-bridge.lan/api/telegram-focus';

  if (window.location.hostname === 'web.telegram.org') {
    const params = new URLSearchParams(window.location.search);
    const isRelay = params.has('relay');
    const isPWA = sessionStorage.getItem('telegram_is_pwa') === '1' || params.has('pwa');

    if (isPWA && !isRelay) {
      sessionStorage.setItem('telegram_is_pwa', '1');

      const bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = async (e) => {
        const data = e.data;
        if (!data) return;

        if (data.type === 'ping') {
          bc.postMessage({ type: 'pong' });
          return;
        }

        if (data.type === 'open_link' && data.targetHash) {
          bc.postMessage({ type: 'ack' });

          try {
            await fetch(BRIDGE_FOCUS_URL, { method: 'POST' });
          } catch (_) {}

          // Changing query parameter forces full navigation so Web K parses the new hash on boot
          const nextUrl = new URL(window.location.href);
          nextUrl.searchParams.set('pwa', '1');
          nextUrl.searchParams.set('_t', String(Date.now()));
          nextUrl.hash = data.targetHash;
          window.location.replace(nextUrl.toString());
        }
      };
      return;
    }

    if (isRelay) {
      const targetHash = window.location.hash;
      const bc = new BroadcastChannel(CHANNEL_NAME);
      let handled = false;

      function closeOrBack() {
        handled = true;
        window.close();
        setTimeout(() => {
          if (!window.closed && window.history.length > 1) {
            window.history.back();
          }
        }, 100);
      }

      bc.onmessage = (e) => {
        if (e.data?.type === 'ack') {
          closeOrBack();
        }
      };

      bc.postMessage({ type: 'open_link', targetHash });
      fetch(BRIDGE_FOCUS_URL, { method: 'POST' }).catch(() => {});

      setTimeout(() => {
        if (!handled) {
          const normalUrl = new URL(window.location.href);
          normalUrl.searchParams.delete('relay');
          window.location.replace(normalUrl.toString());
        }
      }, 350);

      return;
    }

    return;
  }

  function getTargetHash(url) {
    const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!pathname) {
      return null;
    }

    const segments = pathname.split('/');
    const first = segments[0];

    if (first === 'iv' || first === 'static') {
      return null;
    }

    if (first === 's' && segments.length > 1) {
      const channel = segments[1];
      const postId = segments[2];
      return postId ? `#@${channel}/${postId}` : `#@${channel}`;
    }

    if (first.startsWith('+')) {
      const tgScheme = `tg://join?invite=${first.slice(1)}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'joinchat' && segments[1]) {
      const tgScheme = `tg://join?invite=${segments[1]}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'c' && segments[1] && segments[2]) {
      const channelId = segments[1];
      const postId = segments[2];
      // Telegram Web K references private channels via -100 prefix
      const formattedChannelId = channelId.startsWith('-100') ? channelId : `-100${channelId}`;
      return `#${formattedChannelId}/${postId}`;
    }

    if (first === 'share') {
      const tgScheme = `tg://msg_url${url.search}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'addstickers' && segments[1]) {
      const tgScheme = `tg://addstickers?set=${segments[1]}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'addemoji' && segments[1]) {
      const tgScheme = `tg://addemoji?set=${segments[1]}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'addtheme' && segments[1]) {
      const tgScheme = `tg://addtheme?slug=${segments[1]}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'setlanguage' && segments[1]) {
      const tgScheme = `tg://setlanguage?lang=${segments[1]}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'proxy' || first === 'socks') {
      const tgScheme = `tg://${first}${url.search}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (first === 'invoice' && segments[1]) {
      const tgScheme = `tg://invoice?slug=${segments[1]}`;
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    const username = first;
    const postId = segments[1];
    const params = new URLSearchParams(url.search);

    // Deep links with bot start payloads require tg://resolve
    if (params.has('start') || params.has('startgroup') || params.has('startapp') || params.has('attach') || params.has('appname')) {
      let tgScheme = `tg://resolve?domain=${username}`;
      if (postId) {
        tgScheme += `&post=${postId}`;
      }
      for (const [key, val] of params.entries()) {
        tgScheme += `&${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
      }
      return `#?tgaddr=${encodeURIComponent(tgScheme)}`;
    }

    if (postId) {
      return `#@${username}/${postId}`;
    }

    return `#@${username}`;
  }

  const targetHash = getTargetHash(new URL(window.location.href));
  if (targetHash) {
    window.location.replace(`https://web.telegram.org/k/?relay=1${targetHash}`);
  }
})();
