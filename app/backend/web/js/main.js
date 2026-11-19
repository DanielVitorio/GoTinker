import { api, query } from './api.js';
import { icon, logo } from './icons.js';
import { applyTranslations, setLanguage, t } from './i18n.js';
import {
    activeEnvironment, activeTab, addHistory, cloneNode, findNode, insertNode, isDirty, loadState, newDocNode, newDocTab, newFolderNode, newRequestNode,
    newRequestTab, normalizeVariables, persist, persistBeacon, rememberProject, removeNode, state, variableKey
} from './store.js';
import { $, basename, bus, downloadText, nowISO, safeFilename, uid } from './util.js';
import { confirmDialog, showMenu, toast } from './ui.js';
import {
    applyEditorSettings, applyEditorTheme, clearRuntimeError, disposeTab, environmentMap, focusEditor, initEditor, layoutEditor, loadMonaco,
    refreshEnvironmentDecorations, runSelection, setModelValue, setRuntimeError, showTab
} from './editor.js';
import { applyTheme, currentTheme, toggleTheme } from './theme.js';
import { indexInfo, loadIndex, refreshIndex } from './intellisense.js';
import {
    applyLayout, editorReady, initRequestView, refreshDirty, refreshVariableIssues, renderRequest, setHint, setProjectInfo, setRunning, variableIssues
} from './request.js';
import { attachMonaco, initResponse, layoutResponse, renderResponse, setLoading, updateLayoutButtons } from './response.js';
import { initEnvironmentView, renderEnvironment } from './envview.js';
import { focusDoc, initDocView, refreshDocDirty, renderDoc } from './docview.js';
import { initTabs, renderEnvironmentSelect, renderTabs, tabTitle, updateTab } from './tabs.js';
import { applySidebar, initSidebar, renderSidebar, revealNode, startRename } from './sidebar.js';
import { importDialog, projectPicker, saveRequestDialog, settingsDialog, shortcutsDialog } from './dialogs.js';
import { applyTerminalTheme, initTerminal, toggleTerminal } from './terminal.js';
import { openPalette } from './palette.js';

const els = {};
const projectStatus = new Map();
let running = null;
let monacoReady = false;
let dataDir = '';

function activeProject() {
    const tab = activeTab();
    return (tab?.type === 'request' && tab.project) || state.lastProject || '';
}

function buildShell() {
    $('#brandLogo').innerHTML = logo;
    $('#searchBtn').insertAdjacentHTML('afterbegin', icon('search'));
    $('#settingsBtn').innerHTML = icon('settings');
    $('#railCollections').insertAdjacentHTML('afterbegin', icon('collections'));
    $('#railEnvironments').insertAdjacentHTML('afterbegin', icon('environments'));
    $('#railHistory').insertAdjacentHTML('afterbegin', icon('history'));
    $('#sidebarAddBtn').innerHTML = icon('plus');
    $('#sidebarMoreBtn').innerHTML = icon('more');
    $('#sidebarFilterIcon').innerHTML = icon('search');
    els.requestView = $('#requestView');
    els.envView = $('#envView');
    els.docView = $('#docView');
    els.emptyView = $('#emptyView');
    const { codeHost, responseHost } = initRequestView(els.requestView);
    els.codeHost = codeHost;
    initResponse(responseHost);
    initEnvironmentView(els.envView);
    initDocView(els.docView);
    initTabs($('#tabstrip'));
    initSidebar();
    initTerminal({ getProject: activeProject });
    buildEmptyView();
    buildStatusbar();
    $('#searchBtn').addEventListener('click', () => openPalette());
    $('#settingsBtn').addEventListener('click', openSettings);
    $('#themeBtn').addEventListener('click', toggleTheme);
    $('#newBtn').addEventListener('click', event => newMenu(event.currentTarget));
    $('#importBtn').addEventListener('click', openImport);
    applyTranslations();
}

function renderThemeButton() {
    const light = currentTheme() === 'light';
    const button = $('#themeBtn');
    button.innerHTML = icon(light ? 'moon' : 'sun');
    button.title = t(light ? 'darkTheme' : 'lightTheme');
}

function buildEmptyView() {
    els.emptyView.innerHTML = `
        <div class="landing">
            <div class="landing-logo">${logo}</div>
            <h2>Go Tinker</h2>
            <p data-i18n="landingText"></p>
            <div class="landing-actions">
                <button class="landing-card" type="button" data-act="request">${icon('code')}<span data-i18n="newRequest"></span><kbd>Ctrl+T</kbd></button>
                <button class="landing-card" type="button" data-act="collection">${icon('collections')}<span data-i18n="newCollection"></span></button>
                <button class="landing-card" type="button" data-act="environment">${icon('environments')}<span data-i18n="newEnvironment"></span></button>
                <button class="landing-card" type="button" data-act="file">${icon('filePhp')}<span data-i18n="openPHPFile"></span><kbd>Ctrl+O</kbd></button>
            </div>
            <div class="landing-keys">
                <span><kbd>Ctrl</kbd><kbd>Enter</kbd> <span data-i18n="send"></span></span>
                <span><kbd>Ctrl</kbd><kbd>P</kbd> <span data-i18n="search"></span></span>
                <span><kbd>Ctrl</kbd><kbd>S</kbd> <span data-i18n="save"></span></span>
                <span><kbd>Ctrl</kbd><kbd>\`</kbd> <span data-i18n="terminal"></span></span>
            </div>
        </div>`;
    els.emptyView.querySelectorAll('[data-act]').forEach(button => button.addEventListener('click', () => {
        const act = button.dataset.act;
        if (act === 'request') newTab();
        else if (act === 'collection') newCollection();
        else if (act === 'environment') newEnvironment();
        else openFile();
    }));
}

