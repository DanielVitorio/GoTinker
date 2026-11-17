import { api, query } from './api.js';
import { icon } from './icons.js';
import { currentLanguage, languageInfo, languages, t } from './i18n.js';
import { findNode, newFolderNode, persist, state } from './store.js';
import { basename, bus, esc, h } from './util.js';
import { createRichEditor, isRichEmpty } from './richtext.js';
import { openModal, toast } from './ui.js';

export function saveRequestDialog({ name, description = '', title, location: initialLocation = '' }) {
    return new Promise(resolve => {
        let result = null;
        let location = '';
        let search = '';
        const nameInput = h('input', { class: 'input', value: name || '', spellcheck: 'false' });
        const hasDescription = !isRichEmpty(description);
        const descEditor = createRichEditor({ placeholder: t('descriptionPlaceholder'), compact: true });
        descEditor.setValue(description);
        const descWrap = h('div', { class: 'field', hidden: hasDescription ? undefined : true }, h('span', { class: 'field-label', text: t('description') }), descEditor.el);
        const addDesc = h('button', { class: 'link-btn', type: 'button', text: t('addDescription'), hidden: hasDescription ? true : undefined, onclick: () => { descWrap.hidden = false; addDesc.hidden = true; descEditor.focus(); } });
        const crumb = h('div', { class: 'picker-crumb' });
        const searchInput = h('input', { class: 'input input-sm', placeholder: t('searchCollections'), spellcheck: 'false' });
        const list = h('div', { class: 'picker-list' });
        const newBtn = h('button', { class: 'link-btn', type: 'button' });
        const saveBtn = h('button', { class: 'btn btn-primary', type: 'button' });

        const containerItems = () => {
            if (!location) return state.collections;
            return (findNode(location)?.node.items || []).filter(n => n.items);
        };
        const render = () => {
            crumb.innerHTML = '';
            const rootBtn = h('button', { class: 'crumb-btn', type: 'button', text: t('allCollections'), onclick: () => { location = ''; render(); } });
            crumb.append(rootBtn);
            if (location) {
                const trail = [];
                let found = findNode(location);
                while (found) {
                    trail.unshift(found.node);
                    found = found.parent ? findNode(found.parent.id) : null;
                }
                for (const node of trail) {
                    crumb.append(h('span', { class: 'crumb-sep', text: '/' }), h('button', { class: 'crumb-btn', type: 'button', text: node.name, onclick: () => { location = node.id; render(); } }));
                }
            }
            list.innerHTML = '';
            const items = containerItems().filter(n => !search || n.name.toLowerCase().includes(search));
            for (const node of items) {
                const row = h('button', { class: 'picker-row', type: 'button' },
                    h('span', { class: 'picker-icon', html: icon(node.type === 'collection' ? 'collections' : 'folder') }),
                    h('span', { class: 'picker-name', text: node.name }),
                    h('span', { class: 'picker-arrow', html: icon('chevronRight') }));
                row.addEventListener('click', () => { location = node.id; search = ''; searchInput.value = ''; render(); });
                list.append(row);
            }
            if (!items.length) list.append(h('div', { class: 'picker-empty', text: location ? t('noSubfolders') : search ? t('noResults') : t('noCollectionsText') }));
            newBtn.innerHTML = `${icon('plus')}<span>${location ? t('newFolder') : t('newCollection')}</span>`;
            const target = location ? findNode(location)?.node : null;
            saveBtn.disabled = !target;
            saveBtn.textContent = target ? t('saveTo', { name: target.name }) : t('save');
        };
        newBtn.addEventListener('click', () => {
            const input = h('input', { class: 'input input-sm', placeholder: location ? t('folderName') : t('collectionName') });
            const row = h('div', { class: 'picker-new' }, input);
            list.prepend(row);
            input.focus();
            let done = false;
            const commit = () => {
                if (done) return;
                done = true;
                const value = input.value.trim();
                if (!value) {
                    row.remove();
                    return;
                }
                const node = newFolderNode(location ? 'folder' : 'collection', value);
                if (location) findNode(location).node.items.push(node);
                else state.collections.push(node);
                persist();
                bus.emit('tree:changed');
                location = node.id;
                render();
            };
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') { event.preventDefault(); commit(); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); done = true; row.remove(); }
            });
            input.addEventListener('blur', commit);
        });
        searchInput.addEventListener('input', () => { search = searchInput.value.trim().toLowerCase(); render(); });
        const submit = () => {
            if (!location || !nameInput.value.trim()) {
                if (!nameInput.value.trim()) nameInput.focus();
                return;
            }
            result = { name: nameInput.value.trim(), description: descEditor.getValue(), containerId: location };
            modal.close();
        };
        saveBtn.addEventListener('click', submit);
        nameInput.addEventListener('keydown', event => { if (event.key === 'Enter') submit(); });
        const body = h('div', { class: 'save-dialog' },
            h('label', { class: 'field' }, h('span', { class: 'field-label', text: t('requestName') }), nameInput),
            addDesc, descWrap,
            h('div', { class: 'field' }, h('span', { class: 'field-label', text: t('saveToLabel') }), h('div', { class: 'picker' }, h('div', { class: 'picker-head' }, crumb, searchInput), list)));
        const footer = [newBtn, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: t('cancel'), onclick: () => modal.close() }), saveBtn];
        const modal = openModal({ title: title || t('saveRequest'), body, footer, width: 560, onClose: () => resolve(result) });
        location = initialLocation && findNode(initialLocation) ? initialLocation : state.collections.length === 1 ? state.collections[0].id : '';
        render();
    });
}

