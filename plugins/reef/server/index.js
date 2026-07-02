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
// Feature 2: the switchboard. Every REEF feature that can be governed by a
// server admin gets a boolean setting here, and the `getFeatures` action tells
// REEF clients which features this server allows. Enforced features (like the
// GIF proxy) actually stop working when off; client-side features (soundboard,
// saved messages) are policy signals that REEF clients honor by hiding the UI.
//
// More features (presence / custom status, bug reports) will hang off this same
// plugin, each behind its own on/off setting.

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
    },
    {
      key: 'soundboardEnabled',
      name: 'Allow soundboard',
      description:
        'Let REEF clients show the in-voice soundboard on this server. Sounds travel inside the normal voice stream, so this is honored by REEF clients rather than enforced.',
      type: 'boolean',
      defaultValue: true
    },
    {
      key: 'savedMessagesEnabled',
      name: 'Allow saved messages',
      description:
        "Let REEF clients offer the save-message bookmark on this server's channels. Saves live on the user's own device.",
      type: 'boolean',
      defaultValue: true
    },
    {
      key: 'presenceEnabled',
      name: 'Allow custom status',
      description:
        'Let REEF clients set a short custom status text ("Playing X", "AFK", …) that other REEF clients on this server can see. Stored in memory only; cleared on server restart.',
      type: 'boolean',
      defaultValue: true
    },
    {
      key: 'reportsEnabled',
      name: 'Enable bug reports',
      description:
        'Let users send bug reports / feature requests from the REEF client. Reports are emailed via the mail relay below; the feature stays hidden for clients until a relay API key is set.',
      type: 'boolean',
      defaultValue: true
    },
    {
      key: 'reportEmail',
      name: 'Reports go to',
      description: 'Email address that receives the reports.',
      type: 'string',
      defaultValue: 'reefsharkordlobby@gmail.com'
    },
    {
      key: 'mailRelayUrl',
      name: 'Mail relay URL',
      description:
        'HTTP mail relay endpoint. The plugin POSTs JSON {from, to, subject, text} with "Authorization: Bearer <key>" — the Resend API (https://api.resend.com/emails) and most relays accept this shape.',
      type: 'string',
      defaultValue: 'https://api.resend.com/emails'
    },
    {
      key: 'mailFrom',
      name: 'Mail from address',
      description:
        'Sender address the relay is allowed to send as (e.g. "REEF Reports <reports@yourdomain.com>").',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'mailRelayApiKey',
      name: 'Mail relay API key',
      description: 'API key for the mail relay. Kept server-side.',
      type: 'string',
      defaultValue: ''
    }
  ]);

  // Reports are only offered to clients when the admin turned them on AND a
  // relay key exists — otherwise submitting could never succeed.
  const reportsAvailable = () =>
    !!settings.get('reportsEnabled') && !!settings.get('mailRelayApiKey');

  ctx.actions.register({
    name: 'getFeatures',
    description:
      'Which REEF features this server has enabled (the admin switchboard).',
    execute: async () => ({
      ok: true,
      features: {
        gifs: !!settings.get('gifEnabled'),
        soundboard: !!settings.get('soundboardEnabled'),
        savedMessages: !!settings.get('savedMessagesEnabled'),
        reports: reportsAvailable(),
        presence: !!settings.get('presenceEnabled')
      }
    })
  });

  // --- presence / custom status ---------------------------------------------
  // In-memory only: a status is ephemeral by nature, and losing it on a server
  // restart is fine. userId -> { text, updatedAt }
  const PRESENCE_TEXT_MAX = 80;
  const presences = new Map();

  ctx.actions.register({
    name: 'setPresence',
    description: 'Set (or clear, with empty text) your custom status text.',
    execute: async (invoker, payload) => {
      if (!settings.get('presenceEnabled')) {
        return { ok: false, reason: 'disabled' };
      }

      const userId = invoker && invoker.userId;

      if (!userId) {
        return { ok: false, reason: 'no-user' };
      }

      const text =
        payload && payload.text
          ? String(payload.text).trim().slice(0, PRESENCE_TEXT_MAX)
          : '';

      if (text) {
        presences.set(userId, { text, updatedAt: Date.now() });
      } else {
        presences.delete(userId);
      }

      return { ok: true };
    }
  });

  ctx.actions.register({
    name: 'getPresences',
    description: 'Get all custom status texts set on this server.',
    execute: async () => {
      if (!settings.get('presenceEnabled')) {
        return { ok: false, reason: 'disabled', presences: {} };
      }

      const result = {};

      for (const [userId, presence] of presences) {
        result[userId] = presence;
      }

      return { ok: true, presences: result };
    }
  });

  // --- bug reports / feature requests --------------------------------------
  const REPORT_COOLDOWN_MS = 60_000;
  const REPORT_TITLE_MAX = 100;
  const REPORT_DESCRIPTION_MAX = 2000;
  const lastReportAt = new Map(); // userId -> timestamp

  ctx.actions.register({
    name: 'submitReport',
    description:
      'Send a bug report or feature request to the server operator by email.',
    execute: async (invoker, payload) => {
      if (!reportsAvailable()) {
        return { ok: false, reason: 'disabled' };
      }

      const kind = payload && payload.kind === 'feature' ? 'feature' : 'bug';
      const title =
        payload && payload.title ? String(payload.title).trim() : '';
      const description =
        payload && payload.description
          ? String(payload.description).trim()
          : '';
      const clientInfo =
        payload && payload.clientInfo ? String(payload.clientInfo).trim() : '';

      if (!title || !description) {
        return { ok: false, reason: 'empty' };
      }

      const userId = invoker && invoker.userId;
      const last = lastReportAt.get(userId) || 0;

      if (Date.now() - last < REPORT_COOLDOWN_MS) {
        return { ok: false, reason: 'cooldown' };
      }

      let reporter = `user #${userId}`;

      try {
        const user = await ctx.data.getUser(userId);

        if (user && user.name) {
          reporter = `${user.name} (user #${userId})`;
        }
      } catch {
        // reporter stays as the bare id
      }

      const subject = `[REEF ${kind}] ${title.slice(0, REPORT_TITLE_MAX)}`;
      const text = [
        `Kind: ${kind}`,
        `From: ${reporter}`,
        `Sent: ${new Date().toISOString()}`,
        clientInfo ? `Client: ${clientInfo.slice(0, 300)}` : null,
        '',
        description.slice(0, REPORT_DESCRIPTION_MAX)
      ]
        .filter((line) => line !== null)
        .join('\n');

      try {
        const res = await fetch(String(settings.get('mailRelayUrl')), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.get('mailRelayApiKey')}`
          },
          body: JSON.stringify({
            from: String(settings.get('mailFrom') || ''),
            to: String(settings.get('reportEmail')),
            subject,
            text
          }),
          signal: AbortSignal.timeout(GIF_TIMEOUT_MS)
        });

        if (!res.ok) {
          throw new Error(`relay HTTP ${res.status}`);
        }

        lastReportAt.set(userId, Date.now());
        ctx.log?.(`reef: ${kind} report sent from ${reporter}`);

        return { ok: true };
      } catch (error) {
        ctx.error?.(
          'reef: report email failed',
          (error && error.message) || error
        );

        return { ok: false, reason: 'error' };
      }
    }
  });

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

  ctx.log?.('reef plugin loaded (gif proxy + feature switchboard)');
}

export async function onUnload(ctx) {
  ctx.log?.('reef plugin unloaded');
}
