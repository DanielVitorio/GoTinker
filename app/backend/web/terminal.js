const Terminal=window.Terminal;
const FitAddon=window.FitAddon?.FitAddon;
const instances=new Map();
let activeId='';

function connect(instance){
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    const query=new URLSearchParams({session:instance.id,project:instance.project});
    const socket=new WebSocket(`${protocol}//${location.host}/api/terminal?${query}`);
    socket.binaryType='arraybuffer';
    instance.socket=socket;
    socket.addEventListener('open',()=>{fit(instance);instance.terminal.focus();});
    socket.addEventListener('message',event=>instance.terminal.write(new Uint8Array(event.data)));
    socket.addEventListener('close',()=>{if(instances.get(instance.id)===instance)instance.terminal.write('\r\n\x1b[90m[conexão do terminal encerrada]\x1b[0m\r\n');});
    instance.terminal.onData(data=>{if(socket.readyState===WebSocket.OPEN)socket.send(data);});
    instance.fitObserver=new ResizeObserver(()=>fit(instance));
    instance.fitObserver.observe(instance.element);
}

function fit(instance){
    if(!instance||!instance.fit||!instance.element.clientWidth||!instance.element.clientHeight)return;
    try{instance.fit.fit();if(instance.socket?.readyState===WebSocket.OPEN)instance.socket.send(JSON.stringify({type:'resize',cols:instance.terminal.cols,rows:instance.terminal.rows}));}catch{}
}

function open(id,project,host){
    let instance=instances.get(id);
    if(!instance){
        const element=document.createElement('div');
        element.className='terminal-instance';
        element.dataset.session=id;
        host.appendChild(element);
        const terminal=new Terminal({allowProposedApi:true,cursorBlink:true,fontFamily:'Cascadia Code, Consolas, monospace',fontSize:12,scrollback:5000,theme:{background:'#101113',foreground:'#d4d4d8',cursor:'#eab75d',selectionBackground:'#343944'}});
        terminal.attachCustomKeyEventHandler(event=>{
            if(event.type!=='keydown')return true;
            const key=event.key.toLowerCase();
            if((event.ctrlKey&&event.shiftKey&&key==='c')||(event.ctrlKey&&key==='c'&&terminal.hasSelection())){event.preventDefault();copySelection(terminal);return false;}
            if(event.ctrlKey&&key==='v'){event.preventDefault();pasteText(terminal);return false;}
            return true;
        });
        const fitAddon=new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(element);
        instance={id,project,element,terminal,fit:fitAddon,socket:null};
        instances.set(id,instance);
        connect(instance);
    }else if(instance.project!==project&&project){
        instance.project=project;
    }
    activeId=id;
    for(const item of instances.values())item.element.classList.toggle('active',item.id===id);
    requestAnimationFrame(()=>fit(instance));
}

function close(id){
    const instance=instances.get(id);
    if(!instance)return;
    instance.fitObserver?.disconnect();
    instance.socket?.close();
    instance.terminal.dispose();
    instance.element.remove();
    instances.delete(id);
    if(activeId===id)activeId='';
    fetch('/api/terminal/close',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:id})}).catch(()=>{});
}

function writeActive(text){
    const instance=instances.get(activeId);
    if(!instance||instance.socket?.readyState!==WebSocket.OPEN)return false;
    instance.socket.send(text);
    instance.terminal.focus();
    return true;
}

async function copySelection(terminal){
    const text=terminal?.getSelection();
    if(text)await window.GoTinkerClipboard?.writeText(text);
}

async function pasteText(terminal){
    const text=await window.GoTinkerClipboard?.readText();
    if(text)terminal?.paste(text);
}

function activeTerminal(){return instances.get(activeId)?.terminal;}

window.GoTinkerTerminal={open,close,writeActive,copyActive:()=>copySelection(activeTerminal()),pasteActive:()=>pasteText(activeTerminal()),fitActive:()=>fit(instances.get(activeId))};
