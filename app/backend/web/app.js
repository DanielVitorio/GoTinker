(() => {
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const els = {
    tabs: $('#tabs'), code: $('#code'), highlight: $('#highlight'), lineNumbers: $('#lineNumbers'), placeholder: $('#placeholder'), autocomplete: $('#autocomplete'), codeStack: $('#codeStack'),
    projectPicker: $('#projectPicker'), projectPath: $('#projectPath'), statusDot: $('#statusDot'), statusText: $('#statusText'), runBtn: $('#runBtn'), saveBtn: $('#saveBtn'), savedBtn: $('#savedBtn'), historyBtn: $('#historyBtn'), reindexBtn: $('#reindexBtn'), newTabBtn: $('#newTabBtn'),
    output: $('#output'), resultType: $('#resultType'), durationLabel: $('#durationLabel'), outputSubtitle: $('#outputSubtitle'), editorSubtitle: $('#editorSubtitle'), crumb: $('#crumb'), cursorPos: $('#cursorPos'), indexBadge: $('#indexBadge'),
    phpStatus: $('#phpStatus'), laravelStatus: $('#laravelStatus'), storageStatus: $('#storageStatus'), saveState: $('#saveState'), historyCount: $('#historyCount'), toast: $('#toast'),
    folderModal: $('#folderModal'), folderPathInput: $('#folderPathInput'), folderGoBtn: $('#folderGoBtn'), folderDrivesBtn: $('#folderDrivesBtn'), driveGrid: $('#driveGrid'), folderList: $('#folderList'), folderSelectBtn: $('#folderSelectBtn'), folderHint: $('#folderHint'),
    saveModal: $('#saveModal'), snippetName: $('#snippetName'), confirmSaveBtn: $('#confirmSaveBtn'), savedModal: $('#savedModal'), savedList: $('#savedList'), savedCount: $('#savedCount'), historyModal: $('#historyModal'), historyList: $('#historyList'), clearHistoryBtn: $('#clearHistoryBtn'),
    clearCodeBtn: $('#clearCodeBtn'), clearOutputBtn: $('#clearOutputBtn'), copyBtn: $('#copyBtn'), workspace: $('#workspace'), resizer: $('#resizer')
};

let state = {version:3, activeTabId:null, tabs:[], snippets:[], history:[], lastProject:'', split:50};
let completions = [];
let indexedProject = '';
let currentFolder = '';
let folderCurrentIsLaravel = false;
let viewMode = 'auto';
let acItems = [];
let acIndex = 0;
let acReplaceStart = 0;
let acReplaceEnd = 0;
let persistTimer = null;
let running = false;
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
function fmtTime(iso){ try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(iso));}catch{return iso||'';} }
function showToast(message,error=false){ els.toast.textContent=message;els.toast.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>els.toast.className='toast',2300); }
function setStatus(type,text){ els.statusDot.className='status-dot'+(type?' '+type:''); els.statusText.textContent=text; }
function openModal(el){ el.classList.add('open'); }
function closeModal(el){ el.classList.remove('open'); }

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
    normalizeState(); renderAll();
}
function normalizeState(){
    if(!Array.isArray(state.tabs)) state.tabs=[];
    if(!Array.isArray(state.snippets)) state.snippets=[];
    if(!Array.isArray(state.history)) state.history=[];
    state.history=state.history.slice(0,100);
    if(!state.tabs.length){ const t=createTabObject('Tinker 1',state.lastProject||'');state.tabs=[t];state.activeTabId=t.id; }
    if(!state.tabs.some(t=>t.id===state.activeTabId)) state.activeTabId=state.tabs[0].id;
    state.tabs.forEach(t=>{ t.code=String(t.code||'');t.project=String(t.project||state.lastProject||'');t.output=String(t.output||'');t.json=String(t.json||'');t.resultType=String(t.resultType||'');t.durationMs=Number(t.durationMs||0); });
    state.split=Math.min(72,Math.max(28,Number(state.split||50)));
}
function createTabObject(title,project){ return {id:uid('tab'),title,project:project||'',code:'',output:'',json:'',resultType:'',durationMs:0,ok:true,createdAt:nowISO(),updatedAt:nowISO()}; }
function schedulePersist(){
    els.saveState.textContent='salvando…';els.saveState.classList.add('saving');
    clearTimeout(persistTimer);persistTimer=setTimeout(persistState,650);
}
async function persistState(){
    clearTimeout(persistTimer);persistTimer=null;
    try{ await api('/api/state/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)});els.saveState.textContent='alterações salvas';els.saveState.classList.remove('saving'); }
    catch(e){els.saveState.textContent='erro ao salvar';els.saveState.classList.remove('saving');showToast(e.message,true);}
}

function renderAll(){ renderTabs(); loadActiveIntoUI(); renderSaved(); renderHistory(); applySplit(); }
function renderTabs(){
    els.tabs.innerHTML='';
    state.tabs.forEach(tab=>{
        const b=document.createElement('button');b.type='button';b.className='tab'+(tab.id===state.activeTabId?' active':'');b.dataset.id=tab.id;
        b.innerHTML=`<span class="tab-icon">php</span><span class="tab-title">${escapeHTML(tab.title||'Tinker')}</span><span class="tab-close" title="Fechar">×</span>`;
        b.addEventListener('click',e=>{ if(e.target.closest('.tab-close')){closeTab(tab.id);return;} switchTab(tab.id); });
        els.tabs.appendChild(b);
    });
}
function loadActiveIntoUI(){
    const tab=activeTab();if(!tab)return;
    els.code.value=tab.code||'';refreshEditor();updateProjectUI();renderOutput();
    if(tab.project){ validateProject(tab.project,false); if(indexedProject!==tab.project) indexProject(tab.project); }
    else{ setStatus('', 'Sem projeto');els.phpStatus.textContent='PHP —';els.laravelStatus.textContent='Laravel —';els.indexBadge.textContent='0 símbolos';completions=[];indexedProject=''; }
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
    const t=activeTab();const p=t?.project||'';els.projectPath.textContent=p||'Selecionar projeto Laravel…';els.projectPath.classList.toggle('project-placeholder',!p);els.crumb.textContent=p?basename(p):'sem projeto';els.editorSubtitle.textContent=p?basename(p)+' · PHP / Laravel':'PHP / Laravel Tinker';
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
    return {type:'chain',classToken:info.classToken,mode:info.mode,prefix,start:pos-prefix.length,end:pos};
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
    return src.filter(x=>{const l=(x.label||'').toLowerCase(),s=(x.shortName||'').toLowerCase();return prefix.includes('\\')?l.startsWith(p):s.startsWith(p)||l.startsWith(p)}).slice(0,30).map(x=>({...x,replaceText:x.insert||x.label}));
}
function methodCandidates(classToken,prefix){
    const c=resolveCompletion(classToken);
    let methods=[...(c?.methods||[])];
    if(c?.kind==='model'||/model/i.test(c?.kind||''))methods.push(...modelMethods);
    methods=[...new Set(methods)].sort();
    const p=prefix.toLowerCase();
    return methods.filter(m=>m.toLowerCase().startsWith(p)).slice(0,35).map(m=>({label:m+'()',insert:m+'()',kind:'method',detail:c?c.label:'Método Laravel',replaceText:m+'()'}));
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
    for(const method of c.methods||[])push(method+'()',method+'()','method',c.label);
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
    acItems=items;acIndex=0;acReplaceStart=ctx.start;acReplaceEnd=ctx.end;renderAutocomplete();positionAutocomplete();
}
function renderAutocomplete(){
    els.autocomplete.innerHTML='';acItems.slice(0,12).forEach((item,i)=>{const b=document.createElement('button');b.type='button';b.className='ac-item'+(i===acIndex?' active':'');b.dataset.i=i;b.innerHTML=`<span class="ac-kind ${escapeHTML(item.kind||'class')}">${escapeHTML(item.kind||'class')}</span><span class="ac-main"><div class="ac-label">${escapeHTML(item.label)}</div><div class="ac-detail">${escapeHTML(item.detail||'')}</div></span>`;b.addEventListener('mousedown',e=>{e.preventDefault();acceptAutocomplete(i)});els.autocomplete.appendChild(b);});els.autocomplete.classList.add('open');
}
function positionAutocomplete(){
    const pos=els.code.selectionStart||0,before=els.code.value.slice(0,pos),lines=before.split('\n'),line=lines.length-1,col=lines[lines.length-1].length;const lh=21.67,cw=7.58;let left=15+col*cw-els.code.scrollLeft,top=12+(line+1)*lh-els.code.scrollTop;const w=els.codeStack.clientWidth;left=Math.max(8,Math.min(left,w-480));top=Math.max(8,Math.min(top,els.codeStack.clientHeight-285));els.autocomplete.style.left=left+'px';els.autocomplete.style.top=top+'px';
}
function closeAutocomplete(){els.autocomplete.classList.remove('open');acItems=[];}
function acceptAutocomplete(index=acIndex){const item=acItems[index];if(!item)return;const before=els.code.value.slice(0,acReplaceStart),after=els.code.value.slice(acReplaceEnd),insert=item.replaceText||item.insert||item.label;els.code.value=before+insert+after;let caret=before.length+insert.length;if(insert.endsWith('()'))caret--;els.code.setSelectionRange(caret,caret);refreshEditor();saveEditorToTab();schedulePersist();closeAutocomplete();els.code.focus();}

async function validateProject(project,toastOnError=true){
    if(!project)return;setStatus('loading','Validando…');
    try{const s=await api('/api/status?project='+encodeURIComponent(project));if(s.ok){setStatus('ok','Laravel pronto');els.phpStatus.textContent='PHP '+s.php;els.laravelStatus.textContent=s.laravel;els.storageStatus.textContent=s.storage+' · '+basename(s.storagePath||'');if(indexedProject!==project)indexProject(project);}else{setStatus('bad',s.error||'Projeto inválido');if(toastOnError)showToast(s.error||'Projeto inválido',true);}}catch(e){setStatus('bad','Falha na validação');if(toastOnError)showToast(e.message,true);}
}
async function indexProject(project){
    if(!project)return;els.indexBadge.textContent='indexando…';
    try{const data=await api('/api/index?project='+encodeURIComponent(project));if(!data.ok)throw new Error(data.error||'Falha ao indexar');completions=data.completions||[];indexedProject=project;els.indexBadge.textContent=`${data.count||0} símbolos`;showToast(`Projeto indexado: ${data.count||0} classes`);}catch(e){completions=[];indexedProject='';els.indexBadge.textContent='0 símbolos';showToast(e.message,true);}
}

async function runCode(){
    if(running)return;saveEditorToTab();const tab=activeTab();if(!tab?.project){openFolderBrowser('');return;}if(!tab.code.trim()){showToast('Digite algum código PHP.',true);els.code.focus();return;}
    running=true;els.runBtn.disabled=true;els.runBtn.innerHTML='⏳ Executando…';els.durationLabel.textContent='executando';els.output.className='output';els.output.innerHTML='<span style="color:#777">Executando no Laravel…</span>';
    try{
        const res=await api('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:tab.project,code:tab.code})});
        tab.output=res.output||'';tab.json=res.json||'';tab.resultType=res.resultType||'';tab.durationMs=res.durationMs||0;tab.ok=!!res.ok;tab.updatedAt=nowISO();
        state.history.unshift({id:uid('run'),title:tab.title,project:tab.project,code:tab.code,output:tab.output,json:tab.json,resultType:tab.resultType,durationMs:tab.durationMs,ok:tab.ok,error:res.error||'',createdAt:nowISO()});state.history=state.history.slice(0,100);
        renderOutput();renderHistory();schedulePersist();
        if(!res.ok)showToast(res.error||'Execução falhou',true);
    }catch(e){tab.output=e.message;tab.json='';tab.resultType='erro';tab.ok=false;tab.durationMs=0;renderOutput();showToast(e.message,true);}
    finally{running=false;els.runBtn.disabled=false;els.runBtn.innerHTML='▶ Executar <span style="opacity:.72">Ctrl+Enter</span>';}
}
function stripAnsi(value){return String(value||'').replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g,'');}
function ansiToHTML(text){const colors={30:'ansi-black',31:'ansi-red',32:'ansi-green',33:'ansi-yellow',34:'ansi-blue',35:'ansi-magenta',36:'ansi-cyan',37:'ansi-white',90:'ansi-black',91:'ansi-red',92:'ansi-green',93:'ansi-yellow',94:'ansi-blue',95:'ansi-magenta',96:'ansi-cyan',97:'ansi-white'};const re=/\x1b\[([0-9;]*)m/g;let out='',last=0,classes=[],m;while((m=re.exec(text))){out+=classes.length?`<span class="${classes.join(' ')}">${escapeHTML(text.slice(last,m.index))}</span>`:escapeHTML(text.slice(last,m.index));const codes=(m[1]||'0').split(';').map(Number);for(const c of codes){if(c===0)classes=[];else if(c===1&&!classes.includes('ansi-bold'))classes.push('ansi-bold');else if(colors[c]){classes=classes.filter(x=>!x.startsWith('ansi-')||x==='ansi-bold');classes.push(colors[c]);}}last=re.lastIndex;}const tail=text.slice(last);out+=classes.length?`<span class="${classes.join(' ')}">${escapeHTML(tail)}</span>`:escapeHTML(tail);return out;}
function highlightJSON(text){const escaped=escapeHTML(text);return escaped.replace(/(&quot;(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\&])*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,m=>{if(/^&quot;/.test(m))return /:\s*$/.test(m)?`<span class="json-key">${m}</span>`:`<span class="json-string">${m}</span>`;if(/true|false/.test(m))return `<span class="json-bool">${m}</span>`;if(/null/.test(m))return `<span class="json-null">${m}</span>`;return `<span class="json-number">${m}</span>`;});}
function renderOutput(){
    const tab=activeTab();if(!tab)return;els.resultType.textContent=tab.resultType||'—';els.durationLabel.textContent=tab.durationMs?`${tab.durationMs} ms`:'pronto';els.outputSubtitle.textContent=tab.ok===false?'execução com erro':'resultado do Laravel';const raw=tab.output||'',json=tab.json||'';
    $$('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===viewMode));
    if(viewMode==='json'){
        if(!json){els.output.className='output empty';els.output.textContent='Esta execução não retornou um valor convertível para JSON.';return;}els.output.className='output';els.output.innerHTML=highlightJSON(json);return;
    }
    if(viewMode==='auto'&&json){els.output.className='output';els.output.innerHTML=highlightJSON(json);return;}
    if(!raw){els.output.className='output empty';els.output.textContent='A execução terminou sem valor de retorno e sem saída em stdout.';return;}
    els.output.className='output'+(tab.ok===false?' error':'');els.output.innerHTML=ansiToHTML(raw);
}

async function openFolderBrowser(path){openModal(els.folderModal);await browseFolder(path||'');}
async function browseFolder(path){
    els.folderList.innerHTML='<div class="empty-list">Carregando…</div>';els.driveGrid.innerHTML='';els.folderSelectBtn.disabled=true;folderCurrentIsLaravel=false;
    try{const data=await api('/api/fs/list?path='+encodeURIComponent(path||''));if(!data.ok)throw new Error(data.error||'Não foi possível listar a pasta');currentFolder=data.current||'';els.folderPathInput.value=currentFolder;const drives=data.drives||[];drives.forEach(d=>{const b=document.createElement('button');b.type='button';b.className='drive-btn';b.textContent='▣ '+d;b.addEventListener('click',()=>browseFolder(d));els.driveGrid.appendChild(b);});
        if(!currentFolder&&drives.length){els.folderList.innerHTML='<div class="empty-list">Escolha um disco acima.</div>';els.folderHint.textContent='Todos os discos disponíveis são mostrados acima.';return;}
        const currentStatus=await api('/api/status?project='+encodeURIComponent(currentFolder)).catch(()=>({ok:false}));folderCurrentIsLaravel=!!currentStatus.ok;els.folderSelectBtn.disabled=!folderCurrentIsLaravel;els.folderHint.textContent=folderCurrentIsLaravel?'✓ Esta pasta é um projeto Laravel.':'Entre em uma pasta que contenha o arquivo artisan.';
        els.folderList.innerHTML='';if(data.parent){const up=document.createElement('button');up.type='button';up.className='file-row';up.innerHTML='<span class="file-icon">↰</span><span class="file-name">..</span><span></span>';up.addEventListener('click',()=>browseFolder(data.parent));els.folderList.appendChild(up);}for(const entry of data.entries||[]){const row=document.createElement('button');row.type='button';row.className='file-row';row.innerHTML=`<span class="file-icon">▱</span><span class="file-name">${escapeHTML(entry.name)}</span>${entry.isLaravel?'<span class="laravel-tag">Laravel</span>':'<span></span>'}`;row.addEventListener('dblclick',()=>browseFolder(entry.path));row.addEventListener('click',()=>{if(entry.isLaravel){browseFolder(entry.path);}else{browseFolder(entry.path);}});els.folderList.appendChild(row);}if(!(data.entries||[]).length&&!data.parent)els.folderList.innerHTML='<div class="empty-list">Nenhuma pasta encontrada.</div>';
    }catch(e){els.folderList.innerHTML=`<div class="empty-list">${escapeHTML(e.message)}</div>`;showToast(e.message,true);}
}
function chooseCurrentFolder(){if(!currentFolder||!folderCurrentIsLaravel)return;const tab=activeTab();tab.project=currentFolder;state.lastProject=currentFolder;closeModal(els.folderModal);updateProjectUI();validateProject(currentFolder);indexProject(currentFolder);schedulePersist();}

function openSaveModal(){const tab=activeTab();if(!tab)return;els.snippetName.value=tab.title||'';openModal(els.saveModal);setTimeout(()=>{els.snippetName.focus();els.snippetName.select();},50);}
function saveSnippet(){const tab=activeTab();const name=els.snippetName.value.trim()||tab.title||'Snippet';const existing=state.snippets.find(s=>s.name.toLowerCase()===name.toLowerCase());if(existing){existing.code=tab.code;existing.project=tab.project;existing.updatedAt=nowISO();}else state.snippets.unshift({id:uid('snippet'),name,code:tab.code,project:tab.project,createdAt:nowISO(),updatedAt:nowISO()});tab.title=name;closeModal(els.saveModal);renderTabs();renderSaved();schedulePersist();showToast('Snippet salvo no SQLite.');}
function renderSaved(){
    els.savedCount.textContent=`${state.snippets.length} item(ns)`;els.savedList.innerHTML='';if(!state.snippets.length){els.savedList.innerHTML='<div class="empty-list">Nenhum snippet salvo ainda.</div>';return;}state.snippets.forEach(s=>{const row=document.createElement('div');row.className='collection-item';row.innerHTML=`<div class="collection-main"><div class="collection-title">${escapeHTML(s.name)}</div><div class="collection-meta">${escapeHTML(s.project||'sem projeto')} · ${escapeHTML(fmtTime(s.updatedAt||s.createdAt))}</div><div class="collection-code">${escapeHTML((s.code||'').replace(/\s+/g,' ').slice(0,180))}</div></div><div class="collection-actions"><button class="btn btn-ghost open" type="button">Abrir</button><button class="btn btn-ghost danger del" type="button">Excluir</button></div>`;row.querySelector('.open').addEventListener('click',()=>{newTab({title:s.name,project:s.project,code:s.code});closeModal(els.savedModal)});row.querySelector('.collection-main').addEventListener('click',()=>{newTab({title:s.name,project:s.project,code:s.code});closeModal(els.savedModal)});row.querySelector('.del').addEventListener('click',()=>{state.snippets=state.snippets.filter(x=>x.id!==s.id);renderSaved();schedulePersist();});els.savedList.appendChild(row);});
}
function renderHistory(){
    els.historyCount.textContent=`${state.history.length} execuções`;els.historyList.innerHTML='';if(!state.history.length){els.historyList.innerHTML='<div class="empty-list">Nenhuma execução registrada.</div>';return;}state.history.forEach(h=>{const row=document.createElement('div');row.className='collection-item';row.innerHTML=`<div class="collection-main"><div class="collection-title"><span class="${h.ok?'history-ok':'history-bad'}">${h.ok?'●':'●'}</span> ${escapeHTML(h.title||'Tinker')}</div><div class="collection-meta">${escapeHTML(fmtTime(h.createdAt))} · ${escapeHTML(h.resultType||'sem tipo')} · ${Number(h.durationMs||0)} ms</div><div class="collection-code">${escapeHTML((h.code||'').replace(/\s+/g,' ').slice(0,180))}</div></div><div class="collection-actions"><button class="btn btn-ghost open" type="button">Abrir</button></div>`;const open=()=>{newTab({title:(h.title||'Histórico')+' • histórico',project:h.project,code:h.code,output:h.output,json:h.json,resultType:h.resultType,durationMs:h.durationMs,ok:h.ok});closeModal(els.historyModal)};row.querySelector('.open').addEventListener('click',open);row.querySelector('.collection-main').addEventListener('click',open);els.historyList.appendChild(row);});
}

function applySplit(){els.workspace.style.gridTemplateColumns=`minmax(0,${state.split}fr) 5px minmax(0,${100-state.split}fr)`;}
function setupResizer(){let active=false;els.resizer.addEventListener('pointerdown',e=>{active=true;els.resizer.classList.add('active');els.resizer.setPointerCapture(e.pointerId)});els.resizer.addEventListener('pointermove',e=>{if(!active)return;const rect=els.workspace.getBoundingClientRect();let pct=((e.clientX-rect.left)/rect.width)*100;pct=Math.max(28,Math.min(72,pct));state.split=pct;applySplit()});els.resizer.addEventListener('pointerup',e=>{active=false;els.resizer.classList.remove('active');try{els.resizer.releasePointerCapture(e.pointerId)}catch{}schedulePersist()});}

els.code.addEventListener('input',()=>{refreshEditor();saveEditorToTab();schedulePersist();updateAutocomplete();});
els.code.addEventListener('scroll',()=>{syncEditorScroll();if(els.autocomplete.classList.contains('open'))positionAutocomplete();});
els.code.addEventListener('click',()=>{updateCursor();updateAutocomplete();});
els.code.addEventListener('keyup',e=>{if(!['ArrowUp','ArrowDown','Enter','Tab','Escape'].includes(e.key))updateCursor();});
els.code.addEventListener('keydown',e=>{
    if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();closeAutocomplete();runCode();return;}
    if(e.ctrlKey&&e.key.toLowerCase()==='s'){e.preventDefault();closeAutocomplete();openSaveModal();return;}
    if(e.ctrlKey&&e.code==='Space'){e.preventDefault();updateAutocomplete(true);return;}
    if(els.autocomplete.classList.contains('open')){
        if(e.key==='ArrowDown'){e.preventDefault();acIndex=(acIndex+1)%Math.min(12,acItems.length);renderAutocomplete();return;}
        if(e.key==='ArrowUp'){e.preventDefault();acIndex=(acIndex-1+Math.min(12,acItems.length))%Math.min(12,acItems.length);renderAutocomplete();return;}
        if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();acceptAutocomplete();return;}
        if(e.key==='Escape'){e.preventDefault();closeAutocomplete();return;}
    }
    if(e.key==='Tab'){e.preventDefault();const start=els.code.selectionStart,end=els.code.selectionEnd;els.code.setRangeText('    ',start,end,'end');refreshEditor();saveEditorToTab();schedulePersist();}
});

document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.modal-backdrop.open').forEach(closeModal)});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>closeModal($('#'+b.dataset.close))));
$$('.modal-backdrop').forEach(m=>m.addEventListener('mousedown',e=>{if(e.target===m)closeModal(m)}));
$$('.view-btn').forEach(b=>b.addEventListener('click',()=>{viewMode=b.dataset.view;renderOutput()}));
els.runBtn.addEventListener('click',runCode);els.saveBtn.addEventListener('click',openSaveModal);els.confirmSaveBtn.addEventListener('click',saveSnippet);els.snippetName.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveSnippet()}});
els.savedBtn.addEventListener('click',()=>{renderSaved();openModal(els.savedModal)});els.historyBtn.addEventListener('click',()=>{renderHistory();openModal(els.historyModal)});els.newTabBtn.addEventListener('click',()=>newTab());els.projectPicker.addEventListener('click',()=>openFolderBrowser(activeTab()?.project||state.lastProject||''));els.reindexBtn.addEventListener('click',()=>{const p=activeTab()?.project;if(p)indexProject(p);else openFolderBrowser('')});
els.folderGoBtn.addEventListener('click',()=>browseFolder(els.folderPathInput.value.trim()));els.folderPathInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();browseFolder(els.folderPathInput.value.trim())}});els.folderDrivesBtn.addEventListener('click',()=>browseFolder(''));els.folderSelectBtn.addEventListener('click',chooseCurrentFolder);
els.clearCodeBtn.addEventListener('click',()=>{els.code.value='';refreshEditor();saveEditorToTab();schedulePersist();els.code.focus()});els.clearOutputBtn.addEventListener('click',()=>{const t=activeTab();if(t){t.output='';t.json='';t.resultType='';t.durationMs=0;t.ok=true;renderOutput();schedulePersist()}});
els.copyBtn.addEventListener('click',async()=>{const t=activeTab();const text=(viewMode==='json'&&t?.json)?t.json:(t?.output||t?.json||'');if(!text)return;try{await navigator.clipboard.writeText(stripAnsi(text));showToast('Resposta copiada.')}catch{showToast('Não foi possível copiar.',true)}});
els.clearHistoryBtn.addEventListener('click',()=>{state.history=[];renderHistory();schedulePersist()});
setupResizer();
window.addEventListener('beforeunload',()=>{saveEditorToTab();try{navigator.sendBeacon('/api/state/save',new Blob([JSON.stringify(state)],{type:'application/json'}))}catch{}});
loadState();
})();
