import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, closeDb } from './store/db.js';
import { getUpstreamBaseUrl } from './store/repo.js';
import { registerIpcHandlers } from './ipc.js';
import { startProxyServer } from './proxy/server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

app.setPath('userData', path.join(app.getPath('appData'), 'llm-inspector'));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'LLM API Inspector',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  Menu.setApplicationMenu(null);

  if (process.env.LLM_INSPECTOR_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(async () => {
  initDb();
  getUpstreamBaseUrl();
  registerIpcHandlers();
  createWindow();

  try {
    await startProxyServer();
  } catch (err) {
    console.error('Failed to start proxy server:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  closeDb();
});
