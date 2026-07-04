// REEF push notifications — never *requires* Firebase/Google services; the
// server admin picks the delivery method.
//
// How it works: each REEF mobile app registers a per-device handle here via
// the `registerPushTopic` action — a private random topic for ntfy/webhook,
// or the device's FCM registration token for fcm. When a message that
// concerns an *offline* user lands (a DM, or a channel message that @mentions
// them), the plugin delivers a notification via the admin-chosen method (the
// `pushMethod` setting):
//   - 'ntfy'    POST to `<ntfyServerUrl>/<topic>` — the ntfy Android app
//               (subscribed to the topic) displays it. ntfy is open source
//               and self-hostable; the public ntfy.sh works with no account.
//   - 'webhook' POST JSON { topic, title, body } to `webhookUrl` — a generic
//               bridge for self-hosters (Gotify, a UnifiedPush gateway, ...).
//   - 'fcm'     Firebase Cloud Messaging HTTP v1, authenticated with the
//               admin's service-account JSON (no firebase SDK dependency —
//               the plugin mints its own OAuth tokens). Only works for REEF
//               apps built with the SAME Firebase project's
//               google-services.json; official REEF builds ship without one.
//   - 'off'     (default) no push; local notifications from the live app
//               still work.
// Online users are skipped — their running REEF app already shows a local
// notification, so they'd get doubles.
//
// Privacy: message TEXT is only included when the admin opts in
// (`pushIncludeText`) — by default pushes say who/where but not what, because
// the push relay (e.g. the public ntfy.sh) can read what passes through it.
//
// Topics persist in push-topics.json next to the plugin.

import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TOPICS_FILE = 'push-topics.json';
const MAX_TOPICS_PER_USER = 5;
const BODY_MAX = 140;
const NTFY_TIMEOUT_MS = 8000;

