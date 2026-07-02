import { ipcMain } from 'electron';
import log from 'electron-log';

/**
 * Global push-to-talk (UNCORD_PLAN — REEF voice input modes).
 *
 * Electron's globalShortcut API only reports key *presses*, never releases, so
 * hold-to-talk needs a low-level OS keyboard hook. uiohook-napi installs one
 * (the same mechanism Discord uses) and reports both keydown and keyup
 * system-wide.
 *
 * PRIVACY CONTRACT: a global hook technically sees every keystroke in every
 * app. All filtering therefore happens HERE in the main process — the renderer
 * only ever receives `ptt:held` true/false for the single key it bound, and
 * the hook runs only between `ptt:bind` and `ptt:unbind` (the client binds
 * while in a voice channel with push-to-talk selected, and unbinds when
 * leaving it). Never forward raw key events to the renderer.
 *
 * The native module is loaded lazily and every failure degrades gracefully:
 * `ptt:bind` resolves false and the client falls back to window-scoped PTT.
 */

type TUiohookModule = typeof import('uiohook-napi');

// undefined = not attempted yet, null = tried and failed
let uiohookModule: TUiohookModule | null | undefined;

const loadUiohook = (): TUiohookModule | null => {
  if (uiohookModule !== undefined) {
    return uiohookModule;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    uiohookModule = require('uiohook-napi') as TUiohookModule;
  } catch (error) {
    log.warn('[ptt] uiohook-napi failed to load; global PTT disabled', error);
    uiohookModule = null;
  }

  return uiohookModule;
};

/**
 * Map a browser KeyboardEvent.code to a uiohook keycode. UiohookKey names
 * mostly mirror KeyboardEvent.code (Backquote, BracketLeft, ArrowLeft,
 * Numpad5, F13, Space, ...); letters and digits differ ("KeyA" vs "A",
 * "Digit1" vs "1"). Returns undefined for unmappable codes — the client then
 * keeps its window-scoped fallback.
 */
const browserCodeToKeycode = (code: string): number | undefined => {
  const mod = loadUiohook();

  if (!mod) {
    return undefined;
  }

  const keys = mod.UiohookKey as unknown as Record<string, number | undefined>;

  if (/^Key[A-Z]$/.test(code)) return keys[code.slice(3)];
  if (/^Digit[0-9]$/.test(code)) return keys[code.slice(5)];

  return keys[code];
};

let listenersAttached = false;
let hookRunning = false;
let boundKeycode: number | null = null;
let isHeld = false;
let sendHeld: ((held: boolean) => void) | null = null;

const setHeld = (held: boolean) => {
  if (isHeld === held) {
    return;
  }

  isHeld = held;
  sendHeld?.(held);
};

const attachListenersOnce = (mod: TUiohookModule) => {
  if (listenersAttached) {
    return;
  }

  listenersAttached = true;

  mod.uIOhook.on('keydown', (event) => {
    if (boundKeycode === null || event.keycode !== boundKeycode) return;

    setHeld(true); // no-ops on OS key auto-repeat
  });

  mod.uIOhook.on('keyup', (event) => {
    if (boundKeycode === null || event.keycode !== boundKeycode) return;

    setHeld(false);
  });
};

const stopHook = () => {
  const mod = loadUiohook();

  setHeld(false);
  boundKeycode = null;

  if (mod && hookRunning) {
    try {
      mod.uIOhook.stop();
    } catch (error) {
      log.warn('[ptt] failed to stop keyboard hook', error);
    }
    hookRunning = false;
  }
};

/**
 * Register the PTT IPC surface. `send` delivers `ptt:held` to the renderer.
 */
const setupPtt = (send: (held: boolean) => void) => {
  sendHeld = send;

  // Bind (or rebind) the PTT key. Resolves true when the global hook is
  // active for that key, false when unavailable (no native module, unmappable
  // key, hook failed to start) — the renderer falls back to window-scoped PTT.
  ipcMain.handle('ptt:bind', (_event, code: unknown): boolean => {
    if (typeof code !== 'string') {
      return false;
    }

    const mod = loadUiohook();
    const keycode = browserCodeToKeycode(code);

    if (!mod || keycode === undefined) {
      return false;
    }

    setHeld(false);
    boundKeycode = keycode;
    attachListenersOnce(mod);

    if (!hookRunning) {
      try {
        mod.uIOhook.start();
        hookRunning = true;
      } catch (error) {
        log.warn('[ptt] failed to start keyboard hook', error);
        boundKeycode = null;
        return false;
      }
    }

    return true;
  });

  ipcMain.handle('ptt:unbind', () => {
    stopHook();
  });
};

/** Called on app quit so the OS hook never outlives the app. */
const shutdownPtt = () => {
  stopHook();
  sendHeld = null;
};

export { setupPtt, shutdownPtt };
