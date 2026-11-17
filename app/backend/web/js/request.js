import { icon } from './icons.js';
import { t, applyTranslations } from './i18n.js';
import { createKvTable, keyIssues } from './kvtable.js';
import { isDirty, pathOf, persist, publicVariableNames, state, variableKey } from './store.js';
import { $, basename, bus, clamp, dragResize, h } from './util.js';
import { showMenu } from './ui.js';
import { hasSelection, layoutEditor } from './editor.js';
import { layoutResponse } from './response.js';
import { createRichEditor, isRichEmpty } from './richtext.js';

const els = {};
let currentTab = null;
let variablesTable = null;
let descriptionEditor = null;
let projectInfo = {};

export function initRequestView(container) {
    container.innerHTML = `
        <div class="req-header">
            <div class="breadcrumb" id="breadcrumb"></div>
            <div class="req-header-actions">
                <div class="split-btn">
                    <button class="btn btn-sm" id="saveBtn" type="button">${icon('save')}<span data-i18n="save">Save</span></button>
                    <button class="btn btn-sm split-caret" id="saveMenuBtn" type="button" data-i18n-title="moreActions">${icon('chevronDown')}</button>
                </div>
            </div>
        </div>
        <div class="url-bar">
            <div class="url-box">
                <span class="method-pill">PHP</span>
                <span class="url-divider"></span>
                <button class="url-input" id="projectBtn" type="button">
                    <span class="url-icon">${icon('laravel')}</span>
                    <span class="url-text" id="projectText"></span>
                    <span class="url-badges" id="projectBadges"></span>
                </button>
                <button class="url-caret" id="recentBtn" type="button" data-i18n-title="recentProjects">${icon('chevronDown')}</button>
            </div>
            <div class="send-group">
                <button class="btn-send" id="sendBtn" type="button"><span id="sendLabel" data-i18n="send">Send</span></button>
                <button class="btn-send-caret" id="sendMenuBtn" type="button" data-i18n-title="moreActions">${icon('chevronDown')}</button>
            </div>
        </div>
        <div class="req-split" id="reqSplit">
            <div class="req-body" id="reqBody">
                <div class="req-tabs" id="reqTabs">
                    <button class="req-tab" data-view="code" type="button"><span data-i18n="code">Code</span></button>
                    <button class="req-tab" data-view="variables" type="button"><span data-i18n="variables">Variables</span><span class="tab-count" id="varCount"></span></button>
                    <button class="req-tab" data-view="description" type="button"><span data-i18n="description">Description</span><span class="desc-dot" id="descDot"></span></button>
                    <span class="spacer"></span>
                    <span class="req-hint" id="reqHint"></span>
                </div>
                <div class="req-pane pane-code" id="paneCode">
                    <div class="monaco-host" id="codeHost"></div>
                    <div class="editor-loading" id="editorLoading"><div class="spinner"></div></div>
                </div>
                <div class="req-pane pane-variables" id="paneVariables">
                    <div class="pane-help">${icon('info')}<span data-i18n="variablesHelp"></span></div>
                </div>
                <div class="req-pane pane-description" id="paneDescription"></div>
            </div>
            <div class="split-resizer" id="splitResizer"><span></span></div>
            <section class="response" id="responsePane"></section>
        </div>`;
    for (const id of ['breadcrumb', 'saveBtn', 'saveMenuBtn', 'projectBtn', 'projectText', 'projectBadges', 'recentBtn', 'sendBtn', 'sendLabel', 'sendMenuBtn', 'reqTabs', 'varCount', 'descDot', 'reqHint', 'reqSplit', 'reqBody', 'paneCode', 'codeHost', 'editorLoading', 'paneVariables', 'paneDescription', 'splitResizer', 'responsePane']) els[id] = $('#' + id, container);

    variablesTable = createKvTable({
        getRows: () => currentTab?.variables || [],
        onChange: rows => {
            if (!currentTab) return;
            currentTab.variables = rows;
            currentTab.preview = false;
            updateCounts();
            bus.emit('tab:edited', currentTab);
            persist();
        },
        keyPlaceholder: t('variableName'),
        valuePlaceholder: t('variableValue'),
        validate: variableIssues
    });
    els.paneVariables.append(variablesTable.el);

    els.reqTabs.querySelectorAll('.req-tab').forEach(button => button.addEventListener('click', () => {
        if (!currentTab) return;
        currentTab.reqView = button.dataset.view;
        persist();
        renderRequest(currentTab);
    }));
    descriptionEditor = createRichEditor({
        placeholder: t('descriptionPlaceholder'),
        onChange: value => {
            if (!currentTab) return;
            currentTab.description = value;
            currentTab.preview = false;
            updateCounts();
            bus.emit('tab:edited', currentTab);
            persist();
        }
    });
    els.paneDescription.append(descriptionEditor.el);
    els.saveBtn.addEventListener('click', () => bus.emit('action:save'));
    els.saveMenuBtn.addEventListener('click', () => {
        const tab = currentTab;
        showMenu([
            { label: t('saveAs'), icon: 'save', shortcut: 'Ctrl+Shift+S', action: () => bus.emit('action:saveAs') },
            tab?.requestId ? { label: t('revealInSidebar'), icon: 'collections', action: () => bus.emit('action:reveal', tab.requestId) } : null,
            tab?.requestId && isDirty(tab) ? { label: t('revertChanges'), icon: 'refresh', action: () => bus.emit('action:revert', tab.id) } : null,
            '-',
            { label: t('duplicateTab'), icon: 'copy', action: () => bus.emit('action:duplicateTab', tab?.id) }
        ], els.saveMenuBtn, { align: 'right' });
    });
    els.projectBtn.addEventListener('click', () => bus.emit('action:pickProject'));
    els.recentBtn.addEventListener('click', () => {
        const recents = state.recentProjects.filter(p => p !== currentTab?.project);
        showMenu([
            { header: t('recentProjects') },
            ...(recents.length ? recents.map(p => ({ label: p, icon: 'laravel', action: () => bus.emit('action:setProject', p) })) : [{ label: t('noRecentProjects'), disabled: true }]),
            '-',
            { label: t('browseProject'), icon: 'folderOpen', action: () => bus.emit('action:pickProject') }
        ], els.projectBtn.parentElement, { minWidth: els.projectBtn.parentElement.offsetWidth });
    });
    els.sendBtn.addEventListener('click', () => bus.emit(els.sendBtn.classList.contains('running') ? 'run:cancel' : 'action:run'));
    els.sendMenuBtn.addEventListener('click', () => showMenu([
        { label: t('runSelection'), icon: 'code', shortcut: 'Ctrl+Enter', action: () => bus.emit('action:run', { selection: true }), disabled: currentTab?.reqView !== 'code' || !hasSelection() },
        { label: t('runAll'), icon: 'send', shortcut: 'Ctrl+Shift+Enter', action: () => bus.emit('action:run', { full: true }) },
        { label: t('clearResponse'), icon: 'ban', action: () => bus.emit('response:clear') }
    ], els.sendMenuBtn, { align: 'right' }));
    els.breadcrumb.addEventListener('click', event => {
        const crumb = event.target.closest('[data-reveal]');
        if (crumb) bus.emit('action:reveal', crumb.dataset.reveal);
    });

    dragResize({
        handle: els.splitResizer,
        axis: splitAxis,
        onStart: () => ({ rect: els.reqSplit.getBoundingClientRect(), split: state.ui.split, axis: splitAxis() }),
        onMove: (delta, ctx, event) => {
            const pos = ctx.axis === 'x' ? event.clientX - ctx.rect.left : event.clientY - ctx.rect.top;
            const size = ctx.axis === 'x' ? ctx.rect.width : ctx.rect.height;
            state.ui.split = clamp((pos / size) * 100, 15, 85);
            applyLayout();
        },
        onEnd: () => persist()
    });
    els.splitResizer.addEventListener('dblclick', () => {
        state.ui.split = 50;
        applyLayout();
        persist();
    });
    applyLayout();
    return { codeHost: els.codeHost, responseHost: els.responsePane };
}

