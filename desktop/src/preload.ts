import { contextBridge, ipcRenderer } from 'electron';

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

  // Global media hotkeys fired from the main process.
  onToggleMic: (cb: () => void) => {
    ipcRenderer.on('hotkey:toggle-mic', () => cb());
  },
  onToggleDeafen: (cb: () => void) => {
    ipcRenderer.on('hotkey:toggle-deafen', () => cb());
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
    ipcRenderer.invoke('startup:set', openAtLogin, openInTray)
};

contextBridge.exposeInMainWorld('uncordDesktop', api);

export type UncordDesktopApi = typeof api;