function buildStatusbar() {
    const bar = $('#statusbar');
    bar.innerHTML = `
        <button class="sb-item sb-icon" id="sbSidebar" type="button" data-i18n-title="toggleSidebar">${icon('sidebar')}</button>
        <button class="sb-item" id="sbProject" type="button"><span class="sb-dot" id="sbDot"></span><span id="sbProjectText"></span></button>
        <span class="sb-item" id="sbIndex"></span>
        <span class="spacer"></span>
        <span class="sb-item" id="sbSave"></span>
        <span class="sb-item" id="sbCursor"></span>
        <span class="sb-item" id="sbEnv"></span>
        <span class="sb-item">PHP</span>
        <button class="sb-item" id="sbTerminal" type="button">${icon('terminal')}<span data-i18n="terminal"></span></button>
        <button class="sb-item sb-icon" id="sbLayout" type="button" data-i18n-title="toggleLayout"></button>
        <button class="sb-item sb-icon" id="sbKeys" type="button" data-i18n-title="keyboardShortcuts">${icon('keyboard')}</button>`;
    for (const id of ['sbSidebar', 'sbProject', 'sbDot', 'sbProjectText', 'sbIndex', 'sbSave', 'sbCursor', 'sbEnv', 'sbTerminal', 'sbLayout', 'sbKeys']) els[id] = $('#' + id, bar);
    els.sbSidebar.addEventListener('click', toggleSidebar);
    els.sbProject.addEventListener('click', pickProject);
    els.sbTerminal.addEventListener('click', () => toggleTerminal());
    els.sbLayout.addEventListener('click', toggleLayout);
    els.sbKeys.addEventListener('click', shortcutsDialog);
    els.sbIndex.addEventListener('click', () => reindex());
}

function renderStatusbar() {
    if (!els.sbProjectText) return;
    const project = activeProject();
    const status = projectStatus.get(project.toLowerCase());
    els.sbProjectText.textContent = project ? basename(project) : t('noProject');
    els.sbProject.title = project ? `${project}${status?.laravel ? `\nLaravel ${status.laravel}` : ''}${status?.php ? ` · PHP ${status.php}` : ''}` : t('selectProject');
    els.sbDot.className = 'sb-dot ' + (!project ? '' : !status ? 'loading' : status.ok ? 'ok' : 'error');
    const info = project ? indexInfo(project) : null;
    els.sbIndex.innerHTML = !project ? '' : info?.loading || !info ? `<span class="sb-spin"></span>${t('indexing')}` : info.loaded ? `${icon('bolt')}${t('classCount', { count: info.count.toLocaleString() })}` : '';
    els.sbIndex.title = t('reindexProject');
    els.sbLayout.innerHTML = icon(state.ui.layout === 'side' ? 'layoutSide' : 'layoutStacked');
    els.sbLayout.title = state.ui.layout === 'side' ? t('responseBelow') : t('responseSide');
    els.sbTerminal.classList.toggle('active', !!state.ui.terminalOpen);
    const env = activeEnvironment();
    els.sbEnv.innerHTML = env ? `${icon('environments')}${env.name.replace(/</g, '&lt;')}` : '';
    const tab = activeTab();
    document.title = tab ? `${tabTitle(tab)} — Go Tinker` : 'Go Tinker';
    renderThemeButton();
}

function showActive() {
    const tab = activeTab();
    els.requestView.hidden = tab?.type !== 'request';
    els.envView.hidden = tab?.type !== 'environment';
    els.docView.hidden = tab?.type !== 'doc';
    els.emptyView.hidden = !!tab;
    els.sbCursor.hidden = tab?.type !== 'request';
    if (tab?.type === 'request') {
        renderRequest(tab);
        renderResponse(tab);
        setLoading(running?.tabId === tab.id);
        setRunning(running?.tabId === tab.id);
        if (monacoReady) showTab(tab);
        if (tab.project && !projectStatus.has(tab.project.toLowerCase())) refreshProject(tab.project);
    } else if (tab?.type === 'environment') {
        renderEnvironment(state.environments.find(e => e.id === tab.envId));
    } else if (tab?.type === 'doc') {
        renderDoc(tab);
    }
    renderStatusbar();
}

function renderAll() {
    renderTabs();
    renderSidebar();
    showActive();
}

async function refreshProject(project, force = false) {
    if (!project) return;
    const key = project.toLowerCase();
    if (!force && projectStatus.has(key)) return;
    try {
        const status = await api('/api/status?' + query({ project }));
        projectStatus.set(key, status);
        dataDir = status.dataDir || dataDir;
        setProjectInfo(project, status);
        if (!status.ok && status.error) toast(status.error, 'error');
        if (status.hasArtisan) loadIndex(project, force);
    } catch (error) {
        toast(error.message, 'error');
    }
    renderStatusbar();
}

