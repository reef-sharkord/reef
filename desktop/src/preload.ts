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
  }
};

contextBridge.exposeInMainWorld('uncordDesktop', api);

export type UncordDesktopApi = typeof api;
