import {
  addSound,
  getSounds,
  playSoundboardClip,
  removeSound,
  type SoundClip
} from '@/lib/soundboard';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@sharkord/ui';
import { Music, Plus, X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Soundboard (in-voice). Add short audio clips (stored in IndexedDB) and click
 * to mix them into your outgoing mic so others hear them. Only useful while in
 * a voice channel — the mixer is set up by the mic pipeline.
 */
const Soundboard = memo(() => {
  const { t } = useTranslation('sidebar');
  const [open, setOpen] = useState(false);
  const [clips, setClips] = useState<SoundClip[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void getSounds().then(setClips);
  };

  useEffect(() => {
    if (open) {
      refresh();
    }
  }, [open]);

  const onAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;

    if (files) {
      for (const file of Array.from(files)) {
        try {
          await addSound(file);
        } catch {
          // ignore a bad file
        }
      }
    }

    e.target.value = '';
    refresh();
  };

  const onRemove = async (id: string) => {
    await removeSound(id);
    refresh();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" title={t('soundboardTitle')}>
          <Music className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">{t('soundboardTitle')}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileRef.current?.click()}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('soundboardAdd')}
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={onAdd}
        />

        {clips.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-muted-foreground">
            {t('soundboardEmpty')}
          </div>
        ) : (
          <div className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto">
            {clips.map((clip) => (
              <div key={clip.id} className="group relative">
                <button
                  type="button"
                  onClick={() => void playSoundboardClip(clip.id, clip.blob)}
                  title={clip.name}
                  className="w-full truncate rounded-md border border-border bg-muted/40 px-2 py-2 text-xs hover:bg-muted/70"
                >
                  {clip.name}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(clip.id)}
                  title={t('soundboardRemove')}
                  className="absolute -right-1 -top-1 hidden rounded-full bg-card p-0.5 text-muted-foreground shadow group-hover:block hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});

export { Soundboard };
