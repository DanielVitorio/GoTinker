import { api } from './api.js';
import { LANGUAGE_ID, registerPhp } from './php.js';
import { registerIntellisense, setContextProvider } from './intellisense.js';
import { activeEnvironment, persist, publicVariableNames, state, variableKey } from './store.js';
import { bus, debounce } from './util.js';
import { monacoTheme } from './theme.js';

let monaco = null;
let editor = null;
let loadPromise = null;
const models = new Map();
const viewStates = new Map();
const envDecorations = new Map();
let currentTabId = '';
let suppressChange = false;

export function loadMonaco() {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
        window.MonacoEnvironment = { getWorkerUrl: () => '/vendor/monaco/vs/base/worker/workerMain.js' };
        window.require.config({ paths: { vs: '/vendor/monaco/vs' } });
        window.require(['vs/editor/editor.main'], () => {
            monaco = window.monaco;
            registerPhp(monaco);
            registerIntellisense(monaco);
            resolve(monaco);
        }, reject);
    });
    return loadPromise;
}

export function getMonaco() {
    return monaco;
}

export function environmentMap() {
    const env = {};
    for (const v of activeEnvironment()?.variables || []) if (v.enabled && v.key) env[v.key] = v.value;
    return env;
}

function tabForModel(model) {
    for (const [tabId, m] of models) if (m === model) return state.tabs.find(t => t.id === tabId) || null;
    return null;
}

export function editorOptions() {
    const ui = state.ui;
    return {
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: ui.fontSize || 14,
        lineHeight: Math.round((ui.fontSize || 14) * 1.36),
        minimap: { enabled: !!ui.minimap },
        wordWrap: ui.wordWrap || 'off',
        automaticLayout: true,
        scrollBeyondLastLine: true,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true, bracketPairs: false },
        stickyScroll: { enabled: true },
        smoothScrolling: false,
        cursorBlinking: 'blink',
        cursorSmoothCaretAnimation: 'off',
        tabSize: 4,
        insertSpaces: true,
        detectIndentation: false,
        fixedOverflowWidgets: true,
        quickSuggestions: { other: true, comments: false, strings: true },
        quickSuggestionsDelay: 10,
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        wordBasedSuggestions: 'off',
        suggestSelection: 'first',
        suggest: { showStatusBar: false, preview: false, showInlineDetails: true, insertMode: 'replace', localityBonus: true, snippetsPreventQuickSuggestions: false },
        parameterHints: { enabled: true, cycle: true },
        hover: { enabled: true, delay: 300 },
        mouseWheelZoom: true,
        contextmenu: true,
        padding: { top: 6 },
        'semanticHighlighting.enabled': false,
        renderLineHighlight: 'line',
        occurrencesHighlight: 'singleFile',
        matchBrackets: 'always',
        folding: true,
        showFoldingControls: 'mouseover',
        lineNumbersMinChars: 3,
        scrollbar: { verticalScrollbarSize: 14, horizontalScrollbarSize: 12, useShadows: false }
    };
}

export function initEditor(host) {
    editor = monaco.editor.create(host, { ...editorOptions(), model: null, theme: monacoTheme(), language: LANGUAGE_ID });
    setContextProvider(model => {
        const tab = tabForModel(model);
        return {
            project: tab?.project || state.lastProject || '',
            variables: (tab?.variables || []).filter(v => v.enabled && v.key).map(v => variableKey(v.key)),
            publicVariables: [...publicVariableNames().keys()],
            env: environmentMap()
        };
    });
    editor.onDidChangeCursorPosition(event => bus.emit('cursor', event.position, editor.getSelection()));
    editor.onDidChangeCursorSelection(() => bus.emit('cursor', editor.getPosition(), editor.getSelection()));
    editor.onDidChangeModel(() => bus.emit('cursor', editor.getPosition(), editor.getSelection()));
    return editor;
}

export function getEditor() {
    return editor;
}

const lintModel = debounce(async (tabId) => {
    const model = models.get(tabId);
    if (!model || model.isDisposed() || !state.ui.lint) return;
    const version = model.getVersionId();
    try {
        const env = environmentMap();
        const code = model.getValue().replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => Object.prototype.hasOwnProperty.call(env, key) ? String(env[key]).replace(/[\r\n]+/g, ' ') : '0');
        const result = await api('/api/lint', { body: { code } });
        if (model.isDisposed() || model.getVersionId() !== version) return;
        monaco.editor.setModelMarkers(model, 'php', (result?.errors || []).map(error => {
            const line = Math.min(Math.max(1, error.line), model.getLineCount());
            return {
                severity: monaco.MarkerSeverity.Error, message: error.message, source: 'php -l',
                startLineNumber: line, startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
                endLineNumber: line, endColumn: model.getLineMaxColumn(line)
            };
        }));
    } catch {}
}, 700);

