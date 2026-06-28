import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Uncord mobile shell (Capacitor). It packages the same React client, built in
 * standalone mode (VITE_STANDALONE=true) into `www/`, as an Android WebView app.
 * The user adds every server through the rail — there is no bundled server.
 *
 * `androidScheme: 'https'` serves the bundled assets over an https:// origin so
 * the client treats remote servers as secure (wss/https) by default, matching
 * the standalone URL logic in the client.
 */
const config: CapacitorConfig = {
  appId: 'com.uncord.app',
  appName: 'Uncord',
  webDir: 'www',
  backgroundColor: '#171717',
  android: {
    allowMixedContent: false
  },
  server: {
    androidScheme: 'https'
  }
};

export default config;
