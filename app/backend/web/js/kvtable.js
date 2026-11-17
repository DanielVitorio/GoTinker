import { icon } from './icons.js';
import { t } from './i18n.js';
import { h } from './util.js';

export function keyIssues(rows, { normalize = key => String(key || '').trim(), reserved = new Map() } = {}) {
    const seen = new Set();
    return rows.map(row => {
        const key = normalize(row.key);
        if (!key) return '';
        if (reserved.has(key)) return t('variableReserved', { key, env: reserved.get(key) });
        if (seen.has(key)) return t('variableDuplicate', { key });
        seen.add(key);
        return '';
    });
}

export function createKvTable({ getRows, onChange, keyPlaceholder, valuePlaceholder, showDescription = true, validate = null }) {
    const root = h('div', { class: 'kv' });
    let bulk = false;

    const header = h('div', { class: 'kv-toolbar' });
    const title = h('span', { class: 'kv-title' });
    const bulkBtn = h('button', { class: 'link-btn', type: 'button' });
    header.append(title, h('span', { class: 'spacer' }), bulkBtn);
    const table = h('div', { class: 'kv-table' });
    const textarea = h('textarea', { class: 'kv-bulk', spellcheck: 'false' });
    const issues = h('div', { class: 'kv-issues', role: 'alert', hidden: true });
    root.append(header, table, textarea, issues);

    const current = () => getRows().map(r => ({ key: r.key || '', value: r.value || '', description: r.description || '', enabled: r.enabled !== false }));
    const emit = rows => {
        onChange(rows);
        revalidate();
    };

    function revalidate() {
        const messages = validate ? validate(current()) : [];
        table.querySelectorAll('.kv-row:not(.kv-head):not(.kv-new)').forEach((row, index) => {
            const key = row.querySelector('.kv-key');
            const message = messages[index] || '';
            key.classList.toggle('invalid', !!message);
            key.setAttribute('aria-invalid', message ? 'true' : 'false');
            if (message) key.title = message;
            else key.removeAttribute('title');
        });
        const unique = [...new Set(messages.filter(Boolean))];
        issues.replaceChildren(...unique.map(message => h('div', { class: 'kv-issue' }, h('span', { class: 'kv-issue-icon', html: icon('warning') }), h('span', { text: message }))));
        issues.hidden = !unique.length;
    }

    function rowEl(row, index, isNew) {
        const el = h('div', { class: 'kv-row' + (isNew ? ' kv-new' : '') + (!isNew && !row.enabled ? ' disabled' : '') });
        const check = h('input', { type: 'checkbox', class: 'kv-check', checked: isNew ? undefined : row.enabled ? true : undefined, disabled: isNew ? true : undefined });
        const key = h('input', { class: 'kv-input kv-key', value: row.key, placeholder: isNew ? keyPlaceholder || t('key') : '', spellcheck: 'false' });
        const value = h('input', { class: 'kv-input kv-value', value: row.value, placeholder: isNew ? valuePlaceholder || t('value') : '', spellcheck: 'false' });
        const description = showDescription ? h('input', { class: 'kv-input kv-desc', value: row.description, placeholder: isNew ? t('description') : '', spellcheck: 'false' }) : null;
        const remove = h('button', { class: 'icon-btn kv-remove', type: 'button', title: t('delete'), html: icon('close') });
        if (isNew) remove.disabled = true;
        el.append(h('div', { class: 'kv-cell kv-cell-check' }, check), h('div', { class: 'kv-cell' }, key), h('div', { class: 'kv-cell' }, value));
        if (description) el.append(h('div', { class: 'kv-cell' }, description));
        el.append(h('div', { class: 'kv-cell kv-cell-actions' }, remove));
        const update = () => {
            const next = { key: key.value, value: value.value, description: description ? description.value : row.description, enabled: isNew ? true : check.checked };
            if (isNew) {
                if (!next.key && !next.value && !next.description) return;
                emit([...current(), next]);
                render(true, el.contains(document.activeElement) ? [...el.querySelectorAll('input.kv-input')].indexOf(document.activeElement) : -1);
                return;
            }
            const all = current();
            all[index] = next;
            el.classList.toggle('disabled', !next.enabled);
            emit(all);
        };
        for (const input of [key, value, description].filter(Boolean)) input.addEventListener('input', update);
        check.addEventListener('change', update);
        remove.addEventListener('click', () => {
            const all = current();
            all.splice(index, 1);
            emit(all);
            render();
        });
        return el;
    }

    function render(focusNewRow = false, focusIndex = -1) {
        const rows = current();
        title.textContent = '';
        bulkBtn.textContent = bulk ? t('keyValueEdit') : t('bulkEdit');
        table.hidden = bulk;
        textarea.hidden = !bulk;
        if (bulk) {
            textarea.value = rows.map(r => `${r.enabled ? '' : '//'}${r.key}:${r.value}`).join('\n');
            revalidate();
            return;
        }
        table.innerHTML = '';
        const head = h('div', { class: 'kv-row kv-head' },
            h('div', { class: 'kv-cell kv-cell-check' }),
            h('div', { class: 'kv-cell', text: t('key') }),
            h('div', { class: 'kv-cell', text: t('value') }),
            showDescription ? h('div', { class: 'kv-cell', text: t('description') }) : null,
            h('div', { class: 'kv-cell kv-cell-actions' }));
        table.append(head);
        rows.forEach((row, index) => table.append(rowEl(row, index, false)));
        table.append(rowEl({ key: '', value: '', description: '', enabled: true }, rows.length, true));
        if (focusNewRow) {
            const target = table.querySelectorAll('.kv-row:not(.kv-head):not(.kv-new)');
            const last = target[target.length - 1];
            const inputs = last?.querySelectorAll('input.kv-input');
            const input = inputs?.[Math.max(0, focusIndex)];
            if (input) {
                input.focus();
                const end = input.value.length;
                input.setSelectionRange(end, end);
            }
        }
        revalidate();
    }

    bulkBtn.addEventListener('click', () => {
        bulk = !bulk;
        render();
    });
    textarea.addEventListener('input', () => {
        const rows = textarea.value.split('\n').map(line => {
            const disabled = line.trim().startsWith('//');
            const clean = disabled ? line.trim().slice(2) : line;
            const cut = clean.indexOf(':');
            const key = (cut < 0 ? clean : clean.slice(0, cut)).trim();
            const value = cut < 0 ? '' : clean.slice(cut + 1).trim();
            return { key, value, description: '', enabled: !disabled };
        }).filter(r => r.key || r.value);
        const previous = getRows();
        for (const row of rows) row.description = previous.find(p => p.key === row.key)?.description || '';
        emit(rows);
    });

    return { el: root, render, revalidate };
}
