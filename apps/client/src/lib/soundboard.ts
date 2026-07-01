/**
 * Soundboard — mixes short sound clips into your outgoing mic so others in voice
 * hear them (and you monitor them locally). Client-only, REEF-exclusive.
 *
 * The mic pipeline routes its final track through a Web Audio graph here (a
 * passthrough mic source + a shared destination); clips are decoded and played
 * into that same destination. Everything is fail-safe: if the Web Audio routing
 * can't be set up, the caller keeps the untouched mic track, so the mic can
 * never break because of the soundboard. Clips are user-added and persisted in
 * IndexedDB.
 */

// --- mic mixing --------------------------------------------------------------
let mixCtx: AudioContext | null = null;
let mixDest: MediaStreamAudioDestinationNode | null = null;
let micSource: MediaStreamAudioSourceNode | null = null;

const ensureContext = (): boolean => {
  if (!mixCtx) {
    mixCtx = new AudioContext();
    mixDest = mixCtx.createMediaStreamDestination();
  }

  if (mixCtx.state === 'suspended') {
    void mixCtx.resume();
  }

  return !!mixDest;
};

/**
 * Route the final mic stream through the soundboard mixer. Returns the mixed
 * output stream to transmit, or null if setup failed (caller keeps its stream).
 */
export const routeThroughSoundboard = (
  input: MediaStream
): MediaStream | null => {
  try {
    if (!ensureContext() || !mixCtx || !mixDest) {
      return null;
    }

    micSource?.disconnect();
    micSource = mixCtx.createMediaStreamSource(input);
    micSource.connect(mixDest);

    return mixDest.stream;
  } catch {
    return null;
  }
};

/** Detach the mic from the mixer (on mic stop). The context lives on for reuse. */
export const detachSoundboardMic = (): void => {
  try {
    micSource?.disconnect();
  } catch {
    // ignore
  }

  micSource = null;
};

/** True when the mixer is live (i.e. the mic is currently routed through it). */
export const isSoundboardLive = (): boolean => !!mixDest && !!micSource;

const bufferCache = new Map<string, AudioBuffer>();

/** Play a clip into the outgoing mix (and locally when monitor is true). */
export const playSoundboardClip = async (
  id: string,
  blob: Blob,
  monitor = true
): Promise<void> => {
  if (!mixCtx || !mixDest) {
    return; // not in voice / mic not routed — nothing to mix into
  }

  let buffer = bufferCache.get(id);

  if (!buffer) {
    const bytes = await blob.arrayBuffer();
    buffer = await mixCtx.decodeAudioData(bytes);
    bufferCache.set(id, buffer);
  }

  const source = mixCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(mixDest);

  if (monitor) {
    source.connect(mixCtx.destination);
  }

  source.start();
};

// --- clip storage (IndexedDB) ------------------------------------------------
export type SoundClip = { id: string; name: string; blob: Blob };

const DB_NAME = 'reef-soundboard';
const STORE = 'clips';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const tx = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T> => {
  const db = await openDb();

  return new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
};

export const getSounds = async (): Promise<SoundClip[]> => {
  try {
    const all = await tx<SoundClip[]>('readonly', (s) => s.getAll());

    return Array.isArray(all) ? all : [];
  } catch {
    return [];
  }
};

export const addSound = async (file: File): Promise<SoundClip> => {
  const clip: SoundClip = {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: file.name.replace(/\.[^.]+$/, ''),
    blob: file
  };

  await tx('readwrite', (s) => s.put(clip));

  return clip;
};

export const removeSound = async (id: string): Promise<void> => {
  await tx('readwrite', (s) => s.delete(id));
  bufferCache.delete(id);
};
