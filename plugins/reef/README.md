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

> **No GIF button in REEF?** That's this setting. The button only appears once
> **Enable GIF search** is on **and** an API key for the chosen provider is
> entered here — REEF hides it on servers that haven't set this up.

**Settings**
- **Enable GIF search** — master on/off.
- **GIF provider** — `klipy` or `giphy`.
- **Klipy API key** — your key, free at klipy.com/developers. Required when the
  provider is `klipy`.
- **Giphy API key** — your key from developers.giphy.com. Required when the
  provider is `giphy`. (Giphy also requires a "Powered by GIPHY" mark, which the
  REEF client shows.)

### Feature switchboard
The `getFeatures` action tells REEF clients which REEF features this server
allows: `{ gifs, soundboard, savedMessages }`. Clients ask once after joining
and gate their UI per server, so the same client can have a feature on at one
server and off at another. Servers without the plugin express no policy —
clients default everything to on.

Two kinds of toggles, honestly:
- **Enforced** (GIF search): off means the server refuses; the feature truly
  cannot work.
- **Honored** (soundboard, saved messages): these features run entirely inside
  the client (soundboard audio travels in the normal voice stream; saves live on
  the user's device), so the toggle is a policy signal that REEF clients respect
  by hiding the UI.

**Settings**
- **Allow soundboard** — default on.
- **Allow saved messages** — default on.

### Custom status (presence)
`setPresence` / `getPresences` actions let REEF clients set a short status text
("Playing X", "AFK") that other REEF clients on the server see (member list +
own footer). Kept in memory only — a server restart clears all statuses.
Clients refresh on a slow poll (60s) plus immediately after setting their own.

**Settings**
- **Allow custom status** — default on.

### Bug reports / feature requests
The `submitReport` action emails a user's bug report or feature request to the
server operator through an HTTP mail relay. The relay key stays server-side;
clients only see the report form. Hidden from clients until a relay API key is
configured. Per-user 60s cooldown.

The plugin POSTs JSON `{ from, to, subject, text }` with
`Authorization: Bearer <key>` — the Resend API accepts this shape as-is, and
most relays can be adapted.

**Settings**
- **Enable bug reports** — default on (but inactive without a relay key).
- **Reports go to** — default `reefsharkordlobby@gmail.com`.
- **Mail relay URL** — default `https://api.resend.com/emails`.
- **Mail from address** — sender the relay may send as.
- **Mail relay API key** — required for the feature to appear in clients.

## Install

1. Create a folder named **exactly `reef`** inside your server's
   `<data-dir>/plugins/` — the folder name is the plugin id, so
   `plugins/reef-plugin/` or files loose in `plugins/` will **not** load.
2. Copy everything from this folder into `<data-dir>/plugins/reef/`
   (`manifest.json` must end up at `plugins/reef/manifest.json`).
3. Enable it in **Settings → Plugins**.

No build step — it's plain JS.

## Roadmap

- Opt-in desktop game auto-detect feeding the custom status.
