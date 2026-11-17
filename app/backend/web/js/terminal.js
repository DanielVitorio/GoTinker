import { icon } from './icons.js';
import { t } from './i18n.js';
import { persist, state } from './store.js';
import { $, basename, bus, clamp, dragResize, h, uid } from './util.js';
import { openModal, showMenu, toast } from './ui.js';
import { currentTheme } from './theme.js';

const instances = new Map();
const els = {};
let activeId = '';
let projectProvider = () => '';

export function initTerminal({ getProject }) {
    projectProvider = getProject;
    els.panel = $('#terminalPanel');
    els.resizer = $('#terminalResizer');
    els.panel.innerHTML = `
        <div class="panel-head">
            <span class="panel-title" data-i18n="terminal">Terminal</span>
            <div class="term-tabs" id="termTabs"></div>
            <span class="spacer"></span>
            <button class="icon-btn" id="termNewBtn" type="button" data-i18n-title="newTerminal">${icon('plus')}</button>
            <button class="icon-btn" id="termMoreBtn" type="button" data-i18n-title="moreActions">${icon('more')}</button>
            <button class="icon-btn" id="termCloseBtn" type="button" data-i18n-title="close">${icon('close')}</button>
        </div>
        <div class="term-host" id="termHost"></div>`;
    for (const id of ['termTabs', 'termNewBtn', 'termMoreBtn', 'termCloseBtn', 'termHost']) els[id] = $('#' + id, els.panel);
    els.termNewBtn.addEventListener('click', () => newSession());
    els.termCloseBtn.addEventListener('click', () => toggleTerminal(false));
    els.termMoreBtn.addEventListener('click', () => showMenu([
        { label: t('copySelection'), icon: 'copy', action: () => copySelection(activeTerminal()) },
        { label: t('paste'), action: () => pasteText(activeTerminal()) },
        { label: t('clear'), icon: 'ban', action: () => activeTerminal()?.clear() },
        '-',
        { label: t('createAlias'), icon: 'terminal', action: aliasDialog },
        '-',
        { label: t('killTerminal'), icon: 'trash', danger: true, action: () => activeId && closeSession(activeId) }
    ], els.termMoreBtn, { align: 'right' }));
    dragResize({
        handle: els.resizer,
        axis: 'y',
        onStart: () => ({ height: state.ui.terminalHeight }),
        onMove: (delta, ctx) => {
            const max = Math.max(160, $('#main').getBoundingClientRect().height - 220);
            state.ui.terminalHeight = clamp(ctx.height - delta, 120, max);
            applyHeight();
        },
        onEnd: () => persist()
    });
    new ResizeObserver(() => fit(instances.get(activeId))).observe(els.termHost);
    window.addEventListener('beforeunload', () => {
        try { navigator.sendBeacon('/api/terminal/shutdown', new Blob(['{}'], { type: 'application/json' })); } catch {}
    });
    applyHeight();
    state.ui.terminalOpen = false;
}

function terminalTheme() {
    if (currentTheme() === 'light') {
        return {
            background: '#ffffff', foreground: '#333333', cursor: '#333333', selectionBackground: '#add6ff',
            black: '#000000', red: '#cd3131', green: '#00a35c', yellow: '#949800', blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc', white: '#555555',
            brightBlack: '#666666', brightRed: '#cd3131', brightGreen: '#14a85a', brightYellow: '#a6a800', brightBlue: '#0451a5', brightMagenta: '#bc05bc', brightCyan: '#0598bc', brightWhite: '#333333'
        };
    }
    return {
        background: '#1e1e1e', foreground: '#cccccc', cursor: '#aeafad', selectionBackground: '#264f78',
        black: '#000000', red: '#cd3131', green: '#0dbc79', yellow: '#e5e510', blue: '#2472c8', magenta: '#bc3fbc', cyan: '#11a8cd', white: '#e5e5e5',
        brightBlack: '#666666', brightRed: '#f14c4c', brightGreen: '#23d18b', brightYellow: '#f5f543', brightBlue: '#3b8eea', brightMagenta: '#d670d6', brightCyan: '#29b8db', brightWhite: '#e5e5e5'
    };
}

