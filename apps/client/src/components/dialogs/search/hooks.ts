import {
  getActiveHost,
  getConnection,
  getRailServers
} from '@/lib/connections';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TSearchResults, TUnifiedSearchResult } from './types';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

type TServerResults = {
  host: string;
  serverName: string;
  results: TSearchResults;
};

export type TSearchScope = 'active' | 'all';

export const useSearch = (isOpen: boolean) => {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<TSearchScope>('active');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TServerResults[]>([]);

  const serverCount = getRailServers().length;

  useEffect(() => {
    // reset state when dialog is closed
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const trimmed = query.trim();

    if (!isOpen || trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setLoading(false);

      return;
    }

    let cancelled = false;

    const load = async () => {
      const railServers = getRailServers();
      const targets =
        scope === 'all'
          ? railServers
          : railServers.filter((s) => s.host === getActiveHost());

      setLoading(true);

      const settled = await Promise.allSettled(
        targets.map(async (server) => {
          const conn = getConnection(server.host);

          if (!conn) {
            throw new Error('no connection');
          }

          const res = await conn.trpc.messages.search.query({ query: trimmed });

          return { host: server.host, serverName: server.name, results: res };
        })
      );

      if (cancelled) {
        return;
      }

      const ok: TServerResults[] = settled.flatMap((r) =>
        r.status === 'fulfilled' ? [r.value] : []
      );

      if (ok.length === 0 && settled.length > 0) {
        toast.error('Could not load search results.');
      }

      setResults(ok);
      setLoading(false);
    };

    const timer = setTimeout(load, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      cancelled = true;
    };
  }, [query, isOpen, scope]);

  const canSearch = query.trim().length >= MIN_QUERY_LENGTH;

  const unifiedResults: TUnifiedSearchResult[] = useMemo(
    () =>
      results
        .flatMap(({ host, serverName, results: r }) => [
          ...r.messages.map((message) => ({
            type: 'message' as const,
            createdAt: message.createdAt,
            key: `${host}-message-${message.id}`,
            host,
            serverName,
            item: message
          })),
          ...r.files.map((fileResult) => ({
            type: 'file' as const,
            createdAt: fileResult.messageCreatedAt,
            key: `${host}-file-${fileResult.file.id}-${fileResult.messageId}`,
            host,
            serverName,
            item: fileResult
          }))
        ])
        .sort((a, b) => b.createdAt - a.createdAt),
    [results]
  );

  const totalResults = unifiedResults.length;

  return {
    query,
    setQuery,
    scope,
    setScope,
    serverCount,
    loading,
    canSearch,
    totalResults,
    unifiedResults
  };
};
