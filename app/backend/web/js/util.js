export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key === 'text') el.textContent = value;
        else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
        else if (value === true) el.setAttribute(key, '');
        else el.setAttribute(key, value);
    }
    for (const child of children.flat()) {
        if (child === null || child === undefined || child === false) continue;
        el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
}

export function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function debounce(fn, ms) {
    let timer = null;
    const wrapped = (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
    wrapped.flush = (...args) => {
        clearTimeout(timer);
        fn(...args);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
}

export function nowISO() {
    return new Date().toISOString();
}

export function basename(path) {
    return String(path || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || String(path || '');
}

export function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 2 : 1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function formatDuration(ms) {
    const n = Number(ms || 0);
    if (n < 1000) return `${n} ms`;
    if (n < 60000) return `${(n / 1000).toFixed(2)} s`;
    return `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`;
}

export function byteLength(text) {
    return new TextEncoder().encode(String(text || '')).length;
}

export function shortClass(name) {
    return String(name || '').split('|').map(part => part.split('\\').pop()).join('|');
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function safeFilename(value) {
    return String(value || 'gotinker').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/, '') || 'gotinker';
}

export function downloadText(filename, content, mime = 'application/json') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const listeners = new Map();
export const bus = {
    on(event, fn) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(fn);
        return () => listeners.get(event)?.delete(fn);
    },
    emit(event, ...args) {
        for (const fn of listeners.get(event) || []) {
            try { fn(...args); } catch (error) { console.error(error); }
        }
    }
};

export function dragResize({ handle, axis, onStart, onMove, onEnd }) {
    handle.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        event.preventDefault();
        const ax = typeof axis === 'function' ? axis() : axis;
        const start = ax === 'x' ? event.clientX : event.clientY;
        const context = onStart?.(event) ?? {};
        handle.classList.add('active');
        document.body.classList.add(ax === 'x' ? 'resizing-x' : 'resizing-y');
        handle.setPointerCapture(event.pointerId);
        const move = e => onMove((ax === 'x' ? e.clientX : e.clientY) - start, context, e);
        const up = e => {
            handle.classList.remove('active');
            document.body.classList.remove('resizing-x', 'resizing-y');
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', up);
            handle.removeEventListener('pointercancel', up);
            try { handle.releasePointerCapture(e.pointerId); } catch {}
            onEnd?.(context);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', up);
        handle.addEventListener('pointercancel', up);
    });
}

export function relativeDay(iso, locale) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const start = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(date)) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'yesterday';
    try {
        return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(date);
    } catch {
        return date.toDateString();
    }
}

export function formatTime(iso, locale) {
    try {
        return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch {
        return '';
    }
}