export function projectPicker({ mode = 'project', start = '' } = {}) {
    return new Promise(resolve => {
        let result = null;
        let current = '';
        let parent = '';
        let currentIsLaravel = false;
        let selectedFile = '';
        let drives = [];
        let connections = [];
        const pathInput = h('input', { class: 'input', spellcheck: 'false', placeholder: 'C:\\projetos\\meu-laravel' });
        const upBtn = h('button', { class: 'icon-btn', type: 'button', title: t('parentFolder'), html: icon('arrowUp') });
        const goBtn = h('button', { class: 'btn', type: 'button', text: t('go') });
        const places = h('nav', { class: 'fs-places' });
        const list = h('div', { class: 'fs-list' });
        const hint = h('span', { class: 'fs-hint' });
        const useBtn = h('button', { class: 'btn btn-primary', type: 'button', text: mode === 'file' ? t('openFile') : t('useFolder') });
        const samePath = (a, b) => String(a || '').replace(/[\\/]+$/, '').toLowerCase() === String(b || '').replace(/[\\/]+$/, '').toLowerCase();

        const renderPlaces = () => {
            places.innerHTML = '';
            const place = (iconName, label, title, active, onclick, extra = '') => h('button', { class: 'fs-place' + (active ? ' active' : '') + extra, type: 'button', title, html: `${icon(iconName)}<span>${esc(label)}</span>`, onclick });
            const recent = [];
            for (const p of [...state.recentProjects, state.lastProject, ...state.tabs.map(tab => tab.project)]) {
                if (p && !recent.some(x => samePath(x, p))) recent.push(p);
            }
            recent.length = Math.min(recent.length, 8);
            if (recent.length) {
                places.append(h('div', { class: 'fs-section', text: t('recentProjects') }));
                for (const p of recent) places.append(place('laravel', basename(p), p, samePath(p, current), () => browse(p)));
            }
            if (drives.length) {
                places.append(h('div', { class: 'fs-section', text: t('drives') }));
                const drive = drives.find(d => current.toLowerCase().startsWith(d.toLowerCase())) || '';
                for (const d of drives) places.append(place('drive', d.replace(/\\$/, ''), d, d === drive && !recent.some(p => samePath(p, current)), () => browse(d)));
            }
            if (mode === 'project') {
                places.append(h('div', { class: 'fs-section', text: 'SSH' }));
                for (const c of connections) places.append(place('server', c.name, `${c.user}@${c.host}:${c.port}`, false, () => sshDialog(c)));
                places.append(place('plus', t('addSSH'), t('addSSH'), false, () => sshDialog(), ' ghost'));
            }
        };
        const update = () => {
            upBtn.disabled = !parent;
            if (mode === 'file') {
                useBtn.disabled = !selectedFile;
                hint.textContent = selectedFile ? basename(selectedFile) : t('selectPHPFile');
            } else {
                useBtn.disabled = !currentIsLaravel;
                hint.innerHTML = currentIsLaravel ? `${icon('check')}<span>${t('currentLaravelProject')}</span>` : `<span>${t('enterLaravelFolder')}</span>`;
                hint.classList.toggle('ok', currentIsLaravel);
            }
        };
        let firstLoad = true;
        const browse = async path => {
            list.innerHTML = `<div class="fs-loading"><div class="spinner"></div></div>`;
            selectedFile = '';
            try {
                const data = await api('/api/fs/list?' + query({ path: path || '' }));
                if (!data.ok) throw new Error(data.error || t('folderNotFound'));
                current = data.current || '';
                parent = data.parent || '';
                currentIsLaravel = !!data.isLaravel;
                pathInput.value = current;
                if (firstLoad) {
                    firstLoad = false;
                    drives = data.drives || [];
                    if (mode === 'project') {
                        try {
                            connections = (await api('/api/ssh/connections')).connections || [];
                        } catch {}
                    }
                }
                list.innerHTML = '';
                if (!current) {
                    for (const d of data.drives || []) list.append(fsRow({ name: d, isDir: true, path: d, drive: true }));
                }
                for (const entry of data.entries || []) {
                    if (!entry.isDir && mode !== 'file') continue;
                    list.append(fsRow(entry));
                }
                if (!list.children.length) list.append(h('div', { class: 'picker-empty', text: t('emptyFolderBrowser') }));
                list.scrollTop = 0;
            } catch (error) {
                list.innerHTML = '';
                list.append(h('div', { class: 'picker-empty error', text: error.message }));
            }
            renderPlaces();
            update();
        };
        const fsRow = entry => {
            const kind = entry.drive ? 'drive' : entry.isDir ? (entry.isLaravel ? 'laravel' : 'folder') : 'filePhp';
            const row = h('button', { class: 'fs-row' + (entry.isDir ? '' : ' file') + (entry.isLaravel ? ' laravel' : ''), type: 'button', title: entry.path },
                h('span', { class: 'fs-icon ' + kind, html: icon(kind) }),
                h('span', { class: 'fs-name', text: entry.name }),
                entry.isLaravel ? h('span', { class: 'tag-laravel', text: 'Laravel' }) : null,
                entry.isDir ? h('span', { class: 'fs-chevron', html: icon('chevronRight') }) : null);
            row.addEventListener('click', () => {
                if (entry.isDir) {
                    browse(entry.path);
                    return;
                }
                selectedFile = entry.path;
                list.querySelectorAll('.fs-row.selected').forEach(x => x.classList.remove('selected'));
                row.classList.add('selected');
                update();
            });
            row.addEventListener('dblclick', () => {
                if (!entry.isDir) {
                    selectedFile = entry.path;
                    submit();
                } else if (mode === 'project' && entry.isLaravel) {
                    result = entry.path;
                    modal.close();
                }
            });
            return row;
        };
        const submit = () => {
            if (mode === 'file' ? !selectedFile : !currentIsLaravel) return;
            result = mode === 'file' ? selectedFile : current;
            modal.close();
        };
        upBtn.addEventListener('click', () => parent && browse(parent));
        goBtn.addEventListener('click', () => browse(pathInput.value.trim()));
        pathInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); browse(pathInput.value.trim()); } });
        list.addEventListener('keydown', event => {
            if (event.key === 'Backspace' && parent) {
                event.preventDefault();
                browse(parent);
            }
        });
        useBtn.addEventListener('click', submit);
        const body = h('div', { class: 'fs-dialog' },
            places,
            h('div', { class: 'fs-main' }, h('div', { class: 'fs-path' }, upBtn, h('label', { class: 'fs-path-box' }, h('span', { class: 'fs-path-icon', html: icon('folderOpen') }), pathInput), goBtn), list));
        const footer = [hint, h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: t('cancel'), onclick: () => modal.close() }), useBtn];
        const modal = openModal({ title: mode === 'file' ? t('openPHPFile') : t('selectLaravelProject'), subtitle: mode === 'file' ? '' : t('browseDrives'), body, footer, width: 820, className: 'fs-modal', onClose: () => resolve(result), initialFocus: 'input' });
        browse(start || '');
    });
}

