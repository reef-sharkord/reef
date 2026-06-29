// REEF Push — server entry.
//
// Listens for new messages and sends a Firebase Cloud Messaging (FCM v1) push to
// the recipients' registered devices, so the REEF mobile app is notified even
// when it's backgrounded or killed. Targets only DMs and @mentions (the
// high-signal cases) to avoid notifying everyone for every message.
//
// Fully self-contained: it reads DM participants directly from the server's
// SQLite DB (read-only) so it needs NO changes to the Sharkord server core. If a
// future Sharkord renames that table, DM lookup degrades to @mentions-only
// instead of breaking.

import { createSign } from 'node:crypto';
import { join } from 'node:path';
import { Database } from 'bun:sqlite';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MAX_DEVICES_PER_USER = 5;
const MAX_BODY_LEN = 180;

const base64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// --- FCM v1 auth (service-account JWT -> OAuth2 access token, cached) ----------
let cachedToken = null; // { accessToken, exp }

const getAccessToken = async (sa) => {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.exp - 60 > now) {
    return cachedToken.accessToken;
  }

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600
    })
  );
  const signingInput = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(sa.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`oauth token failed: ${res.status} ${JSON.stringify(data)}`);
  }

  cachedToken = {
    accessToken: data.access_token,
    exp: now + (data.expires_in || 3600)
  };

  return cachedToken.accessToken;
};

const sendFcm = async (projectId, accessToken, token, title, body, data) => {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: { priority: 'high' },
          data: data || {}
        }
      })
    }
  );

  let out = {};
  try {
    out = await res.json();
  } catch {
    out = {};
  }

  return { ok: res.ok, status: res.status, out };
};

// FCM reports these for tokens that no longer exist — prune them.
const isDeadToken = (status, out) => {
  if (status === 404) return true;
  const code = out && out.error && out.error.status;
  return code === 'NOT_FOUND' || code === 'UNREGISTERED';
};

// --- recipient resolution -----------------------------------------------------
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
      key: 'projectId',
      name: 'Firebase project ID',
      description: 'The "project_id" from your Firebase service-account JSON.',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'serviceAccountJson',
      name: 'Service account JSON',
      description:
        'Paste the entire Firebase service-account key JSON (secret). Firebase console -> Project settings -> Service accounts -> Generate new private key.',
      type: 'string',
      defaultValue: ''
    },
    {
      key: 'deviceTokens',
      name: 'Device tokens (managed)',
      description: 'Auto-managed by the app. Do not edit.',
      type: 'string',
      defaultValue: '{}'
    }
  ]);

  const dbPath = join(ctx.path, '..', '..', 'db.sqlite');

  let tokensByUser = {};
  try {
    tokensByUser = JSON.parse(settings.get('deviceTokens') || '{}') || {};
  } catch {
    tokensByUser = {};
  }

  const persistTokens = () => {
    try {
      settings.set('deviceTokens', JSON.stringify(tokensByUser));
    } catch (error) {
      ctx.error?.('reef-push: failed to persist tokens', error);
    }
  };

  ctx.actions.register({
    name: 'saveFcmToken',
    description: 'Register the calling device for push notifications.',
    execute: async (invoker, payload) => {
      const token =
        payload && typeof payload.token === 'string' ? payload.token : null;
      const userId = invoker && invoker.userId;

      if (!token || !userId) {
        return { ok: false };
      }

      const key = String(userId);
      const list = tokensByUser[key] || [];

      if (!list.includes(token)) {
        list.push(token);
        tokensByUser[key] = list.slice(-MAX_DEVICES_PER_USER);
        persistTokens();
      }

      return { ok: true };
    }
  });

  ctx.actions.register({
    name: 'removeFcmToken',
    description: 'Unregister the calling device from push notifications.',
    execute: async (invoker, payload) => {
      const token =
        payload && typeof payload.token === 'string' ? payload.token : null;
      const userId = invoker && invoker.userId;

      if (!token || !userId) {
        return { ok: false };
      }

      const key = String(userId);

      if (tokensByUser[key]) {
        tokensByUser[key] = tokensByUser[key].filter((t) => t !== token);
        persistTokens();
      }

      return { ok: true };
    }
  });

  const getServiceAccount = () => {
    try {
      const raw = settings.get('serviceAccountJson');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  ctx.events.on('message:created', async (msg) => {
    try {
      const sa = getServiceAccount();
      const projectId = settings.get('projectId');

      // Not configured yet — stay inert.
      if (!sa || !projectId) {
        return;
      }

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
        for (const token of tokensByUser[String(uid)] || []) {
          targets.push({ uid, token });
        }
      }

      if (targets.length === 0) {
        return;
      }

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

      const accessToken = await getAccessToken(sa);
      let pruned = false;

      for (const { uid, token } of targets) {
        const res = await sendFcm(projectId, accessToken, token, title, body, {
          channelId: String(msg.channelId)
        });

        if (!res.ok && isDeadToken(res.status, res.out)) {
          const key = String(uid);
          tokensByUser[key] = (tokensByUser[key] || []).filter(
            (t) => t !== token
          );
          pruned = true;
        } else if (!res.ok) {
          ctx.error?.(
            `reef-push: FCM send failed (${res.status})`,
            (res.out && res.out.error && res.out.error.message) || ''
          );
        }
      }

      if (pruned) {
        persistTokens();
      }
    } catch (error) {
      ctx.error?.('reef-push: push handler error', error?.message || error);
    }
  });

  ctx.ui.enable();
  ctx.log?.('reef-push loaded');
}

export async function onUnload(ctx) {
  ctx.log?.('reef-push unloaded');
}
