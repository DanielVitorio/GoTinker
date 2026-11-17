import { icon } from './icons.js';
import { t } from './i18n.js';
import { activeEnvironment, isDirty, persist, state } from './store.js';
import { $, bus, h } from './util.js';
import { showMenu } from './ui.js';

const els = {};
let dragId = '';

export function initTabs(container) {
    container.innerHTML = `
        <div class="tabs" id="tabList" role="tablist"></div>
        <button class="icon-btn tab-add" id="tabAddBtn" type="button" data-i18n-title="newTab">${icon('plus')}</button>
        <button class="icon-btn tab-list-btn" id="tabListBtn" type="button" data-i18n-title="openTabs">${icon('chevronDown')}</button>
        <span class="spacer"></span>
        <button class="env-select" id="envSelect" type="button"><span class="env-name" id="envName"></span>${icon('chevronDown')}</button>
        <button class="icon-btn env-eye" id="envEyeBtn" type="button" data-i18n-title="environmentQuickLook">${icon('eye')}</button>`;
    for (const id of ['tabList', 'tabAddBtn', 'tabListBtn', 'envSelect', 'envName', 'envEyeBtn']) els[id] = $('#' + id, container);
    els.tabAddBtn.addEventListener('click', () => bus.emit('action:newTab'));
    els.tabList.addEventListener('wheel', event => {
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            els.tabList.scrollLeft += event.deltaY;
            event.preventDefault();
        }
    }, { passive: false });
    els.tabList.addEventListener('dblclick', event => {
        if (event.target === els.tabList) bus.emit('action:newTab');
    });
    els.tabListBtn.addEventListener('click', () => showMenu([
        ...state.tabs.map(tab => ({ label: tabTitle(tab) + (isDirty(tab) ? ' •' : ''), icon: tabIcon(tab), checked: tab.id === state.activeTabId, action: () => bus.emit('action:switchTab', tab.id) })),
        '-',
        { label: t('closeAllTabs'), icon: 'close', action: () => bus.emit('action:closeTabs', state.tabs.map(x => x.id)), disabled: !state.tabs.length }
    ], els.tabListBtn, { minWidth: 260 }));
    els.envSelect.addEventListener('click', () => showMenu([
        { label: t('noEnvironment'), checked: !state.activeEnvironmentId, action: () => setEnvironment('') },
        ...(state.environments.length ? ['-'] : []),
        ...state.environments.map(env => ({ label: env.name, checked: env.id === state.activeEnvironmentId, action: () => setEnvironment(env.id) })),
        '-',
        { label: t('manageEnvironments'), icon: 'environments', action: () => bus.emit('action:showSidebar', 'environments') },
        { label: t('newEnvironment'), icon: 'plus', action: () => bus.emit('action:newEnvironment') }
    ], els.envSelect, { align: 'right', minWidth: 220 }));
    els.envEyeBtn.addEventListener('click', () => {
        const env = activeEnvironment();
        if (env) bus.emit('action:openEnvironment', env.id, { pin: true });
        else bus.emit('action:showSidebar', 'environments');
    });
}

function setEnvironment(id) {
    state.activeEnvironmentId = id;
    persist();
    bus.emit('environments:changed');
}

export function tabTitle(tab) {
    if (tab.type === 'environment') return state.environments.find(e => e.id === tab.envId)?.name || t('environment');
    if (tab.type === 'doc') return tab.name || t('untitledDoc');
    return tab.name || t('untitledRequest');
}

export function tabIcon(tab) {
    return tab.type === 'environment' ? 'environments' : tab.type === 'doc' ? 'textAlignStart' : 'code';
}