function reindex() {
    const project = activeProject();
    if (!project) return pickProject();
    projectStatus.delete(project.toLowerCase());
    refreshProject(project, true);
}

function activate(tab) {
    state.activeTabId = tab.id;
    persist();
    renderTabs();
    renderSidebar();
    showActive();
}

function newTab(seed = {}) {
    const tab = newRequestTab({ project: activeProject(), ...seed });
    state.tabs.push(tab);
    activate(tab);
    if (tab.type === 'request') setTimeout(focusEditor, 30);
    return tab;
}

function previewSlot() {
    return state.tabs.find(tab => tab.preview && !isDirty(tab) && running?.tabId !== tab.id);
}

function placeTab(tab, pin) {
    const slot = !pin && previewSlot();
    if (slot) {
        const index = state.tabs.indexOf(slot);
        disposeTab(slot.id);
        state.tabs.splice(index, 1, tab);
    } else {
        const index = state.tabs.findIndex(x => x.id === state.activeTabId);
        state.tabs.splice(index < 0 ? state.tabs.length : index + 1, 0, tab);
    }
    activate(tab);
}

function openRequest(id, { pin = false, newTab: forceNew = false } = {}) {
    const found = findNode(id);
    if (!found || found.node.type !== 'request') return;
    const existing = !forceNew && state.tabs.find(tab => tab.type === 'request' && tab.requestId === id);
    if (existing) {
        if (pin) existing.preview = false;
        activate(existing);
        return;
    }
    const request = found.node;
    placeTab(newRequestTab({
        requestId: forceNew ? '' : id, name: forceNew ? `${request.name} ${t('copySuffix')}` : request.name, code: request.code, description: request.description,
        variables: JSON.parse(JSON.stringify(request.variables)), project: request.project || activeProject(), preview: !pin && !forceNew
    }), pin || forceNew);
}

function openDoc(id, { pin = false } = {}) {
    const doc = findNode(id)?.node;
    if (doc?.type !== 'doc') return;
    const existing = state.tabs.find(tab => tab.type === 'doc' && tab.docId === id);
    if (existing) {
        if (pin) existing.preview = false;
        activate(existing);
        return;
    }
    placeTab(newDocTab(doc, { preview: !pin }), pin);
}

function openEnvironment(id, { pin = false } = {}) {
    if (!state.environments.some(env => env.id === id)) return;
    const existing = state.tabs.find(tab => tab.type === 'environment' && tab.envId === id);
    if (existing) {
        if (pin) existing.preview = false;
        activate(existing);
        return;
    }
    placeTab({ id: uid('tab'), type: 'environment', envId: id, preview: !pin }, pin);
}

function openHistory(id, { pin = false } = {}) {
    const entry = state.history.find(item => item.id === id);
    if (!entry) return null;
    const tab = newRequestTab({
        name: entry.name || '', code: entry.code, variables: JSON.parse(JSON.stringify(entry.variables || [])), project: entry.project || activeProject(),
        response: entry.response ? JSON.parse(JSON.stringify(entry.response)) : null, preview: !pin
    });
    placeTab(tab, pin);
    return tab;
}

function switchTab(id) {
    const tab = state.tabs.find(x => x.id === id);
    if (tab) activate(tab);
}

function cycleTab(delta) {
    if (state.tabs.length < 2) return;
    const index = state.tabs.findIndex(x => x.id === state.activeTabId);
    switchTab(state.tabs[(index + delta + state.tabs.length) % state.tabs.length].id);
}

async function closeTab(id, { force = false } = {}) {
    const tab = state.tabs.find(x => x.id === id);
    if (!tab) return true;
    if (!force && isDirty(tab)) {
        if (state.activeTabId !== id) activate(tab);
        const choice = await confirmDialog({
            title: t('unsavedTitle'), message: t('unsavedMessage', { name: tabTitle(tab) }),
            confirmLabel: t('saveChanges'), cancelLabel: t('cancel'), extra: { label: t('dontSave'), value: 'discard' }
        });
        if (choice === 'cancel') return false;
        if (choice === 'confirm' && !(await saveTab(tab))) return false;
    }
    if (running?.tabId === id) running.controller.abort();
    const index = state.tabs.indexOf(tab);
    state.tabs.splice(index, 1);
    disposeTab(id);
    if (state.activeTabId === id) state.activeTabId = (state.tabs[index] || state.tabs[index - 1])?.id || '';
    persist();
    renderAll();
    return true;
}

async function closeTabs(ids) {
    for (const id of [...ids]) {
        if (!(await closeTab(id))) break;
    }
}

function duplicateTab(id) {
    const tab = state.tabs.find(x => x.id === id);
    if (!tab || tab.type !== 'request') return;
    const copy = { ...JSON.parse(JSON.stringify(tab)), id: uid('tab'), requestId: '', filePath: '', savedCode: '', preview: false, name: `${tabTitle(tab)} ${t('copySuffix')}` };
    const index = state.tabs.indexOf(tab);
    state.tabs.splice(index + 1, 0, copy);
    activate(copy);
}