export function sshDialog(connection = null) {
    const name = h('input', { class: 'input', value: connection?.name || '', placeholder: t('connectionName') });
    const host = h('input', { class: 'input', value: connection?.host || '', placeholder: t('server') });
    const port = h('input', { class: 'input', type: 'number', min: '1', max: '65535', value: String(connection?.port || 22) });
    const user = h('input', { class: 'input', value: connection?.user || '', placeholder: t('user') });
    const platform = h('select', { class: 'input' }, h('option', { value: 'linux', text: 'Linux' }), h('option', { value: 'windows', text: 'Windows' }));
    platform.value = connection?.platform || 'linux';
    const password = h('input', { class: 'input', type: 'password', placeholder: t('passwordOptional') });
    const save = h('input', { type: 'checkbox' });
    const submit = async () => {
        try {
            const res = await api('/api/ssh/connections', { body: { connection: { id: connection?.id || '', name: name.value.trim(), host: host.value.trim(), port: Number(port.value || 22), user: user.value.trim(), platform: platform.value }, password: password.value, save: save.checked } });
            modal.close();
            toast(t('connectionSaved', { name: res.connection.name }), 'success');
        } catch (error) {
            toast(error.message, 'error');
        }
    };
    const body = h('div', { class: 'form-grid' },
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label', text: t('connectionName') }), name),
        h('label', { class: 'field' }, h('span', { class: 'field-label', text: t('server') }), host),
        h('label', { class: 'field' }, h('span', { class: 'field-label', text: t('port') }), port),
        h('label', { class: 'field' }, h('span', { class: 'field-label', text: t('user') }), user),
        h('label', { class: 'field' }, h('span', { class: 'field-label', text: t('system') }), platform),
        h('label', { class: 'field span-2' }, h('span', { class: 'field-label', text: t('password') }), password),
        h('label', { class: 'check-row span-2' }, save, h('span', { text: t('savePasswordDPAPI') })),
        h('p', { class: 'help span-2', text: t('sshHelp') }));
    const footer = [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: t('cancel'), onclick: () => modal.close() }), h('button', { class: 'btn btn-primary', type: 'button', text: t('saveConnection'), onclick: submit })];
    const modal = openModal({ title: t('sshConnection'), body, footer, width: 520 });
}

