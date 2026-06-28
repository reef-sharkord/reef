/**
 * Access to the Capacitor native bridge (present only in the Android/iOS shell).
 * The web/desktop builds have no `window.Capacitor`, so callers no-op there.
 */
type NativePlugin = Record<string, ((...args: unknown[]) => Promise<unknown>) | undefined>;

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, NativePlugin | undefined>;
};

const getCapacitor = (): CapacitorBridge | undefined =>
  typeof window !== 'undefined'
    ? (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor
    : undefined;

const isNativeApp = (): boolean => !!getCapacitor()?.isNativePlatform?.();

/** A native plugin by name, or undefined off-native / if the plugin is absent. */
const getNativePlugin = (name: string): NativePlugin | undefined =>
  getCapacitor()?.Plugins?.[name];

export { getNativePlugin, isNativeApp };