function containerOf(requestId) {
    const found = findNode(requestId);
    return found ? (found.parent?.id || found.collection.id) : '';
}

function saveDoc(tab) {
    const doc = findNode(tab.docId)?.node;
    if (!doc) return false;
    Object.assign(doc, { name: tab.name || doc.name, content: tab.content, updatedAt: nowISO() });
    tab.name = doc.name;
    tab.preview = false;
    persist();
    renderTabs();
    renderSidebar();
    refreshDocDirty(tab);
    return true;
}

async function saveTab(tab = activeTab(), { saveAs = false } = {}) {
    if (tab?.type === 'doc') return saveDoc(tab);
    if (!tab || tab.type !== 'request') return false;
    if (tab.filePath && !saveAs) {
        try {
            await api('/api/file', { body: { path: tab.filePath, content: tab.code } });
            tab.savedCode = tab.code;
            tab.preview = false;
            persist();
            renderTabs();
            refreshDirty(tab);
            toast(t('fileSaved'), 'success');
            return true;
        } catch (error) {
            toast(error.message, 'error');
            return false;
        }
    }
    const existing = tab.requestId ? findNode(tab.requestId)?.node : null;
    if (existing && !saveAs) {
        Object.assign(existing, {
            name: tab.name || existing.name, code: tab.code, description: tab.description, variables: normalizeVariables(JSON.parse(JSON.stringify(tab.variables))),
            project: tab.project, updatedAt: nowISO()
        });
        tab.name = existing.name;
        tab.preview = false;
        persist();
        renderTabs();
        renderSidebar();
        refreshDirty(tab);
        renderStatusbar();
        return true;
    }
    const result = await saveRequestDialog({
        name: tab.filePath ? basename(tab.filePath).replace(/\.php$/i, '') : (tab.name || t('untitledRequest')),
        description: tab.description, title: saveAs ? t('saveAs') : t('saveRequest'), location: tab.requestId ? containerOf(tab.requestId) : ''
    });
    if (!result) return false;
    const node = newRequestNode({ name: result.name, description: result.description, code: tab.code, variables: JSON.parse(JSON.stringify(tab.variables)), project: tab.project });
    insertNode(result.containerId, node);
    if (!tab.filePath) {
        tab.requestId = node.id;
        tab.name = node.name;
        tab.description = node.description;
        tab.variables = normalizeVariables(tab.variables);
        tab.preview = false;
    }
    persist();
    renderTabs();
    renderSidebar();
    showActive();
    toast(t('requestSaved', { name: node.name }), 'success');
    return true;
}

function revertTab(id) {
    const tab = state.tabs.find(x => x.id === id);
    if (tab?.type === 'doc') {
        const doc = findNode(tab.docId)?.node;
        if (!doc) return;
        Object.assign(tab, { name: doc.name, content: doc.content });
        persist();
        renderTabs();
        showActive();
        return;
    }
    const request = tab?.requestId ? findNode(tab.requestId)?.node : null;
    if (!request) return;
    Object.assign(tab, { name: request.name, code: request.code, description: request.description, variables: JSON.parse(JSON.stringify(request.variables)), project: request.project || tab.project });
    setModelValue(tab.id, tab.code);
    persist();
    renderTabs();
    showActive();
}

function substituteEnv(text, env) {
    return String(text).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => Object.prototype.hasOwnProperty.call(env, key) ? env[key] : match);
}

