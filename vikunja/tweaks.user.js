// ==UserScript==
// @name           ⚙ [Vikunja] Tweaks
// @namespace      github.com/koresent/userscripts
// @version        1.4.0
// @description    Auto-collapse Done column, Export Sorted Column to Clipboard with Custom Priorities and Emojis.
// @author         Koresent
// @license        GPL-3.0
// @icon           https://vikunja.io/favicon.svg
// @homepageURL    https://github.com/koresent/userscripts
// @supportURL     https://github.com/koresent/userscripts/issues
// @updateURL      https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/vikunja/tweaks.user.js
// @downloadURL    https://raw.githubusercontent.com/koresent/userscripts/refs/heads/main/vikunja/tweaks.user.js
//
// @match          https://tasks.umbra.team/*
//
// @run-at         document-end
//
// @grant          GM_getValue
// @grant          GM_setValue
// @grant          GM_registerMenuCommand
// @grant          GM_unregisterMenuCommand
// @grant          GM_addValueChangeListener
// ==/UserScript==

(function () {
    'use strict';

    const config = {
        collapseDoneEnabled: GM_getValue('collapseDoneEnabled', true),
        targetColumnTitle: GM_getValue('targetColumnTitle', '✅ Done')
    };

    const PRIORITY_MAP = {
        1: 'Low',
        2: 'Medium',
        3: 'High',
        4: 'Urgent',
        5: 'Do Now'
    };

    let menuIds = [];
    let globalTimer = null;

    function updateConfig(key, value) {
        config[key] = value;
        GM_setValue(key, value);
        renderMenu();
        applySpecificModule(key);
    }

    function applySpecificModule(key) {
        if (key === 'collapseDoneEnabled' || key === 'targetColumnTitle') {
            applyCollapseModule();
        }
    }

    function manageStyle(id, css, enable) {
        let el = document.getElementById(id);
        if (enable) {
            if (!el) {
                el = document.createElement('style');
                el.id = id;
                const target = document.head || document.documentElement;
                if (target) target.appendChild(el);
            }
            el.textContent = css;
        } else if (el) {
            el.remove();
        }
    }

    function htmlToMarkdown(htmlString) {
        if (!htmlString || !htmlString.trim()) return '-';

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');

        function convertNode(node) {
            let result = '';

            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent;
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toLowerCase();

                switch (tagName) {
                    case 'p':
                        result += '\n' + convertChildren(node) + '\n';
                        break;
                    case 'br':
                        result += '\n';
                        break;
                    case 'strong':
                    case 'b': {
                        const boldContent = convertChildren(node).trim();
                        if (boldContent) result += `**${boldContent}**`;
                        break;
                    }
                    case 'a': {
                        const href = node.getAttribute('href') || '';
                        const text = convertChildren(node).trim();
                        if (text) {
                            result += href ? `[${text}](${href})` : text;
                        }
                        break;
                    }
                    case 'ul':
                        result += '\n' + convertChildren(node) + '\n';
                        break;
                    case 'li': {
                        const isTask = node.getAttribute('data-type') === 'taskItem';
                        if (isTask) {
                            const checkbox = node.querySelector('input[type="checkbox"]');
                            const isChecked = checkbox ? checkbox.checked : (node.getAttribute('data-checked') === 'true');
                            const marker = isChecked ? '[x]' : '[ ]';

                            const contentDiv = node.querySelector('div');
                            const itemText = contentDiv ? convertNode(contentDiv).trim() : convertChildren(node).trim();
                            result += `* ${marker} ${itemText}\n`;
                        } else {
                            result += `* ${convertChildren(node).trim()}\n`;
                        }
                        break;
                    }
                    default:
                        result += convertChildren(node);
                        break;
                }
            }
            return result;
        }

        function convertChildren(parentNode) {
            let str = '';
            parentNode.childNodes.forEach(child => {
                str += convertNode(child);
            });
            return str;
        }

        let markdown = convertNode(doc.body);

        markdown = markdown
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\s+|\s+$/g, '');

        return markdown || '-';
    }

    function renderMenu() {
        if (window.self !== window.top) return;

        menuIds.forEach(id => GM_unregisterMenuCommand(id));
        menuIds = [];

        menuIds.push(GM_registerMenuCommand(
            `${config.collapseDoneEnabled ? '✅' : '❌'} Auto-collapse Done Column`,
            () => updateConfig('collapseDoneEnabled', !config.collapseDoneEnabled)
        ));

        menuIds.push(GM_registerMenuCommand(
            `    ↳ Set Target Column (${config.targetColumnTitle})`,
            () => {
                const userInput = prompt('Enter the exact column header title:', config.targetColumnTitle);
                if (userInput !== null && userInput.trim() !== '') {
                    updateConfig('targetColumnTitle', userInput.trim());
                }
            }
        ));
    }

    ['collapseDoneEnabled', 'targetColumnTitle'].forEach(key => {
        GM_addValueChangeListener(key, (name, oldValue, newValue, remote) => {
            if (remote) {
                config[name] = newValue;
                applySpecificModule(name);
                renderMenu();
            }
        });
    });

    let lastStateWasCollapsed = false;

    function getColumn() {
        const headers = document.querySelectorAll('.bucket-header h2.title');
        for (const header of headers) {
            if (header.textContent.trim() === config.targetColumnTitle) {
                return header.closest('.bucket');
            }
        }
        return null;
    }

    function collapseColumn(column) {
        if (!column || column.classList.contains('is-collapsed')) return;

        const dropdownTrigger = column.querySelector('.bucket-header .dropdown .dropdown-trigger');
        if (!dropdownTrigger) return;

        dropdownTrigger.click();

        setTimeout(() => {
            const items = column.querySelectorAll('.dropdown-content .dropdown-item');
            for (const item of items) {
                const text = item.textContent.toLowerCase();
                if (text.includes('collapse this column') || text.includes('свернуть эту колонку')) {
                    item.click();
                    break;
                }
            }
        }, 50);
    }

    function expandColumn(column) {
        if (!column || !column.classList.contains('is-collapsed')) return;
        const header = column.querySelector('.bucket-header');
        if (header) header.click();
    }

    function handleDragEnter(e) {
        const column = e.currentTarget;
        if (column.classList.contains('is-collapsed')) {
            expandColumn(column);
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
        const column = e.currentTarget;
        if (column.classList.contains('is-collapsed')) {
            expandColumn(column);
        }
    }

    const COPY_SVG = `<svg style="width:14px;height:14px;" viewBox="0 0 448 512" fill="currentColor"><path d="M208 0H48C21.5 0 0 21.5 0 48v320c0 26.5 21.5 48 48 48h160c26.5 0 48-21.5 48-48V48c0-26.5-21.5-48-48-48zM176 352H80c-8.8 0-16-7.2-16-16s7.2-16 16-16h96c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0-80H80c-8.8 0-16-7.2-16-16s7.2-16 16-16h96c8.8 0 16 7.2 16 16s-7.2 16-16 16zm0-80H80c-8.8 0-16-7.2-16-16s7.2-16 16-16h96c8.8 0 16 7.2 16 16s-7.2 16-16 16zm224-32v352c0 26.5-21.5 48-48 48H144c-26.5 0-48-21.5-48-48v-16h240c17.7 0 32-14.3 32-32V128h16c26.5 0 48 21.5 48 48z"/></svg>`;
    const CHECK_SVG = `<svg style="width:14px;height:14px;color:#23d160;" viewBox="0 0 448 512" fill="currentColor"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`;
    const SPIN_SVG = `<svg style="width:14px;height:14px;" class="fa-spin" viewBox="0 0 512 512" fill="currentColor"><path d="M304 48a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zm0 416a48 48 0 1 0 -96 0 48 48 0 1 0 96 0zM48 304a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm416 0a48 48 0 1 0 0-96 48 48 0 1 0 0 96zM134.1 134.1a48 48 0 1 0 -67.9-67.9 48 48 0 1 0 67.9 67.9zm243.8 243.8a48 48 0 1 0 -67.9-67.9 48 48 0 1 0 67.9 67.9zM134.1 377.9a48 48 0 1 0 -67.9 67.9 48 48 0 1 0 67.9-67.9zm243.8-243.8a48 48 0 1 0 -67.9 67.9 48 48 0 1 0 67.9-67.9z"/></svg>`;

    manageStyle('tm-vikunja-export-css', `@keyframes fa-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .fa-spin { animation: fa-spin 1s linear infinite; }`, true);

    function injectExportButtons() {
        const headers = document.querySelectorAll('.bucket-header');
        headers.forEach(header => {
            if (header.querySelector('.tm-export-btn')) return;

            const dropdown = header.querySelector('.dropdown.options');
            if (!dropdown) return;

            const btn = document.createElement('button');
            btn.className = 'base-button base-button--type-button dropdown-trigger is-flex tm-export-btn';
            btn.type = 'button';
            btn.style.marginRight = '0.5rem';
            btn.style.background = 'transparent';
            btn.style.border = 'none';
            btn.style.cursor = 'pointer';
            btn.style.padding = '4px 8px';
            btn.style.alignItems = 'center';
            btn.innerHTML = COPY_SVG;
            btn.title = 'Copy column tasks description';

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                handleColumnExport(header.closest('.bucket'), btn);
            });

            dropdown.parentNode.insertBefore(btn, dropdown);
        });
    }

    async function handleColumnExport(bucketEl, buttonEl) {
        if (!bucketEl || buttonEl.classList.contains('is-loading')) return;

        const token = localStorage.getItem('token');
        if (!token) {
            console.error('[Vikunja Tweaks] Authorization token not found in Local Storage.');
            alert('Error: Authorization token not found in Local Storage. Please reload the page.');
            return;
        }

        const titleEl = bucketEl.querySelector('.bucket-header h2.title');
        const columnTitle = titleEl ? titleEl.textContent.trim() : 'Column';

        const taskCards = bucketEl.querySelectorAll('.tasks .task-item .task[data-task-id]');
        if (taskCards.length === 0) {
            alert('No tasks found in this column to copy.');
            return;
        }

        buttonEl.innerHTML = SPIN_SVG;
        buttonEl.classList.add('is-loading');

        try {
            const taskIds = Array.from(taskCards).map(card => card.getAttribute('data-task-id'));

            const requestHeaders = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json, text/plain, */*'
            };

            const fetchPromises = taskIds.map(id =>
                fetch(`https://tasks.umbra.team/api/v1/tasks/${id}?expand[]=reactions&expand[]=comments&expand[]=is_unread&expand[]=buckets`, {
                    headers: requestHeaders
                })
                .then(res => {
                    if (!res.ok) throw new Error(`Failed to fetch task ${id}: ${res.status}`);
                    return res.json();
                })
                .catch(err => {
                    console.error(err);
                    return null;
                })
            );

            const tasksData = await Promise.all(fetchPromises);
            const validTasks = tasksData.filter(t => t !== null);

            validTasks.sort((a, b) => {
                const pA = a.priority || 0;
                const pB = b.priority || 0;
                return pB - pA;
            });

            let outputText = `${columnTitle}\n\n`;

            validTasks.forEach(task => {
                const title = task.title ? task.title.trim() : 'Untitled';
                const rawPriority = task.priority || 0;
                const priorityText = PRIORITY_MAP[rawPriority] || null;

                const rawDescription = task.description ? task.description.trim() : '';
                const descriptionMarkdown = htmlToMarkdown(rawDescription);
                const hasDescription = descriptionMarkdown !== '-';

                outputText += `🎯 ${title}\n`;

                if (priorityText) {
                    outputText += `Priority: ${priorityText}\n`;
                }

                if (hasDescription) {
                    outputText += `Description: ${descriptionMarkdown}\n`;
                }

                outputText += `\n`;
            });

            outputText = outputText.trim();

            await navigator.clipboard.writeText(outputText);

            buttonEl.innerHTML = CHECK_SVG;
            setTimeout(() => {
                buttonEl.innerHTML = COPY_SVG;
                buttonEl.classList.remove('is-loading');
            }, 1500);

        } catch (error) {
            console.error('Export failed:', error);
            alert('An error occurred while gathering task data.');
            buttonEl.innerHTML = COPY_SVG;
            buttonEl.classList.remove('is-loading');
        }
    }

    function removeDragHandlers(column) {
        if (!column || !column.dataset.dragHandlerAttached) return;
        column.removeEventListener('dragenter', handleDragEnter);
        column.removeEventListener('dragover', handleDragOver);
        delete column.dataset.dragHandlerAttached;
    }

    function processCollapseLogic() {
        if (!config.collapseDoneEnabled) return;

        const column = getColumn();
        if (!column) {
            lastStateWasCollapsed = false;
            return;
        }

        const isCurrentlyCollapsed = column.classList.contains('is-collapsed');

        if (!isCurrentlyCollapsed && !lastStateWasCollapsed) {
            collapseColumn(column);
        }

        lastStateWasCollapsed = isCurrentlyCollapsed;

        if (!column.dataset.dragHandlerAttached) {
            column.addEventListener('dragenter', handleDragEnter);
            column.addEventListener('dragover', handleDragOver);
            column.dataset.dragHandlerAttached = 'true';
        }
    }

    function applyCollapseModule() {
        if (config.collapseDoneEnabled) {
            processCollapseLogic();
        } else {
            const column = getColumn();
            if (column) {
                removeDragHandlers(column);
                if (column.classList.contains('is-collapsed')) {
                    expandColumn(column);
                }
            }
            lastStateWasCollapsed = false;
        }
    }

    function startExecutionLoop() {
        if (globalTimer) return;

        globalTimer = setInterval(() => {
            processCollapseLogic();
            injectExportButtons();
        }, 1000);
    }

    function initAll() {
        renderMenu();
        applyCollapseModule();
        injectExportButtons();
        startExecutionLoop();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll, { once: true });
    } else {
        initAll();
    }
})();
