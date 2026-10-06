const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GoTinkerClipboard', {
    readText: () => ipcRenderer.invoke('gotinker:clipboard-read'),
    writeText: text => ipcRenderer.send('gotinker:clipboard-write', String(text || ''))
});