export function applyTerminalTheme() {
    const theme = terminalTheme();
    for (const instance of instances.values()) instance.terminal.options.theme = theme;
}

function applyHeight() {
    $('#main').style.setProperty('--terminal-height', `${state.ui.terminalHeight}px`);
}

function currentSession() {
    return state.terminalSessions.find(s => s.id === state.activeTerminalSessionId) || null;
}

function renderSessions() {
    els.termTabs.innerHTML = '';
    for (const session of state.terminalSessions) {
        const tab = h('div', { class: 'term-tab' + (session.id === state.activeTerminalSessionId ? ' active' : ''), title: session.project },
            h('span', { class: 'term-tab-icon', html: icon('terminal') }),
            h('span', { class: 'term-tab-name', text: session.name }),
            h('button', { class: 'term-tab-close', type: 'button', html: icon('close'), 'aria-label': t('close') }));
        tab.addEventListener('click', event => {
            if (event.target.closest('.term-tab-close')) closeSession(session.id);
            else selectSession(session.id);
        });
        els.termTabs.append(tab);
    }
}

function newSession() {
    const project = projectProvider();
    if (!project) {
        toast(t('selectProjectTerminal'), 'error');
        return null;
    }
    const session = { id: uid('term'), name: basename(project), project };
    state.terminalSessions.push(session);
    state.activeTerminalSessionId = session.id;
    persist();
    renderSessions();
    show(session);
    return session;
}

function selectSession(id) {
    state.activeTerminalSessionId = id;
    persist();
    renderSessions();
    show(currentSession());
}

function closeSession(id) {
    const index = state.terminalSessions.findIndex(s => s.id === id);
    state.terminalSessions = state.terminalSessions.filter(s => s.id !== id);
    disposeInstance(id);
    if (state.activeTerminalSessionId === id) state.activeTerminalSessionId = state.terminalSessions[Math.max(0, index - 1)]?.id || '';
    persist();
    renderSessions();
    if (!state.terminalSessions.length) {
        toggleTerminal(false);
        return;
    }
    show(currentSession());
}

function connect(instance) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ session: instance.id, project: instance.project });
    const socket = new WebSocket(`${protocol}//${location.host}/api/terminal?${params}`);
    socket.binaryType = 'arraybuffer';
    instance.socket = socket;
    let opened = false;
    socket.addEventListener('open', () => {
        opened = true;
        fit(instance);
        instance.terminal.focus();
    });
    socket.addEventListener('message', event => instance.terminal.write(new Uint8Array(event.data)));
    socket.addEventListener('close', () => {
        if (instances.get(instance.id) !== instance) return;
        instance.terminal.write(opened ? `\r\n\x1b[90m[${t('terminalClosed')}]\x1b[0m\r\n` : `\x1b[31m${t('terminalFailed', { project: instance.project })}\x1b[0m\r\n`);
    });
    instance.terminal.onData(data => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
}

function fit(instance) {
    if (!instance?.fit || !instance.element.clientWidth || !instance.element.clientHeight) return;
    try {
        instance.fit.fit();
        if (instance.socket?.readyState === WebSocket.OPEN) instance.socket.send(JSON.stringify({ type: 'resize', cols: instance.terminal.cols, rows: instance.terminal.rows }));
    } catch {}
}

