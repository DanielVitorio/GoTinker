(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const FOLDER_ICON = '<svg class="folder-svg" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M22 19V9a2 2 0 0 0-2-2h-6.764a2 2 0 0 1-1.789-1.106l-.894-1.788A2 2 0 0 0 8.763 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2"/></svg>';
const els = {
    tabs: $('#tabs'), code: $('#code'), highlight: $('#highlight'), lineNumbers: $('#lineNumbers'), placeholder: $('#placeholder'), autocomplete: $('#autocomplete'), codeStack: $('#codeStack'),
    projectPicker: $('#projectPicker'), projectPath: $('#projectPath'), statusDot: $('#statusDot'), statusText: $('#statusText'), runBtn: $('#runBtn'), saveBtn: $('#saveBtn'), savedBtn: $('#savedBtn'), historyBtn: $('#historyBtn'), reindexBtn: $('#reindexBtn'), newTabBtn: $('#newTabBtn'), languageBtn: $('#languageBtn'), languageFlag: $('#languageFlag'), languageMenu: $('#languageMenu'),
    output: $('#output'), outputShell: $('.output-shell'), outputScroll: $('#outputScroll'), browserToolbar: $('#browserToolbar'), browserRouteForm: $('#browserRouteForm'), browserRoutePath: $('#browserRoutePath'), browserRouteParams: $('#browserRouteParams'), browserPreviewBtn: $('#browserPreviewBtn'), browserContainer: $('#browserContainer'), responseBrowser: $('#responseBrowser'), browserEmpty: $('#browserEmpty'), resultType: $('#resultType'), durationLabel: $('#durationLabel'), outputSubtitle: $('#outputSubtitle'), editorSubtitle: $('#editorSubtitle'), crumb: $('#crumb'), cursorPos: $('#cursorPos'), indexBadge: $('#indexBadge'),
    phpStatus: $('#phpStatus'), laravelStatus: $('#laravelStatus'), storageStatus: $('#storageStatus'), saveState: $('#saveState'), historyCount: $('#historyCount'), toast: $('#toast'),
    folderModal: $('#folderModal'), folderPathInput: $('#folderPathInput'), folderGoBtn: $('#folderGoBtn'), folderDrivesBtn: $('#folderDrivesBtn'), driveGrid: $('#driveGrid'), folderList: $('#folderList'), folderSelectBtn: $('#folderSelectBtn'), folderHint: $('#folderHint'),
    saveModal: $('#saveModal'), snippetName: $('#snippetName'), snippetAnnotation: $('#snippetAnnotation'), snippetFolderPath: $('#snippetFolderPath'), chooseSnippetFolderBtn: $('#chooseSnippetFolderBtn'), confirmSaveBtn: $('#confirmSaveBtn'), snippetFolderModal: $('#snippetFolderModal'), snippetFolderModalTitle: $('#snippetFolderModalTitle'), snippetFolderBreadcrumb: $('#snippetFolderBreadcrumb'), snippetFolderList: $('#snippetFolderList'), newSnippetFolderName: $('#newSnippetFolderName'), createSnippetFolderBtn: $('#createSnippetFolderBtn'), deleteSnippetFolderBtn: $('#deleteSnippetFolderBtn'), chooseNoSnippetFolderBtn: $('#chooseNoSnippetFolderBtn'), confirmSnippetFolderBtn: $('#confirmSnippetFolderBtn'), deleteSnippetFolderModal: $('#deleteSnippetFolderModal'), deleteSnippetFolderMessage: $('#deleteSnippetFolderMessage'), confirmDeleteSnippetFolderBtn: $('#confirmDeleteSnippetFolderBtn'), savedModal: $('#savedModal'), savedList: $('#savedList'), savedCount: $('#savedCount'), savedFolderCount: $('#savedFolderCount'), savedFolderTree: $('#savedFolderTree'), savedFolderTitle: $('#savedFolderTitle'), savedFolderSummary: $('#savedFolderSummary'), savedSearch: $('#savedSearch'), importSavedBtn: $('#importSavedBtn'), exportSavedBtn: $('#exportSavedBtn'), savedImportFile: $('#savedImportFile'), savedFolderContextMenu: $('#savedFolderContextMenu'), deleteSavedFolderContextBtn: $('#deleteSavedFolderContextBtn'), historyModal: $('#historyModal'), historyList: $('#historyList'), clearHistoryBtn: $('#clearHistoryBtn'),
    clearCodeBtn: $('#clearCodeBtn'), clearOutputBtn: $('#clearOutputBtn'), copyBtn: $('#copyBtn'), workspace: $('#workspace'), resizer: $('#resizer'),
    openFileBtn: $('#openFileBtn'), saveFileBtn: $('#saveFileBtn'), openSelectedFileBtn: $('#openSelectedFileBtn'), panelLeft: $('.panel-left'), terminalPanel: $('#terminalPanel'), terminalResizer: $('#terminalResizer'), cmderHost: $('#cmderHost'), terminalProject: $('#terminalProject'), terminalTabs: $('#terminalTabs'), terminalToggleBtn: $('#terminalToggleBtn'), closeTerminalBtn: $('#closeTerminalBtn'), terminalMenuBtn: $('#terminalMenuBtn'), terminalMenu: $('#terminalMenu'), createAliasBtn: $('#createAliasBtn'), aliasModal: $('#aliasModal'), aliasName: $('#aliasName'), aliasCommand: $('#aliasCommand'), confirmAliasBtn: $('#confirmAliasBtn'),
    sshModal: $('#sshModal'), sshForm: $('#sshForm'), sshName: $('#sshName'), sshHost: $('#sshHost'), sshPort: $('#sshPort'), sshUser: $('#sshUser'), sshPlatform: $('#sshPlatform'), sshPassword: $('#sshPassword'), sshSavePassword: $('#sshSavePassword'), projectLoading: $('#projectLoading'), projectLoadingDetail: $('#projectLoadingDetail')
};

let state = {version:3, activeTabId:null, tabs:[], snippets:[], history:[], terminalSessions:[],activeTerminalSessionId:'',language:'pt-BR',lastProject:'', split:50};
const supportedLanguages=[{code:'pt-BR',name:'Português (Brasil)'},{code:'en',name:'English'},{code:'ja',name:'日本語'},{code:'ru',name:'Русский'},{code:'zh-CN',name:'简体中文'},{code:'es',name:'Español'}];
let translations={};
let savedFolderFilter = '';
const collapsedSavedFolders = new Set();
let snippetFolderCurrentId = '';
let snippetFolderSelectedId = '';
let snippetSaveFolderId = '';
let movingSnippetId = '';
let pendingFolderDeleteId = '';
let completions = [];
let indexedProject = '';
let loadingProject = '';
const projectLoads = new Map();
let currentFolder = '';
let folderCurrentIsLaravel = false;
let selectedFile = '';
let folderPurpose = 'project';
let sshConnections = [];
let viewMode = 'auto';
let browserFrameKey = '';
let acItems = [];
let acIndex = 0;
let acReplaceStart = 0;
let acReplaceEnd = 0;
let acImportClass = '';
let persistTimer = null;
let running = false;
let runController = null;
let toastTimer = null;

const modelMethods = ['query','all','find','findOrFail','first','firstOrFail','firstWhere','where','whereIn','whereNotIn','whereNull','whereNotNull','whereBetween','latest','oldest','orderBy','limit','take','skip','count','exists','doesntExist','pluck','value','get','paginate','cursorPaginate','create','updateOrCreate','firstOrCreate','with','withCount','has','whereHas','whereRelation','select','distinct','groupBy','delete','forceDelete'];
const modelInstanceMethods = ['save','saveOrFail','update','delete','forceDelete','restore','refresh','fresh','replicate','fill','forceFill','isDirty','isClean','wasChanged','getChanges','getOriginal','getRawOriginal','getAttribute','setAttribute','getKey','getKeyName','getTable','toArray','toJson','load','loadMissing','loadCount','loadMorph','loadMorphCount','relationLoaded','unsetRelation','setRelation','touch','increment','decrement','updateQuietly','saveQuietly','deleteQuietly','push','pushQuietly'];
const commonSymbols = [
    {label:'App\\Models\\',insert:'App\\Models\\',kind:'namespace',detail:'Models do projeto'},
    {label:'Illuminate\\Support\\Facades\\DB',insert:'Illuminate\\Support\\Facades\\DB',kind:'class',detail:'Laravel Facade'},
    {label:'Illuminate\\Support\\Facades\\Cache',insert:'Illuminate\\Support\\Facades\\Cache',kind:'class',detail:'Laravel Facade'},
    {label:'Illuminate\\Support\\Facades\\Log',insert:'Illuminate\\Support\\Facades\\Log',kind:'class',detail:'Laravel Facade'},
    {label:'Illuminate\\Support\\Facades\\Http',insert:'Illuminate\\Support\\Facades\\Http',kind:'class',detail:'Laravel Facade'},
    {label:'collect',insert:'collect()',kind:'method',detail:'Laravel helper'},
    {label:'config',insert:'config()',kind:'method',detail:'Laravel helper'},
    {label:'app',insert:'app()',kind:'method',detail:'Laravel helper'},
    {label:'now',insert:'now()',kind:'method',detail:'Laravel helper'},
    {label:'dd',insert:'dd()',kind:'method',detail:'Laravel helper'},
    {label:'dump',insert:'dump()',kind:'method',detail:'Laravel helper'}
];

function uid(prefix='id'){ return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8); }
function escapeHTML(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function activeTab(){ return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0] || null; }
function nowISO(){ return new Date().toISOString(); }
function basename(path){ return String(path||'').replace(/[\\/]+$/,'').split(/[\\/]/).pop() || path; }
function fmtTime(iso){try{return new Intl.DateTimeFormat(state.language||'pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso));}catch{return iso||'';}}
function showToast(message,error=false){ els.toast.textContent=message;els.toast.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.className='toast',2300); }
function setStatus(){}
function t(key){return translations.messages?.[key]||key;}
async function loadLanguage(code=state.language||'pt-BR',persist=true){try{let data=languageCache.get(code);if(!data){const response=await fetch(`/lang/${encodeURIComponent(code)}.json`,{cache:'no-store'});if(!response.ok)throw new Error('language file missing');data=await response.json();languageCache.set(code,data);}state.language=code;translations=data;document.documentElement.lang=code;els.languageFlag.innerHTML=data.flag;els.languageBtn.title=data.name;applyTranslations();renderLanguageMenu();if(persist)schedulePersist();}catch{if(code!=='pt-BR')await loadLanguage('pt-BR',persist);}}
const languageCache=new Map();
function applyTranslations(){document.querySelectorAll('[data-i18n]').forEach(element=>{const value=t(element.dataset.i18n);if(value)element.textContent=value;});document.querySelectorAll('[data-i18n-placeholder]').forEach(element=>element.placeholder=t(element.dataset.i18nPlaceholder));document.querySelectorAll('[data-i18n-title]').forEach(element=>element.title=t(element.dataset.i18nTitle));renderRunButton();updateProjectUI();if(state.terminalSessions)renderTerminalSessions();if(state.snippets)renderSaved();if(state.history)renderHistory();}
async function renderLanguageMenu(){await Promise.all(supportedLanguages.map(async item=>{if(languageCache.has(item.code))return;try{const response=await fetch(`/lang/${encodeURIComponent(item.code)}.json`,{cache:'no-store'});if(response.ok)languageCache.set(item.code,await response.json());}catch{}}));els.languageMenu.innerHTML='';supportedLanguages.forEach(item=>{const data=languageCache.get(item.code);const option=document.createElement('button');option.type='button';option.className='language-option'+(state.language===item.code?' active':'');option.innerHTML=`${data?.flag||''}<span>${escapeHTML(data?.name||item.name)}</span>`;option.addEventListener('click',async()=>{els.languageMenu.classList.add('hidden');await loadLanguage(item.code);});els.languageMenu.appendChild(option);});}
function openModal(el){ el.classList.add('open'); }
function closeModal(el){el.classList.remove('open');if(el===els.snippetFolderModal&&movingSnippetId){movingSnippetId='';els.snippetFolderModalTitle.textContent='Escolher pasta';els.confirmSnippetFolderBtn.textContent='Usar esta pasta';}}

async function api(url, options={}){
    const res = await fetch(url,{cache:'no-store',...options});
    const type=res.headers.get('content-type')||'';
    if(!res.ok){ let msg='Erro '+res.status; try{const j=await res.json();msg=j.error||msg;}catch{} throw new Error(msg); }
    return type.includes('application/json') ? res.json() : res.text();
}

async function loadState(){
    try{
        const data=await api('/api/state/load');
        if(data && typeof data==='object') state={...state,...data};
    }catch(e){ showToast('Não foi possível restaurar o workspace: '+e.message,true); }
    normalizeState();await loadLanguage(state.language,false);renderAll();renderTerminalSessions();
}
function normalizeState(){
    if(!Array.isArray(state.tabs)) state.tabs=[];
    if(!Array.isArray(state.snippets)) state.snippets=[];
    if(!Array.isArray(state.snippetFolders)) state.snippetFolders=[];
    state.snippetFolders=state.snippetFolders.filter(folder=>folder&&typeof folder.id==='string'&&typeof folder.name==='string'&&folder.name.trim()).map(folder=>({id:folder.id,name:folder.name.trim(),parentId:typeof folder.parentId==='string'?folder.parentId:''}));
    if(!Array.isArray(state.history)) state.history=[];
    if(!Array.isArray(state.terminalSessions))state.terminalSessions=[];
    state.terminalSessions=state.terminalSessions.filter(session=>session&&typeof session.id==='string').map((session,index)=>({id:session.id,name:String(session.name||`Cmder ${index+1}`),project:String(session.project||state.lastProject||''),output:String(session.output||'')}));
    if(!state.terminalSessions.some(session=>session.id===state.activeTerminalSessionId))state.activeTerminalSessionId=state.terminalSessions[0]?.id||'';
    if(!supportedLanguages.some(item=>item.code===state.language))state.language='pt-BR';
    state.history=state.history.slice(0,100);
    if(!state.tabs.length){ const t=createTabObject('Tinker 1',state.lastProject||'');state.tabs=[t];state.activeTabId=t.id; }
    if(!state.tabs.some(t=>t.id===state.activeTabId)) state.activeTabId=state.tabs[0].id;
    state.tabs.forEach(t=>{ t.code=String(t.code||'');t.project=String(t.project||state.lastProject||'');t.snippetAnnotation=String(t.snippetAnnotation||'');t.output=String(t.output||'');t.json=String(t.json||'');t.previewHtml=String(t.previewHtml||'');t.previewData=String(t.previewData||'');t.previewMime=String(t.previewMime||'');t.previewRoute=t.previewRoute&&typeof t.previewRoute==='object'?t.previewRoute:null;t.previewParams=t.previewParams&&typeof t.previewParams==='object'?t.previewParams:{};t.previewCode=String(t.previewCode||'');t.resultType=String(t.resultType||'');t.durationMs=Number(t.durationMs||0); });
    state.split=Math.min(72,Math.max(28,Number(state.split||50)));
}
function createTabObject(title,project){ return {id:uid('tab'),title,project:project||'',filePath:'',snippetAnnotation:'',code:'',output:'',json:'',resultType:'',durationMs:0,ok:true,createdAt:nowISO(),updatedAt:nowISO()}; }
function schedulePersist(){
    els.saveState.textContent=t('savingChanges');els.saveState.classList.add('saving');
    clearTimeout(persistTimer);persistTimer=setTimeout(persistState,650);
}
async function persistState(){
    clearTimeout(persistTimer);persistTimer=null;
    try{ await api('/api/state/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});els.saveState.textContent=t('savedChanges');els.saveState.classList.remove('saving'); }
    catch(e){els.saveState.textContent=t('saveError');els.saveState.classList.remove('saving');showToast(e.message,true);}
}

function renderAll(){ renderTabs(); loadActiveIntoUI(); renderSaved(); renderHistory(); applySplit(); }
function renderTabs(){
    els.tabs.innerHTML='';
    state.tabs.forEach(tab=>{
        const b=document.createElement('button');b.type='button';b.className='tab'+(tab.id===state.activeTabId?' active':'');b.dataset.id=tab.id;
        b.title=[tab.project||t('noProject'),tab.snippetAnnotation||''].filter(Boolean).join('\n');
        b.innerHTML=`<span class="tab-icon">php</span><span class="tab-title">${escapeHTML(tab.title||'Tinker')}</span><span class="tab-close" title="${escapeHTML(t('close'))}">×</span>`;
        b.addEventListener('click',e=>{ if(e.target.closest('.tab-close')){closeTab(tab.id);return;} switchTab(tab.id); });
        els.tabs.appendChild(b);
    });
    const newButton=document.createElement('button');newButton.type='button';newButton.className='new-tab';newButton.id='newTabBtn';newButton.title=t('newTab');newButton.textContent='+';newButton.addEventListener('click',()=>newTab());els.tabs.appendChild(newButton);
}
function loadActiveIntoUI(){
    const tab=activeTab();if(!tab)return;
    els.code.value=tab.code||'';refreshEditor();updateProjectUI();renderOutput();
    if(tab.project){ loadProjectContext(tab.project); }
    else{ hideProjectLoading();setStatus('', 'Sem projeto');els.phpStatus.textContent='PHP —';els.laravelStatus.textContent='Laravel —';els.indexBadge.textContent='0 símbolos';completions=[];indexedProject=''; }
}
function switchTab(id){
    saveEditorToTab();state.activeTabId=id;schedulePersist();renderTabs();loadActiveIntoUI();setTimeout(()=>els.code.focus(),0);
}
function closeTab(id){
    if(state.tabs.length===1){state.tabs[0]={...createTabObject('Tinker 1',activeTab()?.project||state.lastProject||''),id:state.tabs[0].id};state.activeTabId=state.tabs[0].id;renderAll();schedulePersist();return;}
    const idx=state.tabs.findIndex(t=>t.id===id);state.tabs=state.tabs.filter(t=>t.id!==id);if(state.activeTabId===id)state.activeTabId=state.tabs[Math.max(0,idx-1)].id;renderAll();schedulePersist();
}
function newTab(seed={}){
    saveEditorToTab();const n=state.tabs.length+1;const t={...createTabObject(seed.title||`Tinker ${n}`,seed.project??activeTab()?.project??state.lastProject),...seed,id:uid('tab')};state.tabs.push(t);state.activeTabId=t.id;renderAll();schedulePersist();setTimeout(()=>els.code.focus(),0);
}
function saveEditorToTab(){ const t=activeTab();if(!t)return;t.code=els.code.value;t.updatedAt=nowISO(); }
function updateProjectUI(){
    const t=activeTab();const p=t?.project||'';els.projectPath.textContent=p||t('selectProject');els.projectPath.classList.toggle('project-placeholder',!p);els.crumb.textContent=t?.filePath?basename(t.filePath):(p?basename(p):t('noProject'));els.editorSubtitle.textContent=t?.filePath?basename(t.filePath):(p?basename(p)+' · PHP / Laravel':'PHP / Laravel Tinker');els.saveFileBtn.disabled=!t?.filePath;els.terminalProject.textContent=currentTerminalSession()?.project||p||t('noProject');
}

function highlightPHP(source){
    let i=0,html='',n=source.length;const keywords=new Set(['abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','enum','eval','exit','extends','final','finally','fn','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','insteadof','interface','isset','list','match','namespace','new','or','print','private','protected','public','readonly','require','require_once','return','static','switch','throw','trait','try','unset','use','var','while','xor','yield','from']);const constants=new Set(['true','false','null','self','parent','static']);
    while(i<n){const ch=source[i],next=source[i+1];
        if(ch==='/'&&next==='/'){let j=source.indexOf('\n',i);if(j<0)j=n;html+=`<span class="tok-comment">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        if(ch==='#'){let j=source.indexOf('\n',i);if(j<0)j=n;html+=`<span class="tok-comment">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        if(ch==='/'&&next==='*'){let j=source.indexOf('*/',i+2);j=j<0?n:j+2;html+=`<span class="tok-comment">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        if(ch==="'"||ch==='"'||ch==='`'){const q=ch;let j=i+1;while(j<n){if(source[j]==='\\'){j+=2;continue}if(source[j]===q){j++;break}j++}html+=`<span class="tok-string">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        if(ch==='$'){let j=i+1;while(/[A-Za-z0-9_]/.test(source[j]||''))j++;html+=`<span class="tok-variable">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        if(/\d/.test(ch)){let j=i+1;while(/[0-9A-Fa-fxXbB._]/.test(source[j]||''))j++;html+=`<span class="tok-number">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        if(/[A-Za-z_\\]/.test(ch)){let j=i+1;while(/[A-Za-z0-9_\\]/.test(source[j]||''))j++;const word=source.slice(i,j),lower=word.toLowerCase();let k=j;while(/\s/.test(source[k]||''))k++;let cls='';if(keywords.has(lower))cls='tok-keyword';else if(constants.has(lower))cls='tok-constant';else if(source.slice(k,k+2)==='::'||word.includes('\\'))cls='tok-class';else if(source[k]==='(')cls='tok-function';html+=cls?`<span class="${cls}">${escapeHTML(word)}</span>`:escapeHTML(word);i=j;continue;}
        if(source.slice(i,i+2)==='->'||source.slice(i,i+2)==='::'){html+=`<span class="tok-arrow">${escapeHTML(source.slice(i,i+2))}</span>`;i+=2;continue;}
        if('=+-*/%!.?:><&|'.includes(ch)){let j=i+1;while('=+-*/%!.?:><&|'.includes(source[j]||'')&&j<i+3)j++;html+=`<span class="tok-operator">${escapeHTML(source.slice(i,j))}</span>`;i=j;continue;}
        html+=escapeHTML(ch);i++;
    }
    return html+(source.endsWith('\n')?' ':'');
}
function refreshEditor(){
    const v=els.code.value;els.highlight.innerHTML=highlightPHP(v);els.placeholder.classList.toggle('hidden',v.length>0);const count=Math.max(1,v.split('\n').length);els.lineNumbers.textContent=Array.from({length:count},(_,i)=>i+1).join('\n');syncEditorScroll();updateCursor();
}
function syncEditorScroll(){els.highlight.scrollTop=els.code.scrollTop;els.highlight.scrollLeft=els.code.scrollLeft;els.lineNumbers.scrollTop=els.code.scrollTop;}
function updateCursor(){const pos=els.code.selectionStart||0,before=els.code.value.slice(0,pos),lines=before.split('\n');els.cursorPos.textContent=`Ln ${lines.length}, Col ${lines[lines.length-1].length+1}`;}

function importedClasses(code){
    const imports=new Map();
    const re=/^\s*use\s+([^;]+);/gm;
    let m;
    while((m=re.exec(code))!==null){
        const raw=m[1].trim();
        const aliasMatch=raw.match(/^(.+?)\s+as\s+([A-Za-z_][A-Za-z0-9_]*)$/i);
        const fqcn=(aliasMatch?aliasMatch[1]:raw).trim().replace(/^\\/,'');
        const alias=(aliasMatch?aliasMatch[2]:fqcn.split('\\').pop()).trim();
        imports.set(alias.toLowerCase(),fqcn);
    }
    return imports;
}
function resolveCompletion(classToken,code=els.code.value){
    const clean=(classToken||'').replace(/^\\/,'').trim();
    if(!clean)return null;
    const imports=importedClasses(code);
    const imported=imports.get(clean.toLowerCase())||clean;
    const lower=imported.toLowerCase();
    return completions.find(x=>(x.label||'').toLowerCase()===lower||(x.shortName||'').toLowerCase()===clean.toLowerCase())||null;
}
function expressionChainInfo(expression){
    const match=String(expression||'').trim().match(/^([\\A-Za-z_][A-Za-z0-9_\\]*)::(.+)$/);
    if(!match)return null;
    const classToken=match[1];
    const tail=match[2];
    const calls=[];
    const re=/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let m;
    while((m=re.exec(tail))!==null)calls.push(m[1]);
    if(!calls.length)return {classToken,mode:'static',calls:[]};
    return {classToken,mode:chainResultMode(calls),calls};
}
function chainResultMode(calls){
    const modelResults=new Set(['find','findOrFail','first','firstOrFail','firstWhere','sole','create','firstOrCreate','updateOrCreate']);
    const collectionResults=new Set(['all','get','findMany']);
    const paginatorResults=new Set(['paginate','simplePaginate','cursorPaginate']);
    const scalarResults=new Set(['count','exists','doesntExist','value','sum','avg','average','min','max']);
    let mode='builder';
    for(const method of calls){
        const name=method.toLowerCase();
        if(mode==='collection'){
            if(['first','firstorfail','firstwhere','sole'].includes(name))mode='model';
            continue;
        }
        if(mode==='model'){
            if(['fresh','refresh','replicate','load','loadmissing'].includes(name))mode='model';
            continue;
        }
        if(modelResults.has(method)||modelResults.has(name))mode='model';
        else if(collectionResults.has(method)||collectionResults.has(name))mode='collection';
        else if(paginatorResults.has(method)||paginatorResults.has(name))mode='paginator';
        else if(scalarResults.has(method)||scalarResults.has(name))mode='scalar';
        else mode='builder';
    }
    return mode;
}
function inferVariableContext(variable,before){
    const name=variable.replace(/^\$/,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re=new RegExp('\\$'+name+'\\s*=\\s*([^;\\n]+)','g');
    let assignment='';
    let m;
    while((m=re.exec(before))!==null)assignment=m[1].trim();
    if(!assignment)return {classToken:'',mode:'instance'};
    const newMatch=assignment.match(/^new\s+([\\A-Za-z_][A-Za-z0-9_\\]*)/);
    if(newMatch)return {classToken:newMatch[1],mode:'model'};
    const info=expressionChainInfo(assignment);
    if(info)return info;
    const staticMatch=assignment.match(/^([\\A-Za-z_][A-Za-z0-9_\\]*)::/);
    return staticMatch?{classToken:staticMatch[1],mode:'model'}:{classToken:'',mode:'instance'};
}
function trailingChainContext(before,pos){
    const segment=before.slice(Math.max(before.lastIndexOf(';'),before.lastIndexOf('\n'))+1);
    const match=segment.match(/([\\A-Za-z_][A-Za-z0-9_\\]*)::(.+)->([A-Za-z_][A-Za-z0-9_]*)?$/);
    if(!match)return null;
    const prefix=match[3]||'';
    const expression=match[1]+'::'+match[2];
    const info=expressionChainInfo(expression);
    if(!info)return null;
    const ownerToken=info.classToken;
    const owner=resolveCompletion(ownerToken);
    const lastCall=info.calls[info.calls.length-1];
    const signature=owner?.methodDetails?.find(item=>item.name===lastCall);
    const returnType=(signature?.returnType||'').split('|').map(type=>type.replace(/^\??\\?/,'').trim()).find(type=>resolveCompletion(type));
    const returned=returnType?resolveCompletion(returnType):null;
    const classToken=returned?.label||ownerToken;
    const mode=returned?'instance':owner?.kind==='package'&&info.calls.some(x=>x.toLowerCase()==='now')?'instance':info.mode;
    return {type:'chain',classToken,importClassToken:ownerToken,mode,prefix,start:pos-prefix.length,end:pos};
}
function completionContext(){
    const pos=els.code.selectionStart||0;
    const before=els.code.value.slice(0,pos);
    let m=before.match(/(\$[A-Za-z_][A-Za-z0-9_]*)->([A-Za-z_][A-Za-z0-9_]*)?$/);
    if(m){
        const prefix=m[2]||'';
        const inferred=inferVariableContext(m[1],before);
        return {type:'chain',classToken:inferred.classToken,mode:inferred.mode||'model',prefix,start:pos-prefix.length,end:pos};
    }
    const chain=trailingChainContext(before,pos);
    if(chain)return chain;
    m=before.match(/([A-Za-z_\\][A-Za-z0-9_\\]*)::([A-Za-z0-9_]*)$/);
    if(m)return {type:'static',classToken:m[1],prefix:m[2]||'',start:pos-(m[2]||'').length,end:pos};
    m=before.match(/([A-Za-z_\\][A-Za-z0-9_\\]*)$/);
    if(m)return {type:'class',prefix:m[1],start:pos-m[1].length,end:pos};
    return null;
}
function classCandidates(prefix){
    const p=prefix.toLowerCase();
    const src=[...completions,...commonSymbols];
    const imports=importedClasses(els.code.value);
    const found=src.filter(x=>{const l=(x.label||'').toLowerCase(),s=(x.shortName||'').toLowerCase();return prefix.includes('\\')?l.startsWith(p):s.startsWith(p)||l.startsWith(p)}).slice(0,30).map(x=>({...x,replaceText:x.insert||x.label}));
    const firstImportable=found.find(item=>item.namespace||item.kind==='package');
    for(const item of found){if(!item.namespace&&item.kind!=='package')continue;const imported=[...imports].find(([,fqcn])=>fqcn.toLowerCase()===item.label.toLowerCase());if(imported)item.replaceText=imported[0];else{item.importClass=item.label;item.replaceText=item.shortName;}}
    if(firstImportable){const imported=[...imports].some(([,fqcn])=>fqcn.toLowerCase()===firstImportable.label.toLowerCase());if(!imported)found.push({label:'Importar '+firstImportable.shortName,insert:'',kind:'import',detail:firstImportable.label,importClass:firstImportable.label,shortName:firstImportable.shortName,replaceText:''});}
    return found;
}
function methodLabel(method,completion){
    const signature=completion?.methodDetails?.find(item=>item.name===method);
    if(!signature)return method+'()';
    return `${method}(${signature.parameters||''})${signature.returnType?' : '+signature.returnType:''}`;
}
function importClassFor(classToken,completion){
    if(!completion?.namespace&&completion?.kind!=='package')return '';
    const imports=importedClasses(els.code.value);
    const resolved=resolveCompletion(classToken);
    const fqcn=resolved?.label||completion.label;
    return [...imports.values()].some(value=>value.toLowerCase()===fqcn.toLowerCase())?'':fqcn;
}
function methodCandidates(classToken,prefix){
    const c=resolveCompletion(classToken);
    let methods=[...(c?.methods||[])];
    if(c?.kind==='model'||/model/i.test(c?.kind||''))methods.push(...modelMethods);
    methods=[...new Set(methods)].sort();
    const p=prefix.toLowerCase();
    const importClass=importClassFor(classToken,c);
    return methods.filter(m=>m.toLowerCase().startsWith(p)).slice(0,35).map(m=>({label:methodLabel(m,c),insert:m+'()',kind:'method',detail:c?c.label:'Método Laravel',replaceText:m+'()',importClass}));
}
function modelInstanceCandidates(classToken,prefix){
    const c=resolveCompletion(classToken);
    if(!c)return [];
    const items=[];
    const seen=new Set();
    const push=(label,insert,kind,detail)=>{const key=kind+':'+label;if(seen.has(key))return;seen.add(key);items.push({label,insert,kind,detail,replaceText:insert});};
    if(c.kind==='model'||/model/i.test(c.kind||'')){
        for(const field of c.fillable||[])push(field,field,'fillable',`Fillable · ${c.label}`);
        for(const field of c.properties||[])push(field,field,'property',`Atributo · ${c.label}`);
        for(const method of modelInstanceMethods)push(method+'()',method+'()','method',`Eloquent Model · ${c.label}`);
    }
    for(const method of c.methods||[]){const signature=methodLabel(method,c);push(signature,method+'()','method',c.label);}
    const p=(prefix||'').toLowerCase();
    return items.filter(x=>x.label.toLowerCase().startsWith(p)).slice(0,45);
}
function builderCandidates(classToken,prefix){
    const c=resolveCompletion(classToken);
    if(!c)return [];
    const coreMethods=['where','orWhere','first','get','find','orderBy'];
    const methods=[...modelMethods,'orWhere','whereKey','whereKeyNot','whereColumn','whereDate','whereDay','whereMonth','whereYear','whereTime','whereJsonContains','whereJsonLength','orWhereIn','orWhereNull','orWhereNotNull','orderByDesc','orderByRaw','selectRaw','addSelect','withExists','withSum','withAvg','withMin','withMax','whereDoesntHave','orWhereHas','orWhereRelation','when','unless','tap','chunk','chunkById','lazy','lazyById','cursor','sole'];
    const items=[];
    const seen=new Set();
    const push=(label,insert,kind,detail)=>{const key=kind+':'+label;if(seen.has(key))return;seen.add(key);items.push({label,insert,kind,detail,replaceText:insert});};
    for(const method of coreMethods)push(method+'()',method+'()','method',`Eloquent Builder · ${c.label}`);
    for(const field of (c.fillable||[]).slice(0,6))push(field,`where('${field}', )`,'fillable',`Fillable · usar em where() · ${c.label}`);
    for(const field of (c.properties||[]).filter(field=>!(c.fillable||[]).includes(field)).slice(0,4))push(field,`where('${field}', )`,'property',`Atributo · usar em where() · ${c.label}`);
    for(const method of [...methods,...(c.methods||[])])push(method+'()',method+'()','method',`Eloquent Builder · ${c.label}`);
    for(const field of (c.fillable||[]).slice(6))push(field,`where('${field}', )`,'fillable',`Fillable · usar em where() · ${c.label}`);
    for(const field of (c.properties||[]).filter(field=>!(c.fillable||[]).includes(field)).slice(4))push(field,`where('${field}', )`,'property',`Atributo · usar em where() · ${c.label}`);
    const p=(prefix||'').toLowerCase();
    return items.filter(x=>x.label.toLowerCase().startsWith(p)||x.detail.toLowerCase().includes(p)).slice(0,50);
}
function collectionCandidates(classToken,prefix){
    const c=resolveCompletion(classToken);
    const methods=['all','average','avg','chunk','collapse','collect','contains','count','each','every','filter','first','firstOrFail','flatMap','flatten','forget','get','groupBy','has','implode','isEmpty','isNotEmpty','keyBy','keys','last','map','mapInto','mapSpread','max','median','merge','min','pluck','pop','push','put','random','reduce','reject','reverse','search','shift','slice','sort','sortBy','sortByDesc','sum','take','toArray','toJson','unique','values','where','whereIn','whereNotIn'];
    const p=(prefix||'').toLowerCase();
    return methods.filter(x=>x.toLowerCase().startsWith(p)).slice(0,45).map(method=>({label:method+'()',insert:method+'()',kind:'method',detail:`Collection${c?' · '+c.label:''}`,replaceText:method+'()'}));
}
function chainCandidates(classToken,mode,prefix){
    if(mode==='builder')return builderCandidates(classToken,prefix);
    if(mode==='collection')return collectionCandidates(classToken,prefix);
    if(resolveCompletion(classToken)?.kind==='package')return modelInstanceCandidates(classToken,prefix);
    if(mode==='model'||mode==='instance')return modelInstanceCandidates(classToken,prefix);
    return [];
}
function updateAutocomplete(force=false){
    const ctx=completionContext();
    if(!ctx){closeAutocomplete();return;}
    if(ctx.type==='class'&&!force&&ctx.prefix.length<2){closeAutocomplete();return;}
    let items=[];
    if(ctx.type==='static')items=methodCandidates(ctx.classToken,ctx.prefix);
    else if(ctx.type==='chain')items=chainCandidates(ctx.classToken,ctx.mode,ctx.prefix);
    else items=classCandidates(ctx.prefix);
    if(!items.length){closeAutocomplete();return;}
    acItems=items;acIndex=0;acReplaceStart=ctx.start;acReplaceEnd=ctx.end;const importToken=ctx.importClassToken||ctx.classToken;acImportClass=importToken?importClassFor(importToken,resolveCompletion(importToken)):'';renderAutocomplete();positionAutocomplete();
}
function renderAutocomplete(){
    els.autocomplete.innerHTML='';acItems.slice(0,12).forEach((item,i)=>{const b=document.createElement('button');b.type='button';b.className='ac-item'+(i===acIndex?' active':'');b.dataset.i=i;b.title=`${item.label}${item.detail?'\n'+item.detail:''}`;b.innerHTML=`<span class="ac-kind ${escapeHTML(item.kind||'class')}">${escapeHTML(item.kind||'class')}</span><span class="ac-main"><div class="ac-label">${escapeHTML(item.label)}</div><div class="ac-detail">${escapeHTML(item.detail||'')}</div></span>`;b.addEventListener('mousedown',e=>{e.preventDefault();acceptAutocomplete(i)});els.autocomplete.appendChild(b);});els.autocomplete.classList.add('open');
}
function positionAutocomplete(){
    const pos=els.code.selectionStart||0,before=els.code.value.slice(0,pos),lines=before.split('\n'),line=lines.length-1,col=lines[lines.length-1].length;const lh=21.67,cw=7.58;let left=15+col*cw-els.code.scrollLeft,top=12+(line+1)*lh-els.code.scrollTop;const w=els.codeStack.clientWidth;left=Math.max(8,Math.min(left,w-480));top=Math.max(8,Math.min(top,els.codeStack.clientHeight-285));els.autocomplete.style.left=left+'px';els.autocomplete.style.top=top+'px';
}
function closeAutocomplete(){els.autocomplete.classList.remove('open');acItems=[];acImportClass='';}
function insertImport(code,fqcn){
    const imports=importedClasses(code);
    if([...imports.values()].some(value=>value.toLowerCase()===fqcn.toLowerCase()))return code;
    const line=`use ${fqcn};\n`;
    const opening=code.match(/^\s*<\?php\s*/);
    if(!opening)return line+code;
    const offset=opening[0].length;
    const rest=code.slice(offset);
    const useLines=[...rest.matchAll(/^\s*use\s+[^;]+;\s*/gm)];
    if(useLines.length){const last=useLines[useLines.length-1];const at=offset+last.index+last[0].length;return code.slice(0,at)+line+code.slice(at);}
    return code.slice(0,offset)+line+code.slice(offset);
}
function acceptAutocomplete(index=acIndex){const item=acItems[index];if(!item)return;if(item.kind==='import'){els.code.value=insertImport(els.code.value,item.importClass);refreshEditor();saveEditorToTab();schedulePersist();closeAutocomplete();els.code.focus();return;}let code=els.code.value;let shift=0;const importClass=item.importClass||acImportClass;if(importClass){const imported=insertImport(code,importClass);shift=imported.length-code.length;code=imported;}const start=acReplaceStart+shift,end=acReplaceEnd+shift,before=code.slice(0,start),after=code.slice(end),insert=item.replaceText||item.insert||item.label;els.code.value=before+insert+after;let caret=before.length+insert.length;if(insert.endsWith('()'))caret--;els.code.setSelectionRange(caret,caret);refreshEditor();saveEditorToTab();schedulePersist();closeAutocomplete();els.code.focus();}

async function validateProject(project,toastOnError=true){
    if(!project)return;setStatus('loading','Validando…');
    try{const s=await api('/api/status?project='+encodeURIComponent(project));if(s.ok){setStatus('ok','Laravel pronto');els.phpStatus.textContent='PHP '+s.php;els.laravelStatus.textContent=s.laravel;els.storageStatus.textContent=s.storage+' · '+basename(s.storagePath||'');return true;}setStatus('bad',s.error||'Projeto inválido');if(toastOnError)showToast(s.error||'Projeto inválido',true);return false;}catch(e){setStatus('bad','Falha na validação');if(toastOnError)showToast(e.message,true);return false;}
}
function showProjectLoading(project,detail){loadingProject=project;els.projectLoading.classList.remove('hidden');els.projectLoadingDetail.textContent=detail;}
function hideProjectLoading(){loadingProject='';els.projectLoading.classList.add('hidden');}
async function indexProject(project,force=false){
    if(!project)return false;
    if(!force&&indexedProject===project)return true;
    els.indexBadge.textContent='indexando…';
    try{const data=await api('/api/index?project='+encodeURIComponent(project));if(!data.ok)throw new Error(data.error||'Falha ao indexar');if(activeTab()?.project===project){completions=data.completions||[];indexedProject=project;els.indexBadge.textContent=`${data.count||0} símbolos`;}return true;}catch(e){if(activeTab()?.project===project){completions=[];indexedProject='';els.indexBadge.textContent='0 símbolos';}showToast(e.message,true);return false;}
}
async function loadProjectContext(project,force=false){
    if(!project)return;
    if(!force&&indexedProject===project)return;
    if(projectLoads.has(project)&&!force)return projectLoads.get(project);
    const task=(async()=>{
        showProjectLoading(project,t('validatingProject'));
        try{
            const valid=await validateProject(project,false);
            if(!valid)throw new Error('Não foi possível validar o projeto Laravel.');
            if(loadingProject===project)els.projectLoadingDetail.textContent=t('readingVendor');
            const indexed=await indexProject(project,force);
            if(!indexed)throw new Error('Não foi possível ler as classes do projeto.');
        }catch(error){if(error.message!=='Não foi possível ler as classes do projeto.')showToast(error.message,true);}
        finally{if(loadingProject===project)hideProjectLoading();}
    })();
    projectLoads.set(project,task);
    try{return await task;}finally{projectLoads.delete(project);}
}

function renderRunButton(){if(!els.runBtn)return;if(running){els.runBtn.innerHTML=`<svg class="stop-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1"/></svg> ${escapeHTML(t('stop'))}`;els.runBtn.classList.add('run-stop');return;}els.runBtn.innerHTML=`▶ ${escapeHTML(t('run'))} <span style="opacity:.72">Ctrl+Enter</span>`;els.runBtn.classList.remove('run-stop');}
async function runCode(selectedCode=null){
    if(running)return;saveEditorToTab();const tab=activeTab();if(!tab?.project){openFolderBrowser('');return;}const selection=els.code.selectionStart!==els.code.selectionEnd;const code=selectedCode===null?(selection?els.code.value.slice(els.code.selectionStart,els.code.selectionEnd):tab.code):selectedCode;if(typeof code!=='string'||!code.trim()){showToast('Digite algum código PHP.',true);els.code.focus();return;}
    running=true;runController=new AbortController();els.runBtn.disabled=false;renderRunButton();els.durationLabel.textContent=t('executing');els.output.className='output';els.output.textContent=t('executing');
    try{
        const res=await api('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:tab.project,code,previewParams:tab.previewParams||{}}),signal:runController.signal});
        tab.output=res.output||'';tab.json=res.json||'';tab.previewHtml=res.previewHtml||'';tab.previewData=res.previewData||'';tab.previewMime=res.previewMime||'';tab.previewRoute=res.previewRoute||null;tab.previewCode=tab.previewRoute?code:'';tab.resultType=res.resultType||'';tab.durationMs=res.durationMs||0;tab.ok=!!res.ok;tab.updatedAt=nowISO();if(tab.previewRoute||tab.previewHtml||tab.previewData)viewMode='browser';
        state.history.unshift({id:uid('run'),title:tab.title,project:tab.project,code,output:tab.output,json:tab.json,previewHtml:tab.previewHtml,previewData:tab.previewData,previewMime:tab.previewMime,previewRoute:tab.previewRoute,previewParams:tab.previewParams,resultType:tab.resultType,durationMs:tab.durationMs,ok:tab.ok,error:res.error||'',createdAt:nowISO()});state.history=state.history.slice(0,100);
        renderOutput();renderHistory();schedulePersist();
        if(!res.ok)showToast(res.error||'Execução falhou',true);
    }catch(e){tab.output=e.name==='AbortError'?t('executionStopped'):e.message;tab.json='';tab.previewHtml='';tab.previewData='';tab.previewMime='';tab.previewRoute=null;tab.previewCode='';tab.resultType=e.name==='AbortError'?'interrompido':'erro';tab.ok=false;tab.durationMs=0;renderOutput();if(e.name!=='AbortError')showToast(e.message,true);else schedulePersist();}
    finally{running=false;runController=null;els.runBtn.disabled=false;renderRunButton();}
}
function stopRun(){if(!running||!runController)return;els.runBtn.disabled=true;els.runBtn.textContent=t('stopping');runController.abort();}
function stripAnsi(value){return String(value||'').replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g,'');}
function ansiToHTML(text){const colors={30:'ansi-black',31:'ansi-red',32:'ansi-green',33:'ansi-yellow',34:'ansi-blue',35:'ansi-magenta',36:'ansi-cyan',37:'ansi-white',90:'ansi-black',91:'ansi-red',92:'ansi-green',93:'ansi-yellow',94:'ansi-blue',95:'ansi-magenta',96:'ansi-cyan',97:'ansi-white'};const re=/\x1b\[([0-9;]*)m/g;let out='',last=0,classes=[],m;while((m=re.exec(text))){out+=classes.length?`<span class="${classes.join(' ')}">${escapeHTML(text.slice(last,m.index))}</span>`:escapeHTML(text.slice(last,m.index));const codes=(m[1]||'0').split(';').map(Number);for(const c of codes){if(c===0)classes=[];else if(c===1&&!classes.includes('ansi-bold'))classes.push('ansi-bold');else if(colors[c]){classes=classes.filter(x=>!x.startsWith('ansi-')||x==='ansi-bold');classes.push(colors[c]);}}last=re.lastIndex;}const tail=text.slice(last);out+=classes.length?`<span class="${classes.join(' ')}">${escapeHTML(tail)}</span>`:escapeHTML(tail);return out;}
function highlightJSON(text){const escaped=escapeHTML(text);return escaped.replace(/(&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\&])*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,m=>{if(/^&quot;/.test(m))return /:\s*$/.test(m)?`<span class="json-key">${m}</span>`:`<span class="json-string">${m}</span>`;if(/true|false/.test(m))return `<span class="json-bool">${m}</span>`;if(/null/.test(m))return `<span class="json-null">${m}</span>`;return `<span class="json-number">${m}</span>`;});}
function renderOutput(){
    const tab=activeTab();if(!tab)return;els.resultType.textContent=tab.resultType||'—';els.durationLabel.textContent=tab.durationMs?`${tab.durationMs} ms`:'pronto';els.outputSubtitle.textContent=viewMode==='browser'?'prévia da resposta gerada':'resultado do Laravel';const raw=tab.output||'',json=tab.json||'';
    $$('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===viewMode));
    const browserMode=viewMode==='browser';els.outputScroll.hidden=browserMode;els.browserToolbar.hidden=!browserMode;els.browserContainer.hidden=!browserMode;els.outputShell.classList.toggle('browser-open',browserMode);
    if(browserMode){renderBrowser(tab);return;}
    if(viewMode==='json'){
        if(!json){els.output.className='output empty';els.output.textContent='Esta execução não retornou um valor convertível para JSON.';return;}els.output.className='output';els.output.innerHTML=highlightJSON(json);return;
    }
    if(viewMode==='auto'&&json){els.output.className='output';els.output.innerHTML=highlightJSON(json);return;}
    if(!raw){els.output.className='output empty';els.output.textContent='A execução terminou sem valor de retorno e sem saída em stdout.';return;}
    els.output.className='output'+(tab.ok===false?' error':'');els.output.innerHTML=ansiToHTML(raw);
}

async function openFolderBrowser(path,purpose='project'){folderPurpose=purpose;selectedFile='';els.openSelectedFileBtn.hidden=purpose!=='file';els.folderSelectBtn.hidden=purpose==='file';openModal(els.folderModal);await browseFolder(path||'');await loadSSHConnections();}
async function browseFolder(path){
    els.folderList.innerHTML='<div class="empty-list">Carregando…</div>';els.driveGrid.innerHTML='';els.folderSelectBtn.disabled=true;els.openSelectedFileBtn.disabled=true;selectedFile='';folderCurrentIsLaravel=false;
    try{const data=await api('/api/fs/list?path='+encodeURIComponent(path||''));if(!data.ok)throw new Error(data.error||'Não foi possível listar a pasta');currentFolder=data.current||'';els.folderPathInput.value=currentFolder;const drives=data.drives||[];drives.forEach(d=>{const b=document.createElement('button');b.type='button';b.className='drive-btn';b.textContent='▣ '+d;b.addEventListener('click',()=>browseFolder(d));els.driveGrid.appendChild(b);});renderSSHConnections();
        if(!currentFolder&&drives.length){els.folderList.innerHTML=`<div class="empty-list">${escapeHTML(t('selectDrive'))}</div>`;els.folderHint.textContent=t('browseDrives');return;}
        const currentStatus=await api('/api/status?project='+encodeURIComponent(currentFolder)).catch(()=>({ok:false}));folderCurrentIsLaravel=!!currentStatus.ok;els.folderSelectBtn.disabled=folderPurpose==='file'||!folderCurrentIsLaravel;els.folderHint.textContent=folderPurpose==='file'?t('selectPHPFile'):folderCurrentIsLaravel?t('currentLaravelProject'):t('enterLaravelFolder');
        els.folderList.innerHTML='';if(data.parent){const up=document.createElement('button');up.type='button';up.className='file-row';up.innerHTML='<span class="file-icon">↰</span><span class="file-name">..</span><span></span>';up.addEventListener('click',()=>browseFolder(data.parent));els.folderList.appendChild(up);}for(const entry of data.entries||[]){const row=document.createElement('button');row.type='button';row.className='file-row'+(!entry.isDir?' file-entry':'');row.innerHTML=`<span class="file-icon">${entry.isDir?FOLDER_ICON:'PHP'}</span><span class="file-name">${escapeHTML(entry.name)}</span>${entry.isLaravel?'<span class="laravel-tag">Laravel</span>':'<span></span>'}`;row.addEventListener('dblclick',()=>entry.isDir?browseFolder(entry.path):openProjectFile(entry.path));row.addEventListener('click',()=>{if(entry.isDir){browseFolder(entry.path);return;}selectedFile=entry.path;els.openSelectedFileBtn.disabled=false;$$('.file-entry').forEach(x=>x.classList.remove('selected'));row.classList.add('selected');});els.folderList.appendChild(row);}if(!(data.entries||[]).length&&!data.parent)els.folderList.innerHTML=`<div class="empty-list">${escapeHTML(t('emptyProjectBrowser'))}</div>`;
    }catch(e){els.folderList.innerHTML=`<div class="empty-list">${escapeHTML(e.message)}</div>`;showToast(e.message,true);}
}
function chooseCurrentFolder(){if(!currentFolder||!folderCurrentIsLaravel)return;const tab=activeTab();tab.project=currentFolder;state.lastProject=currentFolder;closeModal(els.folderModal);updateProjectUI();loadProjectContext(currentFolder,true);schedulePersist();}
async function loadSSHConnections(){try{const data=await api('/api/ssh/connections');sshConnections=data.connections||[];renderSSHConnections();}catch(error){showToast(error.message,true);}}
function renderSSHConnections(){ $$('.ssh-profile').forEach(item=>item.remove());for(const connection of sshConnections){const button=document.createElement('button');button.type='button';button.className='drive-btn ssh-profile';button.textContent=`SSH · ${connection.name}`;button.title=`${connection.user}@${connection.host}:${connection.port} · ${connection.platform}`;button.addEventListener('click',()=>{els.sshForm.reset();els.sshForm.dataset.id=connection.id;els.sshName.value=connection.name;els.sshHost.value=connection.host;els.sshPort.value=connection.port;els.sshUser.value=connection.user;els.sshPlatform.value=connection.platform;els.sshPassword.value='';els.sshSavePassword.checked=false;openModal(els.sshModal)});els.driveGrid.appendChild(button);}}
async function openProjectFile(path){try{const data=await api('/api/file?path='+encodeURIComponent(path));const tab=activeTab();tab.code=data.content||'';tab.filePath=data.path||path;if(data.project){tab.project=data.project;state.lastProject=data.project;}tab.title=basename(path);closeModal(els.folderModal);els.code.value=tab.code;refreshEditor();updateProjectUI();if(tab.project)loadProjectContext(tab.project,true);saveEditorToTab();schedulePersist();els.code.focus();showToast('Arquivo aberto no editor.');}catch(e){showToast(e.message,true);}}
async function saveProjectFile(){const tab=activeTab();if(!tab?.filePath)return;saveEditorToTab();try{await api('/api/file',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:tab.filePath,content:tab.code})});showToast('Arquivo salvo no projeto.');}catch(e){showToast(e.message,true);}}

function snippetFolderPath(folderId,seen=new Set()){const folder=state.snippetFolders.find(item=>item.id===folderId);if(!folder||seen.has(folder.id))return'';seen.add(folder.id);const parent=folder.parentId?snippetFolderPath(folder.parentId,seen):'';return parent?`${parent} / ${folder.name}`:folder.name;}
function openSnippetFolderPicker(){const snippet=movingSnippetId?state.snippets.find(item=>item.id===movingSnippetId):null;const selectedFolderId=snippet?snippet.folderId:snippetSaveFolderId;const folder=state.snippetFolders.find(item=>item.id===(selectedFolderId||''));snippetFolderCurrentId=folder?folder.parentId:'';snippetFolderSelectedId=folder?.id||'';els.snippetFolderModalTitle.textContent=snippet?t('moveSnippet'):t('chooseFolderTitle');els.confirmSnippetFolderBtn.textContent=snippet?t('moveToFolder'):t('useFolder');els.newSnippetFolderName.value='';renderSnippetFolderPicker();openModal(els.snippetFolderModal);}
function renderSnippetFolderPicker(){els.snippetFolderBreadcrumb.textContent=snippetFolderPath(snippetFolderCurrentId)||'Sem pasta';els.snippetFolderList.innerHTML='';if(snippetFolderCurrentId){const parent=state.snippetFolders.find(folder=>folder.id===snippetFolderCurrentId)?.parentId||'';const row=document.createElement('button');row.type='button';row.className='folder-browser-row';row.innerHTML='<span class="folder-browser-icon">↰</span><span>..</span>';row.addEventListener('click',()=>{snippetFolderCurrentId=parent;snippetFolderSelectedId=parent;renderSnippetFolderPicker()});els.snippetFolderList.appendChild(row);}const children=state.snippetFolders.filter(folder=>folder.parentId===snippetFolderCurrentId).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));for(const folder of children){const row=document.createElement('button');row.type='button';row.dataset.folderId=folder.id;row.className='folder-browser-row'+(folder.id===snippetFolderSelectedId?' selected':'');row.innerHTML=`<span class="folder-browser-icon">${FOLDER_ICON}</span><span class="folder-browser-name">${escapeHTML(folder.name)}</span><span class="folder-browser-arrow">›</span>`;row.addEventListener('click',()=>{snippetFolderSelectedId=folder.id;els.snippetFolderList.querySelectorAll('[data-folder-id]').forEach(item=>item.classList.toggle('selected',item.dataset.folderId===folder.id));els.deleteSnippetFolderBtn.disabled=false});row.addEventListener('dblclick',()=>{snippetFolderCurrentId=folder.id;snippetFolderSelectedId=folder.id;renderSnippetFolderPicker()});els.snippetFolderList.appendChild(row);}if(!children.length){const empty=document.createElement('div');empty.className='empty-list';empty.textContent=snippetFolderCurrentId?'Pasta vazia. Crie uma subpasta aqui.':'Nenhuma pasta criada.';els.snippetFolderList.appendChild(empty);}els.deleteSnippetFolderBtn.disabled=!snippetFolderSelectedId;}
function createSnippetFolder(){const name=els.newSnippetFolderName.value.trim();if(!name){els.newSnippetFolderName.focus();return;}if(state.snippetFolders.some(folder=>folder.parentId===snippetFolderCurrentId&&folder.name.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'))){showToast('Já existe uma pasta com esse nome nesse local.',true);return;}const folder={id:uid('folder'),name,parentId:snippetFolderCurrentId};state.snippetFolders.push(folder);snippetFolderCurrentId=folder.id;snippetFolderSelectedId=folder.id;els.newSnippetFolderName.value='';renderSnippetFolderPicker();schedulePersist();showToast('Subpasta criada.');}
function requestDeleteSnippetFolder(folderId=snippetFolderSelectedId){const folder=state.snippetFolders.find(item=>item.id===folderId);if(!folder)return;pendingFolderDeleteId=folder.id;els.deleteSnippetFolderMessage.textContent=`A pasta “${snippetFolderPath(folder.id)}”, suas subpastas e os snippets guardados nelas serão excluídos permanentemente.`;openModal(els.deleteSnippetFolderModal);}
function confirmDeleteSnippetFolder(){const target=state.snippetFolders.find(folder=>folder.id===pendingFolderDeleteId);if(!target)return;const removed=new Set([target.id]);let changed=true;while(changed){changed=false;for(const folder of state.snippetFolders){if(folder.parentId&&removed.has(folder.parentId)&&!removed.has(folder.id)){removed.add(folder.id);changed=true;}}}state.snippetFolders=state.snippetFolders.filter(folder=>!removed.has(folder.id));state.snippets=state.snippets.filter(snippet=>!removed.has(snippet.folderId));state.tabs.forEach(tab=>{if(removed.has(tab.snippetFolderId)){tab.snippetFolderId=target.parentId||'';delete tab.snippetId;}});if(removed.has(snippetSaveFolderId))snippetSaveFolderId=target.parentId||'';if(removed.has(snippetFolderCurrentId))snippetFolderCurrentId=target.parentId||'';if(removed.has(savedFolderFilter))savedFolderFilter=target.parentId||'';removed.forEach(id=>collapsedSavedFolders.delete(id));snippetFolderSelectedId=snippetFolderCurrentId;pendingFolderDeleteId='';selectSnippetSaveFolder(snippetSaveFolderId);closeModal(els.deleteSnippetFolderModal);renderSnippetFolderPicker();renderSaved();schedulePersist();showToast('Pasta e conteúdo excluídos.');}
function selectSnippetSaveFolder(folderId){snippetSaveFolderId=folderId||'';els.snippetFolderPath.textContent=snippetFolderPath(snippetSaveFolderId)||'Sem pasta';}
function openSaveModal(){const tab=activeTab();if(!tab)return;els.snippetName.value=tab.title||'';els.snippetAnnotation.value=tab.snippetAnnotation||state.snippets.find(item=>item.id===tab.snippetId)?.annotation||'';selectSnippetSaveFolder(tab.snippetFolderId||'');openModal(els.saveModal);setTimeout(()=>{els.snippetName.focus();els.snippetName.select();},50);}
function saveSnippet(){const tab=activeTab();const name=els.snippetName.value.trim()||tab.title||'Snippet';const annotation=els.snippetAnnotation.value.trim();const folderId=snippetSaveFolderId;const existing=state.snippets.find(s=>s.id===tab.snippetId)||state.snippets.find(s=>s.name.toLowerCase()===name.toLowerCase()&&String(s.folderId||'')===folderId);if(existing){existing.name=name;existing.code=tab.code;existing.project=tab.project;existing.annotation=annotation;existing.folderId=folderId;existing.updatedAt=nowISO();tab.snippetId=existing.id;}else{const snippet={id:uid('snippet'),name,code:tab.code,project:tab.project,annotation,folderId,createdAt:nowISO(),updatedAt:nowISO()};state.snippets.unshift(snippet);tab.snippetId=snippet.id;}tab.snippetFolderId=folderId;tab.snippetAnnotation=annotation;tab.title=name;closeModal(els.saveModal);renderTabs();renderSaved();schedulePersist();showToast(t('snippetSaved'));}
function showSavedFolderContextMenu(folderId,event){event.preventDefault();pendingFolderDeleteId=folderId;els.savedFolderContextMenu.style.display='block';els.savedFolderContextMenu.style.left=`${event.clientX}px`;els.savedFolderContextMenu.style.top=`${event.clientY}px`;const bounds=els.savedFolderContextMenu.getBoundingClientRect();els.savedFolderContextMenu.style.left=`${Math.min(event.clientX,window.innerWidth-bounds.width-8)}px`;els.savedFolderContextMenu.style.top=`${Math.min(event.clientY,window.innerHeight-bounds.height-8)}px`;}
function closeSavedFolderContextMenu(){els.savedFolderContextMenu.style.display='none';}
function moveSavedSnippet(folderId){const snippet=state.snippets.find(item=>item.id===movingSnippetId);if(!snippet){movingSnippetId='';return;}snippet.folderId=folderId||'';snippet.updatedAt=nowISO();savedFolderFilter=snippet.folderId;let folder=state.snippetFolders.find(item=>item.id===snippet.folderId);while(folder){collapsedSavedFolders.delete(folder.id);folder=folder.parentId?state.snippetFolders.find(item=>item.id===folder.parentId):null;}state.tabs.forEach(tab=>{if(tab.snippetId===snippet.id)tab.snippetFolderId=snippet.folderId;});movingSnippetId='';closeModal(els.snippetFolderModal);renderSaved();schedulePersist();showToast(`Snippet movido para ${snippetFolderPath(snippet.folderId)||'GoTinker'}.`);}
function renderSavedFolderTree(){
    els.savedFolderTree.innerHTML='';els.savedFolderCount.textContent=t('folderCount').replace('{count}',state.snippetFolders.length);
    const childrenOf=parentId=>state.snippetFolders.filter(folder=>(folder.parentId||'')===parentId).sort((a,b)=>a.name.localeCompare(b.name,state.language||'pt-BR'));
    const addFolder=(parent,node)=>{const row=document.createElement('div');row.className='saved-folder-entry'+(savedFolderFilter===node.id?' selected':'');row.style.setProperty('--folder-depth',String(node.depth));if(!node.root)row.addEventListener('contextmenu',event=>showSavedFolderContextMenu(node.id,event));const toggle=document.createElement('button');toggle.type='button';toggle.className='saved-folder-toggle';toggle.textContent=node.hasChildren?(collapsedSavedFolders.has(node.id)?'▸':'▾'):'';toggle.disabled=!node.hasChildren;toggle.setAttribute('aria-label',node.hasChildren?(collapsedSavedFolders.has(node.id)?t('expandFolder'):t('collapseFolder')):'');toggle.addEventListener('click',()=>{if(collapsedSavedFolders.has(node.id))collapsedSavedFolders.delete(node.id);else collapsedSavedFolders.add(node.id);renderSavedFolderTree();});const select=document.createElement('button');select.type='button';select.className='saved-folder-select';select.innerHTML=`<span class="saved-folder-icon">${FOLDER_ICON}</span><span class="saved-folder-name">${escapeHTML(node.name)}</span><span class="saved-folder-items">${node.count}</span>`;select.addEventListener('click',()=>{savedFolderFilter=node.id;renderSaved();});row.append(toggle,select);parent.appendChild(row);if(!collapsedSavedFolders.has(node.id)){for(const child of childrenOf(node.id))addFolder(parent,{id:child.id,name:child.name,depth:node.depth+1,count:state.snippets.filter(snippet=>String(snippet.folderId||'')===child.id).length,hasChildren:childrenOf(child.id).length>0});}};
    addFolder(els.savedFolderTree,{id:'',name:'GoTinker',root:true,depth:0,count:state.snippets.filter(snippet=>!snippet.folderId).length,hasChildren:childrenOf('').length>0});
}
function renderSaved(){
    renderSavedFolderTree();const folderId=savedFolderFilter||'';const folderTitle=folderId?snippetFolderPath(folderId):'GoTinker';els.savedFolderTitle.textContent=folderTitle;const query=els.savedSearch.value.trim().toLocaleLowerCase(state.language||'pt-BR');const snippets=state.snippets.filter(snippet=>String(snippet.folderId||'')===folderId&&(!query||`${snippet.name} ${snippet.code}`.toLocaleLowerCase(state.language||'pt-BR').includes(query)));els.savedCount.textContent=t('savedCounts').replace('{snippets}',state.snippets.length).replace('{folders}',state.snippetFolders.length);els.savedFolderSummary.textContent=t('snippetsInFolder').replace('{count}',snippets.length);els.savedList.innerHTML='';if(!snippets.length){els.savedList.innerHTML=`<div class="empty-list">${query?t('noSearchMatches'):state.snippets.length?t('emptyFolder'):t('noSavedSnippets')}</div>`;return;}snippets.forEach(s=>{const row=document.createElement('div');row.className='collection-item';row.title=[s.project||t('noProject'),s.annotation||''].filter(Boolean).join('\n');row.innerHTML=`<div class="collection-main"><div class="collection-title">${escapeHTML(s.name)}</div><div class="collection-meta">${escapeHTML(s.project||t('noProject'))} · ${escapeHTML(fmtTime(s.updatedAt||s.createdAt))}</div><div class="collection-code">${escapeHTML((s.code||'').replace(/\s+/g,' ').slice(0,180))}</div></div><div class="collection-actions"><button class="btn btn-ghost open" type="button">${escapeHTML(t('open'))}</button><button class="btn btn-ghost move" type="button">${escapeHTML(t('moveSnippet'))}</button><button class="btn btn-ghost export-php" type="button">${escapeHTML(t('exportPHP'))}</button><button class="btn btn-ghost danger del" type="button">${escapeHTML(t('delete'))}</button></div>`;const open=()=>{newTab({title:s.name,project:s.project,code:s.code,snippetId:s.id,snippetFolderId:s.folderId||'',snippetAnnotation:s.annotation||''});closeModal(els.savedModal)};row.querySelector('.open').addEventListener('click',open);row.querySelector('.collection-main').addEventListener('click',open);row.querySelector('.move').addEventListener('click',()=>{movingSnippetId=s.id;openSnippetFolderPicker()});row.querySelector('.export-php').addEventListener('click',()=>downloadText(`${safeFilename(s.name)}.php`,s.code||'','text/php'));row.querySelector('.del').addEventListener('click',()=>{state.snippets=state.snippets.filter(x=>x.id!==s.id);renderSaved();schedulePersist();});els.savedList.appendChild(row);});
}
function safeFilename(value){return String(value||'snippet').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/,'')||'snippet';}
function downloadText(filename,content,mime='application/json'){const blob=new Blob([content],{type:`${mime};charset=utf-8`});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function ensureSnippetFolder(parentId,name){const clean=name.trim()||'Imported';let folder=state.snippetFolders.find(item=>(item.parentId||'')===parentId&&item.name.toLocaleLowerCase('pt-BR')===clean.toLocaleLowerCase('pt-BR'));if(!folder){folder={id:uid('folder'),name:clean,parentId:parentId||''};state.snippetFolders.push(folder);}return folder.id;}
function collectionSnippet(name,code,folderId){const now=nowISO();state.snippets.unshift({id:uid('snippet'),name:name||'Snippet',code,project:activeTab()?.project||state.lastProject||'',folderId:folderId||'',createdAt:now,updatedAt:now});}
function exportSavedCollection(){const rootId=savedFolderFilter||'';const title=rootId?snippetFolderPath(rootId):'GoTinker';const folderItems=parentId=>{const items=state.snippets.filter(snippet=>String(snippet.folderId||'')===parentId).map(snippet=>({name:snippet.name||'Snippet',request:{method:'POST',header:[],body:{mode:'raw',raw:snippet.code||'',options:{raw:{language:'php'}}},url:{raw:'http://localhost'}}}));for(const folder of state.snippetFolders.filter(item=>(item.parentId||'')===parentId).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')))items.push({name:folder.name,item:folderItems(folder.id)});return items;};const collection={info:{name:title,schema:'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},item:folderItems(rootId)};downloadText(`${safeFilename(title)}.postman_collection.json`,JSON.stringify(collection,null,2));}
async function importSavedFile(file){if(!file)return;try{const text=await file.text();if(/\.php$/i.test(file.name)){collectionSnippet(file.name.replace(/\.php$/i,''),text,savedFolderFilter);showToast('Arquivo PHP importado como snippet.');}else{const data=JSON.parse(text);const entries=Array.isArray(data.item)?data.item:Array.isArray(data.collection?.item)?data.collection.item:null;if(!entries)throw new Error('O JSON não contém uma collection Postman válida.');let imported=0;const visit=(items,parentId)=>{for(const item of items){if(Array.isArray(item.item)){const folderId=ensureSnippetFolder(parentId,item.name||'Pasta');visit(item.item,folderId);continue;}const request=item.request||{};const body=request.body;const code=typeof body==='string'?body:typeof body?.raw==='string'?body.raw:null;if(code===null)continue;collectionSnippet(item.name||'Snippet',code,parentId);imported++;}};visit(entries,savedFolderFilter||'');showToast(`${imported} snippet${imported===1?'':'s'} importado${imported===1?'':'s'} da collection.`);}schedulePersist();renderSaved();}catch(error){showToast(`Não foi possível importar: ${error.message}`,true);}finally{els.savedImportFile.value='';}}

function renderBrowser(tab){
    const route=tab.previewRoute;els.browserToolbar.hidden=!route;els.browserRouteParams.innerHTML='';els.browserRoutePath.textContent=route?`${route.method} /${route.uri}`:'';if(route){for(const parameter of route.parameters||[]){const label=document.createElement('label');label.className='browser-param';label.textContent=parameter.name+(parameter.optional?' (opcional)':'');const input=document.createElement('input');input.className='input';input.dataset.paramName=parameter.name;input.value=String(tab.previewParams?.[parameter.name]||'');input.placeholder=parameter.optional?'opcional':'informe o valor';input.required=!parameter.optional;els.browserRouteParams.append(label,input);}els.browserPreviewBtn.disabled=route.method!=='GET';els.browserPreviewBtn.textContent=tab.previewData||tab.previewHtml?'Atualizar resposta':'Gerar resposta';}
    if(tab.previewData&&tab.previewMime){const key=`${tab.id}:data:${tab.previewMime}:${tab.previewData.length}:${tab.previewData.slice(0,48)}`;if(browserFrameKey!==key){els.responseBrowser.removeAttribute('srcdoc');els.responseBrowser.setAttribute('sandbox','allow-forms allow-scripts allow-downloads');els.responseBrowser.src=`data:${tab.previewMime};base64,${tab.previewData}`;browserFrameKey=key;}els.responseBrowser.hidden=false;els.browserEmpty.hidden=true;return;}
    if(tab.previewHtml){const key=`${tab.id}:html:${tab.previewHtml.length}:${tab.previewHtml.slice(0,80)}`;if(browserFrameKey!==key){els.responseBrowser.removeAttribute('src');els.responseBrowser.setAttribute('sandbox','allow-forms allow-scripts allow-downloads');els.responseBrowser.srcdoc=tab.previewHtml;browserFrameKey=key;}els.responseBrowser.hidden=false;els.browserEmpty.hidden=true;return;}
    if(browserFrameKey){els.responseBrowser.removeAttribute('src');els.responseBrowser.srcdoc='';browserFrameKey='';}
    els.responseBrowser.hidden=true;els.browserEmpty.textContent=route?(route.missing?.length?`Informe ${route.missing.join(', ')} para executar esta rota.`:'Gerando resposta da rota…'):'Execute um código que retorne HTML ou registre uma rota para visualizar a resposta aqui.';els.browserEmpty.hidden=false;
}

async function generateRoutePreview(){
    const tab=activeTab();if(!tab?.previewRoute||!tab.previewCode)return;const params={};els.browserRouteParams.querySelectorAll('input[data-param-name]').forEach(input=>params[input.dataset.paramName]=input.value.trim());const missing=(tab.previewRoute.parameters||[]).filter(parameter=>!parameter.optional&&!params[parameter.name]).map(parameter=>parameter.name);if(missing.length){showToast(`Informe: ${missing.join(', ')}.`,true);return;}tab.previewParams=params;els.browserPreviewBtn.disabled=true;els.browserPreviewBtn.textContent='Gerando…';
    try{const result=await api('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:tab.project,code:tab.previewCode,previewParams:params})});tab.output=result.output||tab.output;tab.previewRoute=result.previewRoute||tab.previewRoute;tab.previewHtml=result.previewHtml||'';tab.previewData=result.previewData||'';tab.previewMime=result.previewMime||'';tab.durationMs=result.durationMs||tab.durationMs;tab.ok=!!result.ok;renderOutput();schedulePersist();if(result.previewStatus)showToast(`Resposta HTTP ${result.previewStatus}.`);else if(result.error)showToast(result.error,true);}catch(error){showToast(error.message,true);}finally{els.browserPreviewBtn.disabled=false;els.browserPreviewBtn.textContent=tab.previewData||tab.previewHtml?'Atualizar resposta':'Gerar resposta';}
}
function renderHistory(){
    els.historyCount.textContent=t('executionCount').replace('{count}',state.history.length);els.historyList.innerHTML='';if(!state.history.length){els.historyList.innerHTML=`<div class="empty-list">${escapeHTML(t('noExecutions'))}</div>`;return;}state.history.forEach(h=>{const row=document.createElement('div');row.className='collection-item';row.innerHTML=`<div class="collection-main"><div class="collection-title"><span class="${h.ok?'history-ok':'history-bad'}">${h.ok?'●':'●'}</span> ${escapeHTML(h.title||'Tinker')}</div><div class="collection-meta">${escapeHTML(fmtTime(h.createdAt))} · ${escapeHTML(h.resultType||t('noType'))} · ${Number(h.durationMs||0)} ms</div><div class="collection-code">${escapeHTML((h.code||'').replace(/\s+/g,' ').slice(0,180))}</div></div><div class="collection-actions"><button class="btn btn-ghost open" type="button">${escapeHTML(t('open'))}</button></div>`;const open=()=>{newTab({title:(h.title||'Histórico')+' • histórico',project:h.project,code:h.code,output:h.output,json:h.json,previewHtml:h.previewHtml,previewData:h.previewData,previewMime:h.previewMime,previewRoute:h.previewRoute,previewParams:h.previewParams,previewCode:h.previewRoute?h.code:'',resultType:h.resultType,durationMs:h.durationMs,ok:h.ok});closeModal(els.historyModal)};row.querySelector('.open').addEventListener('click',open);row.querySelector('.collection-main').addEventListener('click',open);els.historyList.appendChild(row);});
}

function applySplit(){els.workspace.style.gridTemplateColumns=`minmax(0,${state.split}fr) 5px minmax(0,${100-state.split}fr)`;}
function setupResizer(){let active=false;els.resizer.addEventListener('pointerdown',e=>{active=true;els.resizer.classList.add('active');els.resizer.setPointerCapture(e.pointerId)});els.resizer.addEventListener('pointermove',e=>{if(!active)return;const rect=els.workspace.getBoundingClientRect();let pct=((e.clientX-rect.left)/rect.width)*100;pct=Math.max(28,Math.min(72,pct));state.split=pct;applySplit()});els.resizer.addEventListener('pointerup',e=>{active=false;els.resizer.classList.remove('active');try{els.resizer.releasePointerCapture(e.pointerId)}catch{}schedulePersist()});}

els.code.addEventListener('input',()=>{refreshEditor();saveEditorToTab();schedulePersist();updateAutocomplete();});
els.code.addEventListener('scroll',()=>{syncEditorScroll();if(els.autocomplete.classList.contains('open'))positionAutocomplete();});
els.code.addEventListener('click',()=>{updateCursor();updateAutocomplete();});
els.code.addEventListener('keyup',e=>{if(!['ArrowUp','ArrowDown','Enter','Tab','Escape'].includes(e.key))updateCursor();});
els.code.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();closeAutocomplete();runCode();return;}
    if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();closeAutocomplete();if(activeTab()?.filePath)saveProjectFile();else openSaveModal();return;}
    if(e.ctrlKey&&e.code==='Space'){e.preventDefault();updateAutocomplete(true);return;}
    if(els.autocomplete.classList.contains('open')){
        if(e.key==='ArrowDown'){e.preventDefault();acIndex=(acIndex+1)%Math.min(12,acItems.length);renderAutocomplete();return;}
        if(e.key==='ArrowUp'){e.preventDefault();acIndex=(acIndex-1+Math.min(12,acItems.length))%Math.min(12,acItems.length);renderAutocomplete();return;}
        if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();acceptAutocomplete();return;}
        if(e.key==='Escape'){e.preventDefault();closeAutocomplete();return;}
    }
    if(e.key==='Tab'){e.preventDefault();const start=els.code.selectionStart,end=els.code.selectionEnd;els.code.setRangeText('    ',start,end,'end');refreshEditor();saveEditorToTab();schedulePersist();}
});

document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal-backdrop.open').forEach(closeModal);if(e.ctrlKey&&e.code==='Backquote'){e.preventDefault();toggleTerminal();}});
els.languageBtn.addEventListener('click',()=>els.languageMenu.classList.toggle('hidden'));document.addEventListener('pointerdown',event=>{if(!event.target.closest('.language-picker'))els.languageMenu.classList.add('hidden')});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal($('#'+b.dataset.close))));
$$('.modal-backdrop').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)closeModal(m)}));
$$('.view-btn').forEach(b=>b.addEventListener('click',()=>{viewMode=b.dataset.view;renderOutput()}));
els.browserRouteForm.addEventListener('submit',e=>{e.preventDefault();generateRoutePreview()});
els.runBtn.addEventListener('click',()=>running?stopRun():runCode());els.saveBtn.addEventListener('click',openSaveModal);els.confirmSaveBtn.addEventListener('click',saveSnippet);els.snippetName.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveSnippet()}});els.chooseSnippetFolderBtn.addEventListener('click',openSnippetFolderPicker);els.createSnippetFolderBtn.addEventListener('click',createSnippetFolder);els.newSnippetFolderName.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();createSnippetFolder()}});els.deleteSnippetFolderBtn.addEventListener('click',requestDeleteSnippetFolder);els.chooseNoSnippetFolderBtn.addEventListener('click',()=>{if(movingSnippetId){moveSavedSnippet('');return;}selectSnippetSaveFolder('');closeModal(els.snippetFolderModal)});els.confirmSnippetFolderBtn.addEventListener('click',()=>{if(movingSnippetId){moveSavedSnippet(snippetFolderSelectedId||snippetFolderCurrentId);return;}selectSnippetSaveFolder(snippetFolderSelectedId||snippetFolderCurrentId);closeModal(els.snippetFolderModal)});els.confirmDeleteSnippetFolderBtn.addEventListener('click',confirmDeleteSnippetFolder);
els.savedBtn.addEventListener('click',()=>{renderSaved();openModal(els.savedModal)});els.savedSearch.addEventListener('input',renderSaved);els.importSavedBtn.addEventListener('click',()=>els.savedImportFile.click());els.exportSavedBtn.addEventListener('click',exportSavedCollection);els.savedImportFile.addEventListener('change',()=>importSavedFile(els.savedImportFile.files?.[0]));els.deleteSavedFolderContextBtn.addEventListener('click',()=>{const folderId=pendingFolderDeleteId;closeSavedFolderContextMenu();requestDeleteSnippetFolder(folderId)});document.addEventListener('pointerdown',event=>{if(!els.savedFolderContextMenu.contains(event.target))closeSavedFolderContextMenu()});document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSavedFolderContextMenu()});els.historyBtn.addEventListener('click',()=>{renderHistory();openModal(els.historyModal)});els.projectPicker.addEventListener('click',()=>openFolderBrowser(activeTab()?.project||state.lastProject||''));els.reindexBtn.addEventListener('click',()=>{const p=activeTab()?.project;if(p)loadProjectContext(p,true);else openFolderBrowser('')});
els.folderGoBtn.addEventListener('click',()=>browseFolder(els.folderPathInput.value.trim()));els.folderPathInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();browseFolder(els.folderPathInput.value.trim())}});els.folderDrivesBtn.addEventListener('click',()=>browseFolder(''));els.folderSelectBtn.addEventListener('click',chooseCurrentFolder);
els.clearCodeBtn.addEventListener('click',()=>{els.code.value='';refreshEditor();saveEditorToTab();schedulePersist();els.code.focus()});els.clearOutputBtn.addEventListener('click',()=>{const t=activeTab();if(t){t.output='';t.json='';t.previewHtml='';t.previewData='';t.previewMime='';t.previewRoute=null;t.previewCode='';t.resultType='';t.durationMs=0;t.ok=true;renderOutput();schedulePersist()}});
els.copyBtn.addEventListener('click',async()=>{const t=activeTab();const text=(viewMode==='json'&&t?.json)?t.json:(t?.output||t?.json||'');if(!text)return;try{await navigator.clipboard.writeText(stripAnsi(text));showToast('Resposta copiada.')}catch{showToast('Não foi possível copiar.',true)}});
els.clearHistoryBtn.addEventListener('click',()=>{state.history=[];renderHistory();schedulePersist()});
els.openFileBtn.addEventListener('click',()=>openFolderBrowser(activeTab()?.project||state.lastProject||'','file'));els.openSelectedFileBtn.addEventListener('click',()=>{if(selectedFile)openProjectFile(selectedFile)});els.saveFileBtn.addEventListener('click',saveProjectFile);
$('#addSSHBtn').addEventListener('click',()=>{els.sshForm.reset();delete els.sshForm.dataset.id;els.sshPort.value='22';openModal(els.sshModal)});
els.sshForm.addEventListener('submit',async e=>{e.preventDefault();const connection={id:els.sshForm.dataset.id||'',name:els.sshName.value.trim(),host:els.sshHost.value.trim(),port:Number(els.sshPort.value||22),user:els.sshUser.value.trim(),platform:els.sshPlatform.value};try{const result=await api('/api/ssh/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connection,password:els.sshPassword.value,save:els.sshSavePassword.checked})});closeModal(els.sshModal);await loadSSHConnections();showToast(`Conexão ${result.connection.name} salva. Senha ${els.sshSavePassword.checked?'protegida com DPAPI':'não armazenada'}.`);}catch(error){showToast(error.message,true);}});
function currentTerminalSession(){return state.terminalSessions.find(session=>session.id===state.activeTerminalSessionId)||null;}
function showCmderSession(session){if(!session)return;const project=session.project||activeTab()?.project||state.lastProject||'';if(!project){showToast(t('selectProjectTerminal'),true);return;}session.project=project;window.GoTinkerTerminal?.open(session.id,project,els.cmderHost);}
function syncCmderBounds(){window.GoTinkerTerminal?.fitActive();}
function renderTerminalSessions(){els.terminalTabs.innerHTML='<div class="terminal-session-tabs" id="terminalSessionTabs"></div>';const list=els.terminalTabs.querySelector('#terminalSessionTabs');state.terminalSessions.forEach(session=>{const tab=document.createElement('button');tab.type='button';tab.className='terminal-tab'+(session.id===state.activeTerminalSessionId?' active':'');tab.title=[session.project||t('noProject'),session.name].join('\n');tab.innerHTML=`<span class="terminal-tab-name">${escapeHTML(session.name)}</span><span class="terminal-tab-close" aria-label="${escapeHTML(t('close'))}">×</span>`;tab.addEventListener('click',event=>{if(event.target.closest('.terminal-tab-close'))closeTerminalSession(session.id);else selectTerminalSession(session.id)});list.appendChild(tab);});const newButton=document.createElement('button');newButton.type='button';newButton.className='terminal-new-tab';newButton.id='newTerminalSessionBtn';newButton.title=t('newSession');newButton.setAttribute('aria-label',t('newSession'));newButton.textContent='+';newButton.addEventListener('click',()=>newTerminalSession());list.appendChild(newButton);const session=currentTerminalSession();els.terminalProject.textContent=session?.project||t('noProject');}
function newTerminalSession(persist=true){const id=uid('terminal');const session={id,name:`Cmder ${state.terminalSessions.length+1}`,project:activeTab()?.project||state.lastProject||''};state.terminalSessions.push(session);state.activeTerminalSessionId=id;renderTerminalSessions();if(persist)schedulePersist();if(!els.terminalPanel.hidden)showCmderSession(session);return session;}
function selectTerminalSession(id){state.activeTerminalSessionId=id;renderTerminalSessions();schedulePersist();showCmderSession(currentTerminalSession());}
function closeTerminalSession(id){const index=state.terminalSessions.findIndex(session=>session.id===id);state.terminalSessions=state.terminalSessions.filter(session=>session.id!==id);window.GoTinkerTerminal?.close(id);if(!state.terminalSessions.length){state.activeTerminalSessionId='';newTerminalSession(false);}else if(state.activeTerminalSessionId===id)state.activeTerminalSessionId=state.terminalSessions[Math.max(0,index-1)].id;renderTerminalSessions();schedulePersist();if(!els.terminalPanel.hidden)showCmderSession(currentTerminalSession());}
function toggleTerminal(force){const show=typeof force==='boolean'?force:els.terminalPanel.hidden;els.terminalPanel.hidden=!show;els.terminalResizer.hidden=!show;els.terminalPanel.classList.toggle('hidden',!show);els.panelLeft.classList.toggle('terminal-open',show);if(show){if(!state.terminalSessions.length)newTerminalSession();else{renderTerminalSessions();showCmderSession(currentTerminalSession());}}else syncCmderBounds();}
els.terminalToggleBtn.addEventListener('click',()=>toggleTerminal());els.closeTerminalBtn.addEventListener('click',()=>toggleTerminal(false));
els.terminalMenuBtn.addEventListener('click',event=>{event.stopPropagation();els.terminalMenu.classList.toggle('hidden')});$('#terminalCopyBtn').addEventListener('click',()=>{els.terminalMenu.classList.add('hidden');window.GoTinkerTerminal?.copyActive()});$('#terminalPasteBtn').addEventListener('click',()=>{els.terminalMenu.classList.add('hidden');window.GoTinkerTerminal?.pasteActive()});els.createAliasBtn.addEventListener('click',()=>{els.terminalMenu.classList.add('hidden');els.aliasName.value='';els.aliasCommand.value='';openModal(els.aliasModal);els.aliasName.focus()});document.addEventListener('pointerdown',event=>{if(!event.target.closest('.terminal-menu-wrap'))els.terminalMenu.classList.add('hidden')});els.confirmAliasBtn.addEventListener('click',()=>{const name=els.aliasName.value.trim(),command=els.aliasCommand.value.trim();if(!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)||!command){showToast(t('aliasInvalid'),true);return;}if(!window.GoTinkerTerminal?.writeActive(`alias ${name}=${command}\r`)){showToast(t('aliasWait'),true);return;}closeModal(els.aliasModal);showToast(t('aliasCreated').replace('{name}',name))});els.aliasCommand.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();els.confirmAliasBtn.click()}});
const cmderObserver=new ResizeObserver(syncCmderBounds);cmderObserver.observe(els.cmderHost);window.addEventListener('resize',syncCmderBounds);
let terminalResize=false;els.terminalResizer.addEventListener('pointerdown',e=>{terminalResize=true;els.terminalResizer.classList.add('active');els.terminalResizer.setPointerCapture(e.pointerId)});els.terminalResizer.addEventListener('pointermove',e=>{if(!terminalResize)return;const rect=els.panelLeft.getBoundingClientRect();els.panelLeft.style.setProperty('--terminal-height',`${Math.max(90,Math.min(rect.height-180,rect.bottom-e.clientY))}px`)});els.terminalResizer.addEventListener('pointerup',e=>{terminalResize=false;els.terminalResizer.classList.remove('active');try{els.terminalResizer.releasePointerCapture(e.pointerId)}catch{}});
setupResizer();
els.terminalPanel.hidden=true;els.terminalPanel.classList.add('hidden');els.terminalResizer.hidden=true;els.panelLeft.classList.remove('terminal-open');els.terminalMenu.classList.add('hidden');
window.addEventListener('beforeunload',()=>{saveEditorToTab();try{navigator.sendBeacon('/api/state/save',new Blob([JSON.stringify(state)],{type:'application/json'}));navigator.sendBeacon('/api/terminal/shutdown',new Blob(['{}'],{type:'application/json'}))}catch{}});
const stateReady=loadState();
window.GoTinkerRequestTerminal=()=>stateReady.then(()=>toggleTerminal(true));
})();
