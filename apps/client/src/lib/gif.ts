import { getTRPCClient } from '@/lib/trpc';
import { prepareMessageHtml } from '@sharkord/shared';

/**
 * GIF search + send (client side).
 *
 * Search is proxied through the connected server's `reef` plugin (see
 * plugins/reef): we call its `searchGifs` action directly with an explicit
 * pluginId, so the provider key stays server-side and there's no browser CORS.
 * Sending a GIF just posts its `.gif` URL as a message — the server unfurls
 * direct image links into inline media, so it renders in every client and needs
 * no re-hosting. If the server has no `reef` plugin, search returns empty.
 */
export type Gif = {
  id: string;
  gifUrl: string;
  previewUrl: string;
  width: number;
  height: number;
};

export type GifSearchResult = {
  provider: string | null;
  results: Gif[];
};

type SearchGifsResponse = {
  ok?: boolean;
  provider?: string;
  results?: Gif[];
};

export const searchGifs = async (
  query: string,
  page = 1
): Promise<GifSearchResult> => {
  const trpc = getTRPCClient();

  try {
    const res = (await trpc.plugins.executeAction.mutate({
      pluginId: 'reef',
      actionName: 'searchGifs',
      payload: { query, page }
    })) as SearchGifsResponse | undefined;

    if (res?.ok && Array.isArray(res.results)) {
      return { provider: res.provider ?? null, results: res.results };
    }

    return { provider: null, results: [] };
  } catch {
    // Server has no reef plugin / GIF disabled / no permission — no GIFs.
    return { provider: null, results: [] };
  }
};

export const sendGif = async (channelId: number, gif: Gif): Promise<void> => {
  const trpc = getTRPCClient();

  await trpc.messages.send.mutate({
    channelId,
    content: prepareMessageHtml(`<p>${gif.gifUrl}</p>`),
    files: []
  });
};
