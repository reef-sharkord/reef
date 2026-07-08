import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  session,
  shell,
  Tray
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import * as path from 'node:path';
import { setupPtt, shutdownPtt } from './ptt';

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
 * Auto-update (Discord-style): electron-updater checks the GitHub Releases
 * feed configured in electron-builder.yml (`publish`) on launch, downloads new
 * builds in the background, and installs them on quit. Publish a new version by
 * bumping `version` and running `npm run publish` with GH_TOKEN set (creates a
 * GitHub release with the installer + latest.yml).
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

// Screen sharing. In the browser `getDisplayMedia()` shows a built-in picker,
// but Electron requires the main process to answer the request explicitly —
// without a handler the renderer's `getDisplayMedia()` is denied and screen
// share silently fails. We present our own in-app picker: enumerate the
// available screens/windows (with thumbnails), ask the renderer to choose one,
// and resolve the request with the user's pick (or deny it if they cancel).
const SCREEN_SHARE_THUMBNAIL = { width: 320, height: 180 };

type ScreenShareCallback = (streams: {
  video?: Electron.DesktopCapturerSource;
  audio?: 'loopback' | 'loopbackWithMute';
}) => void;

type ScreenSharePick = {
  sourceId: string | null;
  withAudio: boolean;
};

let pendingScreenShareCallback: ScreenShareCallback | null = null;
let pendingScreenShareSources: Electron.DesktopCapturerSource[] = [];

// Resolve an in-flight screen-share request with the chosen source id (or null
// to cancel), optionally including system (loopback) audio. Ensures the
// getDisplayMedia callback is always called exactly once.
const resolveScreenShare = (pick: ScreenSharePick) => {
  const callback = pendingScreenShareCallback;

  if (!callback) {
    return;
  }

  const source = pick.sourceId
    ? pendingScreenShareSources.find((s) => s.id === pick.sourceId)
    : undefined;

  pendingScreenShareCallback = null;
  pendingScreenShareSources = [];

  if (!source) {
    // An empty object cancels/denies the request.
    callback({});
    return;
  }

  // 'loopback' shares the system audio while you still hear it locally. Windows
  // 10+ supports this via Chromium's WASAPI loopback; macOS needs a recent
  // Electron + OS. If it isn't available the video still shares.
  callback(pick.withAudio ? { video: source, audio: 'loopback' } : { video: source });
};

const setupScreenShare = () => {
  // The renderer's picker replies here with the chosen source (or null to
  // cancel) and whether to include system audio. Registered once for the app's
  // lifetime.
  ipcMain.on('screen-share:picked', (_event, pick: ScreenSharePick) => {
    resolveScreenShare(pick);
  });

  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({
          types: ['screen', 'window'],
          thumbnailSize: SCREEN_SHARE_THUMBNAIL,
          fetchWindowIcons: true
        })
        .then((sources) => {
          // Never offer REEF's own window as a share target — that produces the
          // "hall of mirrors" recursion.
          const ownId = mainWindow?.getMediaSourceId();
          const offered = ownId
            ? sources.filter((s) => s.id !== ownId)
            : sources;

          if (!mainWindow || offered.length === 0) {
            callback({});
            return;
          }

          // Supersede any in-flight request (deny the old one) so a callback is
          // never left dangling.
          if (pendingScreenShareCallback) {
            resolveScreenShare({ sourceId: null, withAudio: false });
          }

          pendingScreenShareCallback = callback;
          pendingScreenShareSources = offered;

          mainWindow.webContents.send(
            'screen-share:sources',
            offered.map((source) => ({
              id: source.id,
              name: source.name,
              thumbnail: source.thumbnail.toDataURL(),
              appIcon:
                source.appIcon && !source.appIcon.isEmpty()
                  ? source.appIcon.toDataURL()
                  : null,
              isScreen: source.id.startsWith('screen:')
            }))
          );
        })
        .catch((error) => {
          log.error('[screen-share] failed to enumerate sources', error);
          callback({});
        });
    },
    // Always present our own in-app picker (not the OS one) for a consistent
    // cross-platform experience.
    { useSystemPicker: false }
  );
};

// Only ever hand these schemes to the OS shell. A chat client renders
// user-supplied links; without this, a crafted `file://`, `smb://`, or
// `ms-msdt:` link handed to `shell.openExternal` is a known RCE/credential-leak
// vector.
const isSafeExternalUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
};

const openExternalSafely = (url: string) => {
  if (isSafeExternalUrl(url)) {
    void shell.openExternal(url);
  } else {
    log.warn(`[security] blocked openExternal for unsafe url: ${url}`);
  }
};

// The renderer must never navigate the top frame off our own origin — a remote
// page loaded in the main frame would inherit the full `uncordDesktop` preload
// bridge. In prod the app is a local file://; in dev it's the Vite server.
const isInternalNavigation = (url: string): boolean => {
  try {
    if (app.isPackaged) {
      return new URL(url).protocol === 'file:';
    }
    return new URL(url).origin === new URL(DEV_SERVER_URL).origin;
  } catch {
    return false;
  }
};

