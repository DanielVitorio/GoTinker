import { api } from './api.js';
import { bus, debounce, nowISO, uid } from './util.js';

function defaultUI() {
    return {
        sidebarView: 'collections', sidebarWidth: 300, sidebarHidden: false, layout: 'stacked', split: 50,
        terminalOpen: false, terminalHeight: 260, fontSize: 14, minimap: true, wordWrap: 'off', responseWrap: true, lint: true, theme: 'dark'
    };
}

function defaults() {
    return {
        version: 4, language: 'pt-BR', lastProject: '', recentProjects: [], collections: [], environments: [],
        activeEnvironmentId: '', history: [], tabs: [], activeTabId: '', ui: defaultUI(), terminalSessions: [], activeTerminalSessionId: ''
    };
}

export const state = defaults();

export function newRequestNode(seed = {}) {
    const time = nowISO();
    return {
        id: uid('req'), type: 'request', name: seed.name || 'New Request', description: seed.description || '', code: seed.code || '',
        variables: normalizeVariables(seed.variables), project: seed.project || '', createdAt: time, updatedAt: time
    };
}

export function newDocNode(seed = {}) {
    const time = nowISO();
    return { id: uid('doc'), type: 'doc', name: seed.name || 'Description', content: seed.content || '', createdAt: time, updatedAt: time };
}

export function newDocTab(doc, seed = {}) {
    return { id: uid('tab'), type: 'doc', docId: doc.id, name: doc.name, content: doc.content, preview: false, ...seed };
}

export function newFolderNode(type, name) {
    return { id: uid(type === 'collection' ? 'col' : 'fld'), type, name, description: '', expanded: true, items: [] };
}

export function newRequestTab(seed = {}) {
    return {
        id: uid('tab'), type: 'request', requestId: '', name: seed.name || '', code: '', description: '', variables: [],
        project: state.lastProject || '', filePath: '', savedCode: '', response: null, preview: false,
        reqView: 'code', resView: 'body', bodyMode: 'pretty', previewParams: {}, ...seed
    };
}

export function normalizeVariables(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(v => v && typeof v === 'object').map(v => ({
        key: String(v.key ?? ''), value: String(v.value ?? ''), description: String(v.description ?? ''), enabled: v.enabled !== false
    })).filter(v => v.key || v.value || v.description);
}

function normalizeResponse(r) {
    if (!r || typeof r !== 'object') return null;
    return {
        ok: !!r.ok, output: String(r.output || ''), json: String(r.json || ''), resultType: String(r.resultType || ''),
        durationMs: Number(r.durationMs || 0), memoryBytes: Number(r.memoryBytes || 0), exitCode: Number(r.exitCode || 0),
        error: String(r.error || ''), errorLine: Number(r.errorLine || 0), previewHtml: String(r.previewHtml || ''),
        previewData: String(r.previewData || ''), previewMime: String(r.previewMime || ''), previewStatus: Number(r.previewStatus || 0),
        previewRoute: r.previewRoute && typeof r.previewRoute === 'object' ? r.previewRoute : null, at: String(r.at || '')
    };
}

function normalizeNode(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'request') {
        return {
            id: String(node.id || uid('req')), type: 'request', name: String(node.name || 'Request'), description: String(node.description || ''),
            code: String(node.code || ''), variables: normalizeVariables(node.variables), project: String(node.project || ''),
            createdAt: String(node.createdAt || nowISO()), updatedAt: String(node.updatedAt || nowISO())
        };
    }
    if (node.type === 'doc') {
        return {
            id: String(node.id || uid('doc')), type: 'doc', name: String(node.name || 'Description'), content: String(node.content || ''),
            createdAt: String(node.createdAt || nowISO()), updatedAt: String(node.updatedAt || nowISO())
        };
    }
    const type = node.type === 'collection' ? 'collection' : 'folder';
    return {
        id: String(node.id || uid(type === 'collection' ? 'col' : 'fld')), type, name: String(node.name || (type === 'collection' ? 'Collection' : 'Folder')),
        description: String(node.description || ''), expanded: node.expanded !== false,
        items: (Array.isArray(node.items) ? node.items : []).map(normalizeNode).filter(Boolean).map(child => child.type === 'collection' ? { ...child, type: 'folder' } : child)
    };
}

