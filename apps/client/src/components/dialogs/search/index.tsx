import type { TDialogBaseProps } from '@/components/dialogs/types';
import { PaginatedList } from '@/components/paginated-list';
import { jumpToMessage } from '@/features/server/actions';
import { useOnEsc } from '@/hooks/use-on-esc';
import { setActiveHost } from '@/lib/connections';
import type { TMessageJumpToTarget } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  Switch
} from '@sharkord/ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearch } from './hooks';
import { SearchResultFileCard } from './search-result-file';
import { SearchResultMessageCard } from './search-result-message';
import type { TUnifiedSearchResult } from './types';

const ITEMS_PER_PAGE = 12;

type TSearchDialogProps = TDialogBaseProps;

const SearchDialog = memo(({ isOpen, close }: TSearchDialogProps) => {
  const { t } = useTranslation('dialogs');
  useOnEsc(close);

  const {
    query,
    setQuery,
    scope,
    setScope,
    serverCount,
    loading,
    canSearch,
    unifiedResults
  } = useSearch(isOpen);

  const onJump = useCallback(
    (target: TMessageJumpToTarget, host: string) => {
      setActiveHost(host);
      jumpToMessage(target);
      close();
    },
    [close]
  );

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="h-[86vh] max-h-[94vh] lg:min-w-7xl gap-0 overflow-hidden p-0"
        onInteractOutside={close}
        close={close}
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="border-b border-border bg-card/70 px-5 py-4 text-left">
            <DialogTitle className="text-base">{t('searchTitle')}</DialogTitle>
            <DialogDescription>{t('searchDesc')}</DialogDescription>
            <div className="mt-3">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('searchPlaceholder')}
                autoFocus
                className="h-10"
              />
            </div>

            {serverCount > 1 && (
              <label className="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={scope === 'all'}
                  onCheckedChange={(v) => setScope(v ? 'all' : 'active')}
                />
                Search all servers
              </label>
            )}
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
            {!canSearch && !loading && (
              <div className="flex h-full min-h-55 items-center justify-center rounded-lg bg-muted/20 px-6 text-sm text-muted-foreground">
                {t('searchHint')}
              </div>
            )}

            {loading && (
              <div className="flex h-full min-h-55 items-center justify-center">
                <Spinner size="sm" />
              </div>
            )}

            {canSearch && !loading && (
              <PaginatedList
                items={unifiedResults}
                itemsPerPage={ITEMS_PER_PAGE}
              >
                <PaginatedList.Empty className="flex h-full min-h-55 items-center justify-center rounded-lg bg-muted/20 px-6 text-sm text-muted-foreground">
                  {t('noResults')}
                </PaginatedList.Empty>

                <PaginatedList.List<TUnifiedSearchResult>
                  className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1"
                  getItemKey={(entry) => entry.key}
                >
                  {(entry) => (
                    <div>
                      {scope === 'all' && (
                        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {entry.serverName}
                        </div>
                      )}
                      {entry.type === 'message' ? (
                        <SearchResultMessageCard
                          message={entry.item}
                          onJump={(target) => onJump(target, entry.host)}
                        />
                      ) : (
                        <SearchResultFileCard
                          result={entry.item}
                          onJump={(target) => onJump(target, entry.host)}
                        />
                      )}
                    </div>
                  )}
                </PaginatedList.List>

                <PaginatedList.Pagination
                  alwaysShow
                  className="flex shrink-0 items-center justify-center gap-1 border-t border-border pt-3"
                />
              </PaginatedList>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});

export { SearchDialog };
