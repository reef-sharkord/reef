import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as path from 'node:path';

// Tiny 16x16 taskbar overlay dots (red = mention, indigo = unread). Embedded as
// data URLs so they need no file bundling.
const BADGE_MENTION_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFjSURBVDhPtVOvUwJBGL1INBqN/glGA8EhkSgUi4PFRJGEQQqYDEQCzDDMOGNzoADRMRFIFIegBWRv9+72jvPu28/5+DWydx7JN/Pae2+/b9+uYfwHEPEYEW+B8xfgfAScDxDxDhFPdW0EoeNcwWLx5XU6gaxU0C4W0SmX0Ws2EWYzAYw96J4d6CR/OOQ8m0UznY6l127bwNgbIqb2zKGUN8tez9INcZSNhgdCPO7MiHgSzucmz2Qi4r8YTqemUupsFQC+f++1WoEuSqKsVhGEeFoHcD6gi9JFSbQKBQTLel8HeJ4QuVxEdIiE7QQjqksXJFHk8whSzlcBynXrbr0eESWRVqbVty2cB5OJqYuSuOz3bUS83BRpGMDYs6zVvnVhHGldWntn3kyRAtv+PBSyMjP2Qf9lL2ATckSTBOOx6ZRKuG2GnjYZ/W5X0smx5t9QSl2Aab5SvVSV8n2XjEqpa137A4pvGK6FCiW8AAAAAElFTkSuQmCC';
const BADGE_UNREAD_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFhSURBVDhPtVM9SwNBFEyZ0tLS0p9gaenPEEQJSEBEULuAVhIQRQIi+NEpQlBDxMomiJxNahGCRayU3N3eXTaXy3sjL16C2VzOygfTzcy+2dnNZP5jAEwD2FIeVZVHdaXoEUABwKzJHRutedlx6Ov+QUfHJ23sFQMclQLcVjpo2eQ6ioqmZjhykvUSOvk1haUVNxHVqvZctxwA2RGx1pyvPYXKFCShfKO18vlwKAYw03J6dm51nDwJzY+ezcxzfYMw5N27io5MUhpOz9vwfbruG0h2uSiTlIbCji8Gjb5Bp0Pu+sbki5sEmZ8NPKpLXSYhDZvbHrSmz3gDLl1e6TFSGiSyRB+0MN94j2yTlAbLCj0Ai3GRmYzrUvnsIuiaxCRIXIk9FMdbZH2fPv4yEbHjUFP+y4hBbDIlm7y+Rfb+QYBBM/K0RVirhYGcnCj+Pcy8oBQ9S71SVbfLbREyc87kfgMguDsTyotGoQAAAABJRU5ErkJggg==';

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
  tray.setToolTip('REEF');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open REEF', click: showWindow },
      { type: 'separator' },
      {
        label: 'Quit REEF',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
  tray.on('click', showWindow);
};

// Taskbar overlay badge: a red dot for mentions, an indigo dot for plain
// unreads, cleared when there's nothing. (Windows shows app badges as overlay
// icons; setBadgeCount is a no-op there.)
const setUnreadBadge = (count: number, hasMentions: boolean) => {
  if (!mainWindow) {
    return;
  }

  if (count <= 0) {
    mainWindow.setOverlayIcon(null, '');
    app.setBadgeCount(0);
    return;
  }

  const image = nativeImage.createFromDataURL(
    `data:image/png;base64,${hasMentions ? BADGE_MENTION_PNG : BADGE_UNREAD_PNG}`
  );

  mainWindow.setOverlayIcon(image, `${count} unread`);
  app.setBadgeCount(count); // macOS/Linux dock badge
};

// Global media hotkeys: work even when Uncord is unfocused or in the tray. They
// forward to the renderer, which toggles the active voice session via the
// in-app voice bridge. (The renderer suppresses its own in-app handler on
// desktop so these don't double-fire.)
const registerGlobalShortcuts = () => {
  globalShortcut.register('CommandOrControl+Shift+M', () => {
    mainWindow?.webContents.send('hotkey:toggle-mic');
  });
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    mainWindow?.webContents.send('hotkey:toggle-deafen');
  });
};

const shouldStartHidden = () =>
  process.argv.includes('--hidden') ||
  app.getLoginItemSettings().wasOpenedAsHidden;

const createWindow = () => {
  const startHidden = shouldStartHidden();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#171717',
    autoHideMenuBar: true,
    show: !startHidden,
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

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.whenReady().then(() => {
    ipcMain.handle('app:getVersion', () => app.getVersion());
    // Triggered from the renderer (e.g. an in-app "Restart to update" button).
    ipcMain.handle('update:quitAndInstall', () => autoUpdater.quitAndInstall());
    // Renderer asks to bring the window forward (e.g. a notification click).
    ipcMain.handle('window:focus', () => showWindow());
    // Unread badge from the renderer (total across servers + mention flag).
    ipcMain.handle('badge:set', (_event, count: number, hasMentions: boolean) =>
      setUnreadBadge(count, hasMentions)
    );
    // Launch-at-login / start-in-tray settings.
    ipcMain.handle('startup:get', () => {
      const settings = app.getLoginItemSettings();
      const openInTray = (settings.launchItems ?? []).some((item) =>
        item.args?.includes('--hidden')
      );

      return { openAtLogin: settings.openAtLogin, openInTray };
    });
    ipcMain.handle(
      'startup:set',
      (_event, openAtLogin: boolean, openInTray: boolean) => {
        app.setLoginItemSettings({
          openAtLogin,
          args: openInTray ? ['--hidden'] : []
        });
      }
    );

    createWindow();
    setupTray();
    registerGlobalShortcuts();
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
