const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST_DIR = path.join(__dirname, '..', 'dist');
const APP_SCHEME = 'app';
const APP_HOST = 'interntrack';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const reqUrl = new URL(request.url);
    let relPath = decodeURIComponent(reqUrl.pathname || '/');
    if (relPath === '/' || relPath === '') {
      relPath = '/index.html';
    }

    const resolvedDist = path.resolve(DIST_DIR);
    let candidate = path.resolve(resolvedDist, `.${relPath}`);

    // Prevent directory traversal outside dist/
    if (!candidate.startsWith(resolvedDist + path.sep) && candidate !== resolvedDist) {
      candidate = path.join(resolvedDist, 'index.html');
    }

    if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
      candidate = path.join(resolvedDist, 'index.html');
    }

    return net.fetch(pathToFileURL(candidate).toString());
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'InternTrack — OJT & Internship Monitoring',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // Open external http(s) links in the system browser instead of inside Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const isInternalApp = targetUrl.startsWith(`${APP_SCHEME}://${APP_HOST}`);
    const isDevServer = devUrl && targetUrl.startsWith(devUrl);
    if (!isInternalApp && !isDevServer) {
      event.preventDefault();
      if (targetUrl.startsWith('https://') || targetUrl.startsWith('http://')) {
        shell.openExternal(targetUrl);
      }
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadURL(`${APP_SCHEME}://${APP_HOST}/index.html`);
  }

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  if (!process.env.VITE_DEV_SERVER_URL) {
    registerAppProtocol();
  }
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