function splitAxis() {
    const rect = els.splitResizer.getBoundingClientRect();
    return rect.height > rect.width ? 'x' : 'y';
}

export function applyLayout() {
    if (!els.reqSplit) return;
    const side = state.ui.layout === 'side';
    els.reqSplit.classList.toggle('side', side);
    els.reqSplit.style.setProperty('--split', `${state.ui.split}%`);
    els.splitResizer.dataset.axis = side ? 'x' : 'y';
    requestAnimationFrame(() => {
        layoutEditor();
        layoutResponse();
    });
}

export function editorReady() {
    els.editorLoading?.remove();
}

export function setProjectInfo(project, info) {
    projectInfo[String(project || '').toLowerCase()] = info;
    if (currentTab && String(currentTab.project || '').toLowerCase() === String(project || '').toLowerCase()) renderProject(currentTab);
}

function renderProject(tab) {
    const project = tab.project;
    els.projectText.textContent = project || t('selectProject');
    els.projectText.classList.toggle('placeholder', !project);
    els.projectBtn.title = project || t('selectProject');
    const info = projectInfo[String(project || '').toLowerCase()];
    els.projectBadges.innerHTML = '';
    if (project && info) {
        if (info.error) els.projectBadges.append(h('span', { class: 'url-badge error', title: info.error, html: `${icon('warning')}${t('projectProblem')}` }));
        else {
            if (info.laravel) els.projectBadges.append(h('span', { class: 'url-badge', text: `Laravel ${info.laravel}` }));
            if (info.php) els.projectBadges.append(h('span', { class: 'url-badge', text: `PHP ${info.php}` }));
        }
    }
}

