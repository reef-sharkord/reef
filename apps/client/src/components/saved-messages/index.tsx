import { jumpToMessage } from '@/features/server/actions';
import { setActiveHost } from '@/lib/connections';
import { getRailCustom } from '@/lib/rail-prefs';
import {
  getSavedMessages,
  removeSavedMessage,
  type SavedMessage
} from '@/lib/saved-messages';
import { Hash, MessagesSquare, X } from 'lucide-react';
import { memo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/**
 * Cross-server saved-messages list (client-only, REEF-exclusive). Clicking an
 * entry switches to that server and jumps to the original message. Portaled to
 * <body>, mirroring the inbox.
 */
const SavedMessages = memo(({ onClose }: { onClose: () => void }) => {
  const { t } = useTranslation('sidebar');
  const [items, setItems] = useState<SavedMessage[]>(() => getSavedMessages());

  const open = (item: SavedMessage) => {
    setActiveHost(item.host);
    jumpToMessage({
      channelId: item.channelId,
      messageId: item.messageId,
      isDm: item.isDm
    });
    onClose();
  };

  const remove = (item: SavedMessage, e: React.MouseEvent) => {
    e.stopPropagation();
    removeSavedMessage(item.host, item.messageId);
    setItems(getSavedMessages());
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[8vh]"
      onClick={onClose}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{t('savedTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t('inboxClose')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-muted-foreground">
              <span className="text-2xl">🔖</span>
              <span className="text-sm">{t('savedEmpty')}</span>
            </div>
          ) : (
            <div className="p-2">
              {items.map((item) => (
                <div
                  key={`${item.host}-${item.messageId}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(item)}
                  className="group flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                >
                  {item.isDm ? (
                    <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-muted-foreground">
                      {getRailCustom(item.host).name || item.host}
                      {item.channelName ? ` · #${item.channelName}` : ''}
                    </div>
                    <div className="truncate text-sm">
                      {item.preview || t('savedNoPreview')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => remove(item, e)}
                    title={t('savedRemove')}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

export { SavedMessages };
