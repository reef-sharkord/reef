import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
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
let tray: Tray | null = null;
// Closing the window hides to tray; only an explicit Quit (tray menu / app quit)
// actually exits, so the app keeps running for notifications + voice.
let isQuitting = false;

const trayIconPath = () =>
  path.join(__dirname, '../renderer/icon-192.png');

const showWindow = () => {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
};

const setupTray = () => {
  if (tray) {
    return;
  }

  const image = nativeImage.createFromPath(trayIconPath());

  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Uncord');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Uncord', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit Uncord',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on('click', showWindow);
};

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

  // Closing hides to the tray instead of quitting (unless we're really quitting).
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const setupAutoUpdates = () => {
  if (!app.isPackaged) {
    return;
  }

  // Log update checks/downloads to electron-log (userData/logs/main.log) so
  // failures are diagnosable in the field.
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  // Optional runtime override of the update feed (e.g. point at a staging host
  // or a local test server without rebuilding). Falls back to the baked-in
  // electron-builder publish config.
  const overrideUrl = process.env.UNCORD_UPDATE_URL;

  if (overrideUrl) {
    autoUpdater.setFeedURL({ provider: 'generic', url: overrideUrl });
    log.info(`[auto-update] feed overridden -> ${overrideUrl}`);
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

// Single-instance: a second launch focuses the existing window instead of
// opening another copy.
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.whenReady().then(() => {
    ipcMain.handle('app:getVersion', () => app.getVersion());
    // Triggered from the renderer (e.g. an in-app "Restart to update" button).
    ipcMain.handle('update:quitAndInstall', () => autoUpdater.quitAndInstall());

    createWindow();
    setupTray();
    setupAutoUpdates();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        showWindow();
      }
    });
  });

  // With close-to-tray the app intentionally keeps running when all windows are
  // closed; it only exits via the tray's Quit. So we do not quit here.
}