function migrateLegacy(raw) {
    const s = defaults();
    s.language = raw.language || 'pt-BR';
    s.lastProject = raw.lastProject || '';
    const folders = Array.isArray(raw.snippetFolders) ? raw.snippetFolders.filter(f => f && f.id) : [];
    const snippets = Array.isArray(raw.snippets) ? raw.snippets.filter(Boolean) : [];
    const toRequest = sn => ({
        id: sn.id || uid('req'), type: 'request', name: sn.name || 'Snippet', code: String(sn.code || ''), description: String(sn.annotation || ''),
        variables: [], project: String(sn.project || ''), createdAt: sn.createdAt || nowISO(), updatedAt: sn.updatedAt || nowISO()
    });
    const known = new Set(folders.map(f => f.id));
    const build = folder => ({
        id: folder.id, type: 'folder', name: folder.name || 'Folder', description: '', expanded: false,
        items: [
            ...folders.filter(f => f.parentId === folder.id).map(build),
            ...snippets.filter(sn => sn.folderId === folder.id).map(toRequest)
        ]
    });
    for (const root of folders.filter(f => !f.parentId || !known.has(f.parentId))) s.collections.push({ ...build(root), type: 'collection' });
    const loose = snippets.filter(sn => !sn.folderId || !known.has(sn.folderId)).map(toRequest);
    if (loose.length) s.collections.unshift({ id: uid('col'), type: 'collection', name: 'Go Tinker', description: '', expanded: true, items: loose });
    const responseFrom = item => (item.output || item.json || item.previewHtml || item.previewData) ? {
        ok: item.ok !== false, output: item.output, json: item.json, resultType: item.resultType, durationMs: item.durationMs, error: item.error,
        previewHtml: item.previewHtml, previewData: item.previewData, previewMime: item.previewMime, previewRoute: item.previewRoute, at: item.createdAt || item.updatedAt
    } : null;
    s.history = (Array.isArray(raw.history) ? raw.history : []).filter(Boolean).map(item => ({
        id: item.id || uid('run'), name: item.title || '', code: String(item.code || ''), variables: [], project: String(item.project || ''),
        requestId: '', response: responseFrom(item), createdAt: item.createdAt || nowISO()
    }));
    const requestIds = new Set(snippets.map(sn => sn.id));
    s.tabs = (Array.isArray(raw.tabs) ? raw.tabs : []).filter(Boolean).map(tab => ({
        id: tab.id || uid('tab'), type: 'request', requestId: tab.snippetId && requestIds.has(tab.snippetId) ? tab.snippetId : '',
        name: tab.title || '', code: String(tab.code || ''), description: String(tab.snippetAnnotation || ''), variables: [],
        project: String(tab.project || s.lastProject || ''), filePath: String(tab.filePath || ''), savedCode: tab.filePath ? String(tab.code || '') : '',
        response: responseFrom(tab), previewParams: tab.previewParams || {}
    }));
    s.activeTabId = raw.activeTabId || '';
    s.terminalSessions = Array.isArray(raw.terminalSessions) ? raw.terminalSessions : [];
    s.activeTerminalSessionId = raw.activeTerminalSessionId || '';
    if (raw.sshConnections) s.sshConnections = raw.sshConnections;
    return s;
}

