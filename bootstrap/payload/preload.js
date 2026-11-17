const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('GoTinkerWindow', {
    setTheme: theme => ipcRenderer.send('gotinker:theme', theme === 'light' ? 'light' : 'dark')
});

contextBridge.exposeInMainWorld('GoTinkerClipboard', {
    readText: () => ipcRenderer.invoke('gotinker:clipboard-read'),
    writeText: text => ipcRenderer.send('gotinker:clipboard-write', String(text || ''))
});
