import { setDmsOpen } from '@/features/server/actions';
import { setSelectedChannelId } from '@/features/server/channels/actions';
import { setActiveHost } from '@/lib/connections';
import {
  closeQuickSwitch,
  getQuickSwitchOpen,
  getQuickSwitchTargets,
  subscribeQuickSwitch,
  type QuickTarget
} from '@/lib/quick-switch';
import { getRailCustom } from '@/lib/rail-prefs';
import { Hash, MessagesSquare, Server } from 'lucide-react';
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

const MAX_RESULTS = 50;

const iconFor = (kind: QuickTarget['kind']) => {
  if (kind === 'server') {
    return <Server className="h-4 w-4 shrink-0 text-muted-foreground" />;
  }

  if (kind === 'dm') {
    return (
      <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
    );
  }

  return <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />;
};

const QuickSwitch = memo(() => {
  const { t } = useTranslation('sidebar');
  const isOpen = useSyncExternalStore(subscribeQuickSwitch, getQuickSwitchOpen);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Snapshot targets each time the palette opens.
  const targets = useMemo(
    () => (isOpen ? getQuickSwitchTargets() : []),
    [isOpen]
  );

  const labelOf = (target: QuickTarget): string =>
    target.kind === 'dm'
      ? t('quickSwitchDms')
      : target.kind === 'channel'
        ? `#${target.name}`
        : target.name;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matches = targets.filter((target) => {
      if (!q) {
        return true;
      }

      const hay =
        `${labelOf(target)} ${getRailCustom(target.host).name || target.serverName}`.toLowerCase();

      return hay.includes(q);
    });

    return matches.slice(0, MAX_RESULTS);
    // labelOf depends only on t; targets/query drive the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, query, t]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setIndex(0);
      // Focus after the portal paints.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!isOpen) {
    return null;
  }

  const go = (target: QuickTarget | undefined) => {
    if (!target) {
      return;
    }

    setActiveHost(target.host);

    if (target.kind === 'channel' && target.channelId !== undefined) {
      setDmsOpen(false);
      setSelectedChannelId(target.channelId);
    } else if (target.kind === 'dm') {
      setDmsOpen(true);
    }

    closeQuickSwitch();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeQuickSwitch();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4 pt-[12vh]"
      onClick={closeQuickSwitch}
    >
      <div
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t('quickSwitchPlaceholder')}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t('quickSwitchNoResults')}
            </div>
          ) : (
            results.map((target, i) => (
              <button
                type="button"
                key={target.id}
                onClick={() => go(target)}
                onMouseMove={() => setIndex(i)}
                className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                  i === index
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
              >
                {iconFor(target.kind)}
                <span className="flex-1 truncate">{labelOf(target)}</span>
                <span className="shrink-0 truncate text-xs text-muted-foreground">
                  {getRailCustom(target.host).name || target.serverName}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});

export { QuickSwitch };
