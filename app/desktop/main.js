const { app, BrowserWindow, Menu, dialog, clipboard, ipcMain } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

let mainWindow = null;
let backend = null;
let backendPort = null;
let quitting = false;
let applicationURL = null;
let terminalRequested = false;

app.setAppUserModelId('GoTinker');
ipcMain.handle('gotinker:clipboard-read', () => clipboard.readText());
ipcMain.on('gotinker:clipboard-write', (_event, text) => clipboard.writeText(String(text || '')));

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
    createWindow();

    try {
        backendPort = await getFreePort();
        startBackend(backendPort);
        await waitForBackend(backendPort, 45000);
        applicationURL = `http://127.0.0.1:${backendPort}/`;
        await mainWindow.loadURL(applicationURL);
        if (process.argv.includes('--terminal') || terminalRequested) await mainWindow.webContents.executeJavaScript('window.GoTinkerRequestTerminal?.()');
        revealWindow();
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
        height: 900,
        minWidth: 980,
        minHeight: 640,
        backgroundColor: '#09090b',
        show: true,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', 'app.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: false
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
    revealWindow();
}

function startupPage() {
    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{width:100%;height:100%;margin:0;background:#09090b;color:#fafafa;font-family:Inter,Segoe UI,Arial,sans-serif;overflow:hidden}
body{display:flex;align-items:center;justify-content:center}
.wrap{display:flex;flex-direction:column;align-items:center;gap:18px}
.brand{font-size:20px;font-weight:700;letter-spacing:-.02em}
.status{font-size:13px;color:#a1a1aa}
.spinner{width:28px;height:28px;border:3px solid #27272a;border-top-color:#22c55e;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">
<div class="brand">Go Tinker</div>
<div class="spinner"></div>
<div class="status">Iniciando seu ambiente Laravel...</div>
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

function startBackend(port) {
    const backendPath = path.join(__dirname, 'backend', 'gotinker-backend.exe');

    backend = spawn(backendPath, [], {
        windowsHide: true,
        stdio: 'ignore',
        env: {
            ...process.env,
            GO_TINKER_PORT: String(port)
        }
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
            const address = server.address();
            const port = address.port;
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

            const request = http.get({
                hostname: '127.0.0.1',
                port,
                path: '/api/ping',
                timeout: 1000
            }, response => {
                response.resume();
                if (response.statusCode === 200) {
                    resolve();
                    return;
                }
                setTimeout(attempt, 100);
            });

            request.on('timeout', () => request.destroy());
            request.on('error', () => setTimeout(attempt, 100));
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
