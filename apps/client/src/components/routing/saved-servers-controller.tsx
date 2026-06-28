import { restoreSavedServers } from '@/features/server/actions';
import { useIsConnected } from '@/features/server/hooks';
import { isStandalone } from '@/helpers/standalone';
import { memo, useEffect } from 'react';

/**
 * Restores the saved secondary servers into the rail on launch. It waits until
 * the primary server is connected so the primary claims the bootstrap store
 * first and restores never interleave with the primary join. `restoreSavedServers`
 * is itself guarded to run only once. (UNCORD_PLAN.md §3.1, M3)
 */
const SavedServersController = memo(() => {
  const isConnected = useIsConnected();

  useEffect(() => {
    // Browser: wait for the primary to connect so it claims the bootstrap store
    // first. Native shells have no primary, so restore immediately on mount.
    if (isStandalone() || isConnected) {
      void restoreSavedServers();
    }
  }, [isConnected]);

  return null;
});

export { SavedServersController };