const createWindow = () => {
  const startHidden = shouldStartHidden();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#171717',
    icon: path.join(__dirname, '../renderer/icon-512.png'),
    autoHideMenuBar: true,
    show: !startHidden,
    // Frameless: the client draws its own title bar (REEF). Still OS-resizable.
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
      // NB: we deliberately leave backgroundThrottling at its default (on).
      // Disabling it to keep an outbound screen share full-rate while REEF sits
      // in the tray is unreliable on Windows (it doesn't take effect with
      // hide(), and can leave <video> elements blanked on restore). The renderer
      // instead pauses only the *local* self-preview when unfocused, which keeps
      // the sent stream flowing without fighting the throttler.
    }
  });

  // Open external links in the user's browser, never inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  // Allow opening DevTools in any build (useful for diagnosing the self-hosted
  // app): F12 or Ctrl+Shift+I.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.key === 'F12' ||
        (input.control && input.shift && input.key.toLowerCase() === 'i'))
    ) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // Block any top-frame navigation away from our own origin (anchor clicks,
  // injected redirects); send safe external URLs to the browser instead.
  const guardNavigation = (event: Electron.Event, url: string) => {
    if (isInternalNavigation(url)) {
      return;
    }
    event.preventDefault();
    openExternalSafely(url);
  };
  mainWindow.webContents.on('will-navigate', guardNavigation);
  mainWindow.webContents.on('will-redirect', guardNavigation);

  if (!app.isPackaged) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Bundled client (apps/client built with --base=./ into ../renderer).
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Tell the renderer's custom title bar whether the window is maximized so it
  // can toggle the maximize/restore button.
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized', false);
  });

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

// The portable exe can't self-update (electron-updater only supports the
// installed NSIS target); the renderer detects a newer GitHub release itself
// and offers the download page instead.
const isPortableBuild = !!process.env.PORTABLE_EXECUTABLE_DIR;

// Re-check cadence: REEF often lives in the tray for days, so a launch-only
// check would miss releases until the next restart.
const UPDATE_RECHECK_MS = 4 * 60 * 60 * 1000;

const setupAutoUpdates = () => {
  if (!app.isPackaged || isPortableBuild) {
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
    // Builds are unsigned, so the only integrity check is the sha512 in
    // latest.yml — fetched over this same feed. An http feed is therefore
    // MITM-spoofable; require https (allow http only for an explicit localhost
    // test feed).
    let isSafeFeed = false;
    try {
      const { protocol, hostname } = new URL(overrideUrl);
      isSafeFeed =
        protocol === 'https:' ||
        (protocol === 'http:' &&
          (hostname === 'localhost' || hostname === '127.0.0.1'));
    } catch {
      isSafeFeed = false;
    }

    if (isSafeFeed) {
      autoUpdater.setFeedURL({ provider: 'generic', url: overrideUrl });
      log.info(`[auto-update] feed overridden -> ${overrideUrl}`);
    } else {
      log.warn(
        `[auto-update] ignoring unsafe UNCORD_UPDATE_URL (need https): ${overrideUrl}`
      );
    }
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
    // never crash the app over a failed update check (log to main.log)
    log.error('[auto-update] error', err);
  });

  // Plain checkForUpdates (no OS notification) — the renderer shows its own
  // Discord-style update button in the title bar when the download is ready.
  void autoUpdater.checkForUpdates();

  setInterval(() => {
    void autoUpdater.checkForUpdates();
  }, UPDATE_RECHECK_MS);
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
    shutdownPtt();
  });

  app.whenReady().then(() => {
    // Windows: bind the running app to its installed identity so the taskbar
    // shows REEF's icon (and notifications group under it) instead of a generic
    // Electron icon. Must be set before the window is created.
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.reef.desktop');
    }

    ipcMain.handle('app:getVersion', () => app.getVersion());
    // Portable builds can't self-update; the renderer falls back to a GitHub
    // release check and a download link.
    ipcMain.handle('app:isPortable', () => isPortableBuild);
    // Triggered from the renderer (e.g. an in-app "Restart to update" button).
    ipcMain.handle('update:quitAndInstall', () => autoUpdater.quitAndInstall());
    // Renderer asks to bring the window forward (e.g. a notification click).
    ipcMain.handle('window:focus', () => showWindow());
    // Custom title bar window controls.
    ipcMain.handle('window:minimize', () => mainWindow?.minimize());
    ipcMain.handle('window:toggleMaximize', () => {
      if (!mainWindow) return;
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    });
    ipcMain.handle('window:close', () => mainWindow?.close());
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
    // Unread badge from the renderer (total across servers + mention flag).
    ipcMain.handle('badge:set', (_event, count: number, hasMentions: boolean) =>
      setUnreadBadge(count, hasMentions)
    );
    // Launch-at-login / start-in-tray settings.
    ipcMain.handle('startup:get', () => {
      const settings = app.getLoginItemSettings();
      // "Start in tray" is encoded per-platform: openAsHidden on macOS, a
      // --hidden launch arg on Windows.
      const openInTray =
        settings.openAsHidden ||
        (settings.launchItems ?? []).some((item) =>
          item.args?.includes('--hidden')
        );

      return { openAtLogin: settings.openAtLogin, openInTray };
    });
    ipcMain.handle(
      'startup:set',
      (_event, openAtLogin: boolean, openInTray: boolean) => {
        app.setLoginItemSettings({
          openAtLogin,
          openAsHidden: openInTray, // macOS
          args: openInTray ? ['--hidden'] : [] // Windows
        });
      }
    );

    // Global push-to-talk (low-level keyboard hook, see ptt.ts for the
    // privacy contract). Only the bound key's held/released state ever
    // reaches the renderer.
    setupPtt((held) => {
      mainWindow?.webContents.send('ptt:held', held);
    });

    setupScreenShare();
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
