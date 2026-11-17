import { icon } from './icons.js';
import { currentLanguage, t } from './i18n.js';
import { activeTab, containsNode, findNode, insertNode, persist, removeNode, state } from './store.js';
import { $, $$, bus, clamp, dragResize, formatDuration, formatTime, h, relativeDay } from './util.js';
import { showMenu } from './ui.js';

const els = {};
let filter = '';
let dragging = null;
let renaming = '';

export function initSidebar() {
    els.rail = $('#rail');
    els.sidebar = $('#sidebar');
    els.content = $('#sidebarContent');
    els.filter = $('#sidebarFilter');
    els.addBtn = $('#sidebarAddBtn');
    els.moreBtn = $('#sidebarMoreBtn');
    els.resizer = $('#sidebarResizer');
    els.title = $('#sidebarTitle');
    $$('.rail-item', els.rail).forEach(button => button.addEventListener('click', () => {
        const view = button.dataset.view;
        if (state.ui.sidebarView === view && !state.ui.sidebarHidden) state.ui.sidebarHidden = true;
        else {
            state.ui.sidebarView = view;
            state.ui.sidebarHidden = false;
        }
        persist();
        applySidebar();
        renderSidebar();
    }));
    els.filter.addEventListener('input', () => {
        filter = els.filter.value.trim().toLowerCase();
        renderSidebar();
    });
    els.filter.addEventListener('keydown', event => {
        if (event.key === 'Escape' && els.filter.value) {
            event.stopPropagation();
            els.filter.value = '';
            filter = '';
            renderSidebar();
        }
    });
    els.addBtn.addEventListener('click', () => {
        if (state.ui.sidebarView === 'collections') bus.emit('action:newCollection');
        else if (state.ui.sidebarView === 'environments') bus.emit('action:newEnvironment');
        else bus.emit('action:newTab');
    });
    els.moreBtn.addEventListener('click', () => {
        const view = state.ui.sidebarView;
        const items = view === 'collections' ? [
            { label: t('newCollection'), icon: 'plus', action: () => bus.emit('action:newCollection') },
            { label: t('import'), icon: 'upload', action: () => bus.emit('action:import') },
            '-',
            { label: t('expandAll'), action: () => setAllExpanded(true) },
            { label: t('collapseAll'), action: () => setAllExpanded(false) }
        ] : view === 'environments' ? [
            { label: t('newEnvironment'), icon: 'plus', action: () => bus.emit('action:newEnvironment') }
        ] : [
            { label: t('clearHistory'), icon: 'trash', danger: true, action: () => bus.emit('action:clearHistory'), disabled: !state.history.length }
        ];
        showMenu(items, els.moreBtn, { align: 'right' });
    });
    dragResize({
        handle: els.resizer,
        axis: 'x',
        onStart: () => ({ width: Math.round(els.sidebar.getBoundingClientRect().width) || state.ui.sidebarWidth }),
        onMove: (delta, ctx) => {
            state.ui.sidebarWidth = clamp(ctx.width + delta, 220, 560);
            applySidebar();
        },
        onEnd: () => persist()
    });
    applySidebar();
}

function setAllExpanded(expanded) {
    const visit = list => list.forEach(node => {
        if (node.items) {
            node.expanded = expanded;
            visit(node.items);
        }
    });
    visit(state.collections);
    persist();
    renderSidebar();
}

export function applySidebar() {
    const app = $('#app');
    app.style.setProperty('--sidebar-width', `${state.ui.sidebarWidth}px`);
    app.classList.toggle('sidebar-hidden', !!state.ui.sidebarHidden);
    $$('.rail-item', els.rail).forEach(b => b.classList.toggle('active', b.dataset.view === state.ui.sidebarView && !state.ui.sidebarHidden));
    els.filter.placeholder = t(state.ui.sidebarView === 'history' ? 'searchHistory' : state.ui.sidebarView === 'environments' ? 'searchEnvironments' : 'searchCollections');
    els.addBtn.disabled = state.ui.sidebarView === 'history';
}

