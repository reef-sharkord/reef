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
   default `ntfy.sh`, add your self-hosted host if any). Leave *Device endpoints*
   alone — it's auto-managed.

## Notes & limitations
- **v1 scope:** DMs and @mentions only (not every channel message).
- **No Google:** delivery is via ntfy/UnifiedPush. Reliability depends on the
  ntfy app's background connection — whitelist it from your OEM's battery killer
  (you whitelist one app for all UnifiedPush apps).
- **Per-server:** each server sends its own pushes, so each needs the plugin.
- **Privacy:** content transits your ntfy server. With `ntfy.sh`, keep in mind
  it's a public relay (endpoints are unguessable); self-host for full privacy.
- The DM lookup reads the `direct_messages` table directly; if a future Sharkord
  renames it, DM pushes fall back to @mentions-only.
