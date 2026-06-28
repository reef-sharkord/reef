import { addServer } from '@/features/server/actions';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Group,
  Input
} from '@sharkord/ui';
import { memo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal to add (connect to) a server for the multi-server rail. Shared by the
 * rail "+" button and the standalone welcome screen.
 */
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

  // Render through a portal to document.body: when opened from the mobile rail
  // drawer (which has a CSS transform for its slide animation), a nested
  // `position: fixed` would be trapped inside the 72px rail instead of covering
  // the screen. The portal escapes that transformed ancestor.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
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
              placeholder="chat.example.com"
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
    </div>,
    document.body
  );
});

export { AddServerForm };
