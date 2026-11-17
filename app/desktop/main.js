const { app, BrowserWindow, Menu, dialog, clipboard, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');

const localBase = path.join(process.env.LOCALAPPDATA || app.getPath('appData'), 'GoTinker');
app.setPath('userData', path.join(localBase, 'profile'));
app.setAppUserModelId('GoTinker');

let mainWindow = null;
let backend = null;
let quitting = false;
let applicationURL = null;
let terminalRequested = false;

const themeFile = path.join(localBase, 'profile', 'theme.json');
const themes = {
    dark: { background: '#1a1a1a', symbol: '#a6a6a6', text: '#e8e8e8', track: '#2e2e2e' },
    light: { background: '#f3f3f3', symbol: '#555555', text: '#1f1f1f', track: '#dddddd' }
};

function savedTheme() {
    try {
        return JSON.parse(fs.readFileSync(themeFile, 'utf8')).theme === 'light' ? 'light' : 'dark';
    } catch (_) {
        return 'dark';
    }
}

let windowTheme = savedTheme();

ipcMain.handle('gotinker:clipboard-read', () => clipboard.readText());
ipcMain.on('gotinker:clipboard-write', (_event, text) => clipboard.writeText(String(text || '')));
ipcMain.on('gotinker:theme', (_event, theme) => {
    windowTheme = theme === 'light' ? 'light' : 'dark';
    const colors = themes[windowTheme];
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.setTitleBarOverlay({ color: colors.background, symbolColor: colors.symbol, height: 40 });
        } catch (_) {
        }
        mainWindow.setBackgroundColor(colors.background);
    }
    fs.mkdir(path.dirname(themeFile), { recursive: true }, () => fs.writeFile(themeFile, JSON.stringify({ theme: windowTheme }), () => {}));
});

const lock = app.requestSingleInstanceLock();

if (!lock) {
    app.quit();
} else {
    app.on('second-instance', (_event, commandLine) => {
        revealWindow();
        if (commandLine.includes('--terminal')) requestTerminal();
    });
    app.whenReady().then(startApplication).catch(showStartupError);
}

async function startApplication() {
    Menu.setApplicationMenu(null);
    const portPromise = getFreePort();
    createWindow();
    try {
        const port = await portPromise;
        startBackend(port);
        await waitForBackend(port, 45000);
        applicationURL = `http://127.0.0.1:${port}/`;
        await mainWindow.loadURL(applicationURL);
        if (process.argv.includes('--terminal') || terminalRequested) await mainWindow.webContents.executeJavaScript('window.GoTinkerRequestTerminal?.()');
        revealWindow();
        setTimeout(cleanupLegacyFiles, 4000);
    } catch (error) {
        showStartupError(error);
    }
}

function requestTerminal() {
    terminalRequested = true;
    if (!applicationURL || !mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.webContents.executeJavaScript('window.GoTinkerRequestTerminal?.()').then(() => {
        terminalRequested = false;
    }).catch(() => {});
}

function createWindow() {
    mainWindow = new BrowserWindow({
        title: 'Go Tinker',
        width: 1500,
        height: 920,
        minWidth: 980,
        minHeight: 620,
        backgroundColor: themes[windowTheme].background,
        show: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: themes[windowTheme].background, symbolColor: themes[windowTheme].symbol, height: 40 },
        icon: path.join(__dirname, 'assets', 'app.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: false
        }
    });

    applyTaskbarDetails();
    mainWindow.once('ready-to-show', revealWindow);
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
        return { action: 'deny' };
    });
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (applicationURL && url.startsWith(applicationURL)) return;
        if (url.startsWith('data:text/html')) return;
        event.preventDefault();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
        stopBackend();
        if (!quitting) app.quit();
    });
    mainWindow.on('unresponsive', revealWindow);
    mainWindow.loadURL(startupPage()).catch(() => {});
}

function applyTaskbarDetails() {
    const launcher = process.env.GOTINKER_LAUNCHER;
    if (process.platform !== 'win32' || !launcher || !fs.existsSync(launcher)) return;
    mainWindow.setAppDetails({
        appId: 'GoTinker',
        appIconPath: launcher,
        appIconIndex: 0,
        relaunchCommand: `"${launcher}"`,
        relaunchDisplayName: 'Go Tinker'
    });
}