export function renderSidebar() {
    if (!els.content) return;
    applySidebar();
    const scroll = els.content.scrollTop;
    els.content.innerHTML = '';
    if (state.ui.sidebarView === 'environments') renderEnvironments();
    else if (state.ui.sidebarView === 'history') renderHistory();
    else renderCollections();
    els.content.scrollTop = scroll;
}

function matches(node) {
    if (!filter) return true;
    if (node.name.toLowerCase().includes(filter)) return true;
    return (node.items || []).some(matches);
}

function emptyState(iconName, title, text, actionLabel, action) {
    return h('div', { class: 'empty-state' },
        h('div', { class: 'empty-icon', html: icon(iconName) }),
        h('div', { class: 'empty-title', text: title }),
        text ? h('div', { class: 'empty-text', text }) : null,
        actionLabel ? h('button', { class: 'btn btn-sm', type: 'button', text: actionLabel, onclick: action }) : null);
}

function renderCollections() {
    if (!state.collections.length) {
        els.content.append(emptyState('collections', t('noCollections'), t('noCollectionsText'), t('createCollection'), () => bus.emit('action:newCollection')));
        return;
    }
    const tree = h('div', { class: 'tree', role: 'tree' });
    let shown = 0;
    for (const collection of state.collections) {
        if (!matches(collection)) continue;
        shown++;
        renderNode(tree, collection, 0);
    }
    if (!shown) tree.append(h('div', { class: 'empty-text pad', text: t('noResults') }));
    els.content.append(tree);
    tree.addEventListener('dragover', event => {
        if (!dragging || event.target !== tree) return;
        if (dragging.type === 'collection') event.preventDefault();
    });
}

function nodeMenu(node) {
    const isContainer = !!node.items;
    if (isContainer) {
        return [
            { label: t('addRequest'), icon: 'plus', action: () => bus.emit('action:newRequestIn', node.id) },
            { label: t('addFolder'), icon: 'folder', action: () => bus.emit('action:newFolderIn', node.id) },
            { label: t('addDescription'), icon: 'textAlignStart', action: () => bus.emit('action:newDocIn', node.id) },
            '-',
            { label: t('rename'), icon: 'edit', shortcut: 'F2', action: () => startRename(node.id) },
            { label: t('duplicate'), icon: 'copy', action: () => bus.emit('action:duplicateNode', node.id) },
            node.type === 'collection' ? { label: t('export'), icon: 'download', action: () => bus.emit('action:exportCollection', node.id) } : null,
            '-',
            { label: t('delete'), icon: 'trash', danger: true, action: () => bus.emit('action:deleteNode', node.id) }
        ];
    }
    return [
        node.type === 'doc' ? null : { label: t('openInNewTab'), icon: 'tabs', action: () => bus.emit('action:openRequest', node.id, { pin: true, newTab: true }) },
        { label: t('rename'), icon: 'edit', shortcut: 'F2', action: () => startRename(node.id) },
        { label: t('duplicate'), icon: 'copy', action: () => bus.emit('action:duplicateNode', node.id) },
        '-',
        { label: t('delete'), icon: 'trash', danger: true, action: () => bus.emit('action:deleteNode', node.id) }
    ];
}

