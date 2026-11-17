import { icon } from './icons.js';
import { t } from './i18n.js';
import { isDirty, pathOf, persist } from './store.js';
import { $, bus, h } from './util.js';
import { showMenu } from './ui.js';
import { createRichEditor } from './richtext.js';

const els = {};
let currentTab = null;
let editor = null;

export function initDocView(container) {
    container.innerHTML = `
        <div class="req-header">
            <div class="breadcrumb" id="docCrumb"></div>
            <div class="req-header-actions">
                <div class="split-btn">
                    <button class="btn btn-sm" id="docSaveBtn" type="button">${icon('save')}<span data-i18n="save">Save</span></button>
                    <button class="btn btn-sm split-caret" id="docMenuBtn" type="button" data-i18n-title="moreActions">${icon('chevronDown')}</button>
                </div>
            </div>
        </div>
        <div class="doc-body" id="docBody"></div>`;
    for (const id of ['docCrumb', 'docSaveBtn', 'docMenuBtn', 'docBody']) els[id] = $('#' + id, container);
    editor = createRichEditor({
        placeholder: t('docPlaceholder'),
        onChange: value => {
            if (!currentTab) return;
            currentTab.content = value;
            currentTab.preview = false;
            bus.emit('tab:edited', currentTab);
            persist();
        }
    });
    els.docBody.append(editor.el);
    els.docSaveBtn.addEventListener('click', () => bus.emit('action:save'));
    els.docMenuBtn.addEventListener('click', () => {
        const tab = currentTab;
        if (!tab) return;
        showMenu([
            { label: t('revealInSidebar'), icon: 'collections', action: () => bus.emit('action:reveal', tab.docId) },
            isDirty(tab) ? { label: t('revertChanges'), icon: 'refresh', action: () => bus.emit('action:revert', tab.id) } : null,
            '-',
            { label: t('delete'), icon: 'trash', danger: true, action: () => bus.emit('action:deleteNode', tab.docId) }
        ], els.docMenuBtn, { align: 'right' });
    });
    els.docCrumb.addEventListener('click', event => {
        const crumb = event.target.closest('[data-reveal]');
        if (crumb) bus.emit('action:reveal', crumb.dataset.reveal);
    });
}

function renderCrumb(tab) {
    els.docCrumb.innerHTML = '';
    els.docCrumb.append(h('span', { class: 'crumb-icon', html: icon('collections') }));
    for (const node of pathOf(tab.docId).slice(0, -1)) {
        els.docCrumb.append(h('span', { class: 'crumb link', 'data-reveal': node.id, text: node.name }), h('span', { class: 'crumb-sep', text: '/' }));
    }
    const name = h('span', { class: 'crumb-name', tabindex: '0', title: t('rename'), text: tab.name || t('untitledDoc') });
    name.addEventListener('click', () => startRename(name));
    name.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            startRename(name);
        }
    });
    els.docCrumb.append(h('span', { class: 'crumb-icon doc', html: icon('textAlignStart') }), name);
}

function startRename(nameEl) {
    const tab = currentTab;
    if (!tab) return;
    const input = h('input', { class: 'crumb-input', value: tab.name, spellcheck: 'false' });
    input.style.width = Math.max(120, nameEl.offsetWidth + 40) + 'px';
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = commit => {
        if (done) return;
        done = true;
        const value = input.value.trim();
        if (commit && value && value !== tab.name) {
            tab.name = value;
            tab.preview = false;
            bus.emit('tab:edited', tab);
            persist();
        }
        renderCrumb(tab);
    };
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
        }
    });
    input.addEventListener('blur', () => finish(true));
}

export function renderDoc(tab) {
    currentTab = tab;
    if (!tab) return;
    renderCrumb(tab);
    els.docSaveBtn.classList.toggle('dirty', isDirty(tab));
    editor.setValue(tab.content);
    editor.setPlaceholder(t('docPlaceholder'));
    editor.localize();
}

export function refreshDocDirty(tab) {
    if (tab !== currentTab) return;
    els.docSaveBtn.classList.toggle('dirty', isDirty(tab));
    if (!els.docCrumb.querySelector('.crumb-input')) renderCrumb(tab);
}

export function focusDoc() {
    editor?.focus();
}