function startupPage() {
    const colors = themes[windowTheme];
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
html,body{width:100%;height:100%;margin:0;background:${colors.background};color:${colors.text};font:13px "Segoe UI",system-ui,sans-serif;overflow:hidden;-webkit-app-region:drag}
body{display:flex;align-items:center;justify-content:center}
.wrap{display:flex;flex-direction:column;align-items:center;gap:16px}
.brand{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:600}
.track{width:180px;height:2px;border-radius:2px;background:${colors.track};overflow:hidden}
.track span{display:block;width:40%;height:100%;background:#ff6c37;animation:s 1.1s ease-in-out infinite}
@keyframes s{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
</style>
</head>
<body>
<div class="wrap">
<div class="brand"><svg width="30" height="30" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ff6c37"/><path d="m9.5 11 5 5-5 5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 21.5h6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>Go Tinker</div>
<div class="track"><span></span></div>
</div>
</body>
</html>`;
    return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function revealWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.moveTop();
    mainWindow.focus();
}

function cleanupLegacyFiles() {
    const remove = target => fs.rm(target, { recursive: true, force: true, maxRetries: 2 }, () => {});
    const roaming = process.env.APPDATA ? path.join(process.env.APPDATA, 'GoTinker') : '';
    const legacy = [
        'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GPUPersistentCache', 'GrShaderCache', 'ShaderCache',
        'Shared Dictionary', 'SharedStorage', 'Network', 'Local Storage', 'Session Storage', 'IndexedDB', 'WebStorage', 'Service Worker', 'blob_storage',
        'Crashpad', 'browser-profile', 'browser-profile-v3', 'desktop-profile', 'DIPS', 'DIPS-wal', 'Local State', 'Preferences', 'Trust Tokens',
        'TransportSecurity', 'declarative_performance_observer.db', 'declarative_performance_observer.db-journal', 'runner-v3.php'
    ];
    if (roaming && fs.existsSync(path.join(roaming, 'gotinker.sqlite'))) {
        for (const name of legacy) remove(path.join(roaming, name));
    }
    const current = path.basename(__dirname);
    const appRoot = path.dirname(__dirname);
    const installRoot = path.dirname(appRoot);
    if (path.basename(appRoot).toLowerCase() !== 'app' || !/^\d+\.\d+\.\d+$/.test(current) || !fs.existsSync(path.join(installRoot, 'runtime'))) return;
    fs.readdir(appRoot, (error, entries) => {
        if (error) return;
        for (const entry of entries) {
            if (entry === current) continue;
            if (/^\d+\.\d+\.\d+$/.test(entry) || /^\.\d+\.\d+\.\d+\.installing-\d+$/.test(entry)) remove(path.join(appRoot, entry));
        }
    });
}

function startBackend(port) {
    const backendPath = path.join(__dirname, 'backend', 'gotinker-backend.exe');
    backend = spawn(backendPath, [], {
        windowsHide: true,
        stdio: 'ignore',
        env: { ...process.env, GO_TINKER_PORT: String(port) }
    });
    backend.on('error', error => {
        backend = null;
        if (!quitting) showStartupError(error);
    });
    backend.on('exit', code => {
        backend = null;
        if (!quitting && mainWindow) {
            showStartupError(new Error(`O serviço do Go Tinker foi encerrado${code === null ? '' : ` com código ${code}`}.`));
        }
    });
}

function stopBackend() {
    if (!backend) return;
    try {
        backend.kill();
    } catch (_) {
    }
    backend = null;
}

function getFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
    });
}

function waitForBackend(port, timeoutMs) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const attempt = () => {
            if (Date.now() - startedAt > timeoutMs) {
                reject(new Error('O serviço interno do Go Tinker não iniciou a tempo.'));
                return;
            }
            const request = http.get({ hostname: '127.0.0.1', port, path: '/api/ping', timeout: 1000 }, response => {
                response.resume();
                if (response.statusCode === 200) {
                    resolve();
                    return;
                }
                setTimeout(attempt, 50);
            });
            request.on('timeout', () => request.destroy());
            request.on('error', () => setTimeout(attempt, 50));
        };
        attempt();
    });
}

function showStartupError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (mainWindow && !mainWindow.isDestroyed()) {
        revealWindow();
        dialog.showMessageBox(mainWindow, {
            type: 'error',
            title: 'Go Tinker',
            message: 'Não foi possível iniciar o Go Tinker.',
            detail: message
        }).finally(() => {
            stopBackend();
            app.quit();
        });
        return;
    }
    dialog.showErrorBox('Go Tinker', message);
    stopBackend();
    app.quit();
}

app.on('activate', revealWindow);

app.on('before-quit', () => {
    quitting = true;
    stopBackend();
});

app.on('window-all-closed', () => {
    stopBackend();
    app.quit();
});
