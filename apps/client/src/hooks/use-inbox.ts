import {
  getInboxSnapshot,
  subscribeInbox,
  type InboxServer
} from '@/lib/inbox';
import { useSyncExternalStore } from 'react';

/** Live cross-server inbox snapshot (unread channels + DMs per server). */
const useInbox = (): InboxServer[] =>
  useSyncExternalStore(subscribeInbox, getInboxSnapshot, getInboxSnapshot);

export { useInbox };
