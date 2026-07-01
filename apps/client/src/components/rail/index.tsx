import { AddServerForm } from '@/components/add-server-form';
import { Inbox } from '@/components/inbox';
import { RailCustomizeDialog } from '@/components/rail/customize-dialog';
import { SavedMessages } from '@/components/saved-messages';
import { removeServer } from '@/features/server/actions';
import { useRailServers } from '@/hooks/use-connections';
import { useInbox } from '@/hooks/use-inbox';
import { setActiveHost, type RailServer } from '@/lib/connections';
import { isServerMuted, setServerMuted } from '@/lib/notification-prefs';
import { openQuickSwitch } from '@/lib/quick-switch';
import {
  getAllRailCustom,
  getRailOrder,
  setRailOrder,
  sortHostsByOrder,
  type RailCustom
} from '@/lib/rail-prefs';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@sharkord/ui';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  Bookmark,
  Command,
  Inbox as InboxIcon,
  LogOut,
  Palette,
  Plus
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const initialsOf = (name: string) =>
  name.trim().slice(0, 2).toUpperCase() || '?';

const statusColor = (status: RailServer['status']) => {
  switch (status) {
    case 'open':
      return 'bg-green-500';
    case 'connecting':
    case 'reconnecting':
      return 'bg-yellow-500';
    default:
      return 'bg-red-500';
  }
};

type TileProps = {
  server: RailServer;
  custom: RailCustom;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onCustomize: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  dragging: boolean;
};

