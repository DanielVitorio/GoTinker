import { icon } from './icons.js';
import { t } from './i18n.js';
import { isDirty, state, walkDocs, walkRequests } from './store.js';
import { bus, h } from './util.js';
import { tabIcon, tabTitle } from './tabs.js';

let open = null;

function score(text, query) {
    if (!query) return 1;
    const a = text.toLowerCase();
    const q = query.toLowerCase();
    const index = a.indexOf(q);
    if (index >= 0) return 100 - Math.min(index, 50) + (index === 0 ? 50 : 0);
    let i = 0;
    for (const c of a) {
        if (c === q[i]) i++;
        if (i === q.length) return 10;
    }
    return 0;
}

function commands() {
    return [
        { label: t('newRequest'), icon: 'plus', hint: 'Ctrl+T', run: () => bus.emit('action:newTab') },
        { label: t('newCollection'), icon: 'collections', run: () => bus.emit('action:newCollection') },
        { label: t('newEnvironment'), icon: 'environments', run: () => bus.emit('action:newEnvironment') },
        { label: t('openPHPFile'), icon: 'filePhp', hint: 'Ctrl+O', run: () => bus.emit('action:openFile') },
        { label: t('selectLaravelProject'), icon: 'laravel', run: () => bus.emit('action:pickProject') },
        { label: t('reindexProject'), icon: 'refresh', run: () => bus.emit('action:reindex') },
        { label: t('toggleTerminal'), icon: 'terminal', hint: 'Ctrl+`', run: () => bus.emit('action:toggleTerminal') },
        { label: t('toggleSidebar'), icon: 'sidebar', hint: 'Ctrl+\\', run: () => bus.emit('action:toggleSidebar') },
        { label: t('toggleLayout'), icon: 'layoutSide', hint: 'Ctrl+Alt+L', run: () => bus.emit('action:toggleLayout') },
        { label: t('import'), icon: 'upload', run: () => bus.emit('action:import') },
        { label: t('toggleTheme'), icon: document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun', run: () => bus.emit('action:toggleTheme') },
        { label: t('settings'), icon: 'settings', run: () => bus.emit('action:settings') },
        { label: t('keyboardShortcuts'), icon: 'keyboard', run: () => bus.emit('action:shortcuts') },
        { label: t('clearHistory'), icon: 'trash', run: () => bus.emit('action:clearHistory') }
    ];
}

export function openPalette(initial = '') {
    if (open) {
        open.input.focus();
        return;
    }
    const backdrop = h('div', { class: 'palette-backdrop' });
    const box = h('div', { class: 'palette' });
    const input = h('input', { class: 'palette-input', spellcheck: 'false', placeholder: t('paletteSearch'), value: initial });
    const list = h('div', { class: 'palette-list' });
    box.append(input, list);
    backdrop.append(box);
    document.body.append(backdrop);
    let items = [];
    let index = 0;
    const close = () => {
        backdrop.remove();
        open = null;
    };
    const render = () => {
        const raw = input.value;
        const commandMode = raw.startsWith('>');
        const query = commandMode ? raw.slice(1).trim() : raw.trim();
        const results = [];
        if (!commandMode) {
            for (const tab of state.tabs) {
                const label = tabTitle(tab);
                const s = score(label, query);
                if (s) results.push({ s: s + 30, label, detail: t('openTab') + (isDirty(tab) ? ' •' : ''), icon: tabIcon(tab), run: () => bus.emit('action:switchTab', tab.id) });
            }
            walkRequests((request, trail) => {
                const path = trail.map(n => n.name).join(' / ');
                const s = Math.max(score(request.name, query), score(path + ' ' + request.name, query) * 0.6);
                if (s) results.push({ s, label: request.name, detail: path, icon: 'code', method: true, run: () => bus.emit('action:openRequest', request.id, { pin: true }) });
            });
            walkDocs((doc, trail) => {
                const path = trail.map(n => n.name).join(' / ');
                const s = Math.max(score(doc.name, query), score(path + ' ' + doc.name, query) * 0.6);
                if (s) results.push({ s, label: doc.name, detail: path, icon: 'textAlignStart', run: () => bus.emit('action:openDoc', doc.id, { pin: true }) });
            });
            for (const env of state.environments) {
                const s = score(env.name, query);
                if (s) results.push({ s: s - 5, label: env.name, detail: t('environment'), icon: 'environments', run: () => bus.emit('action:openEnvironment', env.id, { pin: true }) });
            }
        }
        for (const command of commands()) {
            const s = score(command.label, query);
            if (s && (commandMode || query)) results.push({ s: commandMode ? s : s - 20, label: command.label, detail: command.hint || '', icon: command.icon, run: command.run, command: true });
        }
        if (!query && !commandMode) results.push(...commands().slice(0, 5).map(c => ({ s: 0, label: c.label, detail: c.hint || '', icon: c.icon, run: c.run, command: true })));
        results.sort((a, b) => b.s - a.s);
        items = results.slice(0, 60);
        index = 0;
        list.innerHTML = '';
        items.forEach((item, i) => {
            const row = h('div', { class: 'palette-item' + (i === 0 ? ' active' : '') + (item.command ? ' command' : '') },
                item.method ? h('span', { class: 'tree-method', text: 'PHP' }) : h('span', { class: 'palette-icon', html: icon(item.icon) }),
                h('span', { class: 'palette-label', text: item.label }),
                h('span', { class: 'palette-detail', text: item.detail || '' }));
            row.addEventListener('mousemove', () => select(i));
            row.addEventListener('mousedown', event => {
                event.preventDefault();
                choose(i);
            });
            list.append(row);
        });
        if (!items.length) list.append(h('div', { class: 'palette-empty', text: t('noResults') }));
    };
    const select = i => {
        index = i;
        list.querySelectorAll('.palette-item').forEach((el, n) => el.classList.toggle('active', n === i));
        list.children[i]?.scrollIntoView({ block: 'nearest' });
    };
    const choose = i => {
        const item = items[i];
        close();
        item?.run();
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            select(Math.min(items.length - 1, index + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            select(Math.max(0, index - 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(index);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    });
    backdrop.addEventListener('pointerdown', event => {
        if (event.target === backdrop) close();
    });
    open = { input, close };
    render();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}