function normalize(raw) {
    const base = !raw || typeof raw !== 'object' ? defaults() : (Number(raw.version || 1) < 4 ? migrateLegacy(raw) : { ...defaults(), ...raw });
    base.version = 4;
    base.ui = { ...defaultUI(), ...(base.ui && typeof base.ui === 'object' ? base.ui : {}) };
    base.collections = (Array.isArray(base.collections) ? base.collections : []).map(normalizeNode).filter(Boolean).map(c => ({ ...c, type: 'collection' }));
    base.environments = (Array.isArray(base.environments) ? base.environments : []).filter(e => e && typeof e === 'object').map(e => ({
        id: String(e.id || uid('env')), name: String(e.name || 'Environment'), variables: normalizeVariables(e.variables)
    }));
    if (!base.environments.some(e => e.id === base.activeEnvironmentId)) base.activeEnvironmentId = '';
    base.recentProjects = (Array.isArray(base.recentProjects) ? base.recentProjects : []).filter(p => typeof p === 'string' && p).slice(0, 12);
    base.history = (Array.isArray(base.history) ? base.history : []).filter(Boolean).slice(0, 300).map(item => ({
        id: String(item.id || uid('run')), name: String(item.name || ''), code: String(item.code || ''), variables: normalizeVariables(item.variables),
        project: String(item.project || ''), requestId: String(item.requestId || ''), response: normalizeResponse(item.response), createdAt: String(item.createdAt || nowISO())
    }));
    base.tabs = (Array.isArray(base.tabs) ? base.tabs : []).filter(t => t && typeof t === 'object').map(t => {
        if (t.type === 'environment') return { id: String(t.id || uid('tab')), type: 'environment', envId: String(t.envId || ''), preview: !!t.preview };
        if (t.type === 'doc') {
            const doc = findIn(base.collections, String(t.docId || ''))?.node;
            if (doc?.type !== 'doc') return null;
            return { id: String(t.id || uid('tab')), type: 'doc', docId: doc.id, name: String(t.name ?? doc.name), content: String(t.content ?? doc.content), preview: !!t.preview };
        }
        return newRequestTab({
            id: String(t.id || uid('tab')), requestId: String(t.requestId || ''), name: String(t.name || ''), code: String(t.code || ''),
            description: String(t.description || ''), variables: normalizeVariables(t.variables), project: String(t.project || ''),
            filePath: String(t.filePath || ''), savedCode: String(t.savedCode || ''), response: normalizeResponse(t.response), preview: !!t.preview,
            reqView: ['code', 'variables', 'description'].includes(t.reqView) ? t.reqView : 'code',
            resView: ['body', 'output'].includes(t.resView) ? t.resView : 'body',
            bodyMode: ['pretty', 'raw', 'preview'].includes(t.bodyMode) ? t.bodyMode : 'pretty',
            previewParams: t.previewParams && typeof t.previewParams === 'object' ? t.previewParams : {}
        });
    }).filter(t => t && (t.type !== 'environment' || base.environments.some(e => e.id === t.envId)));
    for (const tab of base.tabs) {
        if (tab.type === 'request' && tab.requestId && !findIn(base.collections, tab.requestId)) tab.requestId = '';
    }
    if (!base.tabs.some(t => t.id === base.activeTabId)) base.activeTabId = base.tabs[0]?.id || '';
    base.terminalSessions = (Array.isArray(base.terminalSessions) ? base.terminalSessions : []).filter(s => s && typeof s.id === 'string')
        .map((s, i) => ({ id: s.id, name: String(s.name || `cmd ${i + 1}`), project: String(s.project || '') }));
    if (!base.terminalSessions.some(s => s.id === base.activeTerminalSessionId)) base.activeTerminalSessionId = base.terminalSessions[0]?.id || '';
    return base;
}

export async function loadState() {
    let raw = null;
    try {
        raw = await api('/api/state/load');
    } catch {}
    const next = normalize(raw);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, next);
    return state;
}

function trimText(text, limit) {
    text = String(text || '');
    return text.length > limit ? text.slice(0, limit) : text;
}

function trimResponse(response, small) {
    if (!response) return null;
    return {
        ...response,
        output: trimText(response.output, small ? 24000 : 400000),
        json: trimText(response.json, small ? 60000 : 1500000),
        previewHtml: small ? '' : trimText(response.previewHtml, 1500000),
        previewData: small || response.previewData.length > 1500000 ? '' : response.previewData
    };
}

export function serializeState() {
    return JSON.stringify({
        ...state,
        tabs: state.tabs.map(tab => tab.type === 'request' ? { ...tab, response: trimResponse(tab.response, false) } : tab),
        history: state.history.map(item => ({ ...item, response: trimResponse(item.response, true) }))
    });
}

const persistNow = async () => {
    bus.emit('persist', 'saving');
    try {
        await api('/api/state/save', { method: 'POST', body: JSON.parse(serializeState()) });
        bus.emit('persist', 'saved');
    } catch (error) {
        bus.emit('persist', 'error', error);
    }
};
const persistLater = debounce(persistNow, 600);

export function persist() {
    bus.emit('persist', 'pending');
    persistLater();
}

export function persistImmediately() {
    persistLater.cancel();
    return persistNow();
}

export function persistBeacon() {
    try {
        navigator.sendBeacon('/api/state/save', new Blob([serializeState()], { type: 'application/json' }));
    } catch {}
}

