import { AddServerForm } from '@/components/add-server-form';
import { removeServer } from '@/features/server/actions';
import { useRailServers } from '@/hooks/use-connections';
import { setActiveHost, type RailServer } from '@/lib/connections';
import { isServerMuted, setServerMuted } from '@/lib/notification-prefs';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@sharkord/ui';
import { Bell, BellOff, LogOut, Plus } from 'lucide-react';
import { memo, useState } from 'react';

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

const RailTile = memo(({ server }: { server: RailServer }) => {
  const [muted, setMuted] = useState(() => isServerMuted(server.host));

  const toggleMuted = () => {
    const next = !muted;
    setServerMuted(server.host, next);
    setMuted(next);
  };

  return (
  <ContextMenu>
    <ContextMenuTrigger asChild>
      <button
        type="button"
        onClick={() => setActiveHost(server.host)}
        title={`${server.name} (${server.host})`}
        className={`relative flex h-12 w-12 items-center justify-center overflow-visible rounded-2xl bg-muted text-sm font-semibold transition-all hover:rounded-xl ${
          server.isActive ? 'rounded-xl ring-2 ring-primary' : ''
        }`}
      >
        {server.iconUrl ? (
          <img
            src={server.iconUrl}
            alt={server.name}
            className="h-full w-full rounded-[inherit] object-cover"
          />
        ) : (
          <span>{initialsOf(server.name)}</span>
        )}
        <span
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusColor(
            server.status
          )}`}
        />
        {server.unreadCount > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background px-1 text-[10px] font-bold text-white ${
              server.hasMentions ? 'bg-red-500' : 'bg-primary'
            }`}
          >
            {server.unreadCount > 99 ? '99+' : server.unreadCount}
          </span>
        )}
      </button>
    </ContextMenuTrigger>
    <ContextMenuContent>
      <ContextMenuItem onSelect={toggleMuted}>
        {muted ? (
          <Bell className="mr-2 h-4 w-4" />
        ) : (
          <BellOff className="mr-2 h-4 w-4" />
        )}
        {muted ? 'Unmute server' : 'Mute server'}
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() => removeServer(server.host)}
      >
        <LogOut className="mr-2 h-4 w-4" />
        Remove server
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
  );
});

const Rail = memo(({ className }: { className?: string }) => {
  const servers = useRailServers();
  const [adding, setAdding] = useState(false);

  return (
    <div
      className={cn(
        'flex h-full w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-card py-3',
        className
      )}
    >
      {servers.map((server) => (
        <RailTile key={server.host} server={server} />
      ))}
      <button
        type="button"
        onClick={() => setAdding(true)}
        title="Add a server"
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-green-500 transition-all hover:rounded-xl"
      >
        <Plus className="h-5 w-5" />
      </button>
      {adding && <AddServerForm onClose={() => setAdding(false)} />}
    </div>
  );
});

export { Rail };
