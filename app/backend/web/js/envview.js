import { icon } from './icons.js';
import { t } from './i18n.js';
import { createKvTable, keyIssues } from './kvtable.js';
import { persist, state } from './store.js';
import { $, bus, h } from './util.js';
import { showMenu } from './ui.js';

const els = {};
let currentEnv = null;
let table = null;

export function initEnvironmentView(container) {
    container.innerHTML = `
        <div class="req-header">
            <div class="breadcrumb" id="envCrumb"></div>
            <div class="req-header-actions">
                <button class="btn btn-sm" id="envActiveBtn" type="button"></button>
                <button class="icon-btn" id="envMoreBtn" type="button" data-i18n-title="moreActions">${icon('more')}</button>
            </div>
        </div>
        <div class="env-body">
            <div class="pane-help">${icon('info')}<span data-i18n="environmentHelp"></span></div>
            <div id="envTable"></div>
        </div>`;
    for (const id of ['envCrumb', 'envActiveBtn', 'envMoreBtn', 'envTable']) els[id] = $('#' + id, container);
    table = createKvTable({
        getRows: () => currentEnv?.variables || [],
        onChange: rows => {
            if (!currentEnv) return;
            currentEnv.variables = rows;
            persist();
            bus.emit('environments:changed', { fromTable: true });
        },
        keyPlaceholder: t('variableName'),
        valuePlaceholder: t('variableValue'),
        validate: rows => keyIssues(rows)
    });
    els.envTable.append(table.el);
    els.envActiveBtn.addEventListener('click', () => {
        if (!currentEnv) return;
        state.activeEnvironmentId = state.activeEnvironmentId === currentEnv.id ? '' : currentEnv.id;
        persist();
        bus.emit('environments:changed');
    });
    els.envMoreBtn.addEventListener('click', () => {
        if (!currentEnv) return;
        const env = currentEnv;
        showMenu([
            { label: t('rename'), icon: 'edit', action: () => startRename() },
            { label: t('duplicate'), icon: 'copy', action: () => bus.emit('env:duplicate', env.id) },
            { label: t('export'), icon: 'download', action: () => bus.emit('env:export', env.id) },
            '-',
            { label: t('delete'), icon: 'trash', danger: true, action: () => bus.emit('env:delete', env.id) }
        ], els.envMoreBtn, { align: 'right' });
    });
}

function startRename() {
    const nameEl = els.envCrumb.querySelector('.crumb-name');
    if (!nameEl || !currentEnv) return;
    const env = currentEnv;
    const input = h('input', { class: 'crumb-input', value: env.name, spellcheck: 'false' });
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
        if (done) return;
        done = true;
        if (commit && input.value.trim()) {
            env.name = input.value.trim();
            persist();
            bus.emit('environments:changed');
        }
        renderEnvironment(env);
    };
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') finish(true);
        if (event.key === 'Escape') {
            event.stopPropagation();
            finish(false);
        }
    });
    input.addEventListener('blur', () => finish(true));
}

export function renderEnvironment(env) {
    currentEnv = env;
    if (!env) return;
    els.envCrumb.innerHTML = '';
    const name = h('span', { class: 'crumb-name', text: env.name, tabindex: '0', title: t('rename') });
    name.addEventListener('click', startRename);
    els.envCrumb.append(h('span', { class: 'crumb-icon', html: icon('environments') }), name);
    const active = state.activeEnvironmentId === env.id;
    els.envActiveBtn.innerHTML = active ? `${icon('check')}<span>${t('activeEnvironment')}</span>` : `<span>${t('setActive')}</span>`;
    els.envActiveBtn.classList.toggle('btn-active', active);
    table.render();
}
