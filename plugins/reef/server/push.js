// REEF push notifications via ntfy (https://ntfy.sh) — deliberately NO
// Firebase / Google services.
//
// How it works: each REEF mobile app generates a private random ntfy topic and
// registers it here via the `registerPushTopic` action. When a message that
// concerns an *offline* user lands (a DM, or a channel message that @mentions
// them), the plugin POSTs a notification to their topic on the configured ntfy
// server; the ntfy Android app (subscribed to that topic) displays it. Online
// users are skipped — their running REEF app already shows a local
// notification, so they'd get doubles.
//
// ntfy is open source and self-hostable: the default server is the public
// ntfy.sh (no account needed; topic names are the only secret), and operators
// can point the plugin at their own instance + access token instead.
//
// Topics persist in push-topics.json next to the plugin. Online-ness is
// tracked from the SDK's user:joined / user:left events (users connected from
// before the plugin loaded are treated as offline until their next session —
// worst case they briefly get both a push and a local notification).

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
    if (!userId || typeof topic !== 'string' || !TOPIC_RE.test(topic)) {
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
  const available = () => !!settings.get('pushEnabled');

  const ntfyBase = () =>
    String(settings.get('ntfyServerUrl') || 'https://ntfy.sh').replace(
      /\/+$/,
      ''
    );

  const sendToUser = async (userId, title, body) => {
    const topics = registry[userId] || [];

    for (const entry of topics) {
      try {
        const headers = {
          Title: title.slice(0, 200),
          Priority: 'default',
          Tags: 'speech_balloon'
        };
        const token = String(settings.get('ntfyToken') || '');

        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(`${ntfyBase()}/${entry.topic}`, {
          method: 'POST',
          headers,
          body,
          signal: AbortSignal.timeout(NTFY_TIMEOUT_MS)
        });

        if (!res.ok) {
          ctx.error(`[push] ntfy publish failed: HTTP ${res.status}`);
        }
      } catch (error) {
        ctx.error('[push] ntfy publish error', error);
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

    const body =
      String(payload.textContent || '')
        .trim()
        .slice(0, BODY_MAX) || 'Sent you a message';

    let channel = null;

    try {
      channel = await ctx.data.getChannel(payload.channelId);
    } catch {
      return;
    }

    // the sender's app is clearly alive
    touch(payload.userId);

    if (channel && channel.isDm) {
      for (const userId of dmRecipients(channel.name, payload.userId)) {
        if (!isLikelyOnline(userId)) {
          await sendToUser(userId, `${senderName} (DM)`, body);
        }
      }

      return;
    }

    const channelLabel =
      channel && channel.name ? `#${channel.name}` : 'a channel';

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
    registerTopic,
    unregisterTopic,
    onMessageCreated,
    touch
  };
};