export function importDialog(onImport) {
    const fileInput = h('input', { type: 'file', accept: '.json,.php,application/json,text/plain', multiple: true, hidden: true });
    const drop = h('div', { class: 'drop-zone' },
        h('div', { class: 'drop-icon', html: icon('upload') }),
        h('div', { class: 'drop-title', text: t('importDropTitle') }),
        h('div', { class: 'drop-text' }, h('span', { text: t('importDropText') + ' ' }), h('button', { class: 'link-btn', type: 'button', text: t('selectFiles'), onclick: () => fileInput.click() })));
    const paste = h('textarea', { class: 'input textarea mono', spellcheck: 'false', placeholder: t('importPastePlaceholder') });
    const handleFiles = async files => {
        const entries = [];
        for (const file of files) entries.push({ name: file.name, text: await file.text() });
        if (await onImport(entries)) modal.close();
    };
    fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));
    drop.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', event => {
        event.preventDefault();
        drop.classList.remove('over');
        handleFiles([...event.dataTransfer.files]);
    });
    const body = h('div', { class: 'import-dialog' }, drop, fileInput, h('div', { class: 'or-sep', text: t('orPaste') }), paste, h('p', { class: 'help', text: t('importHelp') }));
    const footer = [h('span', { class: 'spacer' }), h('button', { class: 'btn', type: 'button', text: t('cancel'), onclick: () => modal.close() }), h('button', { class: 'btn btn-primary', type: 'button', text: t('import'), onclick: async () => { if (paste.value.trim() && await onImport([{ name: 'pasted', text: paste.value }])) modal.close(); } })];
    const modal = openModal({ title: t('import'), body, footer, width: 600 });
}

