import { persist, state } from './store.js';
import { bus } from './util.js';

export function currentTheme() {
    return state.ui?.theme === 'light' ? 'light' : 'dark';
}

export function monacoTheme() {
    return currentTheme() === 'light' ? 'gotinker-light' : 'gotinker-dark';
}

export function applyTheme() {
    const theme = currentTheme();
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('gotinker-theme', theme); } catch {}
    try { window.GoTinkerWindow?.setTheme(theme); } catch {}
    bus.emit('theme', theme);
}

export function toggleTheme() {
    state.ui.theme = currentTheme() === 'light' ? 'dark' : 'light';
    persist();
    applyTheme();
}