function findIn(list, id, parent = null, collection = null) {
    for (let index = 0; index < list.length; index++) {
        const node = list[index];
        const col = collection || node;
        if (node.id === id) return { node, parent, list, index, collection: col };
        if (node.items) {
            const found = findIn(node.items, id, node, col);
            if (found) return found;
        }
    }
    return null;
}

export function findNode(id) {
    return id ? findIn(state.collections, id) : null;
}

export function pathOf(id) {
    const path = [];
    const visit = (list, trail) => {
        for (const node of list) {
            if (node.id === id) {
                path.push(...trail, node);
                return true;
            }
            if (node.items && visit(node.items, [...trail, node])) return true;
        }
        return false;
    };
    visit(state.collections, []);
    return path;
}

export function removeNode(id) {
    const found = findNode(id);
    if (!found) return null;
    found.list.splice(found.index, 1);
    return found.node;
}

export function containsNode(ancestor, id) {
    if (!ancestor?.items) return false;
    return ancestor.items.some(child => child.id === id || containsNode(child, id));
}

export function insertNode(containerId, node, index = -1) {
    if (!containerId) {
        state.collections.splice(index < 0 ? state.collections.length : index, 0, node);
        return;
    }
    const container = findNode(containerId)?.node;
    if (!container?.items) return;
    container.items.splice(index < 0 ? container.items.length : index, 0, node);
    container.expanded = true;
}

export function cloneNode(node) {
    const copy = JSON.parse(JSON.stringify(node));
    const renew = n => {
        n.id = uid(n.type === 'request' ? 'req' : n.type === 'doc' ? 'doc' : n.type === 'collection' ? 'col' : 'fld');
        if (n.type === 'request' || n.type === 'doc') n.createdAt = n.updatedAt = nowISO();
        n.items?.forEach(renew);
    };
    renew(copy);
    return copy;
}

export function walkRequests(fn, list = state.collections, trail = []) {
    for (const node of list) {
        if (node.type === 'request') fn(node, trail);
        else walkRequests(fn, node.items || [], [...trail, node]);
    }
}

export function walkDocs(fn, list = state.collections, trail = []) {
    for (const node of list) {
        if (node.type === 'doc') fn(node, trail);
        else if (node.items) walkDocs(fn, node.items, [...trail, node]);
    }
}

export function countRequests(node) {
    if (node.type === 'request') return 1;
    return (node.items || []).reduce((sum, child) => sum + countRequests(child), 0);
}

export function activeTab() {
    return state.tabs.find(t => t.id === state.activeTabId) || null;
}

export function activeEnvironment() {
    return state.environments.find(e => e.id === state.activeEnvironmentId) || null;
}

export function variableKey(key) {
    return String(key || '').trim().replace(/^\$/, '');
}

export function publicVariableNames() {
    const env = activeEnvironment();
    const names = new Map();
    for (const v of env?.variables || []) {
        const key = variableKey(v.key);
        if (v.enabled && key && !names.has(key)) names.set(key, env.name);
    }
    return names;
}

function variablesSignature(list) {
    return JSON.stringify(normalizeVariables(list).map(v => [v.key, v.value, v.description, v.enabled]));
}

export function isDirty(tab) {
    if (tab?.type === 'doc') {
        const doc = findNode(tab.docId)?.node;
        return !!doc && (doc.name !== tab.name || doc.content !== tab.content);
    }
    if (!tab || tab.type !== 'request') return false;
    if (tab.filePath) return tab.code !== tab.savedCode;
    const request = tab.requestId ? findNode(tab.requestId)?.node : null;
    if (!request) return tab.code.trim() !== '' || normalizeVariables(tab.variables).length > 0 || tab.description.trim() !== '';
    return request.name !== tab.name || request.code !== tab.code || request.description !== tab.description
        || variablesSignature(request.variables) !== variablesSignature(tab.variables) || (!!request.project && request.project !== tab.project);
}

export function rememberProject(project) {
    if (!project) return;
    state.lastProject = project;
    state.recentProjects = [project, ...state.recentProjects.filter(p => p.toLowerCase() !== project.toLowerCase())].slice(0, 12);
}

export function addHistory(entry) {
    state.history.unshift(entry);
    if (state.history.length > 300) state.history.length = 300;
}
