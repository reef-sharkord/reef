/**
 * "Standalone" / native-shell mode.
 *
 * In the browser the client is served *by* a Sharkord server, so that server is
 * the implicit primary (window.location). In the Electron desktop app and the
 * Capacitor mobile app the client is bundled and served from file:// /
 * capacitor://, so there is NO implicit primary — every server is added through
 * the rail and persisted. The native shells build the client with
 * `VITE_STANDALONE=true` to switch into this mode. (UNCORD_PLAN.md M6/M7)
 */
const isStandalone = (): boolean => import.meta.env.VITE_STANDALONE === 'true';

/** Whether a bare `host[:port]` points at the local machine. */
const isLocalHost = (host: string): boolean =>
  /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/i.test(host);

export { isLocalHost, isStandalone };