const MENTION_SPAN_RE = /<span[^>]*data-type="mention"[^>]*>/g;
const MENTION_USER_ID_RE = /data-user-id="(\d+)"/;
const DM_NAME_RE = /^DM - (\d+):(\d+)$/;
const TOPIC_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export const createPush = (ctx, settings) => {
  const topicsPath = join(ctx.path, TOPICS_FILE);

  // ---- per-user topic registry -------------------------------------------
  // { [userId]: [{ topic, updatedAt }] }
  let registry = {};

  try {
    registry = JSON.parse(readFileSync(topicsPath, 'utf8'));
  } catch {
    registry = {};
  }

  const persist = () => {
    try {
      writeFileSync(topicsPath, JSON.stringify(registry));
    } catch (error) {
      ctx.error('[push] failed to persist topics', error);
    }
  };

  const registerTopic = (userId, topic) => {
    // ntfy/webhook handles are our own random topics; FCM registration
    // tokens are longer and contain ':' — validate per method.
    const valid =
      typeof topic === 'string' &&
      (method() === 'fcm'
        ? topic.length > 0 && topic.length <= 4096 && !/\s/.test(topic)
        : TOPIC_RE.test(topic));

    if (!userId || !valid) {
      return false;
    }

    const list = (registry[userId] || []).filter((t) => t.topic !== topic);

    list.push({ topic, updatedAt: Date.now() });
    registry[userId] = list.slice(-MAX_TOPICS_PER_USER);
    persist();

    return true;
  };

  const unregisterTopic = (userId, topic) => {
    if (!userId || !registry[userId]) {
      return false;
    }

    registry[userId] = registry[userId].filter((t) => t.topic !== topic);

    if (registry[userId].length === 0) {
      delete registry[userId];
    }

    persist();

    return true;
  };

  // ---- liveness tracking ------------------------------------------------------
  // Users with a live REEF app get local notifications from their own socket;
  // pushing to them too would double-notify. The server core never emits a
  // "user left" event to plugins, so presence can't be tracked from join/leave
  // — instead we exploit the fact that running REEF clients invoke reef
  // actions continuously (the presence poll fires every 60s): any action
  // invocation marks the user alive for ONLINE_TTL_MS, and killed apps age
  // out. index.js calls touch() from its action handlers.
  const ONLINE_TTL_MS = 3 * 60 * 1000;
  const lastSeen = new Map(); // userId -> timestamp

  const touch = (userId) => {
    if (userId) {
      lastSeen.set(userId, Date.now());
    }
  };

  const isLikelyOnline = (userId) =>
    Date.now() - (lastSeen.get(userId) || 0) < ONLINE_TTL_MS;

  // ---- sending ---------------------------------------------------------------
  const method = () => {
    const value = String(settings.get('pushMethod') || 'off')
      .trim()
      .toLowerCase();

    return value === 'ntfy' || value === 'webhook' || value === 'fcm'
      ? value
      : 'off';
  };

  // ---- Firebase Cloud Messaging (only when the admin chose it) --------------
  const getServiceAccount = () => {
    try {
      const raw = String(settings.get('firebaseServiceAccount') || '');

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);

      return parsed.client_email && parsed.private_key && parsed.project_id
        ? parsed
        : null;
    } catch {
      return null;
    }
  };

  let cachedAccessToken = null; // { token, expiresAt }

  const getFcmAccessToken = async () => {
    if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60000) {
      return cachedAccessToken.token;
    }

    const account = getServiceAccount();

    if (!account) {
      throw new Error('no Firebase service account configured');
    }

    const base64url = (input) => Buffer.from(input).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
      })
    );
    const signer = createSign('RSA-SHA256');

    signer.update(`${header}.${claims}`);

    const signature = signer.sign(account.private_key, 'base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`
      }),
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`FCM token exchange failed: HTTP ${res.status}`);
    }

    const json = await res.json();

    cachedAccessToken = {
      token: json.access_token,
      expiresAt: Date.now() + (json.expires_in || 3600) * 1000
    };

    return cachedAccessToken.token;
  };

  // Devices FCM reports as gone get pruned so we stop paying for dead sends.
  const dropDeadToken = (token) => {
    for (const userId of Object.keys(registry)) {
      registry[userId] = registry[userId].filter((t) => t.topic !== token);

      if (registry[userId].length === 0) {
        delete registry[userId];
      }
    }

    persist();
  };

  const available = () =>
    method() === 'ntfy' ||
    (method() === 'webhook' && !!settings.get('webhookUrl')) ||
    (method() === 'fcm' && !!getServiceAccount());

  const ntfyBase = () =>
    String(settings.get('ntfyServerUrl') || 'https://ntfy.sh').replace(
      /\/+$/,
      ''
    );

  const authHeader = () => {
    const token = String(settings.get('pushAuthToken') || '');

    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const publish = async (topic, title, body) => {
    if (method() === 'webhook') {
      return fetch(String(settings.get('webhookUrl')), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ topic, title, body }),
        signal: AbortSignal.timeout(NTFY_TIMEOUT_MS)
      });
    }

    if (method() === 'fcm') {
      const account = getServiceAccount();
      const accessToken = await getFcmAccessToken();

      return fetch(
        `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            message: { token: topic, notification: { title, body } }
          }),
          signal: AbortSignal.timeout(NTFY_TIMEOUT_MS)
        }
      );
    }

    return fetch(`${ntfyBase()}/${topic}`, {
      method: 'POST',
      headers: {
        Title: title.slice(0, 200),
        Priority: 'default',
        Tags: 'speech_balloon',
        ...authHeader()
      },
      body,
      signal: AbortSignal.timeout(NTFY_TIMEOUT_MS)
    });
  };

  const sendToUser = async (userId, title, body) => {
    const topics = registry[userId] || [];

    for (const entry of topics) {
      try {
        const res = await publish(entry.topic, title, body);

        if (res.ok) {
          continue;
        }

        // FCM tells us when a device token is dead — prune it.
        if (method() === 'fcm' && (res.status === 404 || res.status === 410)) {
          dropDeadToken(entry.topic);
        } else if (method() === 'fcm') {
          const text = await res.text();

          if (text.includes('UNREGISTERED')) {
            dropDeadToken(entry.topic);
          } else {
            ctx.error(`[push] fcm publish failed: HTTP ${res.status}`);
          }
        } else {
          ctx.error(`[push] ${method()} publish failed: HTTP ${res.status}`);
        }
      } catch (error) {
        ctx.error(`[push] ${method()} publish error`, error);
      }
    }
  };

  // ---- message routing --------------------------------------------------------
  // DM channels are named "DM - <a>:<b>" by the server (the participant pair);
  // that name is the only participant handle exposed to plugins today.
  const dmRecipients = (channelName, senderId) => {
    const match = DM_NAME_RE.exec(channelName || '');

    if (!match) {
      return [];
    }

    return [Number(match[1]), Number(match[2])].filter(
      (id) => Number.isFinite(id) && id !== senderId
    );
  };

  const mentionedUserIds = (content) => {
    const ids = new Set();

    for (const span of String(content || '').match(MENTION_SPAN_RE) || []) {
      const match = MENTION_USER_ID_RE.exec(span);

      if (match) {
        ids.add(Number(match[1]));
      }
    }

    return ids;
  };

  const onMessageCreated = async (payload) => {
    if (!available() || payload.pluginId || !payload.userId) {
      return;
    }

    let senderName = `User #${payload.userId}`;

    try {
      const sender = await ctx.data.getUser(payload.userId);

      if (sender && sender.name) {
        senderName = sender.name;
      }
    } catch {
      // keep the fallback name
    }

    // Message text is opt-in: whatever relay carries the push (e.g. the
    // public ntfy.sh) can read it, so default to who/where without the what.
    const includeText = !!settings.get('pushIncludeText');
    const text = String(payload.textContent || '')
      .trim()
      .slice(0, BODY_MAX);

    let channel = null;

    try {
      channel = await ctx.data.getChannel(payload.channelId);
    } catch {
      return;
    }

    // the sender's app is clearly alive
    touch(payload.userId);

    if (channel && channel.isDm) {
      const body = includeText && text ? text : 'New direct message';

      for (const userId of dmRecipients(channel.name, payload.userId)) {
        if (!isLikelyOnline(userId)) {
          await sendToUser(userId, `${senderName} (DM)`, body);
        }
      }

      return;
    }

    const channelLabel =
      channel && channel.name ? `#${channel.name}` : 'a channel';
    const body = includeText && text ? text : 'You were mentioned';

    for (const userId of mentionedUserIds(payload.content)) {
      if (userId !== payload.userId && !isLikelyOnline(userId)) {
        await sendToUser(
          userId,
          `${senderName} mentioned you in ${channelLabel}`,
          body
        );
      }
    }
  };

  return {
    available,
    method,
    registerTopic,
    unregisterTopic,
    onMessageCreated,
    touch
  };
};
