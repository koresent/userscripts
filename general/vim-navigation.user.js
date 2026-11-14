// ==UserScript==
// @name           ⚙ [General] Vim Navigation
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Vim-style keyboard navigation and link hints for web browsing
// @author         Koresent
// @license        GPL-3.0
// @icon           https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/vim.svg
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/vim-navigation.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/general/vim-navigation.user.js
//
// @match          *://*/*
// @match          https://*.lan/*
// @match          http://*.lan/*
//
// @run-at         document-start
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_addValueChangeListener
// @grant          GM_openInTab
// @grant          GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'vim_nav_config';
  const SETTINGS_URL = 'https://search.lan/vim.html';

  const DEFAULT_CONFIG = {
    version: 1,
    keys: {
      scrollDown: 'j',
      scrollUp: 'k',
      scrollLeft: 'h',
      scrollRight: 'l',
      scrollPageDown: 'd',
      scrollPageUp: 'u',
      scrollFullPageDown: 'Space',
      scrollFullPageUp: 'Shift+Space',
      scrollToTop: 'gg',
      scrollToBottom: 'G',
      scrollToLeft: '0',
      scrollToRight: '$',
      linkHintsCurrentTab: 'f',
      linkHintsNewTab: 'F',
      linkHintsCopyUrl: 'yf',
      linkHintsDownload: 'df',
      focusFirstInput: 'gi',
      passNextKey: 'i',
      copyCurrentUrl: 'yy',
      copyUrlMarkdown: 'ym',
      goBack: 'H',
      goForward: 'L',
      reload: 'r',
      hardReload: 'R',
      nextPage: ']]',
      prevPage: '[[',
      openSettings: 'gS'
    },
    scroll: {
      smooth: true,
      stepSize: 70,
      pageStepRatio: 0.5,
      fullPageRatio: 0.9
    },
    hints: {
      characters: 'sadfjklewcmpgh',
      fontSize: 12,
      uppercase: true,
      autoActivateSingle: true,
      highlightTarget: true,
      openInBackground: false
    },
    focus: {
      preventAutofocus: false,
      blurOnEscape: true
    },
    exclusions: [
      { pattern: 'mail.google.com', disabledKeys: '' },
      { pattern: 'docs.google.com', disabledKeys: '' },
      { pattern: 'figma.com', disabledKeys: '' },
      { pattern: 'github.dev', disabledKeys: '' },
      { pattern: 'vscode.dev', disabledKeys: '' }
    ]
  };

  let activeConfig = loadConfig();

  function loadConfig() {
    try {
      const stored = GM_getValue(STORAGE_KEY, null);
      if (!stored) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
      return Object.assign({}, DEFAULT_CONFIG, parsed, {
        keys: Object.assign({}, DEFAULT_CONFIG.keys, parsed.keys || {}),
        scroll: Object.assign({}, DEFAULT_CONFIG.scroll, parsed.scroll || {}),
        hints: Object.assign({}, DEFAULT_CONFIG.hints, parsed.hints || {}),
        focus: Object.assign({}, DEFAULT_CONFIG.focus, parsed.focus || {}),
        exclusions: Array.isArray(parsed.exclusions) ? parsed.exclusions : DEFAULT_CONFIG.exclusions
      });
    } catch (err) {
      return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  }

  function saveConfig(cfg) {
    activeConfig = cfg;
    GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
  }

  GM_registerMenuCommand('⚙ Vim Navigation Settings', () => {
    GM_openInTab(SETTINGS_URL, { active: true });
  });

  if (typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(STORAGE_KEY, (_name, _oldVal, newVal, remote) => {
      if (remote && newVal) {
        try {
          activeConfig = typeof newVal === 'string' ? JSON.parse(newVal) : newVal;
        } catch (_) {}
      }
    });
  }

  const isSettingsPage = location.hostname === 'vim.lan' || location.pathname.endsWith('/vim.html');
  if (isSettingsPage) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initSettingsPage);
    } else {
      initSettingsPage();
    }
    return;
  }

  function isUrlExcluded() {
    const currentHost = location.hostname;
    const currentUrl = location.href;
    for (const rule of activeConfig.exclusions) {
      if (!rule.pattern) continue;
      if (currentHost.includes(rule.pattern) || currentUrl.includes(rule.pattern)) {
        if (!rule.disabledKeys || rule.disabledKeys.trim() === '') {
          return { excluded: true, disabledKeys: [] };
        }
        return {
          excluded: false,
          disabledKeys: rule.disabledKeys.split(',').map(k => k.trim())
        };
      }
    }
    return { excluded: false, disabledKeys: [] };
  }

  if (activeConfig.focus.preventAutofocus) {
    const originalFocus = HTMLElement.prototype.focus;
    let userInteracted = false;
    window.addEventListener('mousedown', () => { userInteracted = true; }, { once: true, capture: true });
    window.addEventListener('keydown', () => { userInteracted = true; }, { once: true, capture: true });
    HTMLElement.prototype.focus = function (...args) {
      if (!userInteracted && (this.tagName === 'INPUT' || this.tagName === 'TEXTAREA')) {
        return;
      }
      return originalFocus.apply(this, args);
    };
  }

  let keyBuffer = '';
  let keyBufferTimer = null;
  let passNextKeyActive = false;
  let hintModeActive = false;
  let activeHintAction = 'currentTab';
  let activeHintMarkers = [];
  let hintKeystrokes = '';
  let hintContainer = null;
  let lastFocusedInputIndex = -1;

  const CODE_TO_CHAR = {
    KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f',
    KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l',
    KeyM: 'm', KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r',
    KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x',
    KeyY: 'y', KeyZ: 'z',
    Digit0: '0', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4',
    Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9',
    BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Backquote: '`',
    Comma: ',', Period: '.', Slash: '/',
    Minus: '-', Equal: '=', Backslash: '\\'
  };

  const SHIFT_SYMBOLS = {
    '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&', '8': '*', '9': '(', '0': ')',
    '-': '_', '=': '+', '[': '{', ']': '}', ';': ':', "'": '"', ',': '<', '.': '>', '/': '?',
    '`': '~', '\\': '|'
  };

  function normalizeEventKey(e) {
    if (!e) return '';
    if (e.code === 'Escape') return 'Escape';
    if (e.code === 'Backspace') return 'Backspace';
    if (e.code === 'Enter') return 'Enter';
    if (e.code === 'Space') return e.shiftKey ? 'Shift+Space' : 'Space';

    if (e.code && e.code.startsWith('Key')) {
      const letter = e.code.slice(3).toLowerCase();
      return e.shiftKey ? letter.toUpperCase() : letter;
    }

    if (e.code && CODE_TO_CHAR[e.code]) {
      const ch = CODE_TO_CHAR[e.code];
      return e.shiftKey ? (SHIFT_SYMBOLS[ch] || ch) : ch;
    }

    return e.key;
  }

  window.addEventListener('keydown', handleKeyDown, true);

  function isEditableElement(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'INPUT') {
      const type = (el.type || '').toLowerCase();
      const nonText = ['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'];
      return !nonText.includes(type);
    }
    return tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function handleKeyDown(event) {
    const target = event.target;

    if (hintModeActive) {
      handleHintModeKey(event);
      return;
    }

    const keyName = normalizeEventKey(event);

    if (keyName === 'Escape') {
      if (activeConfig.focus.blurOnEscape && isEditableElement(target)) {
        target.blur();
        event.stopPropagation();
        event.preventDefault();
      }
      keyBuffer = '';
      return;
    }

    if (passNextKeyActive) {
      passNextKeyActive = false;
      return;
    }

    if (isEditableElement(target)) {
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const { excluded, disabledKeys } = isUrlExcluded();
    if (excluded) return;

    clearTimeout(keyBufferTimer);
    keyBuffer += keyName;
    keyBufferTimer = setTimeout(() => { keyBuffer = ''; }, 1000);

    const action = resolveAction(keyBuffer);
    if (action) {
      if (disabledKeys.includes(action) || disabledKeys.includes(keyBuffer)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      keyBuffer = '';
      executeAction(action);
      return;
    }

    if (isPrefixOfAnyAction(keyBuffer)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function resolveAction(keystrokes) {
    const mappings = activeConfig.keys;
    for (const [action, binding] of Object.entries(mappings)) {
      if (binding === keystrokes) return action;
    }
    return null;
  }

  function isPrefixOfAnyAction(prefix) {
    const mappings = activeConfig.keys;
    for (const binding of Object.values(mappings)) {
      if (binding.startsWith(prefix) && binding.length > prefix.length) {
        return true;
      }
    }
    return false;
  }

  function executeAction(action) {
    const scroll = activeConfig.scroll;
    const behavior = scroll.smooth ? 'smooth' : 'auto';

    switch (action) {
      case 'scrollDown':
        scrollTarget(0, scroll.stepSize, behavior);
        break;
      case 'scrollUp':
        scrollTarget(0, -scroll.stepSize, behavior);
        break;
      case 'scrollLeft':
        scrollTarget(-scroll.stepSize, 0, behavior);
        break;
      case 'scrollRight':
        scrollTarget(scroll.stepSize, 0, behavior);
        break;
      case 'scrollPageDown':
        scrollTarget(0, window.innerHeight * scroll.pageStepRatio, behavior);
        break;
      case 'scrollPageUp':
        scrollTarget(0, -window.innerHeight * scroll.pageStepRatio, behavior);
        break;
      case 'scrollFullPageDown':
        scrollTarget(0, window.innerHeight * scroll.fullPageRatio, behavior);
        break;
      case 'scrollFullPageUp':
        scrollTarget(0, -window.innerHeight * scroll.fullPageRatio, behavior);
        break;
      case 'scrollToTop':
        window.scrollTo({ top: 0, left: window.scrollX, behavior });
        break;
      case 'scrollToBottom':
        window.scrollTo({ top: document.documentElement.scrollHeight, left: window.scrollX, behavior });
        break;
      case 'scrollToLeft':
        window.scrollTo({ top: window.scrollY, left: 0, behavior });
        break;
      case 'scrollToRight':
        window.scrollTo({ top: window.scrollY, left: document.documentElement.scrollWidth, behavior });
        break;

      case 'linkHintsCurrentTab':
        activateHintMode('currentTab');
        break;
      case 'linkHintsNewTab':
        activateHintMode('newTab');
        break;
      case 'linkHintsCopyUrl':
        activateHintMode('copyUrl');
        break;
      case 'linkHintsDownload':
        activateHintMode('download');
        break;

      case 'focusFirstInput':
        cycleInputs();
        break;
      case 'passNextKey':
        passNextKeyActive = true;
        showToast('Pass next key');
        break;

      case 'copyCurrentUrl':
        GM_setClipboard(window.location.href);
        showToast('URL copied to clipboard');
        break;
      case 'copyUrlMarkdown':
        GM_setClipboard(`[${document.title}](${window.location.href})`);
        showToast('Markdown link copied');
        break;
      case 'goBack':
        window.history.back();
        break;
      case 'goForward':
        window.history.forward();
        break;
      case 'reload':
        window.location.reload();
        break;
      case 'hardReload':
        window.location.reload(true);
        break;
      case 'nextPage':
        traversePagination(['next', 'следующая', '>', '»']);
        break;
      case 'prevPage':
        traversePagination(['prev', 'previous', 'предыдущая', '<', '«']);
        break;
      case 'openSettings':
        GM_openInTab(SETTINGS_URL, { active: true });
        break;
    }
  }

  function scrollTarget(dx, dy, behavior) {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) {
      const isScrollable = (el) => {
        const style = window.getComputedStyle(el);
        return /(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX);
      };
      if (isScrollable(active)) {
        active.scrollBy({ left: dx, top: dy, behavior });
        return;
      }
    }
    window.scrollBy({ left: dx, top: dy, behavior });
  }

  function cycleInputs() {
    const candidates = Array.from(document.querySelectorAll('input:not([type=hidden]), textarea, [contenteditable="true"]'));
    const visible = candidates.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
    });

    if (visible.length === 0) return;
    lastFocusedInputIndex = (lastFocusedInputIndex + 1) % visible.length;
    const target = visible[lastFocusedInputIndex];
    target.focus();
    if (typeof target.select === 'function' && target.tagName === 'INPUT') {
      target.select();
    }
  }

  function traversePagination(patterns) {
    const links = Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"]'));
    for (const link of links) {
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      const text = (link.textContent || '').trim().toLowerCase();
      const aria = (link.getAttribute('aria-label') || '').toLowerCase();

      for (const pat of patterns) {
        if (rel === pat || text === pat || aria === pat || text.includes(pat)) {
          link.click();
          return;
        }
      }
    }
  }

  function activateHintMode(action) {
    hintModeActive = true;
    activeHintAction = action;
    hintKeystrokes = '';

    const candidates = collectClickableElements(document.documentElement);
    const visible = [];

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > viewportH || rect.right < 0 || rect.left > viewportW) {
        continue;
      }
      if (rect.width < 4 || rect.height < 4) continue;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
        continue;
      }
      visible.push({ element: el, rect });
    }

    if (visible.length === 0) {
      hintModeActive = false;
      return;
    }

    const chars = activeConfig.hints.characters.toLowerCase();
    const labels = generateHintLabels(visible.length, chars);

    hintContainer = document.createElement('div');
    hintContainer.id = 'vim-nav-hints-container';
    hintContainer.style.cssText = 'all: initial; position: absolute; top: 0; left: 0; z-index: 2147483647; pointer-events: none;';

    activeHintMarkers = visible.map((item, idx) => {
      const label = activeConfig.hints.uppercase ? labels[idx].toUpperCase() : labels[idx];
      const marker = document.createElement('div');
      marker.className = 'vim-nav-hint-marker';
      marker.textContent = label;
      marker.style.cssText = `
        all: initial; position: fixed;
        left: ${Math.max(0, Math.floor(item.rect.left))}px;
        top: ${Math.max(0, Math.floor(item.rect.top))}px;
        background: #32302f; color: #b8bb26;
        font-family: 'Maple Mono NF', 'JetBrains Mono', 'Fira Code', monospace;
        font-size: ${activeConfig.hints.fontSize}px;
        font-weight: 700; line-height: 1; padding: 3px 6px;
        border: 1px solid #504945; border-radius: 6px;
        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.3);
        z-index: 2147483647; pointer-events: none;
        letter-spacing: 0.5px; user-select: none;
      `;
      hintContainer.appendChild(marker);
      return { element: item.element, label, rawLabel: labels[idx], marker };
    });

    document.documentElement.appendChild(hintContainer);
  }

  function handleHintModeKey(event) {
    const normKey = normalizeEventKey(event);

    if (normKey === 'Escape' || event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      exitHintMode();
      return;
    }

    if (normKey === 'Backspace' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      if (hintKeystrokes.length > 0) {
        hintKeystrokes = hintKeystrokes.slice(0, -1);
        updateHintMarkers();
      } else {
        exitHintMode();
      }
      return;
    }

    const char = normKey.toLowerCase();
    if (!activeConfig.hints.characters.includes(char)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    hintKeystrokes += char;
    updateHintMarkers();
  }

  function updateHintMarkers() {
    const matches = activeHintMarkers.filter(m => m.rawLabel.startsWith(hintKeystrokes));

    if (matches.length === 0) {
      exitHintMode();
      return;
    }

    if (matches.length === 1 && activeConfig.hints.autoActivateSingle) {
      const targetElement = matches[0].element;
      exitHintMode();
      triggerHintAction(targetElement);
      return;
    }

    for (const m of activeHintMarkers) {
      if (m.rawLabel.startsWith(hintKeystrokes)) {
        m.marker.style.display = 'block';
        const matchedPart = activeConfig.hints.uppercase ? hintKeystrokes.toUpperCase() : hintKeystrokes;
        const restPart = (activeConfig.hints.uppercase ? m.rawLabel.toUpperCase() : m.rawLabel).slice(matchedPart.length);
        m.marker.innerHTML = `<span style="color: #fabd2f; font-weight: 800;">${matchedPart}</span>${restPart}`;
      } else {
        m.marker.style.display = 'none';
      }
    }
  }

  function triggerHintAction(element) {
    if (activeConfig.hints.highlightTarget) {
      const origOutline = element.style.outline;
      const origOffset = element.style.outlineOffset;
      element.style.outline = '2px solid #b8bb26';
      element.style.outlineOffset = '2px';
      setTimeout(() => {
        element.style.outline = origOutline;
        element.style.outlineOffset = origOffset;
      }, 350);
    }

    const link = element.closest('a') || (element.tagName === 'A' ? element : null);

    switch (activeHintAction) {
      case 'currentTab':
        simulateClick(element);
        break;
      case 'newTab':
        if (link && link.href && !link.href.startsWith('javascript:')) {
          GM_openInTab(link.href, { active: !activeConfig.hints.openInBackground });
        } else {
          simulateClick(element, { ctrlKey: true, metaKey: true });
        }
        break;
      case 'copyUrl':
        if (link && link.href) {
          GM_setClipboard(link.href);
          showToast('Link URL copied');
        } else {
          showToast('Target element is not a link');
        }
        break;
      case 'download':
        if (link && link.href) {
          const a = document.createElement('a');
          a.href = link.href;
          a.download = '';
          a.click();
        } else {
          simulateClick(element);
        }
        break;
    }
  }

  function simulateClick(element, modifiers = {}) {
    const link = element.closest('a') || (element.tagName === 'A' ? element : null);

    const rect = element.getBoundingClientRect();
    const cx = Math.floor(rect.left + Math.max(1, rect.width / 2));
    const cy = Math.floor(rect.top + Math.max(1, rect.height / 2));
    const centerEl = (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight)
      ? document.elementFromPoint(cx, cy)
      : element;
    const target = (centerEl && (element.contains(centerEl) || centerEl.contains(element)))
      ? centerEl
      : element;

    try { target.focus(); } catch (_) {}

    function dispatch(el, type) {
      try {
        const init = Object.assign({
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: cx,
          clientY: cy
        }, modifiers);
        if (type.startsWith('pointer') && typeof PointerEvent === 'function') {
          el.dispatchEvent(new PointerEvent(type, init));
        } else {
          el.dispatchEvent(new MouseEvent(type, init));
        }
      } catch (_) {}
    }

    dispatch(target, 'pointerover');
    dispatch(target, 'mouseover');
    dispatch(target, 'pointerdown');
    dispatch(target, 'mousedown');
    dispatch(target, 'pointerup');
    dispatch(target, 'mouseup');
    dispatch(target, 'click');

    try {
      if (typeof target.click === 'function') {
        target.click();
      }
    } catch (_) {}

    try {
      if (link && link !== target && typeof link.click === 'function') {
        link.click();
      }
    } catch (_) {}

    if (link && link.href && !link.href.startsWith('javascript:') && !link.href.startsWith('#')) {
      const origUrl = window.location.href;
      setTimeout(() => {
        if (window.location.href === origUrl) {
          if (link.target === '_blank') {
            window.open(link.href, '_blank');
          } else {
            window.location.href = link.href;
          }
        }
      }, 50);
    }
  }

  function exitHintMode() {
    hintModeActive = false;
    hintKeystrokes = '';
    if (hintContainer) {
      hintContainer.remove();
      hintContainer = null;
    }
    activeHintMarkers = [];
  }

  function generateHintLabels(count, alphabet) {
    const base = alphabet.length;
    if (count <= base) {
      return alphabet.slice(0, count).split('');
    }
    const labels = [];
    for (let i = 0; i < base; i++) {
      for (let j = 0; j < base; j++) {
        labels.push(alphabet[i] + alphabet[j]);
        if (labels.length >= count) return labels;
      }
    }
    for (let i = 0; i < base; i++) {
      for (let j = 0; j < base; j++) {
        for (let k = 0; k < base; k++) {
          labels.push(alphabet[i] + alphabet[j] + alphabet[k]);
          if (labels.length >= count) return labels;
        }
      }
    }
    return labels;
  }

  function collectClickableElements(root) {
    const selector = 'a, button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="menuitem"], [onclick], [tabindex]:not([tabindex="-1"])';
    const elements = Array.from(root.querySelectorAll(selector));
    const all = Array.from(root.querySelectorAll('*'));
    for (const el of all) {
      if (el.shadowRoot) {
        elements.push(...collectClickableElements(el.shadowRoot));
      }
    }
    return elements;
  }

  function showToast(msg) {
    let toast = document.getElementById('vim-nav-hud-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'vim-nav-hud-toast';
      toast.style.cssText = `
        all: initial; position: fixed; bottom: 16px; right: 16px;
        background: #1d2021; color: #ebdbb2; border: 1px solid #b8bb26;
        border-radius: 4px; padding: 6px 14px; font-family: 'Maple Mono NF', 'JetBrains Mono', monospace;
        font-size: 11px; z-index: 2147483647; pointer-events: none;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5); opacity: 0;
        transition: opacity 0.15s ease-in-out;
      `;
      document.documentElement.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
  }

  function initSettingsPage() {
    const badge = document.getElementById('conn-badge');
    if (badge) {
      badge.textContent = 'Connected (Violentmonkey active)';
      badge.classList.add('connected');
    }

    const cfg = loadConfig();

    const scrollKeys = [
      { key: 'scrollDown', label: 'Scroll Down' },
      { key: 'scrollUp', label: 'Scroll Up' },
      { key: 'scrollLeft', label: 'Scroll Left' },
      { key: 'scrollRight', label: 'Scroll Right' },
      { key: 'scrollPageDown', label: 'Half Page Down' },
      { key: 'scrollPageUp', label: 'Half Page Up' },
      { key: 'scrollFullPageDown', label: 'Full Page Down' },
      { key: 'scrollFullPageUp', label: 'Full Page Up' },
      { key: 'scrollToTop', label: 'Scroll to Top' },
      { key: 'scrollToBottom', label: 'Scroll to Bottom' },
      { key: 'scrollToLeft', label: 'Scroll to Left Edge' },
      { key: 'scrollToRight', label: 'Scroll to Right Edge' }
    ];

    const hintKeys = [
      { key: 'linkHintsCurrentTab', label: 'Activate Hints (Current Tab)' },
      { key: 'linkHintsNewTab', label: 'Activate Hints (New Tab)' },
      { key: 'linkHintsCopyUrl', label: 'Copy Link URL with Hints' },
      { key: 'linkHintsDownload', label: 'Download Link with Hints' }
    ];

    const navKeys = [
      { key: 'focusFirstInput', label: 'Focus / Cycle Text Inputs' },
      { key: 'passNextKey', label: 'Pass Next Key Unhandled' },
      { key: 'copyCurrentUrl', label: 'Copy Current Page URL' },
      { key: 'copyUrlMarkdown', label: 'Copy URL as Markdown Link' },
      { key: 'goBack', label: 'History Back' },
      { key: 'goForward', label: 'History Forward' },
      { key: 'reload', label: 'Reload Page' },
      { key: 'hardReload', label: 'Hard Reload (Bypass Cache)' },
      { key: 'nextPage', label: 'Next Page / Pagination' },
      { key: 'prevPage', label: 'Previous Page / Pagination' },
      { key: 'openSettings', label: 'Open Settings Page' }
    ];

    renderKeyCategory('keys-scroll-container', scrollKeys, cfg.keys);
    renderKeyCategory('keys-hints-container', hintKeys, cfg.keys);
    renderKeyCategory('keys-nav-container', navKeys, cfg.keys);

    document.getElementById('cfg-scroll-smooth').checked = cfg.scroll.smooth;
    document.getElementById('cfg-scroll-step').value = cfg.scroll.stepSize;
    document.getElementById('cfg-scroll-half-ratio').value = cfg.scroll.pageStepRatio;
    document.getElementById('cfg-scroll-full-ratio').value = cfg.scroll.fullPageRatio;

    document.getElementById('cfg-hints-chars').value = cfg.hints.characters;
    document.getElementById('cfg-hints-upper').checked = cfg.hints.uppercase;
    document.getElementById('cfg-hints-fontsize').value = cfg.hints.fontSize;
    document.getElementById('cfg-hints-auto-activate').checked = cfg.hints.autoActivateSingle;
    document.getElementById('cfg-hints-highlight').checked = cfg.hints.highlightTarget;
    document.getElementById('cfg-hints-bg-tab').checked = cfg.hints.openInBackground;

    document.getElementById('cfg-focus-prevent-auto').checked = cfg.focus.preventAutofocus;
    document.getElementById('cfg-focus-blur-esc').checked = cfg.focus.blurOnEscape;

    renderExclusionsTable(cfg.exclusions);
    updateRawJson(cfg);

    document.getElementById('btn-add-exclusion').onclick = () => {
      const input = document.getElementById('new-exclusion-pattern');
      const val = input.value.trim();
      if (!val) return;
      cfg.exclusions.push({ pattern: val, disabledKeys: '' });
      input.value = '';
      renderExclusionsTable(cfg.exclusions);
      updateRawJson(cfg);
    };

    document.getElementById('btn-save').onclick = () => {
      collectFormSettings(cfg);
      saveConfig(cfg);
      updateRawJson(cfg);
      if (window.VimSettingsUI?.showToast) {
        window.VimSettingsUI.showToast('Settings saved to Violentmonkey');
      }
    };

    document.getElementById('btn-reset').onclick = () => {
      if (!confirm('Reset all settings to defaults?')) return;
      const fresh = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      saveConfig(fresh);
      location.reload();
    };

    document.getElementById('btn-export').onclick = () => {
      collectFormSettings(cfg);
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(cfg, null, 2));
      const dl = document.createElement('a');
      dl.setAttribute('href', dataStr);
      dl.setAttribute('download', 'vim-navigation-config.json');
      dl.click();
    };

    document.getElementById('btn-copy-json').onclick = () => {
      const json = document.getElementById('raw-json-editor').value;
      navigator.clipboard.writeText(json).then(() => {
        if (window.VimSettingsUI?.showToast) window.VimSettingsUI.showToast('JSON copied to clipboard');
      });
    };

    document.getElementById('btn-apply-json').onclick = () => {
      try {
        const parsed = JSON.parse(document.getElementById('raw-json-editor').value);
        saveConfig(parsed);
        if (window.VimSettingsUI?.showToast) window.VimSettingsUI.showToast('Config validated & applied');
        setTimeout(() => location.reload(), 300);
      } catch (err) {
        alert('Invalid JSON: ' + err.message);
      }
    };
  }

  function renderKeyCategory(containerId, items, keyMap) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'setting-row';

      const info = document.createElement('div');
      info.className = 'setting-info';
      const label = document.createElement('div');
      label.className = 'setting-label';
      label.textContent = item.label;
      info.appendChild(label);

      const control = document.createElement('div');
      control.className = 'setting-control';

      const badge = document.createElement('button');
      badge.className = 'key-badge';
      badge.textContent = keyMap[item.key] || '<none>';
      badge.title = 'Click to record new key';

      badge.onclick = () => {
        badge.textContent = 'Press key...';
        badge.classList.add('recording');
        const listener = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.removeEventListener('keydown', listener, true);
          badge.classList.remove('recording');

          const k = normalizeEventKey(e);
          if (k === 'Escape') {
            badge.textContent = keyMap[item.key] || '<none>';
            return;
          }

          keyMap[item.key] = k;
          badge.textContent = k;
        };
        window.addEventListener('keydown', listener, true);
      };

      control.appendChild(badge);
      row.appendChild(info);
      row.appendChild(control);
      container.appendChild(row);
    }
  }

  function renderExclusionsTable(exclusions) {
    const tbody = document.getElementById('exclusions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    exclusions.forEach((rule, idx) => {
      const tr = document.createElement('tr');

      const tdPat = document.createElement('td');
      tdPat.textContent = rule.pattern;
      tr.appendChild(tdPat);

      const tdKeys = document.createElement('td');
      const inputKeys = document.createElement('input');
      inputKeys.type = 'text';
      inputKeys.value = rule.disabledKeys || '';
      inputKeys.placeholder = 'All keys disabled';
      inputKeys.style.width = '100%';
      inputKeys.onchange = () => { rule.disabledKeys = inputKeys.value.trim(); };
      tdKeys.appendChild(inputKeys);
      tr.appendChild(tdKeys);

      const tdAct = document.createElement('td');
      tdAct.style.textAlign = 'right';
      const delBtn = document.createElement('button');
      delBtn.className = 'danger';
      delBtn.textContent = 'Remove';
      delBtn.onclick = () => {
        exclusions.splice(idx, 1);
        renderExclusionsTable(exclusions);
      };
      tdAct.appendChild(delBtn);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
  }

  function collectFormSettings(cfg) {
    cfg.scroll.smooth = document.getElementById('cfg-scroll-smooth').checked;
    cfg.scroll.stepSize = parseInt(document.getElementById('cfg-scroll-step').value, 10) || 70;
    cfg.scroll.pageStepRatio = parseFloat(document.getElementById('cfg-scroll-half-ratio').value) || 0.5;
    cfg.scroll.fullPageRatio = parseFloat(document.getElementById('cfg-scroll-full-ratio').value) || 0.9;

    cfg.hints.characters = document.getElementById('cfg-hints-chars').value.trim() || 'sadfjklewcmpgh';
    cfg.hints.uppercase = document.getElementById('cfg-hints-upper').checked;
    cfg.hints.fontSize = parseInt(document.getElementById('cfg-hints-fontsize').value, 10) || 12;
    cfg.hints.autoActivateSingle = document.getElementById('cfg-hints-auto-activate').checked;
    cfg.hints.highlightTarget = document.getElementById('cfg-hints-highlight').checked;
    cfg.hints.openInBackground = document.getElementById('cfg-hints-bg-tab').checked;

    cfg.focus.preventAutofocus = document.getElementById('cfg-focus-prevent-auto').checked;
    cfg.focus.blurOnEscape = document.getElementById('cfg-focus-blur-esc').checked;
  }

  function updateRawJson(cfg) {
    const el = document.getElementById('raw-json-editor');
    if (el) el.value = JSON.stringify(cfg, null, 2);
  }

})();