function renderNode(parent, node, depth) {
    const isContainer = !!node.items;
    const expanded = isContainer && (node.expanded || !!filter);
    const tab = activeTab();
    const isDoc = node.type === 'doc';
    const open = isDoc ? 'action:openDoc' : 'action:openRequest';
    const active = (tab?.type === 'request' && tab.requestId === node.id) || (tab?.type === 'doc' && tab.docId === node.id);
    const row = h('div', {
        class: `tree-row ${node.type}` + (active ? ' active' : '') + (expanded ? ' expanded' : ''),
        role: 'treeitem', tabindex: '0', draggable: 'true', 'data-id': node.id,
        style: { '--depth': depth }
    });
    if (isContainer) {
        row.append(h('span', { class: 'tree-chevron', html: icon('chevronRight') }));
        if (node.type === 'folder') row.append(h('span', { class: 'tree-icon', html: icon(expanded ? 'folderOpen' : 'folder') }));
    } else if (isDoc) {
        row.append(h('span', { class: 'tree-chevron spacer' }), h('span', { class: 'tree-icon doc', html: icon('textAlignStart') }));
    } else {
        row.append(h('span', { class: 'tree-chevron spacer' }), h('span', { class: 'tree-method', text: 'PHP' }));
    }
    if (renaming === node.id) {
        const input = h('input', { class: 'tree-rename', value: node.name, spellcheck: 'false' });
        row.append(input);
        let done = false;
        const finish = commit => {
            if (done) return;
            done = true;
            renaming = '';
            const value = input.value.trim();
            if (commit && value && value !== node.name) {
                node.name = value;
                if (node.type === 'request' || node.type === 'doc') node.updatedAt = new Date().toISOString();
                persist();
                bus.emit('tree:renamed', node);
            }
            renderSidebar();
        };
        input.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Enter') finish(true);
            if (event.key === 'Escape') finish(false);
        });
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('click', event => event.stopPropagation());
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    } else {
        const label = h('span', { class: 'tree-label', text: node.name });
        row.append(label);
    }
    const more = h('button', { class: 'icon-btn tree-more', type: 'button', html: icon('more'), title: t('moreActions') });
    more.addEventListener('click', event => {
        event.stopPropagation();
        row.classList.add('menu-open');
        showMenu(nodeMenu(node), more, { onClose: () => row.classList.remove('menu-open') });
    });
    row.append(more);
    row.addEventListener('click', () => {
        if (renaming === node.id) return;
        if (isContainer) {
            node.expanded = !node.expanded;
            persist();
            renderSidebar();
        } else {
            bus.emit(open, node.id, { pin: false });
        }
    });
    row.addEventListener('dblclick', () => {
        if (!isContainer) bus.emit(open, node.id, { pin: true });
    });
    row.addEventListener('keydown', event => {
        if (event.key === 'F2') {
            event.preventDefault();
            startRename(node.id);
        } else if (event.key === 'Delete') {
            event.preventDefault();
            bus.emit('action:deleteNode', node.id);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            row.click();
        }
    });
    row.addEventListener('contextmenu', event => {
        event.preventDefault();
        row.classList.add('menu-open');
        showMenu(nodeMenu(node), event, { onClose: () => row.classList.remove('menu-open') });
    });
    setupDrag(row, node);
    parent.append(row);
    if (expanded) {
        const children = node.items.filter(matches);
        if (!children.length && !filter) {
            const empty = h('div', { class: 'tree-empty', style: { '--depth': depth + 1 } });
            empty.append(h('span', { text: node.type === 'collection' ? t('emptyCollection') : t('emptyFolder') + ' ' }));
            empty.append(h('button', { class: 'link-btn', type: 'button', text: t('addRequest'), onclick: () => bus.emit('action:newRequestIn', node.id) }));
            parent.append(empty);
        }
        for (const child of children) renderNode(parent, child, depth + 1);
    }
}

function dropPosition(row, node, event) {
    const rect = row.getBoundingClientRect();
    const y = event.clientY - rect.top;
    if (node.items) {
        if (dragging.type === 'collection') return node.type === 'collection' ? (y < rect.height / 2 ? 'before' : 'after') : null;
        if (node.type === 'collection') return 'inside';
        if (y < rect.height * 0.25) return 'before';
        if (y > rect.height * 0.75 && !node.expanded) return 'after';
        return 'inside';
    }
    if (dragging.type === 'collection') return null;
    return y < rect.height / 2 ? 'before' : 'after';
}