async function run({ full = false, previewParams = null, selection: useSelection } = {}) {
    const tab = activeTab();
    if (!tab || tab.type !== 'request' || running) return;
    const selection = previewParams ? { code: tab.lastRunCode || tab.code, lineOffset: tab.lastRunOffset || 0 } : full ? { code: tab.code, lineOffset: 0 } : (runSelection(useSelection) || { code: tab.code, lineOffset: 0 });
    if (!tab.project) {
        const project = await pickProject();
        if (!project) return;
    }
    if (!String(selection.code).trim()) {
        toast(t('emptyCode'), 'error');
        focusEditor();
        return;
    }
    const issue = variableIssues(tab.variables || []).find((message, index) => message && tab.variables[index].enabled);
    if (issue) {
        toast(issue, 'error');
        tab.reqView = 'variables';
        persist();
        renderRequest(tab);
        return;
    }
    const env = environmentMap();
    const variables = {};
    for (const [key, value] of Object.entries(env)) if (variableKey(key)) variables[variableKey(key)] = value;
    for (const v of tab.variables || []) if (v.enabled && variableKey(v.key)) variables[variableKey(v.key)] = substituteEnv(v.value, env);
    if (previewParams) tab.previewParams = previewParams;
    const controller = new AbortController();
    running = { tabId: tab.id, controller };
    setRunning(true);
    setLoading(true);
    setHint(selection.selection ? t('runningSelection') : '');
    clearRuntimeError(tab.id);
    els.sbSave.textContent = t('running');
    const started = performance.now();
    try {
        const res = await api('/api/run', { body: { project: tab.project, code: substituteEnv(selection.code, env), variables, previewParams: tab.previewParams || {} }, signal: controller.signal });
        tab.response = {
            ok: !!res.ok, output: res.output || '', json: res.json || '', resultType: res.resultType || '', durationMs: res.durationMs || Math.round(performance.now() - started),
            memoryBytes: res.memoryBytes || 0, exitCode: res.exitCode || 0, error: res.error || '', errorLine: res.errorLine || 0,
            previewHtml: res.previewHtml || '', previewData: res.previewData || '', previewMime: res.previewMime || '', previewStatus: res.previewStatus || 0,
            previewRoute: res.previewRoute || null, at: nowISO()
        };
        tab.lastRunCode = selection.code;
        tab.lastRunOffset = selection.lineOffset;
        if (res.errorLine) setRuntimeError(tab.id, res.errorLine + selection.lineOffset, res.error);
        const hasPreview = !!(res.previewHtml || res.previewData || res.previewRoute);
        if (hasPreview && tab.resView === 'body') tab.bodyMode = 'preview';
        else if (!hasPreview && tab.bodyMode === 'preview') tab.bodyMode = 'pretty';
        if (!previewParams) {
            addHistory({ id: uid('run'), name: tab.name, code: selection.code, variables: JSON.parse(JSON.stringify(tab.variables || [])), project: tab.project, requestId: tab.requestId, response: tab.response, createdAt: nowISO() });
        }
        persist();
    } catch (error) {
        if (error.name === 'AbortError') toast(t('executionStopped'));
        else {
            tab.response = { ok: false, output: error.message, json: '', resultType: '', durationMs: 0, memoryBytes: 0, exitCode: -1, error: error.message, errorLine: 0, previewHtml: '', previewData: '', previewMime: '', previewStatus: 0, previewRoute: null, at: nowISO() };
            toast(error.message, 'error');
        }
    } finally {
        running = null;
        setHint('');
        els.sbSave.textContent = '';
        if (activeTab() === tab) {
            setRunning(false);
            setLoading(false);
            renderResponse(tab);
        } else {
            setRunning(false);
            setLoading(false);
        }
        if (state.ui.sidebarView === 'history') renderSidebar();
    }
}

function cancelRun() {
    running?.controller.abort();
}

async function pickProject() {
    const project = await projectPicker({ mode: 'project', start: activeProject() });
    if (project) setProject(project);
    return project;
}

function setProject(project) {
    const tab = activeTab();
    if (tab?.type === 'request') {
        tab.project = project;
        tab.preview = false;
        updateTab(tab);
        refreshDirty(tab);
    }
    rememberProject(project);
    persist();
    showActive();
    refreshProject(project);
}

async function openFile() {
    const path = await projectPicker({ mode: 'file', start: activeProject() });
    if (!path) return;
    const existing = state.tabs.find(tab => tab.filePath && tab.filePath.toLowerCase() === path.toLowerCase());
    if (existing) {
        activate(existing);
        return;
    }
    try {
        const data = await api('/api/file?' + query({ path }));
        const project = data.project || activeProject();
        if (data.project) rememberProject(data.project);
        placeTab(newRequestTab({ name: basename(path), code: data.content || '', filePath: data.path || path, savedCode: data.content || '', project }), true);
    } catch (error) {
        toast(error.message, 'error');
    }
}

function showSidebar(view) {
    state.ui.sidebarView = view;
    state.ui.sidebarHidden = false;
    persist();
    renderSidebar();
}

function newCollection() {
    const node = newFolderNode('collection', t('newCollectionName'));
    state.collections.push(node);
    persist();
    showSidebar('collections');
    startRename(node.id);
}

function newRequestIn(containerId) {
    const node = newRequestNode({ name: t('newRequestName'), project: activeProject() });
    insertNode(containerId, node);
    persist();
    renderSidebar();
    openRequest(node.id, { pin: true });
    setTimeout(focusEditor, 30);
}

function newDocIn(containerId) {
    const node = newDocNode({ name: t('newDocName') });
    insertNode(containerId, node);
    persist();
    renderSidebar();
    openDoc(node.id, { pin: true });
    setTimeout(focusDoc, 30);
}

function newFolderIn(containerId) {
    const node = newFolderNode('folder', t('newFolderName'));
    insertNode(containerId, node);
    persist();
    startRename(node.id);
}

function duplicateNode(id) {
    const found = findNode(id);
    if (!found) return;
    const copy = cloneNode(found.node);
    copy.name = `${found.node.name} ${t('copySuffix')}`;
    found.list.splice(found.index + 1, 0, copy);
    persist();
    renderSidebar();
}

async function deleteNode(id) {
    const found = findNode(id);
    if (!found) return;
    const node = found.node;
    const kind = node.type === 'collection' ? t('collection') : node.type === 'folder' ? t('folder') : node.type === 'doc' ? t('docKind') : t('request');
    const choice = await confirmDialog({ title: t('deleteTitle', { kind }), message: t('deleteMessage', { name: node.name }), confirmLabel: t('delete'), danger: true });
    if (choice !== 'confirm') return;
    const ids = new Set();
    const collect = n => {
        ids.add(n.id);
        n.items?.forEach(collect);
    };
    collect(node);
    removeNode(id);
    for (const tab of state.tabs) if (tab.requestId && ids.has(tab.requestId)) tab.requestId = '';
    for (const tab of state.tabs.filter(x => x.type === 'doc' && ids.has(x.docId))) {
        const index = state.tabs.indexOf(tab);
        state.tabs.splice(index, 1);
        if (state.activeTabId === tab.id) state.activeTabId = (state.tabs[index] || state.tabs[index - 1])?.id || '';
    }
    persist();
    renderAll();
}

