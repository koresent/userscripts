// ==UserScript==
// @name           ⚙ [GitHub] Enhancer
// @namespace      github.com/koresent/userscripts
// @version        3.4.0
// @description    Combines Material Icons, Repo Stats, Active Forks, and Folder Downloader.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/github-light.svg
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/github/enhancer.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/github/enhancer.user.js
//
// @match          https://github.com/*
//
// @run-at         document-end
//
// @connect        cdn.jsdelivr.net
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_CONFIG = {
        enableIcons: true,
        enableDownloader: true,
        enableForks: true,
        enableStats: true
    };

    const savedConfig = JSON.parse(GM_getValue('gh_enhancer_config', '{}'));
    const config = { ...DEFAULT_CONFIG, ...savedConfig };

    function toggleFeature(key) {
        config[key] = !config[key];
        GM_setValue('gh_enhancer_config', JSON.stringify(config));
        location.reload();
    }

    GM_registerMenuCommand(`${config.enableIcons ? '✅' : '❌'} Material Icons`, () => toggleFeature('enableIcons'));
    GM_registerMenuCommand(`${config.enableDownloader ? '✅' : '❌'} Folder Downloader`, () => toggleFeature('enableDownloader'));
    GM_registerMenuCommand(`${config.enableForks ? '✅' : '❌'} Active Forks`, () => toggleFeature('enableForks'));
    GM_registerMenuCommand(`${config.enableStats ? '✅' : '❌'} Repo Stats`, () => toggleFeature('enableStats'));

    let PAT_GITHUB_TOKEN = GM_getValue('githubToken', '');
    GM_registerMenuCommand("🔑 Set GitHub Token", function () {
        const token = prompt("Enter your GitHub personal access token:\nLeave empty to clear.", PAT_GITHUB_TOKEN);
        if (token !== null) {
            GM_setValue('githubToken', token.trim());
            PAT_GITHUB_TOKEN = token.trim();
            GM_setValue(CACHE_KEY_GH, '{}');
            location.reload();
        }
    });

    const MANIFEST_URL = 'https://cdn.jsdelivr.net/npm/material-icon-theme/dist/material-icons.json';
    const ICON_BASE_URL = 'https://cdn.jsdelivr.net/npm/material-icon-theme/icons/';
    const CACHE_KEY_ICONS = 'mat-manifest-data';
    const CACHE_TTL_ICONS = 7 * 24 * 60 * 60 * 1000;

    const HARD_MAPPING = {
        'ts': 'typescript',
        'tsx': 'typescriptreact',
        'js': 'javascript',
        'jsx': 'javascriptreact',
        'yml': 'yaml',
        'yaml': 'yaml',
        'py': 'python'
    };

    const SELECTORS = {
        row: `.js-navigation-container[role=grid] > .js-navigation-item,
              file-tree .ActionList-content,
              .PRIVATE_TreeView-item-content,
              .react-directory-filename-column,
              .Box details .Box-row`,
        filename: `div[role="rowheader"] > span,
                   .ActionList-item-label,
                   .PRIVATE_TreeView-item-content > .PRIVATE_TreeView-item-content-text,
                   .react-directory-filename-column a,
                   a.Truncate`,
        icon: `.octicon-file,
               .octicon-file-directory-fill,
               .octicon-file-directory-open-fill,
               .octicon-file-submodule,
               .react-directory-filename-column > svg`
    };

    const CACHE_KEY_GH = 'gh_ext_cache';
    const CACHE_TTL_GH = 24 * 60 * 60 * 1000;

    let manifest = null;
    let sharedDebounceTimer = null;
    const pendingIconRequests = {};

    if (config.enableIcons) {
        const style = document.createElement('style');
        style.innerHTML = `
            img[data-mat-icon] { width: 16px; height: 16px; margin-right: 8px; vertical-align: middle; flex-shrink: 0; }
            .octicon-file-directory-open-fill, .octicon-file-directory-fill, .octicon-file { display: none !important; }
            .PRIVATE_TreeView-item-visual > svg, .react-directory-filename-column > svg { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    function getHumanReadableSize(sizeInKB) {
        if (!sizeInKB) return "0 B";
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const size = sizeInKB * 1024;
        const i = parseInt(Math.floor(Math.log(size) / Math.log(1024)));
        return (size / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
    }

    function formatDate(dateString) {
        if (!dateString) return "Unknown";
        return new Date(dateString).toISOString().split('T')[0];
    }

    function getRelativeTime(dateString) {
        if (!dateString) return 'unknown';
        const date = new Date(dateString);
        const diffInDays = Math.floor((new Date() - date) / 86400000);
        if (diffInDays < 1) return 'today';
        if (diffInDays < 30) return `${diffInDays}d ago`;
        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths < 12) return `${diffInMonths}mo ago`;
        return `${Math.floor(diffInMonths / 12)}y ago`;
    }

    function getLindyBadge(dateString) {
        if (!dateString) return { icon: '', label: 'Unknown' };
        const years = (new Date() - new Date(dateString)) / (1000 * 60 * 60 * 24 * 365.25);
        if (years < 1) return { icon: '🌱', label: 'Sprout' };
        if (years > 10) return { icon: '🏛️', label: 'Ancient' };
        if (years > 5) return { icon: '🌳', label: 'Mature' };
        return { icon: '🌿', label: 'Established' };
    }

    async function fetchRepoData(apiPath) {
        const cacheRaw = GM_getValue(CACHE_KEY_GH, '{}');
        const cache = JSON.parse(cacheRaw);

        if (cache[apiPath] && (Date.now() - cache[apiPath].timestamp < CACHE_TTL_GH)) {
            return cache[apiPath].data;
        }

        const headers = PAT_GITHUB_TOKEN ? { authorization: `token ${PAT_GITHUB_TOKEN}` } : {};
        try {
            const res = await fetch(`https://api.github.com/repos${apiPath}`, { headers });
            if (!res.ok) return null;
            const data = await res.json();
            const result = { size: data.size, created_at: data.created_at, pushed_at: data.pushed_at };

            cache[apiPath] = { timestamp: Date.now(), data: result };
            GM_setValue(CACHE_KEY_GH, JSON.stringify(cache));
            return result;
        } catch (err) {
            return null;
        }
    }

    function request(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: (r) => (r.status >= 200 && r.status < 300) ? resolve(JSON.parse(r.responseText)) : reject(r.statusText),
                onerror: (e) => reject(e)
            });
        });
    }

    async function getIconDataUri(iconId, url) {
        const cacheKey = 'icon_svg_' + iconId;
        const cachedUri = GM_getValue(cacheKey);
        if (cachedUri) return cachedUri;

        if (pendingIconRequests[iconId]) return pendingIconRequests[iconId];

        pendingIconRequests[iconId] = new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: (r) => {
                    if (r.status >= 200 && r.status < 300) {
                        // CSP img-src bypass via Data URI
                        const dataUri = 'data:image/svg+xml;utf8,' + encodeURIComponent(r.responseText);
                        GM_setValue(cacheKey, dataUri);
                        resolve(dataUri);
                    } else {
                        reject(`HTTP ${r.status}`);
                    }
                },
                onerror: (e) => reject(e)
            });
        });

        try {
            const uri = await pendingIconRequests[iconId];
            delete pendingIconRequests[iconId];
            return uri;
        } catch (e) {
            console.error('Failed to fetch icon:', iconId, e);
            delete pendingIconRequests[iconId];
            return null;
        }
    }

    async function loadManifest() {
        if (!config.enableIcons) return;

        const cachedStr = GM_getValue(CACHE_KEY_ICONS);
        if (cachedStr) {
            try {
                const cached = JSON.parse(cachedStr);
                if (Date.now() - cached.timestamp < CACHE_TTL_ICONS) {
                    manifest = cached.data;
                    return;
                }
            } catch (e) {
                console.warn('Cache parsing failed, fetching new manifest');
            }
        }

        try {
            manifest = await request(MANIFEST_URL);
            GM_setValue(CACHE_KEY_ICONS, JSON.stringify({
                timestamp: Date.now(),
                data: manifest
            }));
        } catch (e) {
            console.error('Manifest load error:', e);
        }
    }

    function getIconId(name, isDir, fullPath = '') {
        if (!manifest) return null;
        const lowerName = name.toLowerCase();

        if (isDir) {
            if (fullPath.includes('.github/workflows')) return 'folder-gh-workflows';
            if (fullPath.includes('.github')) return 'folder-github';
            if (manifest.folderNames && manifest.folderNames[lowerName]) return manifest.folderNames[lowerName];
            return manifest.folder || 'folder';
        }

        if (manifest.fileNames && manifest.fileNames[lowerName]) return manifest.fileNames[lowerName];

        const parts = lowerName.split('.');
        for (let i = 1; i < parts.length; i++) {
            const subExt = parts.slice(i).join('.');
            if (manifest.fileExtensions && manifest.fileExtensions[subExt]) return manifest.fileExtensions[subExt];
            if (manifest.languageIds && manifest.languageIds[subExt]) return manifest.languageIds[subExt];
        }

        const lastExt = parts[parts.length - 1];
        if (HARD_MAPPING[lastExt]) return HARD_MAPPING[lastExt];

        return manifest.file || 'file';
    }

    function getIconUrl(iconId) {
        const def = manifest.iconDefinitions[iconId];
        if (!def) return null;
        const path = def.iconPath.split('/').pop();
        return ICON_BASE_URL + path;
    }

    function applyIcons() {
        if (!config.enableIcons || !manifest) return;

        const rows = document.querySelectorAll(SELECTORS.row);
        rows.forEach(row => {
            const linkEl = row.querySelector('a') || row.closest('a');
            const fullPath = linkEl ? (linkEl.getAttribute('href') || '') : '';

            // Handle virtual DOM re-renders where classes might stay but content changes
            if (row.getAttribute('data-mat-path') === fullPath) return;
            row.setAttribute('data-mat-path', fullPath);

            const nameEl = row.querySelector(SELECTORS.filename);
            const iconEl = row.querySelector(SELECTORS.icon);

            if (nameEl && iconEl) {
                const name = nameEl.textContent.trim().split('/').pop();
                const isDir = iconEl.classList.contains('octicon-file-directory-fill') ||
                              iconEl.classList.contains('octicon-file-directory-open-fill') ||
                              iconEl.getAttribute('aria-label') === 'Directory' ||
                              fullPath.includes('/tree/');

                const iconId = getIconId(name, isDir, fullPath);
                const url = getIconUrl(iconId);

                if (url) {
                    let img = row.querySelector('img[data-mat-icon]');
                    if (!img) {
                        img = document.createElement('img');
                        img.setAttribute('data-mat-icon', 'true');
                        iconEl.style.display = 'none';
                        iconEl.before(img);
                    }

                    if (img.dataset.iconId !== iconId) {
                        img.dataset.iconId = iconId;
                        img.src = '';

                        getIconDataUri(iconId, url).then(dataUri => {
                            if (dataUri && img.dataset.iconId === iconId) {
                                img.src = dataUri;
                            }
                        });
                    }
                } else {
                    iconEl.style.display = '';
                    const oldImg = row.querySelector('img[data-mat-icon]');
                    if (oldImg) oldImg.remove();
                }
            }
        });
    }

    function insertFolderDownloader() {
        if (!config.enableDownloader) return;

        const currentUrl = window.location.href;
        let btn = document.getElementById('gh-folder-downloader');

        if (btn) {
            if (btn.dataset.url === currentUrl) return;
            btn.remove();
        }

        const anchor = document.querySelector('[data-testid="tree-overflow-menu-anchor"]') ||
                       document.querySelector('button[aria-label="More file navigation options"]') ||
                       document.querySelector('#folder-row-0')?.closest('.Box-header')?.querySelector('.d-flex');

        if (!anchor) return;

        btn = document.createElement('a');
        btn.id = 'gh-folder-downloader';
        btn.dataset.url = currentUrl;
        btn.href = `https://download-directory.github.io?url=${currentUrl}`;
        btn.target = '_blank';
        btn.className = 'btn btn-sm ml-2 d-inline-flex flex-items-center';
        btn.style.gap = '4px';
        btn.innerHTML = `
            <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                <path d="M7.47 10.78a.75.75 0 0 0 1.06 0l3.75-3.75a.75.75 0 00-1.06-1.06L8.75 8.44V1.75a.75.75 0 00-1.5 0v6.69L4.78 5.97a.75.75 0 00-1.06 1.06l3.75 3.75zM3.75 13a.75.75 0 000 1.5h8.5a.75.75 0 000-1.5h-8.5z"></path>
            </svg>
            <span class="d-none d-sm-inline">Download</span>
        `;
        anchor.parentElement.insertBefore(btn, anchor);
    }

    function insertActiveForks(owner, repo) {
        if (!config.enableForks) return;

        const targetUrl = `https://techgaun.github.io/active-forks/index.html#${owner}/${repo}`;
        const existingBtn = document.getElementById('github-active-forks');

        if (existingBtn) {
            if (existingBtn.getAttribute('href') === targetUrl) return;
            existingBtn.closest('li, details').remove();
        }

        const svgStr = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path fill-rule="evenodd" d="M1.5 1.75a.75.75 0 00-1.5 0v12.5c0 .414.336.75.75.75h14.5a.75.75 0 000-1.5H1.5V1.75zm14.28 2.53a.75.75 0 00-1.06-1.06L10 7.94 7.53 5.47a.75.75 0 00-1.06 0L3.22 8.72a.75.75 0 001.06 1.06L7 7.06l2.47 2.47a.75.75 0 001.06 0l5.25-5.25z"></path></svg>';
        const el = document.querySelector('.pagehead-actions') || document.querySelector('#responsive-meta-container .flex-wrap');
        if (!el) return;

        const isPageHead = el.classList.contains('pagehead-actions');
        const buttonHtml = `<details class="details-reset details-overlay f5 position-relative"><summary class="btn btn-sm tooltipped tooltipped-s" aria-label="Active Forks"><a id="github-active-forks" href="${targetUrl}" target="_blank" style="text-decoration:none; color:inherit;"> ${svgStr} ${isPageHead ? 'Active forks' : ''}</a></summary></details>`;

        if (isPageHead) el.insertAdjacentHTML('afterbegin', `<li>${buttonHtml}</li>`);
        else el.insertAdjacentHTML('afterbegin', buttonHtml);
    }

    const injectRepoStats = () => {
        const { pathname } = window.location;
        const pathParts = pathname.split('/').filter(Boolean);
        if (pathParts.length < 2) return;

        if (document.querySelector('.react-directory-row, .js-navigation-container, [data-testid="file-list-main-area"]')) {
            insertFolderDownloader();
        }

        const owner = pathParts[0];
        const repo = pathParts[1];

        let repoSelector = '';
        if (pathname.includes('/repositories')) repoSelector = 'div[data-testid="list-view-item-title-container"] h4 a';
        else if (window.location.search.includes('tab=repositories')) repoSelector = '#user-repositories-list h3 a';
        else if (window.location.search.includes('tab=stars')) repoSelector = '#user-starred-repos h3 a';
        else if (pathParts.length === 2) repoSelector = '#repository-container-header strong a';
        else if (pathname.includes('/search')) repoSelector = 'div[data-testid="results-list"] .search-title a';

        if (pathParts.length === 2 && !pathname.includes('/search')) {
            insertActiveForks(owner, repo);
        }

        if (repoSelector && config.enableStats) {
            document.querySelectorAll(repoSelector).forEach(async (elem) => {
                const parts = elem.getAttribute('href').split('/').filter(Boolean);
                if (parts.length < 2) return;
                const apiPath = `/${parts[0]}/${parts[1]}`;

                if (elem.dataset.statsHandled === apiPath) return;
                elem.dataset.statsHandled = apiPath;

                const repoData = await fetchRepoData(apiPath);
                if (!repoData) return;

                let parent = (pathParts.length === 2 && !pathname.includes('/search')) ? elem.parentElement.parentElement : elem.parentElement;

                const oldStats = parent.querySelector('#lite-repo-stats');
                if (oldStats) oldStats.remove();

                const statsContainer = document.createElement('span');
                statsContainer.id = 'lite-repo-stats';
                statsContainer.className = 'v-align-middle ml-2 d-inline-flex flex-items-center flex-wrap';
                statsContainer.style.gap = '6px';

                const badge = getLindyBadge(repoData.created_at);
                const relTime = getRelativeTime(repoData.created_at);
                const tooltip = `Age: ${badge.label}\nCreated: ${formatDate(repoData.created_at)}\nPushed: ${formatDate(repoData.pushed_at)}`;

                statsContainer.innerHTML = `
                    <span class="Label Label--info" title="Size: ${getHumanReadableSize(repoData.size)}">${getHumanReadableSize(repoData.size)}</span>
                    <span class="Label Label--secondary" title="${tooltip}" style="display: flex; align-items: center; gap: 3px;">
                        <span>${badge.icon}</span><span>${relTime}</span>
                    </span>
                `;
                parent.appendChild(statsContainer);
            });
        }
    };

    function executeDOMUpdates() {
        applyIcons();
        injectRepoStats();
    }

    function setupObserver() {
        const observer = new MutationObserver(() => {
            if (sharedDebounceTimer) clearTimeout(sharedDebounceTimer);
            sharedDebounceTimer = setTimeout(() => {
                executeDOMUpdates();
            }, 150);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener('turbo:load', executeDOMUpdates);
    document.addEventListener('turbo:render', executeDOMUpdates);
    document.addEventListener('soft-nav:end', executeDOMUpdates);

    injectRepoStats();

    loadManifest().then(() => {
        applyIcons();
        setupObserver();
    });

})();