function tabElement(tab) {
    const dirty = isDirty(tab);
    const el = h('div', {
        class: 'tab' + (tab.id === state.activeTabId ? ' active' : '') + (tab.preview ? ' preview' : '') + (dirty ? ' dirty' : ''),
        role: 'tab', draggable: 'true', 'data-id': tab.id, title: tab.type === 'request' ? [tab.name, tab.filePath || tab.project].filter(Boolean).join('\n') : tabTitle(tab)
    });
    const lead = tab.type === 'environment'
        ? h('span', { class: 'tab-lead env', html: icon('environments') })
        : tab.type === 'doc' ? h('span', { class: 'tab-lead doc', html: icon('textAlignStart') })
        : tab.filePath ? h('span', { class: 'tab-lead file', html: icon('filePhp') }) : h('span', { class: 'tab-method', text: 'PHP' });
    const name = h('span', { class: 'tab-name', text: tabTitle(tab) });
    const close = h('button', { class: 'tab-close', type: 'button', 'aria-label': t('close'), html: icon('close') });
    const status = h('span', { class: 'tab-status' }, h('span', { class: 'tab-dot' }), close);
    el.append(lead, name, status);
    el.addEventListener('mousedown', event => {
        if (event.button === 1) {
            event.preventDefault();
            bus.emit('action:closeTab', tab.id);
        }
    });
    el.addEventListener('click', event => {
        if (event.target.closest('.tab-close')) {
            bus.emit('action:closeTab', tab.id);
            return;
        }
        bus.emit('action:switchTab', tab.id);
    });
    el.addEventListener('dblclick', () => {
        if (tab.preview) {
            tab.preview = false;
            persist();
            renderTabs();
        }
    });
    el.addEventListener('contextmenu', event => {
        event.preventDefault();
        const index = state.tabs.findIndex(x => x.id === tab.id);
        showMenu([
            { label: t('duplicateTab'), icon: 'copy', action: () => bus.emit('action:duplicateTab', tab.id), disabled: tab.type !== 'request' },
            '-',
            { label: t('closeTab'), shortcut: 'Ctrl+W', action: () => bus.emit('action:closeTab', tab.id) },
            { label: t('forceCloseTab'), action: () => bus.emit('action:closeTab', tab.id, { force: true }) },
            { label: t('closeOtherTabs'), action: () => bus.emit('action:closeTabs', state.tabs.filter(x => x.id !== tab.id).map(x => x.id)), disabled: state.tabs.length < 2 },
            { label: t('closeTabsRight'), action: () => bus.emit('action:closeTabs', state.tabs.slice(index + 1).map(x => x.id)), disabled: index === state.tabs.length - 1 },
            { label: t('closeAllTabs'), action: () => bus.emit('action:closeTabs', state.tabs.map(x => x.id)) }
        ], event);
    });
    el.addEventListener('dragstart', event => {
        dragId = tab.id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', tab.id);
        el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => {
        dragId = '';
        el.classList.remove('dragging');
        els.tabList.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
    });
    el.addEventListener('dragover', event => {
        if (!dragId || dragId === tab.id) return;
        event.preventDefault();
        const rect = el.getBoundingClientRect();
        const after = event.clientX > rect.left + rect.width / 2;
        el.classList.toggle('drop-after', after);
        el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', event => {
        event.preventDefault();
        if (!dragId || dragId === tab.id) return;
        const after = el.classList.contains('drop-after');
        const moving = state.tabs.find(x => x.id === dragId);
        state.tabs = state.tabs.filter(x => x.id !== dragId);
        const index = state.tabs.findIndex(x => x.id === tab.id) + (after ? 1 : 0);
        state.tabs.splice(index, 0, moving);
        persist();
        renderTabs();
    });
    return el;
}

export function renderTabs() {
    if (!els.tabList) return;
    const scroll = els.tabList.scrollLeft;
    els.tabList.innerHTML = '';
    for (const tab of state.tabs) els.tabList.append(tabElement(tab));
    els.tabList.scrollLeft = scroll;
    const active = els.tabList.querySelector('.tab.active');
    if (active) {
        const listRect = els.tabList.getBoundingClientRect();
        const rect = active.getBoundingClientRect();
        if (rect.left < listRect.left) els.tabList.scrollLeft -= listRect.left - rect.left + 8;
        else if (rect.right > listRect.right) els.tabList.scrollLeft += rect.right - listRect.right + 8;
    }
    renderEnvironmentSelect();
}

export function updateTab(tab) {
    const el = els.tabList?.querySelector(`.tab[data-id="${tab.id}"]`);
    if (!el) return;
    el.classList.toggle('dirty', isDirty(tab));
    el.classList.toggle('preview', !!tab.preview);
    const name = el.querySelector('.tab-name');
    if (name.textContent !== tabTitle(tab)) name.textContent = tabTitle(tab);
}

export function renderEnvironmentSelect() {
    if (!els.envName) return;
    const env = activeEnvironment();
    els.envName.textContent = env ? env.name : t('noEnvironment');
    els.envSelect.classList.toggle('has-env', !!env);
}
