import {
  getLocalStorageItem,
  LocalStorageKey,
  setLocalStorageItem
} from '@/helpers/storage';

/**
 * Cross-server saved (bookmarked) messages. Client-only and REEF-exclusive:
 * stored in localStorage as lightweight snapshots so the list renders without
 * fetching, and clicking one jumps to the original. Newest first, capped.
 */
export type SavedMessage = {
  host: string;
  channelId: number;
  messageId: number;
  isDm: boolean;
  channelName: string;
  preview: string;
  savedAt: number;
};

const MAX_SAVED = 300;

const read = (): SavedMessage[] => {
  const raw = getLocalStorageItem(LocalStorageKey.SAVED_MESSAGES);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? (parsed as SavedMessage[]) : [];
  } catch {
    return [];
  }
};

const write = (entries: SavedMessage[]): void => {
  setLocalStorageItem(
    LocalStorageKey.SAVED_MESSAGES,
    JSON.stringify(entries.slice(0, MAX_SAVED))
  );
};

const sameMessage = (a: SavedMessage, host: string, messageId: number) =>
  a.host === host && a.messageId === messageId;

/** All saved messages, newest first. */
export const getSavedMessages = (): SavedMessage[] =>
  read().sort((a, b) => b.savedAt - a.savedAt);

export const isMessageSaved = (host: string, messageId: number): boolean =>
  read().some((e) => sameMessage(e, host, messageId));

export const removeSavedMessage = (host: string, messageId: number): void => {
  write(read().filter((e) => !sameMessage(e, host, messageId)));
};

/** Add or remove a message from saved. Returns the new saved state. */
export const toggleSavedMessage = (entry: SavedMessage): boolean => {
  const entries = read();
  const exists = entries.some((e) =>
    sameMessage(e, entry.host, entry.messageId)
  );

  if (exists) {
    write(entries.filter((e) => !sameMessage(e, entry.host, entry.messageId)));
    return false;
  }

  write([entry, ...entries]);
  return true;
};

/** Best-effort plain-text preview from a (possibly HTML) message body. */
export const previewFromContent = (
  content: string | null | undefined
): string => {
  if (!content) {
    return '';
  }

  return content
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
};
