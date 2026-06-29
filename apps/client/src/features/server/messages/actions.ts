import {
  browserNotificationsForDmsSelector,
  browserNotificationsForMentionsSelector,
  browserNotificationsForRepliesSelector,
  browserNotificationsSelector,
  threadSidebarDataSelector
} from '@/features/app/selectors';
import { getActiveStore, store } from '@/features/store';
import { getDesktopApi } from '@/helpers/desktop';
import { getFileUrl, getFileUrlForHost } from '@/helpers/get-file-url';
import { getHostForStore, setActiveHost } from '@/lib/connections';
import { isDndActive } from '@/lib/dnd';
import { isChannelMuted, isServerMuted } from '@/lib/notification-prefs';
import {
  getPlainTextFromHtml,
  hasMention,
  TYPING_MS,
  type TJoinedMessage
} from '@sharkord/shared';
import { markChannelAsRead } from '../actions';
import {
  channelByIdSelector,
  isChannelTextVisibleByIdSelector
} from '../channels/selectors';
import { pluginMetadataByIdSelector } from '../plugins/selectors';
import { serverSliceActions } from '../slice';
import { playSound } from '../sounds/actions';
import { SoundType } from '../types';
import { ownUserIdSelector, userByIdSelector } from '../users/selectors';
import { threadMessagesMapSelector } from './selectors';

const sendBrowserNotification = (
  message: TJoinedMessage,
  channelId: number,
  isDm = false
) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const state = store.getState();

  const user = userByIdSelector(state, message.userId);
  const plugin = pluginMetadataByIdSelector(state, message.pluginId);
  const channel = channelByIdSelector(state, channelId);
  const isPluginMessage = !!message.pluginId;

  if (!user || !channel) {
    return;
  }

  const authorName = isPluginMessage && plugin ? plugin.name : user.name;
  const textContent = getPlainTextFromHtml(message.content ?? '');

  const title = isDm
    ? `${authorName} (DM)`
    : `${authorName} in #${channel?.name ?? 'unknown'}`;

  const body = textContent ? textContent : 'Sent an attachment';
  // Resolve the author avatar against the server this message belongs to (the
  // bound store's host), not the active one — so notifications from a
  // backgrounded server show the right avatar. (UNCORD_PLAN.md §3.5)
  const boundHost = getHostForStore(getActiveStore());
  const icon = user?.avatar
    ? boundHost
      ? getFileUrlForHost(boundHost, user.avatar)
      : getFileUrl(user.avatar)
    : undefined;

  const notification = new Notification(title, { body, icon });

  // Click focuses the app (desktop shell) and jumps to the originating server.
  notification.onclick = () => {
    void getDesktopApi()?.focusWindow();
    window.focus();

    if (boundHost) {
      setActiveHost(boundHost);
    }
  };
};

const typingTimeouts: { [key: string]: NodeJS.Timeout } = {};

const getTypingKey = (channelId: number, userId: number) =>
  `${channelId}-${userId}`;

export const addMessages = (
  channelId: number,
  messages: TJoinedMessage[],
  opts: { prepend?: boolean } = {},
  isSubscriptionMessage = false,
  // Whether the bound server is the one the user is actively viewing. For a
  // backgrounded server in the multi-server rail this is false, so its incoming
  // messages notify (and don't auto-mark-read) even though that server's own
  // store still has a "selected channel". (UNCORD_PLAN.md §3.5) Defaults to true
  // to preserve single-server behaviour for non-subscription callers.
  isActiveServer = true
) => {
  const rootMessages = messages.filter((m) => !m.parentMessageId);
  const threadReplies = messages.filter((m) => !!m.parentMessageId);

  if (rootMessages.length > 0) {
    store.dispatch(
      serverSliceActions.addMessages({
        channelId,
        messages: rootMessages,
        opts
      })
    );
  }

  const repliesByParent = new Map<number, TJoinedMessage[]>();

  for (const reply of threadReplies) {
    const parentId = reply.parentMessageId!;

    if (!repliesByParent.has(parentId)) {
      repliesByParent.set(parentId, []);
    }

    repliesByParent.get(parentId)!.push(reply);
  }

  for (const [parentMessageId, replies] of repliesByParent) {
    store.dispatch(
      serverSliceActions.addThreadMessages({
        parentMessageId,
        messages: replies,
        opts
      })
    );
  }

  rootMessages.forEach((message) => {
    if (message.userId) {
      removeTypingUser(channelId, message.userId);
    }
  });

  threadReplies.forEach((message) => {
    if (message.parentMessageId && message.userId) {
      removeThreadTypingUser(message.parentMessageId, message.userId);
    }
  });

  if (isSubscriptionMessage && messages.length > 0) {
    const state = store.getState();
    const ownUserId = ownUserIdSelector(state);
    const hasBrowserNotificationsEnabled = browserNotificationsSelector(state);
    const notificationsForMentionsOnly =
      browserNotificationsForMentionsSelector(state);
    const targetMessage = messages[0];
    const isFromOwnUser =
      targetMessage.userId && ownUserId === targetMessage.userId;

    const isChannelTextVisible = isChannelTextVisibleByIdSelector(
      state,
      channelId
    );

    const isWindowHidden = document?.hidden;

    // A message is only truly "in front of the user" when it lands on the server
    // they're actively viewing, in a visible channel, with the window focused.
    // A backgrounded server is never in the foreground, so it always notifies.
    const isChannelInForeground =
      isActiveServer && isChannelTextVisible && !isWindowHidden;

    // Suppress the ping sound + notification (the unread badge still accrues)
    // when this server is muted, this channel is muted, or Do-Not-Disturb /
    // quiet hours are active. The bound store maps to its host.
    const boundHost = getHostForStore(getActiveStore());
    const muted =
      (boundHost &&
        (isServerMuted(boundHost) || isChannelMuted(boundHost, channelId))) ||
      isDndActive();

    if (!isFromOwnUser && !muted) {
      const isThreadReply = !!targetMessage.parentMessageId;

      if (isThreadReply) {
        const { isOpen, parentMessageId } = threadSidebarDataSelector(state);

        // only play sound if the user has this thread open
        if (isOpen && parentMessageId === targetMessage.parentMessageId) {
          playSound(SoundType.MESSAGE_RECEIVED);
        }
      } else {
        playSound(SoundType.MESSAGE_RECEIVED);
      }

      // only send browser notifications if the user is not currently viewing
      // this channel on the foreground server
      if (!isChannelInForeground) {
        const channel = channelByIdSelector(state, channelId);
        const isDmChannel = !!channel?.isDm;
        const hasDmNotificationsEnabled =
          browserNotificationsForDmsSelector(state);
        const hasRepliesNotificationsEnabled =
          browserNotificationsForRepliesSelector(state);

        if (isDmChannel && hasDmNotificationsEnabled) {
          sendBrowserNotification(targetMessage, channelId, true);
        } else if (notificationsForMentionsOnly) {
          const isMentioned = hasMention(
            targetMessage.content ?? null,
            ownUserId
          );

          if (isMentioned) {
            sendBrowserNotification(targetMessage, channelId);
          }
        } else if (hasBrowserNotificationsEnabled) {
          sendBrowserNotification(targetMessage, channelId);
        } else if (hasRepliesNotificationsEnabled) {
          const isReplyToOwnMessage =
            !!targetMessage.replyToMessageId &&
            targetMessage.replyTo?.userId === ownUserId;

          if (isReplyToOwnMessage) {
            sendBrowserNotification(targetMessage, channelId);
          }
        }
      }
    }

    if (
      isActiveServer &&
      isChannelTextVisible &&
      !isFromOwnUser &&
      rootMessages.length > 0
    ) {
      markChannelAsRead(channelId, true);
    }
  }
};

