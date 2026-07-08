import { contextBridge, ipcRenderer } from 'electron';

/** A capturable screen or window offered to the in-app screen-share picker. */
export type DesktopCaptureSource = {
  id: string;
  name: string;
  thumbnail: string; // data URL
  appIcon: string | null; // data URL, windows only
  isScreen: boolean;
};

/**
 * Minimal, safe bridge exposed to the renderer (the Uncord client) as
 * `window.uncordDesktop`. Context isolation is on, so the client can only reach
 * exactly what is whitelisted here. The client can feature-detect this object to
 * know it is running inside the desktop shell.
 */
const api = {
  isDesktop: true,
  platform: process.platform,
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  isPortable: (): Promise<boolean> => ipcRenderer.invoke('app:isPortable'),
  quitAndInstallUpdate: (): Promise<void> =>
    ipcRenderer.invoke('update:quitAndInstall'),
  onUpdateAvailable: (cb: (version: string) => void) => {
    ipcRenderer.on('update:available', (_e, version: string) => cb(version));
  },
  onUpdateProgress: (cb: (percent: number) => void) => {
    ipcRenderer.on('update:progress', (_e, percent: number) => cb(percent));
  },
  onUpdateDownloaded: (cb: (version: string) => void) => {
    ipcRenderer.on('update:downloaded', (_e, version: string) => cb(version));
  },

  // Bring the window forward (e.g. on notification click).
  focusWindow: (): Promise<void> => ipcRenderer.invoke('window:focus'),

  // Custom title bar window controls.
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: (): Promise<void> =>
    ipcRenderer.invoke('window:toggleMaximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('window:isMaximized'),
  onMaximizeChange: (cb: (maximized: boolean) => void) => {
    ipcRenderer.on('window:maximized', (_e, maximized: boolean) => cb(maximized));
  },

  // Global media hotkeys fired from the main process.
  onToggleMic: (cb: () => void) => {
    ipcRenderer.on('hotkey:toggle-mic', () => cb());
  },
  onToggleDeafen: (cb: () => void) => {
    ipcRenderer.on('hotkey:toggle-deafen', () => cb());
  },

  // Global push-to-talk. bind() starts a system-wide keyboard hook for the
  // given KeyboardEvent.code and resolves false when unavailable (the client
  // then falls back to window-scoped PTT). Filtering happens in the main
  // process — only the bound key's held state ever crosses this bridge.
  // Subscribed per voice session, so the listener returns an unsubscribe.
  pttBind: (code: string): Promise<boolean> =>
    ipcRenderer.invoke('ptt:bind', code),
  pttUnbind: (): Promise<void> => ipcRenderer.invoke('ptt:unbind'),
  onPttHeldChange: (cb: (held: boolean) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, held: boolean) =>
      cb(held);
    ipcRenderer.on('ptt:held', listener);
    return () => ipcRenderer.removeListener('ptt:held', listener);
  },

  // Taskbar/dock unread badge.
  setUnreadBadge: (count: number, hasMentions: boolean): Promise<void> =>
    ipcRenderer.invoke('badge:set', count, hasMentions),

  // Launch-at-login / start-in-tray.
  getStartupSettings: (): Promise<{
    openAtLogin: boolean;
    openInTray: boolean;
  }> => ipcRenderer.invoke('startup:get'),
  setStartupSettings: (
    openAtLogin: boolean,
    openInTray: boolean
  ): Promise<void> =>
    ipcRenderer.invoke('startup:set', openAtLogin, openInTray),

  // Screen-share source picker. The main process asks the renderer to choose a
  // capture source when getDisplayMedia() is called; the renderer replies with
  // the chosen id (or null to cancel).
  onScreenShareSources: (cb: (sources: DesktopCaptureSource[]) => void) => {
    ipcRenderer.on(
      'screen-share:sources',
      (_e, sources: DesktopCaptureSource[]) => cb(sources)
    );
  },
  pickScreenShareSource: (
    sourceId: string | null,
    withAudio: boolean
  ): void => {
    ipcRenderer.send('screen-share:picked', { sourceId, withAudio });
  }
};

contextBridge.exposeInMainWorld('uncordDesktop', api);

export type UncordDesktopApi = typeof api;
