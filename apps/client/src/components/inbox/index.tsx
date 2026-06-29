import { setDmsOpen } from '@/features/server/actions';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import { useInbox } from '@/hooks/use-inbox';
import { setActiveHost } from '@/lib/connections';
import { getRailCustom } from '@/lib/rail-prefs';
import type { InboxEntry } from '@/lib/inbox';
import { Hash, MessagesSquare, X } from 'lucide-react';
import { memo } from 'react';
import { createPortal } from 'react-dom';

const initialsOf = (name: string) =>
  name.trim().slice(0, 2).toUpperCase() || '?';

/**
 * Unified cross-server inbox: every unread channel (and a DM summary) across all
 * connected servers, grouped by server. Clicking an entry switches to that
 * server and opens the channel/DMs. Portaled to <body>. (M8)
 */
const Inbox = memo(({ onClose }: { onClose: () => void }) => {
  const servers = useInbox();

  const open = (host: string, entry: InboxEntry) => {
    setActiveHost(host);

    if (entry.kind === 'dm') {
      setDmsOpen(true);
    } else {
      setDmsOpen(false);
      setSelectedChannelId(entry.channelId);
    }

    onClose();
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
          <h2 className="text-sm font-semibold">Inbox</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {servers.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center text-muted-foreground">
              <span className="text-2xl">🦈</span>
              <span className="text-sm">You're all caught up.</span>
            </div>
          ) : (
            servers.map((server) => {
              const name = getRailCustom(server.host).name || server.name;

              return (
                <div key={server.host} className="px-2 py-2">
                  <div className="flex items-center gap-2 px-2 pb-1">
                    {server.iconUrl ? (
                      <img
                        src={server.iconUrl}
                        alt=""
                        className="h-5 w-5 rounded"
                      />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-muted text-[9px] font-semibold">
                        {initialsOf(name)}
                      </span>
                    )}
                    <span className="truncate text-xs font-semibold text-muted-foreground">
                      {name}
                    </span>
                  </div>

                  {server.entries.map((entry) => (
                    <button
                      type="button"
                      key={`${entry.kind}-${entry.channelId ?? 'dm'}`}
                      onClick={() => open(server.host, entry)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      {entry.kind === 'dm' ? (
                        <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate">{entry.name}</span>
                      {entry.hasMention && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
                      )}
                      <span
                        className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
                          entry.hasMention ? 'bg-red-500' : 'bg-primary'
                        }`}
                      >
                        {entry.unread > 99 ? '99+' : entry.unread}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

export { Inbox };
