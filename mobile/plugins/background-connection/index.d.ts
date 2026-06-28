export interface BackgroundConnectionPlugin {
  /** Start the foreground service (ongoing notification + wake lock). */
  enable(): Promise<void>;
  /** Stop the foreground service. */
  disable(): Promise<void>;
}

export declare const BackgroundConnection: BackgroundConnectionPlugin;
