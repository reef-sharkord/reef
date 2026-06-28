import { registerPlugin } from '@capacitor/core';

// Native foreground-service control. On non-native platforms (browser) the
// methods are harmless no-ops via Capacitor's web fallback.
export const BackgroundConnection = registerPlugin('BackgroundConnection', {
  web: () => ({
    enable: async () => undefined,
    disable: async () => undefined
  })
});
