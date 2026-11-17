export const languages = ['pt-BR', 'en', 'es', 'ja', 'ru', 'zh-CN'];

const cache = new Map();
let current = 'pt-BR';
let messages = {};
let fallback = {};

async function fetchLanguage(code) {
    if (cache.has(code)) return cache.get(code);
    const response = await fetch(`/lang/${encodeURIComponent(code)}.json`, { cache: 'no-cache' });
    if (!response.ok) throw new Error('language');
    const data = await response.json();
    cache.set(code, data);
    return data;
}

export async function setLanguage(code) {
    if (!languages.includes(code)) code = 'pt-BR';
    try {
        if (!Object.keys(fallback).length) fallback = (await fetchLanguage('en')).messages || {};
        const data = await fetchLanguage(code);
        messages = data.messages || {};
        current = code;
    } catch {
        messages = fallback;
        current = 'en';
    }
    document.documentElement.lang = current;
    applyTranslations();
    return current;
}

export function currentLanguage() {
    return current;
}

export async function languageInfo(code) {
    try {
        const data = await fetchLanguage(code);
        return { code, name: data.name, flag: data.flag };
    } catch {
        return { code, name: code, flag: '' };
    }
}

export function t(key, vars) {
    let text = messages[key] ?? fallback[key] ?? key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(String(value));
    }
    return text;
}

export function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nLabel)); });
}