function toPostmanItem(node) {
    if (node.items) return { name: node.name, description: node.description || undefined, item: node.items.map(toPostmanItem) };
    if (node.type === 'doc') return { name: node.name, description: node.content || undefined, 'x-gotinker': { type: 'doc' } };
    return {
        name: node.name,
        request: {
            method: 'POST', header: [], description: node.description || undefined,
            body: { mode: 'raw', raw: node.code, options: { raw: { language: 'php' } } },
            url: { raw: 'tinker://' + (node.project || '').replace(/\\/g, '/'), protocol: 'tinker', host: [basename(node.project || 'project')] }
        },
        'x-gotinker': { variables: node.variables, project: node.project }
    };
}

function exportCollection(id) {
    const node = findNode(id)?.node;
    if (!node) return;
    const collection = {
        info: { _postman_id: node.id, name: node.name, description: node.description || undefined, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: node.items.map(toPostmanItem)
    };
    downloadText(`${safeFilename(node.name)}.gotinker_collection.json`, JSON.stringify(collection, null, 2));
}

function fromPostmanItem(item) {
    if (Array.isArray(item.item)) {
        const folder = newFolderNode('folder', item.name || t('folder'));
        folder.description = typeof item.description === 'string' ? item.description : '';
        folder.items = item.item.map(fromPostmanItem).filter(Boolean);
        folder.expanded = false;
        return folder;
    }
    if (item['x-gotinker']?.type === 'doc') {
        return newDocNode({ name: item.name || t('newDocName'), content: typeof item.description === 'string' ? item.description : '' });
    }
    const request = item.request || {};
    const body = request.body;
    const code = typeof body === 'string' ? body : typeof body?.raw === 'string' ? body.raw : '';
    const extra = item['x-gotinker'] || {};
    return newRequestNode({
        name: item.name || t('request'), code, description: typeof request.description === 'string' ? request.description : (typeof item.description === 'string' ? item.description : ''),
        variables: extra.variables || [], project: extra.project || ''
    });
}

async function importEntries(entries) {
    let imported = 0;
    for (const entry of entries) {
        try {
            if (/\.php$/i.test(entry.name) || /^\s*<\?php/.test(entry.text)) {
                let target = state.collections.find(c => c.name === t('importedCollection'));
                if (!target) {
                    target = newFolderNode('collection', t('importedCollection'));
                    state.collections.push(target);
                }
                target.items.push(newRequestNode({ name: entry.name.replace(/\.php$/i, ''), code: entry.text, project: activeProject() }));
                imported++;
                continue;
            }
            const data = JSON.parse(entry.text);
            if (Array.isArray(data.values) && !data.item) {
                state.environments.push({ id: uid('env'), name: data.name || t('environment'), variables: normalizeVariables(data.values.map(v => ({ key: v.key, value: v.value, enabled: v.enabled !== false }))) });
                imported++;
                continue;
            }
            const items = Array.isArray(data.item) ? data.item : Array.isArray(data.collection?.item) ? data.collection.item : null;
            if (!items) throw new Error(t('invalidCollection'));
            const info = data.info || data.collection?.info || {};
            const collection = newFolderNode('collection', info.name || entry.name.replace(/\.json$/i, ''));
            collection.description = typeof info.description === 'string' ? info.description : '';
            collection.items = items.map(fromPostmanItem).filter(Boolean);
            state.collections.push(collection);
            imported++;
        } catch (error) {
            toast(`${entry.name}: ${error.message}`, 'error');
        }
    }
    if (!imported) return false;
    persist();
    renderAll();
    toast(t('importDone', { count: imported }), 'success');
    return true;
}

function openImport() {
    importDialog(importEntries);
}

function newEnvironment() {
    const env = { id: uid('env'), name: t('newEnvironmentName'), variables: [] };
    state.environments.push(env);
    if (!activeEnvironment()) state.activeEnvironmentId = env.id;
    persist();
    showSidebar('environments');
    openEnvironment(env.id, { pin: true });
    bus.emit('environments:changed');
}

async function deleteEnvironment(id) {
    const env = state.environments.find(e => e.id === id);
    if (!env) return;
    const choice = await confirmDialog({ title: t('deleteTitle', { kind: t('environment') }), message: t('deleteMessage', { name: env.name }), confirmLabel: t('delete'), danger: true });
    if (choice !== 'confirm') return;
    state.environments = state.environments.filter(e => e.id !== id);
    if (state.activeEnvironmentId === id) state.activeEnvironmentId = '';
    for (const tab of state.tabs.filter(x => x.type === 'environment' && x.envId === id)) {
        const index = state.tabs.indexOf(tab);
        state.tabs.splice(index, 1);
        if (state.activeTabId === tab.id) state.activeTabId = (state.tabs[index] || state.tabs[index - 1])?.id || '';
    }
    persist();
    renderAll();
    refreshEnvironmentDecorations();
}

function duplicateEnvironment(id) {
    const env = state.environments.find(e => e.id === id);
    if (!env) return;
    const copy = { id: uid('env'), name: `${env.name} ${t('copySuffix')}`, variables: JSON.parse(JSON.stringify(env.variables)) };
    state.environments.splice(state.environments.indexOf(env) + 1, 0, copy);
    persist();
    renderSidebar();
}

function exportEnvironment(id) {
    const env = state.environments.find(e => e.id === id);
    if (!env) return;
    const data = { id: env.id, name: env.name, values: env.variables.map(v => ({ key: v.key, value: v.value, type: 'default', enabled: v.enabled })), _postman_variable_scope: 'environment' };
    downloadText(`${safeFilename(env.name)}.postman_environment.json`, JSON.stringify(data, null, 2));
}

async function clearHistory() {
    if (!state.history.length) return;
    const choice = await confirmDialog({ title: t('clearHistory'), message: t('clearHistoryMessage'), confirmLabel: t('clearHistory'), danger: true });
    if (choice !== 'confirm') return;
    state.history = [];
    persist();
    renderSidebar();
}

function toggleSidebar() {
    state.ui.sidebarHidden = !state.ui.sidebarHidden;
    persist();
    applySidebar();
    renderSidebar();
    setTimeout(() => { layoutEditor(); layoutResponse(); }, 20);
}

function setLayout(layout) {
    state.ui.layout = layout === 'side' ? 'side' : 'stacked';
    persist();
    applyLayout();
    updateLayoutButtons();
    renderStatusbar();
}

function toggleLayout() {
    setLayout(state.ui.layout === 'side' ? 'stacked' : 'side');
}

function openSettings() {
    settingsDialog({
        dataDir,
        onChange: async change => {
            if (change.language) {
                state.language = await setLanguage(change.language);
                renderAll();
            }
            for (const key of ['fontSize', 'minimap', 'wordWrap', 'lint']) {
                if (key in change) state.ui[key] = change[key];
            }
            if ('layout' in change) setLayout(change.layout);
            applyEditorSettings();
            persist();
            renderStatusbar();
        }
    });
}

function newMenu(anchor) {
    showMenu([
        { label: t('newRequest'), icon: 'code', shortcut: 'Ctrl+T', action: () => newTab() },
        { label: t('newCollection'), icon: 'collections', action: newCollection },
        { label: t('newEnvironment'), icon: 'environments', action: newEnvironment },
        '-',
        { label: t('openPHPFile'), icon: 'filePhp', shortcut: 'Ctrl+O', action: openFile }
    ], anchor);
}

function bindBus() {
    bus.on('action:newTab', () => newTab());
    bus.on('action:switchTab', switchTab);
    bus.on('action:closeTab', (id, options) => closeTab(id, options));
    bus.on('action:closeTabs', closeTabs);
    bus.on('action:duplicateTab', duplicateTab);
    bus.on('action:openRequest', openRequest);
    bus.on('action:openEnvironment', openEnvironment);
    bus.on('action:openDoc', openDoc);
    bus.on('action:newDocIn', newDocIn);
    bus.on('action:openHistory', openHistory);
    bus.on('action:saveHistory', id => {
        const tab = openHistory(id, { pin: true });
        if (tab) saveTab(tab);
    });
    bus.on('action:save', () => saveTab());
    bus.on('action:saveAs', () => saveTab(activeTab(), { saveAs: true }));
    bus.on('action:revert', revertTab);
    bus.on('action:reveal', id => revealNode(id));
    bus.on('action:run', options => run(options || {}));
    bus.on('run:cancel', cancelRun);
    bus.on('route:preview', params => run({ previewParams: params }));
    bus.on('response:clear', () => {
        const tab = activeTab();
        if (!tab || tab.type !== 'request') return;
        tab.response = null;
        clearRuntimeError(tab.id);
        persist();
        renderResponse(tab);
    });
    bus.on('action:pickProject', pickProject);
    bus.on('action:setProject', setProject);
    bus.on('action:reindex', reindex);
    bus.on('action:openFile', openFile);
    bus.on('action:newCollection', newCollection);
    bus.on('action:newRequestIn', newRequestIn);
    bus.on('action:newFolderIn', newFolderIn);
    bus.on('action:duplicateNode', duplicateNode);
    bus.on('action:deleteNode', deleteNode);
    bus.on('action:exportCollection', exportCollection);
    bus.on('action:import', openImport);
    bus.on('action:newEnvironment', newEnvironment);
    bus.on('action:showSidebar', showSidebar);
    bus.on('action:clearHistory', clearHistory);
    bus.on('action:toggleTerminal', () => toggleTerminal());
    bus.on('action:toggleSidebar', toggleSidebar);
    bus.on('action:toggleLayout', toggleLayout);
    bus.on('action:setLayout', setLayout);
    bus.on('action:settings', openSettings);
    bus.on('action:shortcuts', shortcutsDialog);
    bus.on('env:delete', deleteEnvironment);
    bus.on('env:duplicate', duplicateEnvironment);
    bus.on('env:export', exportEnvironment);
    bus.on('environments:changed', options => {
        renderEnvironmentSelect();
        renderTabs();
        if (state.ui.sidebarView === 'environments') renderSidebar();
        const tab = activeTab();
        if (tab?.type === 'environment' && !options?.fromTable) renderEnvironment(state.environments.find(e => e.id === tab.envId));
        refreshEnvironmentDecorations();
        refreshVariableIssues();
        renderStatusbar();
    });
    bus.on('tab:edited', tab => {
        updateTab(tab);
        if (tab.type === 'doc') refreshDocDirty(tab);
        else refreshDirty(tab);
    });
    bus.on('tree:renamed', node => {
        for (const tab of state.tabs) {
            if (tab.requestId === node.id && !isDirty({ ...tab, name: node.name })) tab.name = node.name;
            if (tab.type === 'doc' && tab.docId === node.id) tab.name = node.name;
        }
        renderTabs();
        const tab = activeTab();
        if (tab?.type === 'doc') renderDoc(tab);
        else if (tab) refreshDirty(tab);
    });
    bus.on('tree:moved', () => {
        const tab = activeTab();
        if (tab?.type === 'request') renderRequest(tab);
        else if (tab?.type === 'doc') renderDoc(tab);
    });
    bus.on('tree:changed', () => renderSidebar());
    bus.on('index', event => {
        if (event.status === 'error' && event.project === activeProject()) toast(event.error?.message || t('indexFailed'), 'error');
        renderStatusbar();
    });
    bus.on('persist', status => {
        if (!els.sbSave || running) return;
        els.sbSave.textContent = status === 'error' ? t('saveError') : '';
        els.sbSave.classList.toggle('error', status === 'error');
    });
    bus.on('cursor', (position, selection) => {
        if (!els.sbCursor || !position) return;
        let text = t('cursorPosition', { line: position.lineNumber, column: position.column });
        if (selection && !selection.isEmpty()) {
            const lines = selection.endLineNumber - selection.startLineNumber + 1;
            text += ` (${t('selectedLines', { count: lines })})`;
        }
        els.sbCursor.textContent = text;
    });
    bus.on('layout', () => setTimeout(() => { layoutEditor(); layoutResponse(); renderStatusbar(); }, 10));
    bus.on('action:toggleTheme', toggleTheme);
    bus.on('theme', () => {
        renderThemeButton();
        applyEditorTheme();
        applyTerminalTheme();
        const tab = activeTab();
        if (tab?.type === 'request') renderResponse(tab);
    });
}

function bindKeys() {
    document.addEventListener('keydown', event => {
        if (document.querySelector('.modal-backdrop, .palette-backdrop')) return;
        const ctrl = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const inEditor = !!document.activeElement?.closest('.monaco-editor');
        const stop = () => {
            event.preventDefault();
            event.stopPropagation();
        };
        if (ctrl && key === 'enter') {
            stop();
            if (running) return;
            run({ full: event.shiftKey });
        } else if (ctrl && key === 's') {
            stop();
            saveTab(activeTab(), { saveAs: event.shiftKey });
        } else if (ctrl && !event.shiftKey && (key === 't' || key === 'n')) {
            stop();
            newTab();
        } else if (ctrl && key === 'w') {
            stop();
            if (state.activeTabId) closeTab(state.activeTabId);
        } else if (ctrl && (key === 'tab' || key === 'pagedown' || key === 'pageup')) {
            stop();
            cycleTab(key === 'pageup' || (key === 'tab' && event.shiftKey) ? -1 : 1);
        } else if (ctrl && key === 'p') {
            stop();
            openPalette(event.shiftKey ? '>' : '');
        } else if (ctrl && key === 'k' && !inEditor) {
            stop();
            openPalette();
        } else if (ctrl && key === 'o') {
            stop();
            openFile();
        } else if (ctrl && key === '\\') {
            stop();
            toggleSidebar();
        } else if (ctrl && event.code === 'Backquote') {
            stop();
            toggleTerminal();
        } else if (ctrl && event.altKey && key === 'l') {
            stop();
            toggleLayout();
        } else if (ctrl && key === ',') {
            stop();
            openSettings();
        }
    }, true);
}

async function boot() {
    const monacoPromise = loadMonaco();
    await loadState();
    state.language = await setLanguage(state.language);
    buildShell();
    bindBus();
    applyTheme();
    bindKeys();
    renderAll();
    $('#app').classList.add('ready');
    window.addEventListener('beforeunload', persistBeacon);
    window.addEventListener('focus', () => refreshIndex(activeProject()));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIndex(activeProject()); });
    window.GoTinkerRequestTerminal = () => toggleTerminal(true);
    const project = activeProject();
    if (project) refreshProject(project);
    else api('/api/status').then(s => { dataDir = s.dataDir || ''; }).catch(() => {});
    try {
        const monaco = await monacoPromise;
        initEditor(els.codeHost);
        attachMonaco(monaco);
        monacoReady = true;
        editorReady();
        const tab = activeTab();
        if (tab?.type === 'request') {
            showTab(tab);
            if (tab.response?.errorLine) setRuntimeError(tab.id, tab.response.errorLine + (tab.lastRunOffset || 0), tab.response.error);
        }
    } catch (error) {
        toast(t('editorFailed') + ': ' + error.message, 'error');
    }
}

boot();
