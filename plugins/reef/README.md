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

### Push notifications (no Google services, ever)
Notifies **offline** REEF mobile users about **DMs** and **@mentions**. REEF
deliberately uses no Firebase/FCM, so how pushes reach phones is the server
operator's choice — the **Push method** setting:

| Method | What happens | Best for |
|---|---|---|
| `off` *(default)* | No push. Users with the REEF app running (even backgrounded) still get normal notifications. | Servers that don't want any third party involved. |
| `ntfy` | The plugin publishes to each user's **private random topic** on an [ntfy](https://ntfy.sh) server. Users install the free ntfy app once and subscribe with one tap from REEF's settings. | Easiest working push. Public `ntfy.sh` needs zero setup; self-hosting ntfy keeps everything on your infra. |
| `webhook` | The plugin POSTs JSON `{topic, title, body}` to your own endpoint for every push. | Self-hosters with existing infra (Gotify, a UnifiedPush bridge, home-grown relays). Delivery to phones is then your bridge's job. |
| `fcm` | The plugin sends through **Firebase Cloud Messaging** using your service-account key (HTTP v1; no Firebase SDK on the server). No extra app on phones. | Communities that build **their own REEF APK**: FCM device tokens only exist for apps built with your Firebase project's `google-services.json`. Official REEF builds ship Firebase-free, so they can't receive FCM. |

**How it works (both methods):** each REEF mobile app generates a private
random topic (128 bits — the topic name is the only secret) and registers it
over the authenticated connection via the `registerPushTopic` action. When a
DM or @mention lands for a user whose REEF app looks *offline* (no reef
action calls for ~3 minutes), the plugin pushes to their topic. Users with a
live app are skipped — their app already notifies locally, so no doubles.

**Privacy:** by default pushes contain **who wrote and where, never the
message text** — whatever relay carries the push (e.g. the public ntfy.sh)
can read what passes through it. The **Include message text in pushes**
toggle opts in to full previews; sensible if you self-host the relay.

**Admin setup — ntfy (5 minutes):**
1. Set **Push method** to `ntfy`. Done, if you're fine with the public
   `ntfy.sh` relay.
2. (Recommended for privacy) [Self-host ntfy](https://docs.ntfy.sh/install/)
   and put your instance in **ntfy server URL**. If it requires auth to
   publish, create an access token and paste it into **Push auth token**.
3. Tell your users: install the **ntfy app** (Play Store / F-Droid), then in
   REEF go to **Settings → Notifications → "Subscribe in ntfy"** (appears
   automatically on Android once the server offers push).

**Admin setup — webhook:**
1. Set **Push method** to `webhook` and your endpoint in **Push webhook URL**
   (optional Bearer auth via **Push auth token**).
2. Your endpoint receives `{topic, title, body}` per push; route `topic` to
   the right device however your infra does that (each user's REEF app knows
   its topic; you'll need your own way to enroll devices).

**Admin setup — fcm (custom APK builds only):**
1. Create a Firebase project; add an Android app with your APK's package id
   and download its `google-services.json` into `mobile/` **before building
   your APK** (the build script wires it in automatically).
2. In the Firebase console: **Project settings → Service accounts → Generate
   new private key**; paste the whole JSON into **Firebase service account
   JSON** and set **Push method** to `fcm`.
3. REEF apps built with that config register their FCM device token
   automatically — users install nothing extra. Apps *without* your config
   (including official REEF builds) simply can't receive FCM pushes.

**Settings**
- **Push method** — `off` (default) / `ntfy` / `webhook` / `fcm`.
- **ntfy server URL** — default `https://ntfy.sh`.
- **Push webhook URL** — required for the webhook method.
- **Firebase service account JSON** — required for the fcm method.
- **Push auth token** — optional Bearer token for ntfy/webhook.
- **Include message text in pushes** — default off (see Privacy above).

## Install

1. Create a folder named **exactly `reef`** inside your server's
   `<data-dir>/plugins/` — the folder name is the plugin id, so
   `plugins/reef-plugin/` or files loose in `plugins/` will **not** load.
2. Copy everything from this folder into `<data-dir>/plugins/reef/`
   (`manifest.json` must end up at `plugins/reef/manifest.json`).
3. Enable it in **Settings → Plugins**.
4. **Give your member roles the `USE_PLUGINS` permission** (Settings → Roles).
   Without it, every reef feature silently does nothing for regular users —
   only the owner would see GIFs, presence, push, and reports.

No build step — it's plain JS.

## Roadmap

- Opt-in desktop game auto-detect feeding the custom status.