export const updateMessage = (channelId: number, message: TJoinedMessage) => {
  if (message.parentMessageId) {
    store.dispatch(
      serverSliceActions.updateThreadMessage({
        parentMessageId: message.parentMessageId,
        message
      })
    );
  } else {
    store.dispatch(serverSliceActions.updateMessage({ channelId, message }));
  }
};

export const deleteMessage = (channelId: number, messageId: number) => {
  // delete from both maps, the message could be a thread reply or root
  store.dispatch(serverSliceActions.deleteMessage({ channelId, messageId }));

  const state = store.getState();
  const threadMessagesMap = threadMessagesMapSelector(state);

  for (const parentId in threadMessagesMap) {
    const threadMessages = threadMessagesMap[parentId];

    if (threadMessages?.some((m) => m.id === messageId)) {
      store.dispatch(
        serverSliceActions.deleteThreadMessage({
          parentMessageId: Number(parentId),
          messageId
        })
      );

      break;
    }
  }
};

export const addThreadMessages = (
  parentMessageId: number,
  messages: TJoinedMessage[],
  opts: { prepend?: boolean } = {}
) => {
  store.dispatch(
    serverSliceActions.addThreadMessages({
      parentMessageId,
      messages,
      opts
    })
  );
};

export const clearThreadMessages = (parentMessageId: number) => {
  store.dispatch(serverSliceActions.clearThreadMessages(parentMessageId));
};

export const addTypingUser = (
  channelId: number,
  userId: number,
  parentMessageId?: number
) => {
  if (parentMessageId) {
    store.dispatch(
      serverSliceActions.addThreadTypingUser({ parentMessageId, userId })
    );

    const timeoutKey = `thread-${parentMessageId}-${userId}`;

    if (typingTimeouts[timeoutKey]) {
      clearTimeout(typingTimeouts[timeoutKey]);
    }

    typingTimeouts[timeoutKey] = setTimeout(() => {
      removeThreadTypingUser(parentMessageId, userId);

      delete typingTimeouts[timeoutKey];
    }, TYPING_MS + 500);
  } else {
    store.dispatch(serverSliceActions.addTypingUser({ channelId, userId }));

    const timeoutKey = getTypingKey(channelId, userId);

    if (typingTimeouts[timeoutKey]) {
      clearTimeout(typingTimeouts[timeoutKey]);
    }

    typingTimeouts[timeoutKey] = setTimeout(() => {
      removeTypingUser(channelId, userId);

      delete typingTimeouts[timeoutKey];
    }, TYPING_MS + 500);
  }
};

export const removeTypingUser = (channelId: number, userId: number) => {
  store.dispatch(serverSliceActions.removeTypingUser({ channelId, userId }));
};

export const removeThreadTypingUser = (
  parentMessageId: number,
  userId: number
) => {
  store.dispatch(
    serverSliceActions.removeThreadTypingUser({ parentMessageId, userId })
  );
};

export const updateReplyCount = (
  channelId: number,
  messageId: number,
  replyCount: number
) => {
  store.dispatch(
    serverSliceActions.updateReplyCount({ channelId, messageId, replyCount })
  );
};
