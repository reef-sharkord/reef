import { ServerScreen } from '@/components/server-screens/screens';
import { openVoiceChatSidebar } from '@/features/app/actions';
import { requestConfirmation } from '@/features/dialogs/actions';
import { openServerScreen } from '@/features/server-screens/actions';
import { markChannelAsRead } from '@/features/server/actions';
import { useChannelById } from '@/features/server/channels/hooks';
import { useCan } from '@/features/server/hooks';
import { getActiveHost } from '@/lib/connections';
import { isChannelMuted, setChannelMuted } from '@/lib/notification-prefs';
import { getTRPCClient } from '@/lib/trpc';
import { ChannelType, Permission } from '@sharkord/shared';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@sharkord/ui';
import { Bell, BellOff, Check } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

type TChannelContextMenuProps = {
  children: React.ReactNode;
  channelId: number;
};

const ChannelContextMenu = memo(
  ({ children, channelId }: TChannelContextMenuProps) => {
    const { t } = useTranslation('sidebar');
    const can = useCan();
    const channel = useChannelById(channelId);

    const [muted, setMuted] = useState(() =>
      isChannelMuted(getActiveHost() ?? '', channelId)
    );

    const canManageChannels = can(Permission.MANAGE_CHANNELS);
    const isVoiceChannel = channel?.type === ChannelType.VOICE;

    const toggleMuted = useCallback(() => {
      const host = getActiveHost();
      if (!host) return;
      const next = !muted;
      setChannelMuted(host, channelId, next);
      setMuted(next);
    }, [channelId, muted]);

    const onMarkRead = useCallback(() => {
      markChannelAsRead(channelId, true);
    }, [channelId]);

    const onOpenChat = useCallback(() => {
      openVoiceChatSidebar(channelId);
    }, [channelId]);

    const onDeleteClick = useCallback(async () => {
      const choice = await requestConfirmation({
        title: t('deleteChannelTitle'),
        message: t('deleteChannelMsg'),
        confirmLabel: t('deleteLabel'),
        cancelLabel: t('cancel', { ns: 'common' })
      });

      if (!choice) return;

      const trpc = getTRPCClient();

      try {
        await trpc.channels.delete.mutate({ channelId });

        toast.success(t('channelDeleted'));
      } catch {
        toast.error(t('failedDeleteChannel'));
      }
    }, [channelId, t]);

    const onEditClick = useCallback(() => {
      openServerScreen(ServerScreen.CHANNEL_SETTINGS, { channelId });
    }, [channelId]);

    return (
      <ContextMenu>
        <ContextMenuTrigger>{children}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>{channel?.name}</ContextMenuLabel>
          <ContextMenuSeparator />

          <ContextMenuItem onClick={onMarkRead}>
            <Check className="mr-2 h-4 w-4" />
            Mark as read
          </ContextMenuItem>
          <ContextMenuItem onClick={toggleMuted}>
            {muted ? (
              <Bell className="mr-2 h-4 w-4" />
            ) : (
              <BellOff className="mr-2 h-4 w-4" />
            )}
            {muted ? 'Unmute channel' : 'Mute channel'}
          </ContextMenuItem>

          {isVoiceChannel && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onOpenChat}>
                {t('openChat')}
              </ContextMenuItem>
            </>
          )}

          {canManageChannels && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onEditClick}>
                {t('editLabel')}
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onClick={onDeleteClick}>
                {t('deleteLabel')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  }
);

export { ChannelContextMenu };
