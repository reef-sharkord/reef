// REEF companion plugin — server entry.
//
// Feature 1: GIF search proxy. The REEF client calls the `searchGifs` action;
// this plugin queries the admin-selected provider (Giphy or Klipy) *server-side*
// and returns a normalized list. Doing it here (not in the browser) means the
// provider API key never reaches clients, there are no CORS problems, and the
// rate limit is scoped to this server. The admin picks the provider and pastes
// their own key in plugin settings; if the Klipy key is left blank a shared
// REEF fallback key is used so it still works out of the box.
//
// More features (presence / custom status) will hang off this same plugin, each
// behind its own on/off setting.

const GIF_PER_PAGE = 24;
const GIF_TIMEOUT_MS = 8000;

// Shared REEF fallback (Klipy) — used only when the admin hasn't set their own.
// Prefer setting your own key so the quota is yours.
const DEFAULT_KLIPY_KEY = 'REDACTED';

const fetchJson = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(GIF_TIMEOUT_MS) });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.json();
};

// --- Klipy -------------------------------------------------------------------
const pickKlipyUrl = (sizes, order) => {
  for (const size of order) {
    const variant = sizes && sizes[size] && sizes[size].gif;

    if (variant && variant.url) {
      return {
        url: variant.url,
        width: variant.width || 0,
        height: variant.height || 0
      };
    }
  }

  return null;
};

const normalizeKlipy = (item) => {
  const sizes = item && (item.file || item.files);

  if (!sizes) {
    return null;
  }

  const full = pickKlipyUrl(sizes, ['md', 'sm', 'hd', 'xs']);
  const preview = pickKlipyUrl(sizes, ['xs', 'sm', 'md']) || full;

  if (!full) {
    return null;
  }

  return {
    id: String(item.slug || item.id || full.url),
    gifUrl: full.url,
    previewUrl: preview.url,
    width: full.width,
    height: full.height
  };
};

const searchKlipy = async (query, page, key) => {
  const base = `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/`;
  const url = query
    ? `${base}search?q=${encodeURIComponent(query)}&per_page=${GIF_PER_PAGE}&page=${page}`
    : `${base}trending?per_page=${GIF_PER_PAGE}&page=${page}`;

  const json = await fetchJson(url);
  const items = (json && json.data && json.data.data) || [];

  return items.map(normalizeKlipy).filter(Boolean);
};

// --- Giphy -------------------------------------------------------------------
const normalizeGiphy = (item) => {
  const images = item && item.images;

  if (!images) {
    return null;
  }

  const full = images.downsized_medium || images.original;
  const preview = images.fixed_width || images.preview_gif || full;

  if (!full || !full.url) {
    return null;
  }

  return {
    id: String(item.id || full.url),
    gifUrl: full.url,
    previewUrl: (preview && preview.url) || full.url,
    width: Number(full.width) || 0,
    height: Number(full.height) || 0
  };
};

const searchGiphy = async (query, page, key) => {
  if (!key) {
    throw new Error('no Giphy API key configured');
  }

  const limit = GIF_PER_PAGE;
  const offset = (page - 1) * limit;
  const common = `api_key=${encodeURIComponent(key)}&limit=${limit}&offset=${offset}&rating=pg-13`;
  const url = query
    ? `https://api.giphy.com/v1/gifs/search?${common}&q=${encodeURIComponent(query)}`
    : `https://api.giphy.com/v1/gifs/trending?${common}`;

  const json = await fetchJson(url);
  const items = (json && json.data) || [];

  return items.map(normalizeGiphy).filter(Boolean);
};

export async function onLoad(ctx) {
  const settings = await ctx.settings.register([
    {
      key: 'gifEnabled',
      name: 'Enable GIF search',
      description:
        'Let REEF clients search GIFs through this server (keeps the API key server-side).',
      type: 'boolean',
      defaultValue: true
    },
    {
      key: 'gifProvider',
      name: 'GIF provider',
      description:
        'Which service to search: "klipy" or "giphy". Klipy works with the built-in fallback key; Giphy requires your own key below.',
      type: 'string',
      defaultValue: 'klipy'
    },
    {
      key: 'klipyApiKey',
      name: 'Klipy API key',
      description:
        'Your Klipy app key (klipy.com/developers). Leave blank to use the shared REEF fallback key.',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'giphyApiKey',
      name: 'Giphy API key',
      description:
        'Your Giphy API key (developers.giphy.com). Required if the provider is set to "giphy".',
      type: 'string',
      defaultValue: ''
    }
  ]);

  ctx.actions.register({
    name: 'searchGifs',
    description: 'Search GIFs via the server-configured provider.',
    execute: async (_invoker, payload) => {
      if (!settings.get('gifEnabled')) {
        return { ok: false, reason: 'disabled', results: [] };
      }

      const query = payload && payload.query ? String(payload.query).trim() : '';
      const page =
        payload && Number(payload.page) > 0 ? Number(payload.page) : 1;
      const provider = String(settings.get('gifProvider') || 'klipy')
        .trim()
        .toLowerCase();

      try {
        const results =
          provider === 'giphy'
            ? await searchGiphy(query, page, settings.get('giphyApiKey'))
            : await searchKlipy(
                query,
                page,
                settings.get('klipyApiKey') || DEFAULT_KLIPY_KEY
              );

        return { ok: true, provider, results };
      } catch (error) {
        ctx.error?.(
          'reef: GIF search failed',
          (error && error.message) || error
        );

        return { ok: false, reason: 'error', results: [] };
      }
    }
  });

  ctx.log?.('reef plugin loaded (gif proxy)');
}

export async function onUnload(ctx) {
  ctx.log?.('reef plugin unloaded');
}
