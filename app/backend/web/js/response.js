import { ansiToHtml, stripAnsi } from './ansi.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { persist, state } from './store.js';
import { $, byteLength, bus, formatBytes, formatDuration, h, shortClass } from './util.js';
import { toast, showMenu } from './ui.js';
import { monacoTheme } from './theme.js';

let monaco = null;
let viewer = null;
let root = null;
let currentTab = null;
let frameKey = '';
const els = {};

export function initResponse(container) {
    root = container;
    root.innerHTML = `
        <div class="res-head">
            <div class="res-tabs" role="tablist">
                <button class="res-tab" data-res="body" type="button" data-i18n="body">Body</button>
                <button class="res-tab" data-res="output" type="button" data-i18n="output">Output</button>
            </div>
            <div class="res-meta" id="resMeta"></div>
            <div class="res-actions">
                <div class="layout-switch" role="group">
                    <button class="icon-btn" id="resLayoutBelow" type="button" data-layout="stacked" data-i18n-title="responseBelow">${icon('layoutStacked')}</button>
                    <button class="icon-btn" id="resLayoutSide" type="button" data-layout="side" data-i18n-title="responseSide">${icon('layoutSide')}</button>
                </div>
                <button class="icon-btn" id="resMoreBtn" type="button" data-i18n-title="moreActions">${icon('more')}</button>
            </div>
        </div>
        <div class="res-toolbar" id="resToolbar">
            <div class="segmented" id="bodyModes">
                <button type="button" data-mode="pretty" data-i18n="pretty">Pretty</button>
                <button type="button" data-mode="raw" data-i18n="raw">Raw</button>
                <button type="button" data-mode="preview" data-i18n="preview">Preview</button>
            </div>
            <span class="format-label" id="formatLabel"></span>
            <span class="spacer"></span>
            <button class="icon-btn" id="resWrapBtn" type="button" data-i18n-title="wordWrap">${icon('wrap')}</button>
            <button class="icon-btn" id="resSearchBtn" type="button" data-i18n-title="search">${icon('search')}</button>
            <button class="icon-btn" id="resCopyBtn" type="button" data-i18n-title="copyResponse">${icon('copy')}</button>
        </div>
        <div class="res-body">
            <div class="res-viewer" id="resViewer"></div>
            <div class="res-ansi-wrap" id="resAnsiWrap"><pre class="res-ansi" id="resAnsi"></pre></div>
            <div class="res-preview" id="resPreview">
                <form class="route-bar" id="routeForm" hidden>
                    <span class="route-method" id="routeMethod"></span>
                    <span class="route-path" id="routePath"></span>
                    <div class="route-params" id="routeParams"></div>
                    <button class="btn btn-primary btn-sm" id="routeSend" type="submit" data-i18n="generate">Generate</button>
                </form>
                <iframe id="resFrame" title="Preview" sandbox="allow-forms allow-scripts allow-downloads" referrerpolicy="no-referrer"></iframe>
                <div class="res-preview-empty" id="resPreviewEmpty"></div>
            </div>
            <div class="res-empty" id="resEmpty">
                <div class="res-empty-art">${icon('send')}</div>
                <div class="res-empty-text" data-i18n="responseEmpty">Click Send to get a response</div>
                <div class="res-empty-hint"><kbd>Ctrl</kbd><span>+</span><kbd>Enter</kbd></div>
            </div>
            <div class="res-loading" id="resLoading" hidden>
                <div class="spinner"></div>
                <div class="res-loading-text" data-i18n="sendingRequest">Sending request…</div>
                <button class="btn btn-sm" id="resCancelBtn" type="button" data-i18n="cancel">Cancel</button>
            </div>
        </div>`;
    for (const id of ['resMeta', 'resToolbar', 'bodyModes', 'formatLabel', 'resViewer', 'resAnsiWrap', 'resAnsi', 'resPreview', 'routeForm', 'routeMethod', 'routePath', 'routeParams', 'routeSend', 'resFrame', 'resPreviewEmpty', 'resEmpty', 'resLoading', 'resWrapBtn', 'resSearchBtn', 'resCopyBtn', 'resMoreBtn', 'resCancelBtn']) els[id] = $('#' + id, root);
    root.querySelectorAll('.res-tab').forEach(button => button.addEventListener('click', () => {
        if (!currentTab) return;
        currentTab.resView = button.dataset.res;
        persist();
        renderResponse(currentTab);
    }));
    els.bodyModes.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        if (!currentTab) return;
        currentTab.bodyMode = button.dataset.mode;
        persist();
        renderResponse(currentTab);
    }));
    els.resWrapBtn.addEventListener('click', () => {
        state.ui.responseWrap = !state.ui.responseWrap;
        persist();
        applyWrap();
    });
    els.resSearchBtn.addEventListener('click', () => {
        if (!viewer || els.resViewer.hidden) return;
        viewer.focus();
        viewer.getAction('actions.find')?.run();
    });
    root.querySelectorAll('.layout-switch [data-layout]').forEach(button => button.addEventListener('click', () => bus.emit('action:setLayout', button.dataset.layout)));
    updateLayoutButtons();
    els.resCopyBtn.addEventListener('click', copyResponse);
    els.resCancelBtn.addEventListener('click', () => bus.emit('run:cancel'));
    els.resMoreBtn.addEventListener('click', () => showMenu([
        { label: t('copyResponse'), icon: 'copy', action: copyResponse },
        { label: t('saveResponseFile'), icon: 'download', action: downloadResponse, disabled: !currentTab?.response },
        '-',
        { label: t('clearResponse'), icon: 'ban', action: () => bus.emit('response:clear'), disabled: !currentTab?.response }
    ], els.resMoreBtn, { align: 'right' }));
    els.routeForm.addEventListener('submit', event => {
        event.preventDefault();
        const params = {};
        els.routeParams.querySelectorAll('input[data-param]').forEach(input => { params[input.dataset.param] = input.value.trim(); });
        bus.emit('route:preview', params);
    });
}

