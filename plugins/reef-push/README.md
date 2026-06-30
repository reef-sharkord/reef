# REEF Push (`reef-push`)

Push notifications for **DMs** and **@mentions** via **UnifiedPush / ntfy**, so
the REEF mobile app is notified even when it's backgrounded or killed — **without
Google/Firebase**.

It's a **standard Sharkord plugin** — no changes to the Sharkord server. It reads
DM participants directly from the server's SQLite DB (read-only); if that ever
fails it falls back to **@mentions-only**.

## How it works
- **Server** (`server/index.js`): on each new message, resolves recipients (DM
  partner + anyone @mentioned, minus the author), looks up their registered
  **UnifiedPush endpoint URLs**, and POSTs the notification to each. To avoid
  being an open relay it only sends to **https** endpoints whose host is in the
  **Allowed push hosts** setting.
- **Client** (`client/index.js`): on the native app, registers with the device's
  UnifiedPush distributor (the **ntfy app**) and uploads the endpoint URL via the
  `savePushEndpoint` action. Inert on desktop/browser.
- **Transport**: an **ntfy** server (public `ntfy.sh` or self-hosted) relays the
  POST to the ntfy app, which wakes REEF to show the notification.

## Choose a backend (the plugin supports both)
- **Zero hosting:** use **`ntfy.sh`**. Keep *Allowed push hosts* = `ntfy.sh` and
  point the ntfy app's default server at `ntfy.sh`.
- **Self-host:** run the bundled ntfy (`push/ntfy/docker-compose.yml`), point the
  ntfy app at your server, and add your host to *Allowed push hosts*.

## Prerequisites
1. A **REEF APK with the UnifiedPush native plugin** built in (the native stage).
   The client half is inert until the APK has it.
2. The **ntfy Android app** installed and selected as the UnifiedPush distributor
   (set its default server to `ntfy.sh` or your self-hosted URL).

## Install (per Sharkord server you want pushes from)
1. Copy this `reef-push/` folder into the server's data plugins dir:
   - dev: `apps/server/data/plugins/reef-push/`
   - prod: `<SHARKORD_DATA_PATH>/plugins/reef-push/`
2. Enable the plugin (admin → plugins).
3. In the plugin's **settings**, set **Allowed push hosts** (comma-separated;
   default `ntfy.sh`, add your self-hosted host if any). **Include DM text in
   push** is OFF by default (DM bodies stay off the relay) — see *Privacy* below
   before turning it on. Leave *Device endpoints* alone — it's auto-managed.

## Notes & limitations
- **v1 scope:** DMs and @mentions only (not every channel message).
- **No Google:** delivery is via ntfy/UnifiedPush. Reliability depends on the
  ntfy app's background connection — whitelist it from your OEM's battery killer
  (you whitelist one app for all UnifiedPush apps).
- **Per-server:** each server sends its own pushes, so each needs the plugin.
- **Privacy:**
  - **DM bodies stay off the relay by default.** A DM push carries only the
    sender's name and a generic body ("Sent you a direct message"); the message
    text is never sent to ntfy. Channel **@mention** pushes include a short
    preview. To include DM text too, enable **Include DM text in push** in the
    plugin settings — only do this with a **self-hosted** ntfy you trust.
  - Whatever is sent still transits your ntfy server. `ntfy.sh` is a **public
    relay** — endpoint URLs are unguessable, but anyone who obtains one can
    subscribe to it. **Self-host (with auth, below) for full privacy.**
  - **Admin caveat:** the registered endpoint URLs are stored in plugin settings,
    which a server admin with `MANAGE_PLUGINS` can read. Such an admin could
    therefore subscribe to a user's push topic. Self-hosted ntfy auth limits the
    blast radius; the default-generic DM body limits what leaks regardless.

### Locking down self-hosted ntfy (recommended)

By default ntfy lets anyone publish/subscribe to any topic. To restrict it so
only your authenticated client can use its endpoints, enable auth in
`push/ntfy/server.yml` and create a user:

```
# in server.yml
auth-file: "/var/lib/ntfy/user.db"
auth-default-access: "deny-all"
```
```
# then, inside the container (docker compose exec ntfy sh):
ntfy user add reef                    # set a password
ntfy access reef "up*" read-write     # allow only UnifiedPush topics
```
Point the ntfy Android app at your server with those credentials. (Skip this
only if you accept the public-relay tradeoff above.)
- The DM lookup reads the `direct_messages` table directly; if a future Sharkord
  renames it, DM pushes fall back to @mentions-only.
