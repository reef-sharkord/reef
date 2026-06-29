// REEF Push — server entry (UnifiedPush / ntfy transport).
//
// Listens for new messages and delivers a push to the recipients' registered
// UnifiedPush endpoints (served by ntfy — public ntfy.sh or a self-hosted
// instance), so the REEF mobile app is notified even when backgrounded or
// killed. Targets only DMs and @mentions to avoid notifying everyone.
//
// Fully self-contained: no Sharkord server changes. DM participants are read
// directly from the server's SQLite DB (read-only); if that schema ever changes
// it falls back to @mentions-only.
//
// The client uploads a UnifiedPush *endpoint URL* (from its distributor, e.g.
// the ntfy app). We POST the notification payload to that URL. To avoid being an
// open relay (SSRF), we only POST to https endpoints whose host is allow-listed
// in the `allowedEndpointHosts` setting (defaults to ntfy.sh; add your
// self-hosted ntfy host).

import { join } from 'node:path';
import { Database } from 'bun:sqlite';

const MAX_ENDPOINTS_PER_USER = 5;
const MAX_BODY_LEN = 180;

const parseAllowedHosts = (raw) =>
  String(raw || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

const isEndpointAllowed = (endpoint, allowedHosts) => {
  try {
    const url = new URL(endpoint);

    if (url.protocol !== 'https:') {
      return false;
    }

    return allowedHosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const sendPush = async (endpoint, payload) => {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return { ok: res.ok, status: res.status };
};

// UnifiedPush: 404/410 from the push service means the endpoint is gone.
const isDeadEndpoint = (status) => status === 404 || status === 410;

// Read DM participants straight from the server's SQLite DB (read-only). Best
// effort: any failure (path/schema change, lock) falls back to mentions-only.
const getDmParticipantIds = (dbPath, channelId) => {
  try {
    const db = new Database(dbPath, { readonly: true });

    try {
      db.run('PRAGMA busy_timeout = 3000');
      const row = db
        .query(
          'SELECT user_one_id AS a, user_two_id AS b FROM direct_messages WHERE channel_id = ?'
        )
        .get(channelId);

      return row ? [row.a, row.b] : [];
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
};

const parseMentionedUserIds = (content) => {
  const ids = new Set();
  const re = /data-user-id="(\d+)"/g;
  let match;

  while ((match = re.exec(content || ''))) {
    ids.add(Number(match[1]));
  }

  return ids;
};

export async function onLoad(ctx) {
  const settings = await ctx.settings.register([
    {
      key: 'allowedEndpointHosts',
      name: 'Allowed push hosts',
      description:
        'Comma-separated hostnames the server may send pushes to. Defaults to ntfy.sh; add your self-hosted ntfy host (e.g. "ntfy.sh,push.example.com").',
      type: 'string',
      defaultValue: 'ntfy.sh'
    },
    {
      key: 'deviceEndpoints',
      name: 'Device endpoints (managed)',
      description: 'Auto-managed by the app. Do not edit.',
      type: 'string',
      defaultValue: '{}'
    }
  ]);

  const dbPath = join(ctx.path, '..', '..', 'db.sqlite');

  let endpointsByUser = {};
  try {
    endpointsByUser = JSON.parse(settings.get('deviceEndpoints') || '{}') || {};
  } catch {
    endpointsByUser = {};
  }

  const persist = () => {
    try {
      settings.set('deviceEndpoints', JSON.stringify(endpointsByUser));
    } catch (error) {
      ctx.error?.('reef-push: failed to persist endpoints', error);
    }
  };

  ctx.actions.register({
    name: 'savePushEndpoint',
    description: 'Register the calling device for push (UnifiedPush endpoint).',
    execute: async (invoker, payload) => {
      const endpoint =
        payload && typeof payload.endpoint === 'string'
          ? payload.endpoint
          : null;
      const userId = invoker && invoker.userId;

      if (!endpoint || !userId) {
        return { ok: false };
      }

      const allowedHosts = parseAllowedHosts(settings.get('allowedEndpointHosts'));
      if (!isEndpointAllowed(endpoint, allowedHosts)) {
        ctx.error?.('reef-push: rejected endpoint (host not allow-listed)', endpoint);
        return { ok: false, reason: 'host_not_allowed' };
      }

      const key = String(userId);
      const list = endpointsByUser[key] || [];

      if (!list.includes(endpoint)) {
        list.push(endpoint);
        endpointsByUser[key] = list.slice(-MAX_ENDPOINTS_PER_USER);
        persist();
      }

      return { ok: true };
    }
  });

  ctx.actions.register({
    name: 'removePushEndpoint',
    description: 'Unregister the calling device from push.',
    execute: async (invoker, payload) => {
      const endpoint =
        payload && typeof payload.endpoint === 'string'
          ? payload.endpoint
          : null;
      const userId = invoker && invoker.userId;

      if (!endpoint || !userId) {
        return { ok: false };
      }

      const key = String(userId);

      if (endpointsByUser[key]) {
        endpointsByUser[key] = endpointsByUser[key].filter((e) => e !== endpoint);
        persist();
      }

      return { ok: true };
    }
  });

  ctx.events.on('message:created', async (msg) => {
    try {
      // Ignore plugin/system-authored messages.
      if (msg.pluginId) {
        return;
      }

      const authorId = msg.userId;
      const recipients = parseMentionedUserIds(msg.content);

      try {
        const channel = await ctx.data.getChannel(msg.channelId);

        if (channel && channel.isDm) {
          for (const id of getDmParticipantIds(dbPath, msg.channelId)) {
            recipients.add(id);
          }
        }
      } catch {
        // ignore — mentions still apply
      }

      if (authorId) {
        recipients.delete(authorId);
      }

      if (recipients.size === 0) {
        return;
      }

      const targets = [];
      for (const uid of recipients) {
        for (const endpoint of endpointsByUser[String(uid)] || []) {
          targets.push({ uid, endpoint });
        }
      }

      if (targets.length === 0) {
        return;
      }

      const allowedHosts = parseAllowedHosts(settings.get('allowedEndpointHosts'));

      let title = 'New message';
      try {
        const author = authorId ? await ctx.data.getUser(authorId) : null;
        if (author && author.name) {
          title = author.name;
        }
      } catch {
        // keep default title
      }

      const body =
        (msg.textContent || '').trim().slice(0, MAX_BODY_LEN) ||
        'Sent you a message';

      let pruned = false;

      for (const { uid, endpoint } of targets) {
        if (!isEndpointAllowed(endpoint, allowedHosts)) {
          continue; // allow-list may have changed since registration
        }

        try {
          const res = await sendPush(endpoint, {
            title,
            body,
            channelId: String(msg.channelId)
          });

          if (!res.ok && isDeadEndpoint(res.status)) {
            const key = String(uid);
            endpointsByUser[key] = (endpointsByUser[key] || []).filter(
              (e) => e !== endpoint
            );
            pruned = true;
          } else if (!res.ok) {
            ctx.error?.(`reef-push: push failed (${res.status})`);
          }
        } catch (error) {
          ctx.error?.('reef-push: push request error', error?.message || error);
        }
      }

      if (pruned) {
        persist();
      }
    } catch (error) {
      ctx.error?.('reef-push: handler error', error?.message || error);
    }
  });

  ctx.ui.enable();
  ctx.log?.('reef-push (ntfy/UnifiedPush) loaded');
}

export async function onUnload(ctx) {
  ctx.log?.('reef-push unloaded');
}