function setupDrag(row, node) {
    row.addEventListener('dragstart', event => {
        if (renaming) {
            event.preventDefault();
            return;
        }
        dragging = node;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.id);
        requestAnimationFrame(() => row.classList.add('dragging'));
    });
    row.addEventListener('dragend', () => {
        dragging = null;
        $$('.tree-row', els.content).forEach(r => r.classList.remove('dragging', 'drop-before', 'drop-after', 'drop-inside'));
    });
    row.addEventListener('dragover', event => {
        if (!dragging || dragging.id === node.id || containsNode(dragging, node.id)) return;
        const position = dropPosition(row, node, event);
        row.classList.remove('drop-before', 'drop-after', 'drop-inside');
        if (!position) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('drop-' + position);
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-before', 'drop-after', 'drop-inside'));
    row.addEventListener('drop', event => {
        event.preventDefault();
        const position = dragging ? dropPosition(row, node, event) : null;
        row.classList.remove('drop-before', 'drop-after', 'drop-inside');
        if (!dragging || !position || dragging.id === node.id || containsNode(dragging, node.id)) return;
        const moving = dragging;
        dragging = null;
        removeNode(moving.id);
        if (position === 'inside') insertNode(node.id, moving, 0);
        else {
            const target = findNode(node.id);
            const containerId = moving.type === 'collection' ? '' : (target.parent?.id || target.collection.id);
            const list = moving.type === 'collection' ? state.collections : target.list;
            const index = list.findIndex(n => n.id === node.id) + (position === 'after' ? 1 : 0);
            insertNode(containerId, moving, index);
        }
        persist();
        renderSidebar();
        bus.emit('tree:moved', moving);
    });
}

export function startRename(id) {
    if (state.ui.sidebarHidden || state.ui.sidebarView !== 'collections') {
        state.ui.sidebarView = 'collections';
        state.ui.sidebarHidden = false;
    }
    revealNode(id, false);
    renaming = id;
    renderSidebar();
}

export function revealNode(id, render = true) {
    const found = findNode(id);
    if (!found) return;
    state.ui.sidebarView = 'collections';
    state.ui.sidebarHidden = false;
    filter = '';
    if (els.filter) els.filter.value = '';
    const expand = (list, trail) => {
        for (const node of list) {
            if (node.id === id) {
                trail.forEach(n => { n.expanded = true; });
                return true;
            }
            if (node.items && expand(node.items, [...trail, node])) return true;
        }
        return false;
    };
    expand(state.collections, []);
    if (render) {
        renderSidebar();
        const row = els.content.querySelector(`.tree-row[data-id="${id}"]`);
        row?.scrollIntoView({ block: 'nearest' });
        row?.classList.add('flash');
        setTimeout(() => row?.classList.remove('flash'), 900);
    }
}

function renderEnvironments() {
    const list = state.environments.filter(env => !filter || env.name.toLowerCase().includes(filter));
    if (!state.environments.length) {
        els.content.append(emptyState('environments', t('noEnvironments'), t('noEnvironmentsText'), t('createEnvironment'), () => bus.emit('action:newEnvironment')));
        return;
    }
    const wrap = h('div', { class: 'tree' });
    const tab = activeTab();
    for (const env of list) {
        const active = env.id === state.activeEnvironmentId;
        const row = h('div', { class: 'tree-row env-row' + (tab?.type === 'environment' && tab.envId === env.id ? ' active' : ''), tabindex: '0', style: { '--depth': 0 } });
        const check = h('button', { class: 'env-check' + (active ? ' on' : ''), type: 'button', title: active ? t('activeEnvironment') : t('setActive'), html: icon('check') });
        check.addEventListener('click', event => {
            event.stopPropagation();
            state.activeEnvironmentId = active ? '' : env.id;
            persist();
            bus.emit('environments:changed');
        });
        const more = h('button', { class: 'icon-btn tree-more', type: 'button', html: icon('more') });
        const menu = () => [
            { label: active ? t('unsetActive') : t('setActive'), icon: 'check', action: () => check.click() },
            { label: t('duplicate'), icon: 'copy', action: () => bus.emit('env:duplicate', env.id) },
            { label: t('export'), icon: 'download', action: () => bus.emit('env:export', env.id) },
            '-',
            { label: t('delete'), icon: 'trash', danger: true, action: () => bus.emit('env:delete', env.id) }
        ];
        more.addEventListener('click', event => {
            event.stopPropagation();
            showMenu(menu(), more);
        });
        row.append(h('span', { class: 'tree-icon env', html: icon('environments') }), h('span', { class: 'tree-label', text: env.name }), h('span', { class: 'tree-count', text: String(env.variables.filter(v => v.key).length) }), check, more);
        row.addEventListener('click', () => bus.emit('action:openEnvironment', env.id, { pin: false }));
        row.addEventListener('dblclick', () => bus.emit('action:openEnvironment', env.id, { pin: true }));
        row.addEventListener('contextmenu', event => {
            event.preventDefault();
            showMenu(menu(), event);
        });
        wrap.append(row);
    }
    if (!list.length) wrap.append(h('div', { class: 'empty-text pad', text: t('noResults') }));
    els.content.append(wrap);
}

function renderHistory() {
    const items = state.history.filter(item => !filter || item.name.toLowerCase().includes(filter) || item.code.toLowerCase().includes(filter));
    if (!state.history.length) {
        els.content.append(emptyState('history', t('noHistory'), t('noHistoryText')));
        return;
    }
    const wrap = h('div', { class: 'history' });
    let group = '';
    let groupEl = null;
    for (const item of items) {
        const day = relativeDay(item.createdAt, currentLanguage());
        if (day !== group) {
            group = day;
            const label = day === 'today' ? t('today') : day === 'yesterday' ? t('yesterday') : day;
            groupEl = h('div', { class: 'history-group' });
            const head = h('div', { class: 'history-head' }, h('span', { text: label }));
            groupEl.append(head);
            wrap.append(groupEl);
        }
        const firstLine = item.code.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('<?php') && !l.startsWith('use ')) || item.code.trim();
        const ok = item.response ? item.response.ok : true;
        const row = h('div', { class: 'tree-row history-row', tabindex: '0', title: item.code.slice(0, 600), style: { '--depth': 0 } },
            h('span', { class: 'tree-method' + (ok ? '' : ' error'), text: 'PHP' }),
            h('span', { class: 'history-main' }, h('span', { class: 'tree-label', text: item.name || firstLine }), h('span', { class: 'history-code', text: item.name ? firstLine : '' })),
            h('span', { class: 'history-time', text: formatTime(item.createdAt, currentLanguage()) + (item.response?.durationMs ? ` · ${formatDuration(item.response.durationMs)}` : '') }));
        const more = h('button', { class: 'icon-btn tree-more', type: 'button', html: icon('more') });
        const menu = () => [
            { label: t('openInNewTab'), icon: 'tabs', action: () => bus.emit('action:openHistory', item.id, { pin: true }) },
            { label: t('saveToCollection'), icon: 'save', action: () => bus.emit('action:saveHistory', item.id) },
            '-',
            { label: t('delete'), icon: 'trash', danger: true, action: () => {
                state.history = state.history.filter(x => x.id !== item.id);
                persist();
                renderSidebar();
            } }
        ];
        more.addEventListener('click', event => {
            event.stopPropagation();
            showMenu(menu(), more);
        });
        row.append(more);
        row.addEventListener('click', () => bus.emit('action:openHistory', item.id, { pin: false }));
        row.addEventListener('dblclick', () => bus.emit('action:openHistory', item.id, { pin: true }));
        row.addEventListener('contextmenu', event => {
            event.preventDefault();
            showMenu(menu(), event);
        });
        groupEl.append(row);
    }
    if (!items.length) wrap.append(h('div', { class: 'empty-text pad', text: t('noResults') }));
    els.content.append(wrap);
}

export function focusSidebarFilter() {
    els.filter?.focus();
}
