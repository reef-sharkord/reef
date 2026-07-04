// REEF companion plugin — server entry.
//
// Feature 1: GIF search proxy. The REEF client calls the `searchGifs` action;
// this plugin queries the admin-selected provider (Giphy or Klipy) *server-side*
// and returns a normalized list. Doing it here (not in the browser) means the
// provider API key never reaches clients, there are no CORS problems, and the
// rate limit is scoped to this server. The admin picks the provider and pastes
// their own key in plugin settings (Klipy keys are free at klipy.com); the
// feature is hidden from clients until a key is configured.
//
// Feature 2: the switchboard. Every REEF feature that can be governed by a
// server admin gets a boolean setting here, and the `getFeatures` action tells
// REEF clients which features this server allows. Enforced features (like the
// GIF proxy) actually stop working when off; client-side features (soundboard,
// saved messages) are policy signals that REEF clients honor by hiding the UI.
//
// More features (presence / custom status, bug reports) will hang off this same
// plugin, each behind its own on/off setting.

import { createPush } from './push.js';

const GIF_PER_PAGE = 24;
const GIF_TIMEOUT_MS = 8000;

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
        'Which service to search: "klipy" or "giphy". Both need your own (free) API key below.',
      type: 'string',
      defaultValue: 'klipy'
    },
    {
      key: 'klipyApiKey',
      name: 'Klipy API key',
      description:
        'Your Klipy app key (free at klipy.com/developers). Required for GIF search with the klipy provider.',
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
    },
    {
      key: 'pushMethod',
      name: 'Push method',
      description:
        'How to notify offline REEF mobile users about DMs and @mentions — your choice, nothing is ever forced. "off" = no push (in-app notifications still work). "ntfy" = publish to each user\'s private topic on the ntfy server below (easiest — users install the free ntfy app once). "webhook" = POST JSON {topic, title, body} to your own endpoint (Gotify, UnifiedPush bridge, ...). "fcm" = Firebase Cloud Messaging with your service-account JSON below (only works for REEF apps built with your Firebase project\'s google-services.json — official builds are not). See the README for setup guides.',
      type: 'string',
      defaultValue: 'off'
    },
    {
      key: 'firebaseServiceAccount',
      name: 'Firebase service account JSON',
      description:
        'For the "fcm" method: paste the entire service-account key JSON from your Firebase project (Project settings → Service accounts → Generate new private key). Kept server-side.',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'ntfyServerUrl',
      name: 'ntfy server URL',
      description:
        'For the "ntfy" method: the ntfy instance to publish through. The public https://ntfy.sh works out of the box; self-hosters point this at their own instance (recommended for privacy).',
      type: 'string',
      defaultValue: 'https://ntfy.sh'
    },
    {
      key: 'webhookUrl',
      name: 'Push webhook URL',
      description:
        'For the "webhook" method: your endpoint. The plugin POSTs JSON {topic, title, body} for every push.',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'pushAuthToken',
      name: 'Push auth token',
      description:
        'Optional Bearer token sent with every push publish — for ntfy instances or webhooks that require auth. Kept server-side.',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'pushIncludeText',
      name: 'Include message text in pushes',
      description:
        'Off (default): pushes say who wrote and where, but not what — the push relay (e.g. the public ntfy.sh) can read everything passing through it. Turn on if you self-host the relay or accept that trade-off.',
      type: 'boolean',
      defaultValue: false
    }
  ]);

  // --- push notifications (method chosen by the admin) ------------------------
  const push = createPush(ctx, settings);

  ctx.actions.register({
    name: 'getPushInfo',
    description:
      'Which push method this server uses, so clients know what to register (an ntfy/webhook topic vs. an FCM device token).',
    execute: async (invoker) => {
      push.touch(invoker && invoker.userId);

      return {
        ok: true,
        method: push.available() ? push.method() : 'off',
        ntfyServerUrl:
          push.method() === 'ntfy'
            ? String(settings.get('ntfyServerUrl'))
            : undefined
      };
    }
  });

  ctx.actions.register({
    name: 'registerPushTopic',
    description:
      "Register the calling user's private ntfy topic for push notifications.",
    execute: async (invoker, payload) => {
      if (!push.available()) {
        return { ok: false, reason: 'disabled' };
      }

      const ok = push.registerTopic(
        invoker && invoker.userId,
        payload && payload.topic
      );

      // With the ntfy method the client shows a subscribe link and needs the
      // same ntfy instance; with a webhook the admin's own infra delivers, so
      // there is nothing for the user to subscribe to.
      return {
        ok,
        method: push.method(),
        ntfyServerUrl:
          push.method() === 'ntfy'
            ? String(settings.get('ntfyServerUrl'))
            : undefined
      };
    }
  });

  ctx.actions.register({
    name: 'unregisterPushTopic',
    description: "Remove one of the calling user's ntfy topics.",
    execute: async (invoker, payload) => {
      const ok = push.unregisterTopic(
        invoker && invoker.userId,
        payload && payload.topic
      );

      return { ok };
    }
  });

  ctx.events.on('message:created', (payload) => {
    // fire-and-forget: pushes must never block message delivery
    void push.onMessageCreated(payload).catch((error) => {
      ctx.error?.('reef: push send failed', (error && error.message) || error);
    });
  });

  // Reports are only offered to clients when the admin turned them on AND a
  // relay key exists — otherwise submitting could never succeed.
  const reportsAvailable = () =>
    !!settings.get('reportsEnabled') && !!settings.get('mailRelayApiKey');

  // Same honesty rule for GIFs: enabled AND a key for the chosen provider.
  const gifsAvailable = () => {
    if (!settings.get('gifEnabled')) return false;

    return settings.get('gifProvider') === 'giphy'
      ? !!settings.get('giphyApiKey')
      : !!settings.get('klipyApiKey');
  };

  ctx.actions.register({
    name: 'getFeatures',
    description:
      'Which REEF features this server has enabled (the admin switchboard).',
    execute: async (invoker) => {
      // any action call proves this user's REEF app is alive (push suppression)
      push.touch(invoker && invoker.userId);

      return {
        ok: true,
        features: {
          gifs: gifsAvailable(),
          soundboard: !!settings.get('soundboardEnabled'),
          savedMessages: !!settings.get('savedMessagesEnabled'),
          reports: reportsAvailable(),
          presence: !!settings.get('presenceEnabled'),
          push: push.available()
        }
      };
    }
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
      push.touch(invoker && invoker.userId);

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
    execute: async (invoker) => {
      // REEF clients poll this every 60s — the main liveness signal that
      // suppresses redundant ntfy pushes while the app is alive.
      push.touch(invoker && invoker.userId);

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
      if (!gifsAvailable()) {
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
            : await searchKlipy(query, page, settings.get('klipyApiKey'));

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