export function attachMonaco(instance) {
    monaco = instance;
    viewer = monaco.editor.create(els.resViewer, {
        value: '', language: 'json', theme: monacoTheme(), readOnly: true, domReadOnly: false, automaticLayout: true,
        minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "Consolas, 'Courier New', monospace", fontSize: 13, lineHeight: 18,
        folding: true, showFoldingControls: 'always', renderLineHighlight: 'none', lineNumbersMinChars: 3, wordWrap: state.ui.responseWrap ? 'on' : 'off',
        stickyScroll: { enabled: false }, contextmenu: true, padding: { top: 6 }, scrollbar: { useShadows: false, verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
        guides: { indentation: true }, bracketPairColorization: { enabled: true }, occurrencesHighlight: 'off', selectionHighlight: true
    });
    if (currentTab) renderResponse(currentTab);
}

function applyWrap() {
    els.resWrapBtn.classList.toggle('active', !!state.ui.responseWrap);
    viewer?.updateOptions({ wordWrap: state.ui.responseWrap ? 'on' : 'off' });
    els.resAnsi.classList.toggle('wrap', !!state.ui.responseWrap);
}

function bodyText(tab) {
    const r = tab.response;
    if (!r) return '';
    if (tab.resView === 'output') return stripAnsi(r.output);
    if (tab.bodyMode === 'raw') return r.json ? JSON.stringify(safeParse(r.json)) ?? r.json : stripAnsi(r.output);
    return r.json || stripAnsi(r.output);
}

function safeParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

async function copyResponse() {
    if (!currentTab?.response) return;
    try {
        await navigator.clipboard.writeText(bodyText(currentTab));
        toast(t('responseCopied'), 'success');
    } catch {
        toast(t('copyFailed'), 'error');
    }
}

function downloadResponse() {
    const r = currentTab?.response;
    if (!r) return;
    const json = !!r.json;
    const blob = new Blob([json ? r.json : stripAnsi(r.output)], { type: json ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `${(currentTab.name || 'response').replace(/[<>:"/\\|?*]/g, '_')}.${json ? 'json' : 'txt'}` });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function setViewerValue(text, language) {
    if (!viewer) return;
    const model = viewer.getModel();
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
    if (model.getValue() !== text) {
        viewer.setValue(text);
        viewer.setScrollTop(0);
    }
}

function renderMeta(tab) {
    const r = tab.response;
    if (!r) {
        els.resMeta.innerHTML = '';
        return;
    }
    const size = byteLength(r.json || r.output);
    const status = r.ok ? `<span class="status-pill ok">${t('statusOk')}</span>` : `<span class="status-pill error" title="${(r.error || '').replace(/"/g, '&quot;')}">${t('statusError')}</span>`;
    const http = r.previewStatus ? `<span class="meta-item"><span class="meta-label">HTTP</span><span class="meta-value ${r.previewStatus < 400 ? 'ok' : 'error'}">${r.previewStatus}</span></span>` : '';
    const type = r.resultType ? `<span class="meta-item meta-type" title="${r.resultType.replace(/"/g, '&quot;')}"><span class="meta-label">${t('type')}</span><span class="meta-value">${shortClass(r.resultType).replace(/</g, '&lt;')}</span></span>` : '';
    els.resMeta.innerHTML = `${status}${http}
        <span class="meta-item"><span class="meta-label">${t('time')}</span><span class="meta-value">${formatDuration(r.durationMs)}</span></span>
        <span class="meta-item"><span class="meta-label">${t('size')}</span><span class="meta-value">${formatBytes(size)}</span></span>
        ${r.memoryBytes ? `<span class="meta-item meta-mem"><span class="meta-label">${t('memory')}</span><span class="meta-value">${formatBytes(r.memoryBytes)}</span></span>` : ''}
        ${type}`;
}

function renderPreview(tab) {
    const r = tab.response;
    const route = r?.previewRoute;
    els.routeForm.hidden = !route;
    if (route) {
        els.routeMethod.textContent = route.method;
        els.routePath.textContent = '/' + String(route.uri || '').replace(/^\//, '');
        els.routeParams.innerHTML = '';
        for (const param of route.parameters || []) {
            const input = h('input', { class: 'input input-sm', 'data-param': param.name, placeholder: param.name + (param.optional ? '?' : ''), value: tab.previewParams?.[param.name] || '' });
            els.routeParams.append(input);
        }
        els.routeSend.disabled = route.method !== 'GET';
    }
    if (r?.previewData && r.previewMime) {
        const key = `${tab.id}:${r.at}:data:${r.previewData.length}`;
        if (frameKey !== key) {
            els.resFrame.removeAttribute('srcdoc');
            els.resFrame.src = `data:${r.previewMime};base64,${r.previewData}`;
            frameKey = key;
        }
        els.resFrame.hidden = false;
        els.resPreviewEmpty.hidden = true;
        return;
    }
    if (r?.previewHtml) {
        const key = `${tab.id}:${r.at}:html:${r.previewHtml.length}`;
        if (frameKey !== key) {
            els.resFrame.removeAttribute('src');
            els.resFrame.srcdoc = r.previewHtml;
            frameKey = key;
        }
        els.resFrame.hidden = false;
        els.resPreviewEmpty.hidden = true;
        return;
    }
    if (frameKey) {
        els.resFrame.removeAttribute('src');
        els.resFrame.srcdoc = '';
        frameKey = '';
    }
    els.resFrame.hidden = true;
    els.resPreviewEmpty.hidden = false;
    els.resPreviewEmpty.textContent = route ? (route.missing?.length ? t('routeMissing', { params: route.missing.join(', ') }) : t('routeReady')) : t('previewEmpty');
}

export function renderResponse(tab) {
    currentTab = tab;
    if (!root || !tab) return;
    const r = tab.response;
    root.querySelectorAll('.res-tab').forEach(b => b.classList.toggle('active', b.dataset.res === tab.resView));
    els.bodyModes.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === tab.bodyMode));
    renderMeta(tab);
    applyWrap();
    els.resEmpty.hidden = !!r;
    els.resToolbar.classList.toggle('disabled', !r);
    const showBody = tab.resView === 'body';
    els.bodyModes.hidden = !showBody;
    els.formatLabel.textContent = !r ? '' : tab.resView === 'output' ? 'Dump' : tab.bodyMode === 'preview' ? 'HTML' : r.json ? 'JSON' : 'Text';
    els.resViewer.hidden = true;
    els.resAnsiWrap.hidden = true;
    els.resPreview.hidden = true;
    if (!r) return;
    if (!showBody) {
        els.resAnsi.innerHTML = r.output ? ansiToHtml(r.output) : `<span class="muted">${t('noOutput')}</span>`;
        els.resAnsiWrap.hidden = false;
        return;
    }
    if (tab.bodyMode === 'preview') {
        els.resPreview.hidden = false;
        renderPreview(tab);
        return;
    }
    if (tab.bodyMode === 'pretty' && !r.json) {
        els.resAnsi.innerHTML = r.output ? ansiToHtml(r.output) : `<span class="muted">${t('noReturn')}</span>`;
        els.resAnsiWrap.hidden = false;
        return;
    }
    els.resViewer.hidden = false;
    if (tab.bodyMode === 'raw') setViewerValue(r.json ? (JSON.stringify(safeParse(r.json)) ?? r.json) : stripAnsi(r.output), r.json ? 'json' : 'plaintext');
    else setViewerValue(r.json, 'json');
    requestAnimationFrame(() => viewer?.layout());
}

export function updateLayoutButtons() {
    root?.querySelectorAll('.layout-switch [data-layout]').forEach(button => button.classList.toggle('active', button.dataset.layout === (state.ui.layout === 'side' ? 'side' : 'stacked')));
}

export function setLoading(loading) {
    if (!els.resLoading) return;
    els.resLoading.hidden = !loading;
    root.classList.toggle('loading', loading);
}

export function layoutResponse() {
    viewer?.layout();
}
