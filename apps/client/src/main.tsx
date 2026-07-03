import { i18nReady } from '@/i18n';
import { Toaster } from '@sharkord/ui';
import 'prosemirror-view/style/prosemirror.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { DebugInfo } from './components/debug-info/index.tsx';
import { StoreDebug } from './components/debug/store-debug.tsx';
import { DevicesProvider } from './components/devices-provider/index.tsx';
import { DialogsProvider } from './components/dialogs/index.tsx';
import { GlobalErrorBoundary } from './components/error-boundary/global-error-boundary.tsx';
import { HotkeysController } from './components/hotkeys-controller/index.tsx';
import { PluginsController } from './components/plugins-controller/index.tsx';
import { QuickSwitch } from './components/quick-switch/index.tsx';
import { AutoLoginController } from './components/routing/auto-login-controller.tsx';
import { BackgroundConnectionController } from './components/routing/background-connection-controller.tsx';
import { DesktopController } from './components/routing/desktop-controller.tsx';
import { ForegroundResumeController } from './components/routing/foreground-resume-controller.tsx';
import { Routing } from './components/routing/index.tsx';
import { NativePushController } from './components/routing/native-push-controller.tsx';
import { ReconnectController } from './components/routing/reconnect-controller.tsx';
import { SavedServersController } from './components/routing/saved-servers-controller.tsx';
import { UpdateNotifier } from './components/routing/update-notifier.tsx';
import { ScreenSharePicker } from './components/screen-share-picker/index.tsx';
import { ServerScreensProvider } from './components/server-screens/index.tsx';
import { ThemeProvider } from './components/theme-provider/index.tsx';
import { Titlebar } from './components/titlebar/index.tsx';
import { VoiceProvider } from './components/voice-provider/index.tsx';
import { VoiceStoreProvider } from './components/voice-provider/voice-store-provider.tsx';
import { exposePluginStore } from './features/server/plugins/plugin-store.ts';
import { store } from './features/store.ts';
import { exposeLibs, exposeReact } from './helpers/exposes.ts';
import { LocalStorageKey } from './helpers/storage.ts';
import './index.css';
import { applyAppearance } from './lib/appearance.ts';

exposeReact();
exposeLibs();
exposePluginStore();
applyAppearance();

await i18nReady;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      defaultTheme="dark"
      storageKey={LocalStorageKey.VITE_UI_THEME}
    >
      <GlobalErrorBoundary>
        <DebugInfo />
        <Toaster />
        <ScreenSharePicker />
        <QuickSwitch />
        <Provider store={store}>
          <StoreDebug />
          <HotkeysController />
          <DevicesProvider>
            <PluginsController />
            <DialogsProvider />
            <ServerScreensProvider />
            <AutoLoginController />
            <ForegroundResumeController />
            <ReconnectController />
            <NativePushController />
            <SavedServersController />
            <BackgroundConnectionController />
            <DesktopController />
            <UpdateNotifier />
            <div className="flex h-dvh flex-col">
              <Titlebar />
              <div className="min-h-0 flex-1">
                <VoiceStoreProvider>
                  <VoiceProvider>
                    <Routing />
                  </VoiceProvider>
                </VoiceStoreProvider>
              </div>
            </div>
          </DevicesProvider>
        </Provider>
      </GlobalErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
