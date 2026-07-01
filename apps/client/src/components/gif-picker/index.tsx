import { searchGifs, sendGif, type Gif } from '@/lib/gif';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@sharkord/ui';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

/**
 * GIF picker (composer button + popover). Searches through the server's `reef`
 * plugin and, on pick, sends the GIF's URL as a message (the server unfurls it
 * into inline media). Shows the Giphy attribution mark when the server returns
 * that provider. If the server has no `reef` plugin the grid is simply empty.
 */
const GifPicker = memo(
  ({ channelId, disabled }: { channelId: number; disabled?: boolean }) => {
    const { t } = useTranslation('common');
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [gifs, setGifs] = useState<Gif[]>([]);
    const [provider, setProvider] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const reqRef = useRef(0);

    useEffect(() => {
      if (!open) {
        setQuery('');
        setGifs([]);
        setProvider(null);
        return;
      }

      const id = ++reqRef.current;
      setLoading(true);

      // Debounce typing; load trending immediately when the query is empty.
      const handle = setTimeout(
        async () => {
          const res = await searchGifs(query);

          if (id !== reqRef.current) {
            return; // a newer search superseded this one
          }

          setGifs(res.results);
          setProvider(res.provider);
          setLoading(false);
        },
        query ? 400 : 0
      );

      return () => clearTimeout(handle);
    }, [open, query]);

    const pick = async (gif: Gif) => {
      setOpen(false);

      try {
        await sendGif(channelId, gif);
      } catch {
        toast.error(t('gifSendFailed'));
      }
    };

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            disabled={disabled}
            title={t('gifButton')}
          >
            <span className="text-[10px] font-bold leading-none">GIF</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('gifSearchPlaceholder')}
            className="mb-2 w-full rounded-md border border-border bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => pick(gif)}
                className="overflow-hidden rounded-md bg-muted/40 transition-opacity hover:opacity-80"
              >
                <img
                  src={gif.previewUrl}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
            {!loading && gifs.length === 0 && (
              <div className="col-span-2 px-2 py-8 text-center text-xs text-muted-foreground">
                {t('gifNoResults')}
              </div>
            )}
          </div>
          {provider === 'giphy' && (
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {t('gifPoweredByGiphy')}
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }
);

export { GifPicker };
