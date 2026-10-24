// ==UserScript==
// @name           ⚙ [Geekr] Preset initializer
// @namespace      github.com/koresent/userscripts
// @version        1.0.0
// @description    Configures user preferences and injects a Gruvbox Dark theme for Geekr.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://www.google.com/s2/favicons?sz=64&domain=geekr.vercel.app
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/geekr/preset-initializer.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/geekr/preset-initializer.user.js
//
// @match          https://geekr.vercel.app/*
//
// @run-at         document-start
//
// @grant          none
// ==/UserScript==

(function () {
  'use strict';

  const desiredValues = {
    habra_rebranding: true,
    habra_ruvds_promo: true,
    habra_USER_SETTINGS: {
      themeType: "1760705224549",
      customThemes: [
        {
          name: "Gruvbox Dark",
          type: "1760705224549",
          palette: {
            type: "dark",
            primary: { main: "#98971a", light: "#b8bb26", dark: "#79740e" },
            background: { paper: "#282828", default: "#1d2021" },
            text: {
              primary: "#fbf1c7",
              secondary: "rgba(251, 241, 199, 0.54)",
              hint: "rgba(251, 241, 199, 0.38)",
              disabled: "rgba(251, 241, 199, 0.38)"
            }
          }
        }
      ],
      hiddenAuthors: [],
      hiddenCompanies: [],
      preferredDarkTheme: "dark",
      preferredLightTheme: "light",
      autoChangeTheme: false,
      cookiesPreferences: { disableCookies: false },
      readerSettings: {
        fontFamily: "Roboto",
        fontSize: 16,
        changeLinks: false,
        replaceImagesWithPlaceholder: false
      },
      interfaceFeed: {
        isCompact: false,
        hideMegaposts: false,
        hideNewsBlock: false,
        disablePostImage: false,
        openPostsInNewTab: false
      },
      interfaceComments: { showThreads: true, sortByKarma: false },
      language: { feed: "ru", interface: "ru" }
    },
    i18nextLng: "ru",
    mode: "daily"
  };

  let changed = false;

  for (const [key, value] of Object.entries(desiredValues)) {
    const current = localStorage.getItem(key);
    const target = typeof value === "object" ? JSON.stringify(value) : String(value);

    if (current !== target) {
      localStorage.setItem(key, target);
      changed = true;
    }
  }

  if (changed) {
    setTimeout(() => location.reload(), 1000);
  }
})();