function renderBreadcrumb(tab) {
    const crumbs = els.breadcrumb;
    crumbs.innerHTML = '';
    const nameEl = h('span', { class: 'crumb-name', tabindex: '0', title: t('rename') });
    nameEl.textContent = tab.name || t('untitledRequest');
    nameEl.addEventListener('click', () => startRename(nameEl));
    nameEl.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            startRename(nameEl);
        }
    });
    if (tab.filePath) {
        crumbs.append(h('span', { class: 'crumb-icon file', html: icon('filePhp') }), h('span', { class: 'crumb', text: tab.filePath.replace(/[\\/][^\\/]*$/, ''), title: tab.filePath }), h('span', { class: 'crumb-sep', text: '/' }), h('span', { class: 'crumb-name static', text: basename(tab.filePath) }));
        return;
    }
    const path = tab.requestId ? pathOf(tab.requestId) : [];
    if (path.length > 1) {
        crumbs.append(h('span', { class: 'crumb-icon', html: icon('collections') }));
        for (const node of path.slice(0, -1)) {
            crumbs.append(h('span', { class: 'crumb link', 'data-reveal': node.id, text: node.name }), h('span', { class: 'crumb-sep', text: '/' }));
        }
    } else {
        crumbs.append(h('span', { class: 'crumb-badge', text: 'PHP' }));
    }
    crumbs.append(nameEl);
}

function startRename(nameEl) {
    const tab = currentTab;
    if (!tab || tab.filePath) return;
    const input = h('input', { class: 'crumb-input', value: tab.name || t('untitledRequest'), spellcheck: 'false' });
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
        renderBreadcrumb(tab);
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

export function variableIssues(rows) {
    return keyIssues(rows, { normalize: variableKey, reserved: publicVariableNames() });
}

export function refreshVariableIssues() {
    if (currentTab?.type === 'request' && currentTab.reqView === 'variables') variablesTable?.revalidate();
}

function updateCounts() {
    if (!currentTab) return;
    const count = (currentTab.variables || []).filter(v => v.enabled && v.key).length;
    els.varCount.textContent = count ? String(count) : '';
    els.descDot.classList.toggle('on', !isRichEmpty(currentTab.description));
}

export function setRunning(running) {
    els.sendBtn.classList.toggle('running', running);
    els.sendLabel.textContent = running ? t('cancel') : t('send');
}

export function setHint(text) {
    if (els.reqHint) els.reqHint.textContent = text || '';
}

export function renderRequest(tab) {
    currentTab = tab;
    if (!tab) return;
    renderBreadcrumb(tab);
    renderProject(tab);
    els.saveBtn.classList.toggle('dirty', isDirty(tab));
    els.reqTabs.querySelectorAll('.req-tab').forEach(b => b.classList.toggle('active', b.dataset.view === tab.reqView));
    els.paneCode.hidden = tab.reqView !== 'code';
    els.paneVariables.hidden = tab.reqView !== 'variables';
    els.paneDescription.hidden = tab.reqView !== 'description';
    if (tab.reqView === 'variables') variablesTable.render();
    descriptionEditor.setValue(tab.description);
    descriptionEditor.setPlaceholder(t('descriptionPlaceholder'));
    descriptionEditor.localize();
    updateCounts();
    applyTranslations(els.paneVariables.querySelector('.pane-help'));
    if (tab.reqView === 'code') requestAnimationFrame(() => layoutEditor());
}

export function refreshDirty(tab) {
    if (tab === currentTab) {
        els.saveBtn.classList.toggle('dirty', isDirty(tab));
        if (!document.activeElement?.classList.contains('crumb-input')) renderBreadcrumb(tab);
    }
}

export function requestDomReady() {
    return !!els.codeHost;
}
