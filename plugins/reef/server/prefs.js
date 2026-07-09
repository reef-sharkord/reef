// REEF synced client prefs — a tiny per-user blob store so one person's REEF
// apps on different devices (desktop + phone) can share client-side settings
// that belong to THIS server anyway (today: muted channels + server mute).
//
// The plugin never interprets the blob: the REEF client owns the schema and
// resolves conflicts with last-write-wins on the updatedAt stamp (a stale
// write is rejected so the losing device pulls instead of clobbering). Users
// can only ever read/write their own blob, and it is size-capped so this can
// never become a file dump.
//
// Blobs persist in synced-prefs.json next to the plugin.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFS_FILE = 'synced-prefs.json';
const BLOB_MAX = 8192;

export const createSyncedPrefs = (ctx) => {
  const prefsPath = join(ctx.path, PREFS_FILE);

  // { [userId]: { blob, updatedAt } }
  let registry = {};

  try {
    registry = JSON.parse(readFileSync(prefsPath, 'utf8'));
  } catch {
    registry = {};
  }

  const persist = () => {
    try {
      writeFileSync(prefsPath, JSON.stringify(registry));
    } catch (error) {
      ctx.error('[prefs] failed to persist synced prefs', error);
    }
  };

  const get = (userId) => {
    const entry = userId ? registry[userId] : undefined;

    return entry ? { blob: entry.blob, updatedAt: entry.updatedAt } : null;
  };

  // Returns 'ok', 'stale' (server already has newer — caller should pull), or
  // 'invalid' (bad shape / too large).
  const set = (userId, blob, updatedAt) => {
    const at = Number(updatedAt);

    if (
      !userId ||
      typeof blob !== 'string' ||
      blob.length === 0 ||
      blob.length > BLOB_MAX ||
      !Number.isFinite(at)
    ) {
      return 'invalid';
    }

    const existing = registry[userId];

    if (existing && existing.updatedAt > at) {
      return 'stale';
    }

    registry[userId] = { blob, updatedAt: at };
    persist();

    return 'ok';
  };

  return { get, set };
};
