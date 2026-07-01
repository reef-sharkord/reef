# REEF companion plugin

First-party plugin for servers that host REEF clients. It adds server-side
features the REEF client can use, each behind its own toggle. Runs on a stock
Sharkord server and is harmless to clients that don't use it.

## Features

### GIF search proxy
The REEF client's GIF picker calls the `searchGifs` action; the plugin queries
the configured provider **server-side** and returns a normalized list
(`{ id, gifUrl, previewUrl, width, height }`). Because the request happens on the
server, the provider API key never reaches clients, there are no browser CORS
problems, and the rate limit is scoped to this server.

**Settings**
- **Enable GIF search** — master on/off.
- **GIF provider** — `klipy` or `giphy`.
- **Klipy API key** — your key from klipy.com/developers. Blank = shared REEF
  fallback key, so it works out of the box.
- **Giphy API key** — your key from developers.giphy.com. Required when the
  provider is `giphy`. (Giphy also requires a "Powered by GIPHY" mark, which the
  REEF client shows.)

> Prefer setting your own key so the quota (and any abuse) is yours, not the
> shared fallback's.

## Install

Copy this folder into your server's `<data-dir>/plugins/reef` and enable it in
**Settings → Plugins**. No build step — it's plain JS.

## Roadmap

- Presence / custom status (+ opt-in desktop game auto-detect), behind its own
  toggle.
