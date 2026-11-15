const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const { isDev, getAppRoot, getPythonExecutable, getBinariesDir } = require('./paths.cjs');

let mainWindow = null;
let pythonProcess = null;
let backendPort = 8000;
let logStream = null;

function getLogFile() {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    return path.join(logDir, 'shortly.log');
  } catch {
    return null;
  }
}

function writeLog(tag, msg) {
  const line = `[${new Date().toISOString()}] [${tag}] ${msg}\n`;
  try {
    if (!logStream) {
      const p = getLogFile();
      if (p) logStream = fs.createWriteStream(p, { flags: 'a' });
    }
    if (logStream) logStream.write(line);
  } catch {}
  if (tag && tag.includes('Err')) {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
}

// Pure Node.js process-tree terminator (zero external dependencies)
function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (e) {
      console.error('Failed to taskkill:', e);
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_) {
      try { process.kill(pid, 'SIGKILL'); } catch (__) {}
    }
  }
}

// Pure Node.js port discovery (zero external dependencies)
function getAvailablePort(preferredPort = 18000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      // If preferred port is busy, request any free port from OS
      const fallback = net.createServer();
      fallback.unref();
      fallback.listen(0, '127.0.0.1', () => {
        const port = fallback.address().port;
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

// Test if an HTTP endpoint responds
function checkEndpoint(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          resolve(res.statusCode >= 200 && res.statusCode < 400);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

// Wait until backend answers health checks
async function waitForBackend(port, maxAttempts = 30) {
  const url = `http://127.0.0.1:${port}/api/config`;
  for (let i = 0; i < maxAttempts; i++) {
    const ok = await checkEndpoint(url, 1000);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startBackend() {
  // In dev, check if developer already has a backend running on port 8000
  if (isDev) {
    const alreadyRunning = await checkEndpoint('http://127.0.0.1:8000/api/config', 1000);
    if (alreadyRunning) {
      console.log('⚡ Using already-running backend on port 8000');
      backendPort = 8000;
      process.env.SHORTLY_API_URL = `http://127.0.0.1:${backendPort}`;
      return;
    }
  }

  // Find an available high-range port
  backendPort = await getAvailablePort(18000);
  console.log(`🚀 Starting Shortly Python backend on port ${backendPort}...`);
  process.env.SHORTLY_API_URL = `http://127.0.0.1:${backendPort}`;

  const pythonExec = getPythonExecutable();
  const root = getAppRoot();
  const binDir = getBinariesDir();

  const env = {
    ...process.env,
    PORT: String(backendPort),
    SHORTLY_PORT: String(backendPort),
    SHORTLY_DESKTOP: '1',
    SHORTLY_BIN_DIR: binDir,
  };

  if (isDev) {
    // Run app.py via uvicorn in project root
    pythonProcess = spawn(
      pythonExec,
      ['-m', 'uvicorn', 'app:app', '--host', '127.0.0.1', '--port', String(backendPort)],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } else {
    // Run packaged binary sidecar
    pythonProcess = spawn(pythonExec, ['--port', String(backendPort)], {
      cwd: path.dirname(pythonExec),
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  pythonProcess.stdout.on('data', (d) => {
    writeLog('Backend', d.toString().trim());
  });

  pythonProcess.stderr.on('data', (d) => {
    writeLog('Backend Err', d.toString().trim());
  });

  pythonProcess.on('exit', (code) => {
    writeLog('Backend', `exited with code ${code}`);
    pythonProcess = null;
  });

  const ready = await waitForBackend(backendPort);
  if (!ready) {
    writeLog('Backend Err', `timed out waiting for port ${backendPort}`);
  }
}

function stopBackend() {
  if (pythonProcess && pythonProcess.pid) {
    writeLog('Electron', `Terminating backend PID ${pythonProcess.pid}...`);
    killProcessTree(pythonProcess.pid);
    pythonProcess = null;
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0c0d12',
    title: 'Shortly',
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Global shortcuts: F12 / Ctrl+Shift+I for DevTools, Ctrl+Shift+L to reveal logs
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (input.control && input.shift && input.key.toLowerCase() === 'l') {
      const p = getLogFile();
      if (p && fs.existsSync(p)) shell.showItemInFolder(p);
      event.preventDefault();
    }
  });

  // Open external links in user's default browser (Terms, Privacy, OAuth)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (isDev) {
    const devUrl = 'http://localhost:5173/#app';
    console.log(`Loading Dev URL: ${devUrl}`);
    mainWindow.loadURL(devUrl);
  } else {
    const prodFile = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(prodFile, { hash: 'app' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('open-external', async (_, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.handle('get-log-path', () => getLogFile());

ipcMain.handle('open-log-folder', () => {
  const p = getLogFile();
  if (p && fs.existsSync(p)) {
    shell.showItemInFolder(p);
  } else {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (fs.existsSync(logDir)) shell.openPath(logDir);
  }
  return true;
});

// App Lifecycle
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const { session } = require('electron');
  if (session && session.defaultSession) {
    session.defaultSession.webRequest.onBeforeSendHeaders(
      { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
      (details, callback) => {
        details.requestHeaders['Referer'] = 'https://www.youtube.com/';
        details.requestHeaders['Origin'] = 'https://www.youtube.com';
        callback({ cancel: false, requestHeaders: details.requestHeaders });
      }
    );
  }

  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

process.on('SIGINT', () => {
  stopBackend();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopBackend();
  process.exit(0);
});
