import { h } from './util.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

let toastTimer = null;
let openMenu = null;

export function toast(message, type = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
        el = h('div', { id: 'toast', class: 'toast', role: 'status' });
        document.body.append(el);
    }
    el.className = `toast show ${type}`;
    el.innerHTML = `${icon(type === 'error' ? 'error' : type === 'success' ? 'check' : 'info')}<span></span>`;
    el.querySelector('span').textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), type === 'error' ? 4200 : 2400);
}

export function closeMenu() {
    if (!openMenu) return;
    openMenu.el.remove();
    openMenu.onClose?.();
    openMenu = null;
}

export function showMenu(items, anchor, { align = 'left', onClose, minWidth } = {}) {
    closeMenu();
    const menu = h('div', { class: 'menu', role: 'menu' });
    if (minWidth) menu.style.minWidth = minWidth + 'px';
    for (const item of items) {
        if (!item) continue;
        if (item === '-' || item.separator) {
            menu.append(h('div', { class: 'menu-sep' }));
            continue;
        }
        if (item.header) {
            menu.append(h('div', { class: 'menu-header', text: item.header }));
            continue;
        }
        const button = h('button', {
            class: 'menu-item' + (item.danger ? ' danger' : '') + (item.checked ? ' checked' : ''),
            type: 'button', role: 'menuitem', disabled: item.disabled ? true : undefined
        });
        button.innerHTML = `<span class="menu-icon">${item.icon ? icon(item.icon) : item.checked ? icon('check') : ''}</span><span class="menu-label"></span>${item.shortcut ? `<kbd class="menu-kbd">${item.shortcut}</kbd>` : ''}`;
        button.querySelector('.menu-label').textContent = item.label;
        button.addEventListener('click', event => {
            event.stopPropagation();
            closeMenu();
            item.action?.();
        });
        menu.append(button);
    }
    document.body.append(menu);
    let x;
    let y;
    if (anchor instanceof MouseEvent) {
        x = anchor.clientX;
        y = anchor.clientY;
    } else {
        const rect = anchor.getBoundingClientRect();
        x = align === 'right' ? rect.right - menu.offsetWidth : rect.left;
        y = rect.bottom + 4;
    }
    const bounds = menu.getBoundingClientRect();
    x = Math.max(6, Math.min(x, window.innerWidth - bounds.width - 6));
    if (y + bounds.height > window.innerHeight - 6) y = Math.max(6, (anchor instanceof MouseEvent ? y : anchor.getBoundingClientRect().top - 4) - bounds.height);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    openMenu = { el: menu, onClose };
    requestAnimationFrame(() => menu.querySelector('.menu-item:not([disabled])')?.focus({ preventScroll: true }));
    menu.addEventListener('keydown', event => {
        const buttons = [...menu.querySelectorAll('.menu-item:not([disabled])')];
        const index = buttons.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            buttons[(index + 1) % buttons.length]?.focus();
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeMenu();
        }
    });
    return menu;
}

document.addEventListener('pointerdown', event => {
    if (openMenu && !openMenu.el.contains(event.target)) closeMenu();
}, true);
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);

const modalStack = [];

export function openModal({ title, subtitle, body, footer, width = 520, className = '', onClose, initialFocus }) {
    const backdrop = h('div', { class: 'modal-backdrop' });
    const dialog = h('div', { class: `modal ${className}`, role: 'dialog', 'aria-modal': 'true', style: { width: `min(${width}px, calc(100vw - 32px))` } });
    const header = h('div', { class: 'modal-header' });
    const titles = h('div', { class: 'modal-titles' }, h('div', { class: 'modal-title', text: title || '' }), subtitle ? h('div', { class: 'modal-subtitle', text: subtitle }) : null);
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('close'), html: icon('close') });
    header.append(titles, closeBtn);
    const bodyEl = h('div', { class: 'modal-body' });
    if (body) bodyEl.append(body);
    dialog.append(header, bodyEl);
    if (footer) dialog.append(h('div', { class: 'modal-footer' }, footer));
    backdrop.append(dialog);
    document.body.append(backdrop);
    const modal = {
        el: dialog, body: bodyEl, backdrop,
        close(result) {
            if (!backdrop.isConnected) return;
            backdrop.remove();
            const index = modalStack.indexOf(modal);
            if (index >= 0) modalStack.splice(index, 1);
            onClose?.(result);
        }
    };
    closeBtn.addEventListener('click', () => modal.close());
    backdrop.addEventListener('pointerdown', event => {
        if (event.target === backdrop) modal.close();
    });
    modalStack.push(modal);
    requestAnimationFrame(() => {
        const target = initialFocus ? dialog.querySelector(initialFocus) : dialog.querySelector('input, textarea, select, button.btn-primary');
        target?.focus();
        if (target?.select && target.tagName === 'INPUT') target.select();
    });
    return modal;
}

export function topModal() {
    return modalStack[modalStack.length - 1] || null;
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modalStack.length && !openMenu) {
        event.preventDefault();
        event.stopPropagation();
        topModal().close();
    }
}, true);

export function confirmDialog({ title, message, confirmLabel, cancelLabel, danger = false, extra }) {
    return new Promise(resolve => {
        let result = 'cancel';
        const footer = [];
        if (extra) footer.push(h('button', { class: 'btn', type: 'button', text: extra.label, onclick: () => { result = extra.value; modal.close(); } }));
        footer.push(h('span', { class: 'spacer' }));
        footer.push(h('button', { class: 'btn', type: 'button', text: cancelLabel || t('cancel'), onclick: () => modal.close() }));
        footer.push(h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', text: confirmLabel || t('confirm'), onclick: () => { result = 'confirm'; modal.close(); } }));
        const modal = openModal({ title, body: h('p', { class: 'modal-text', text: message }), footer, width: 460, onClose: () => resolve(result), initialFocus: '.btn-primary, .btn-danger' });
    });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel }) {
    return new Promise(resolve => {
        let result = null;
        const input = h('input', { class: 'input', value, placeholder, spellcheck: 'false' });
        const submit = () => {
            if (!input.value.trim()) {
                input.focus();
                return;
            }
            result = input.value.trim();
            modal.close();
        };
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                submit();
            }
        });
        const body = h('label', { class: 'field' }, label ? h('span', { class: 'field-label', text: label }) : null, input);
        const footer = [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: t('cancel'), onclick: () => modal.close() }), h('button', { class: 'btn btn-primary', type: 'button', text: confirmLabel || t('save'), onclick: submit })];
        const modal = openModal({ title, body, footer, width: 440, onClose: () => resolve(result) });
    });
}
