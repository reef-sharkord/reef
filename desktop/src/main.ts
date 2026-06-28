import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'node:path';

/**
 * Uncord desktop shell (Electron).
 *
 * It is intentionally thin: it loads the same React client the browser uses,
 * built in "standalone" mode (no baked-in primary server — the user adds every
 * server through the rail). The only desktop-specific responsibilities are
 * window management and auto-update.
 *
 * Auto-update (Discord-style): electron-updater checks the generic feed
 * configured in electron-builder.yml (`publish.url`) on launch, downloads new
 * builds in the background, and installs them on quit. Publish a new version by
 * bumping `version` and running `npm run publish` (uploads the installer +
 * latest.yml to that URL).
 */

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#171717',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Open external links in the user's browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Bundled client (apps/client built with --base=./ into ../renderer).
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const setupAutoUpdates = () => {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:available', info.version);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:progress', progress.percent);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:downloaded', info.version);
  });

  autoUpdater.on('error', (err) => {
    // never crash the app over a failed update check
    console.error('[auto-update] error', err);
  });

  void autoUpdater.checkForUpdatesAndNotify();
};

app.whenReady().then(() => {
  ipcMain.handle('app:getVersion', () => app.getVersion());
  // Triggered from the renderer (e.g. an in-app "Restart to update" button).
  ipcMain.handle('update:quitAndInstall', () => autoUpdater.quitAndInstall());

  createWindow();
  setupAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
