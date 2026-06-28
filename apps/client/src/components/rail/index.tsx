import { addServer } from '@/features/server/actions';
import { useRailServers } from '@/hooks/use-connections';
import { setActiveHost, type RailServer } from '@/lib/connections';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Group,
  Input
} from '@sharkord/ui';
import { Plus } from 'lucide-react';
import { memo, useCallback, useState } from 'react';

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

const RailTile = memo(({ server }: { server: RailServer }) => (
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
  </button>
));

const AddServerForm = memo(({ onClose }: { onClose: () => void }) => {
  const [host, setHost] = useState('');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await addServer({
        host: host.trim(),
        identity,
        password
      });

      if (!result.ok) {
        setError(Object.values(result.errors)[0] ?? 'Failed to connect');
        return;
      }

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [host, identity, password, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <CardHeader>
          <CardTitle>Add a server</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Group label="Server address">
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost:4992"
              autoFocus
            />
          </Group>
          <Group label="Username">
            <Input
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              autoComplete="off"
            />
          </Group>
          <Group label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onEnter={onSubmit}
            />
          </Group>
          {error && <span className="text-sm text-destructive">{error}</span>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={onSubmit}
              disabled={loading || !host || !identity || !password}
            >
              {loading ? 'Connecting…' : 'Connect'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

const Rail = memo(() => {
  const servers = useRailServers();
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex h-full w-[72px] shrink-0 flex-col items-center gap-2 border-r bg-card py-3">
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
