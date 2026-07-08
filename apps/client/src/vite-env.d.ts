/// <reference types="vite/client" />
/// <reference types="zzfx" />

// Extend the Window interface for global functions
declare global {
  // A capturable screen or window offered to the in-app screen-share picker
  // (mirrors desktop/src/preload.ts DesktopCaptureSource).
  interface DesktopCaptureSource {
    id: string;
    name: string;
    thumbnail: string;
    appIcon: string | null;
    isScreen: boolean;
  }

  // Bridge exposed by the Electron desktop shell (desktop/src/preload.ts).
  // Absent in the browser and mobile.
  interface UncordDesktopApi {
    isDesktop: boolean;
    platform: string;
    getVersion: () => Promise<string>;
    // optional: absent in desktop shells older than the update-button feature
    isPortable?: () => Promise<boolean>;
    quitAndInstallUpdate: () => Promise<void>;
    onUpdateAvailable: (cb: (version: string) => void) => void;
    onUpdateProgress: (cb: (percent: number) => void) => void;
    onUpdateDownloaded: (cb: (version: string) => void) => void;
    focusWindow: () => Promise<void>;
    onToggleMic: (cb: () => void) => void;
    onToggleDeafen: (cb: () => void) => void;
    // Global push-to-talk (optional: absent in desktop shells older than the
    // PTT feature). bind resolves false when the OS hook is unavailable.
    pttBind?: (code: string) => Promise<boolean>;
    pttUnbind?: () => Promise<void>;
    onPttHeldChange?: (cb: (held: boolean) => void) => () => void;
    setUnreadBadge: (count: number, hasMentions: boolean) => Promise<void>;
    getStartupSettings: () => Promise<{
      openAtLogin: boolean;
      openInTray: boolean;
    }>;
    setStartupSettings: (
      openAtLogin: boolean,
      openInTray: boolean
    ) => Promise<void>;
    minimizeWindow: () => Promise<void>;
    toggleMaximizeWindow: () => Promise<void>;
    closeWindow: () => Promise<void>;
    isWindowMaximized: () => Promise<boolean>;
    onMaximizeChange: (cb: (maximized: boolean) => void) => void;
    onScreenShareSources: (
      cb: (sources: DesktopCaptureSource[]) => void
    ) => void;
    pickScreenShareSource: (
      sourceId: string | null,
      withAudio: boolean
    ) => void;
  }

  interface Window {
    useToken: (token: string) => Promise<void>;
    openSoundsModal?: () => void;
    printVoiceStats?: () => void;
    DEBUG?: boolean;
    uncordDesktop?: UncordDesktopApi;

    // plugin store exposed for plugins to use imperatively
    __SHARKORD_STORE__: import('@sharkord/shared').TPluginStore;

    // libs exposed for plugins to use
    __SHARKORD_EXPOSED_LIBS__: {
      createSelector: typeof import('@reduxjs/toolkit').createSelector;
      createCachedSelector: typeof import('re-reselect').createCachedSelector;
    };

    // react and react-dom for plugins to use, injected in main.tsx
    __SHARKORD_REACT__: typeof import('react');
    __SHARKORD_REACT_JSX__: typeof import('react/jsx-runtime');
    __SHARKORD_REACT_JSX_DEV__: typeof import('react/jsx-dev-runtime');
    __SHARKORD_REACT_DOM__: typeof import('react-dom');
    __SHARKORD_REACT_DOM_CLIENT__: typeof import('react-dom/client');
  }

  const VITE_APP_VERSION: string;
  // REEF release version (from desktop/package.json — the release tag source)
  const VITE_REEF_VERSION: string;
}

// this provides type definitions for i18n setup
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof import('./locales/en/common.json');
      connect: typeof import('./locales/en/connect.json');
      disconnected: typeof import('./locales/en/disconnected.json');
      sidebar: typeof import('./locales/en/sidebar.json');
      topbar: typeof import('./locales/en/topbar.json');
      dialogs: typeof import('./locales/en/dialogs.json');
      settings: typeof import('./locales/en/settings.json');
      permissions: typeof import('./locales/en/permissions.json');
    };
  }
}

export {};