function updateEnvDecorations(tabId) {
    const model = models.get(tabId);
    if (!model || model.isDisposed()) return;
    const env = environmentMap();
    const decorations = [];
    const matches = model.findMatches('\\{\\{\\s*([\\w.\\-]+)\\s*\\}\\}', false, true, true, null, true);
    for (const match of matches) {
        const key = match.matches?.[1];
        const known = Object.prototype.hasOwnProperty.call(env, key);
        decorations.push({ range: match.range, options: { inlineClassName: known ? 'env-known' : 'env-missing' } });
    }
    envDecorations.set(tabId, model.deltaDecorations(envDecorations.get(tabId) || [], decorations));
}

export function refreshEnvironmentDecorations() {
    for (const tabId of models.keys()) updateEnvDecorations(tabId);
    if (currentTabId) lintModel(currentTabId);
}

function ensureModel(tab) {
    let model = models.get(tab.id);
    if (model && !model.isDisposed()) return model;
    model = monaco.editor.createModel(tab.code || '', LANGUAGE_ID, monaco.Uri.parse(`inmemory://gotinker/${tab.id}.php`));
    model.updateOptions({ tabSize: 4, insertSpaces: true });
    model.onDidChangeContent(() => {
        if (suppressChange) return;
        const current = state.tabs.find(t => t.id === tab.id);
        if (!current) return;
        current.code = model.getValue();
        current.preview = false;
        monaco.editor.setModelMarkers(model, 'runtime', []);
        bus.emit('tab:edited', current);
        persist();
        lintModel(tab.id);
        updateEnvDecorations(tab.id);
    });
    models.set(tab.id, model);
    updateEnvDecorations(tab.id);
    lintModel(tab.id);
    return model;
}

export function showTab(tab) {
    if (!editor) return;
    if (currentTabId && models.has(currentTabId)) viewStates.set(currentTabId, editor.saveViewState());
    const model = ensureModel(tab);
    if (model.getValue() !== tab.code) setModelValue(tab.id, tab.code);
    editor.setModel(model);
    const view = viewStates.get(tab.id);
    if (view) editor.restoreViewState(view);
    currentTabId = tab.id;
    editor.updateOptions({ readOnly: false });
}

export function setModelValue(tabId, code) {
    const model = models.get(tabId);
    if (!model) return;
    suppressChange = true;
    try {
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: code }], () => null);
    } finally {
        suppressChange = false;
    }
    updateEnvDecorations(tabId);
    lintModel(tabId);
}

export function disposeTab(tabId) {
    const model = models.get(tabId);
    if (model) {
        if (editor?.getModel() === model) editor.setModel(null);
        model.dispose();
    }
    models.delete(tabId);
    viewStates.delete(tabId);
    envDecorations.delete(tabId);
    if (currentTabId === tabId) currentTabId = '';
}

export function hasSelection() {
    const selection = editor?.getModel() ? editor.getSelection() : null;
    return !!selection && !selection.isEmpty();
}

export function runSelection(useSelection = !!editor?.hasTextFocus()) {
    const model = editor?.getModel();
    if (!model) return null;
    const selection = editor.getSelection();
    if (useSelection && selection && !selection.isEmpty()) {
        return { code: model.getValueInRange(selection), lineOffset: selection.startLineNumber - 1, selection: true };
    }
    return { code: model.getValue(), lineOffset: 0, selection: false };
}

export function setRuntimeError(tabId, line, message) {
    const model = models.get(tabId);
    if (!model || !line || line > model.getLineCount()) return;
    monaco.editor.setModelMarkers(model, 'runtime', [{
        severity: monaco.MarkerSeverity.Error, message, source: 'runtime',
        startLineNumber: line, startColumn: model.getLineFirstNonWhitespaceColumn(line) || 1,
        endLineNumber: line, endColumn: model.getLineMaxColumn(line)
    }]);
}

export function clearRuntimeError(tabId) {
    const model = models.get(tabId);
    if (model) monaco.editor.setModelMarkers(model, 'runtime', []);
}

export function focusEditor() {
    editor?.focus();
}

export function applyEditorSettings() {
    editor?.updateOptions(editorOptions());
}

export function applyEditorTheme() {
    monaco?.editor.setTheme(monacoTheme());
}

export function editorAction(id) {
    editor?.focus();
    editor?.getAction(id)?.run();
}

export function insertText(text) {
    if (!editor) return;
    const selection = editor.getSelection();
    editor.executeEdits('gotinker', [{ range: selection, text, forceMoveMarkers: true }]);
    editor.focus();
}

export function layoutEditor() {
    editor?.layout();
}