const RailTile = memo(
  ({
    server,
    custom,
    canMoveUp,
    canMoveDown,
    onMoveUp,
    onMoveDown,
    onCustomize,
    onDragStart,
    onDrop,
    dragging
  }: TileProps) => {
    const { t } = useTranslation('sidebar');
    const [muted, setMuted] = useState(() => isServerMuted(server.host));

    const toggleMuted = () => {
      const next = !muted;
      setServerMuted(server.host, next);
      setMuted(next);
    };

    const name = custom.name || server.name;

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            draggable
            onDragStart={onDragStart}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => setActiveHost(server.host)}
            title={`${name} (${server.host})`}
            style={custom.color ? { backgroundColor: custom.color } : undefined}
            className={cn(
              'relative flex h-12 w-12 items-center justify-center overflow-visible rounded-2xl bg-muted text-sm font-semibold transition-all hover:rounded-xl',
              custom.color && 'text-white',
              server.isActive && 'rounded-xl ring-2 ring-primary',
              dragging && 'opacity-40'
            )}
          >
            {server.iconUrl ? (
              <img
                src={server.iconUrl}
                alt={name}
                className="h-full w-full rounded-[inherit] object-cover"
              />
            ) : (
              <span>{initialsOf(name)}</span>
            )}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background',
                statusColor(server.status)
              )}
            />
            {server.unreadCount > 0 && (
              <span
                className={cn(
                  'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background px-1 text-[10px] font-bold text-white',
                  server.hasMentions ? 'bg-red-500' : 'bg-primary'
                )}
              >
                {server.unreadCount > 99 ? '99+' : server.unreadCount}
              </span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={onCustomize}>
            <Palette className="mr-2 h-4 w-4" />
            {t('railCustomize')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={toggleMuted}>
            {muted ? (
              <Bell className="mr-2 h-4 w-4" />
            ) : (
              <BellOff className="mr-2 h-4 w-4" />
            )}
            {muted ? t('railUnmuteServer') : t('railMuteServer')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            <ArrowUp className="mr-2 h-4 w-4" />
            {t('railMoveUp')}
          </ContextMenuItem>
          <ContextMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            <ArrowDown className="mr-2 h-4 w-4" />
            {t('railMoveDown')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => removeServer(server.host)}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('railRemoveServer')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }
);

const Rail = memo(({ className }: { className?: string }) => {
  const { t } = useTranslation('sidebar');
  const servers = useRailServers();
  const inbox = useInbox();
  const [adding, setAdding] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [order, setOrder] = useState<string[]>(() => getRailOrder());
  const [customMap, setCustomMap] = useState<Record<string, RailCustom>>(() =>
    getAllRailCustom()
  );
  const [customizing, setCustomizing] = useState<RailServer | null>(null);
  const [dragHost, setDragHost] = useState<string | null>(null);

  const inboxUnread = inbox.reduce(
    (n, s) => n + s.entries.reduce((m, e) => m + e.unread, 0),
    0
  );
  const inboxHasMention = inbox.some((s) =>
    s.entries.some((e) => e.hasMention)
  );

  const ordered = useMemo(
    () => sortHostsByOrder(servers, order),
    [servers, order]
  );

  const persistOrder = (hosts: string[]) => {
    setRailOrder(hosts);
    setOrder(hosts);
  };

  const move = (host: string, dir: -1 | 1) => {
    const hosts = ordered.map((s) => s.host);
    const i = hosts.indexOf(host);
    const j = i + dir;

    if (i < 0 || j < 0 || j >= hosts.length) {
      return;
    }

    [hosts[i], hosts[j]] = [hosts[j], hosts[i]];
    persistOrder(hosts);
  };

  const onDropOn = (targetHost: string) => {
    if (!dragHost || dragHost === targetHost) {
      setDragHost(null);
      return;
    }

    const hosts = ordered.map((s) => s.host).filter((h) => h !== dragHost);
    const at = hosts.indexOf(targetHost);
    hosts.splice(at < 0 ? hosts.length : at, 0, dragHost);
    persistOrder(hosts);
    setDragHost(null);
  };

  return (
    <div
      className={cn(
        'flex h-full w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-card py-3',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setInboxOpen(true)}
        title={t('railInbox')}
        className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-all hover:rounded-xl hover:text-foreground"
      >
        <InboxIcon className="h-5 w-5" />
        {inboxUnread > 0 && (
          <span
            className={cn(
              'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card px-1 text-[10px] font-bold text-white',
              inboxHasMention ? 'bg-red-500' : 'bg-primary'
            )}
          >
            {inboxUnread > 99 ? '99+' : inboxUnread}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => setSavedOpen(true)}
        title={t('railSaved')}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-all hover:rounded-xl hover:text-foreground"
      >
        <Bookmark className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => openQuickSwitch()}
        title={t('railQuickSwitch')}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground transition-all hover:rounded-xl hover:text-foreground"
      >
        <Command className="h-5 w-5" />
      </button>
      <div className="my-1 h-px w-8 shrink-0 bg-border" />

      {ordered.map((server, i) => (
        <RailTile
          key={server.host}
          server={server}
          custom={customMap[server.host] ?? {}}
          canMoveUp={i > 0}
          canMoveDown={i < ordered.length - 1}
          onMoveUp={() => move(server.host, -1)}
          onMoveDown={() => move(server.host, 1)}
          onCustomize={() => setCustomizing(server)}
          onDragStart={() => setDragHost(server.host)}
          onDrop={() => onDropOn(server.host)}
          dragging={dragHost === server.host}
        />
      ))}
      <button
        type="button"
        onClick={() => setAdding(true)}
        title={t('railAddServer')}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-green-500 transition-all hover:rounded-xl"
      >
        <Plus className="h-5 w-5" />
      </button>

      {adding && <AddServerForm onClose={() => setAdding(false)} />}

      {inboxOpen && <Inbox onClose={() => setInboxOpen(false)} />}

      {savedOpen && <SavedMessages onClose={() => setSavedOpen(false)} />}

      {customizing && (
        <RailCustomizeDialog
          host={customizing.host}
          serverName={customizing.name}
          onClose={() => setCustomizing(null)}
          onSaved={() => setCustomMap(getAllRailCustom())}
        />
      )}
    </div>
  );
});

export { Rail };