function show(session) {
    if (!session || !window.Terminal) return;
    if (!session.project) {
        session.project = projectProvider();
        if (!session.project) {
            toast(t('selectProjectTerminal'), 'error');
            return;
        }
        persist();
    }
    let instance = instances.get(session.id);
    if (!instance) {
        const element = h('div', { class: 'term-instance', 'data-session': session.id });
        els.termHost.append(element);
        const terminal = new window.Terminal({
            allowProposedApi: true, cursorBlink: true, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 13, lineHeight: 1.15, scrollback: 5000,
            theme: terminalTheme()
        });
        terminal.attachCustomKeyEventHandler(event => {
            if (event.type !== 'keydown') return true;
            const key = event.key.toLowerCase();
            if ((event.ctrlKey && event.shiftKey && key === 'c') || (event.ctrlKey && key === 'c' && terminal.hasSelection())) {
                event.preventDefault();
                copySelection(terminal);
                return false;
            }
            if (event.ctrlKey && key === 'v') {
                event.preventDefault();
                pasteText(terminal);
                return false;
            }
            if (event.ctrlKey && (event.code === 'Backquote' || key === 'p' || key === 't' || key === 'w' || key === 'tab')) return false;
            return true;
        });
        const fitAddon = new window.FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(element);
        instance = { id: session.id, project: session.project, element, terminal, fit: fitAddon, socket: null };
        instances.set(session.id, instance);
        connect(instance);
    }
    activeId = session.id;
    for (const item of instances.values()) item.element.classList.toggle('active', item.id === session.id);
    requestAnimationFrame(() => {
        fit(instance);
        instance.terminal.focus();
    });
}

function disposeInstance(id) {
    const instance = instances.get(id);
    if (!instance) return;
    instance.socket?.close();
    instance.terminal.dispose();
    instance.element.remove();
    instances.delete(id);
    if (activeId === id) activeId = '';
    fetch('/api/terminal/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session: id }) }).catch(() => {});
}

function activeTerminal() {
    return instances.get(activeId)?.terminal;
}

async function copySelection(terminal) {
    const text = terminal?.getSelection();
    if (text) window.GoTinkerClipboard ? window.GoTinkerClipboard.writeText(text) : await navigator.clipboard.writeText(text);
}

async function pasteText(terminal) {
    const text = window.GoTinkerClipboard ? await window.GoTinkerClipboard.readText() : await navigator.clipboard.readText();
    if (text) terminal?.paste(text);
}

function writeActive(text) {
    const instance = instances.get(activeId);
    if (!instance || instance.socket?.readyState !== WebSocket.OPEN) return false;
    instance.socket.send(text);
    instance.terminal.focus();
    return true;
}

function aliasDialog() {
    const name = h('input', { class: 'input', placeholder: t('aliasNamePlaceholder'), spellcheck: 'false' });
    const command = h('input', { class: 'input', placeholder: 'php artisan $*', spellcheck: 'false' });
    const submit = () => {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name.value.trim()) || !command.value.trim()) {
            toast(t('aliasInvalid'), 'error');
            return;
        }
        if (!writeActive(`alias ${name.value.trim()}=${command.value.trim()}\r`)) {
            toast(t('aliasWait'), 'error');
            return;
        }
        modal.close();
        toast(t('aliasCreated', { name: name.value.trim() }), 'success');
    };
    command.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
    const body = h('div', { class: 'form-grid' },
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label', text: t('aliasName') }), name),
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label', text: t('aliasCommand') }), command),
        h('p', { class: 'help span-2', text: t('aliasHelp') }));
    const modal = openModal({ title: t('createAlias'), body, footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: t('cancel'), onclick: () => modal.close() }), h('button', { class: 'btn btn-primary', type: 'button', text: t('createAlias'), onclick: submit })], width: 460 });
}

export function toggleTerminal(force) {
    const visible = typeof force === 'boolean' ? force : els.panel.hidden;
    els.panel.hidden = !visible;
    els.resizer.hidden = !visible;
    $('#main').classList.toggle('terminal-open', visible);
    state.ui.terminalOpen = visible;
    persist();
    bus.emit('layout');
    if (!visible) {
        activeTerminal()?.blur?.();
        return;
    }
    if (!state.terminalSessions.length) {
        if (!newSession()) {
            els.panel.hidden = true;
            els.resizer.hidden = true;
            $('#main').classList.remove('terminal-open');
            state.ui.terminalOpen = false;
        }
        return;
    }
    const session = currentSession() || state.terminalSessions[0];
    state.activeTerminalSessionId = session.id;
    renderSessions();
    show(session);
}