export async function settingsDialog({ onChange, dataDir }) {
    const infos = await Promise.all(languages.map(languageInfo));
    const lang = h('div', { class: 'lang-grid' });
    for (const info of infos) {
        const button = h('button', { class: 'lang-option' + (info.code === currentLanguage() ? ' active' : ''), type: 'button', html: `${info.flag || ''}<span></span>` });
        button.querySelector('span').textContent = info.name;
        button.addEventListener('click', async () => {
            lang.querySelectorAll('.lang-option').forEach(b => b.classList.remove('active'));
            button.classList.add('active');
            await onChange({ language: info.code });
        });
        lang.append(button);
    }
    const fontSize = h('input', { class: 'input', type: 'number', min: '10', max: '28', value: String(state.ui.fontSize) });
    fontSize.addEventListener('change', () => onChange({ fontSize: Math.min(28, Math.max(10, Number(fontSize.value) || 14)) }));
    const toggle = (key, label) => {
        const input = h('input', { type: 'checkbox', checked: key === 'wordWrap' ? state.ui.wordWrap === 'on' ? true : undefined : state.ui[key] ? true : undefined });
        input.addEventListener('change', () => onChange({ [key]: key === 'wordWrap' ? (input.checked ? 'on' : 'off') : input.checked }));
        return h('label', { class: 'switch-row' }, h('span', { text: label }), h('span', { class: 'switch' }, input, h('span', { class: 'switch-ui' })));
    };
    const layout = h('div', { class: 'segmented' });
    for (const [value, label] of [['stacked', t('layoutStacked')], ['side', t('layoutSide')]]) {
        const b = h('button', { type: 'button', class: state.ui.layout === value ? 'active' : '', text: label });
        b.addEventListener('click', () => {
            layout.querySelectorAll('button').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            onChange({ layout: value });
        });
        layout.append(b);
    }
    const body = h('div', { class: 'settings' },
        h('section', { class: 'settings-section' }, h('h3', { text: t('language') }), lang),
        h('section', { class: 'settings-section' }, h('h3', { text: t('editor') }),
            h('label', { class: 'switch-row' }, h('span', { text: t('fontSize') }), fontSize),
            toggle('minimap', t('minimap')), toggle('wordWrap', t('wordWrap')), toggle('lint', t('syntaxCheck'))),
        h('section', { class: 'settings-section' }, h('h3', { text: t('layout') }), h('div', { class: 'switch-row' }, h('span', { text: t('responsePosition') }), layout)),
        h('section', { class: 'settings-section' }, h('h3', { text: t('data') }), h('p', { class: 'help', text: t('dataLocation') }), h('code', { class: 'path-box', text: dataDir || '%APPDATA%\\GoTinker' })));
    const modal = openModal({ title: t('settings'), body, footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary', type: 'button', text: t('close'), onclick: () => modal.close() })], width: 560 });
}

export function shortcutsDialog() {
    const rows = [
        ['Ctrl+Enter', t('send')], ['Ctrl+Shift+Enter', t('runAll')], ['Ctrl+S', t('save')], ['Ctrl+Shift+S', t('saveAs')],
        ['Ctrl+T', t('newTab')], ['Ctrl+W', t('closeTab')], ['Ctrl+Tab', t('nextTab')], ['Ctrl+P / Ctrl+K', t('search')],
        ['Ctrl+O', t('openPHPFile')], ['Ctrl+\\', t('toggleSidebar')], ['Ctrl+`', t('toggleTerminal')], ['Ctrl+Alt+L', t('toggleLayout')],
        ['Ctrl+Space', t('triggerSuggest')], ['F1', t('commandPalette')], ['Ctrl+F', t('find')], ['Ctrl+/', t('toggleComment')], ['Alt+↑ / Alt+↓', t('moveLine')]
    ];
    const table = h('div', { class: 'shortcuts' });
    for (const [keys, label] of rows) table.append(h('div', { class: 'shortcut-row' }, h('span', { text: label }), h('span', { class: 'keys' }, ...keys.split(' / ').flatMap((combo, i) => [i ? h('span', { class: 'muted', text: '/' }) : null, ...combo.split('+').map(k => h('kbd', { text: k }))]))));
    const modal = openModal({ title: t('keyboardShortcuts'), body: table, footer: [h('span', { class: 'spacer' }), h('button', { class: 'btn btn-primary', type: 'button', text: t('close'), onclick: () => modal.close() })], width: 520 });
}
