# REEF Push (`reef-push`)

Push notifications for **DMs** and **@mentions** via Firebase Cloud Messaging
(FCM), so the REEF mobile app is notified even when it's backgrounded or killed.

It is a **standard Sharkord plugin** — it needs **no changes to the Sharkord
server**. It reads DM participants directly from the server's SQLite DB
(read-only); if that ever fails it falls back to **@mentions-only** rather than
breaking.

## How it works
- **Server** (`server/index.js`): on every new message, works out the recipients
  (DM partner + anyone @mentioned, minus the author), looks up their registered
  device tokens, and sends each an FCM v1 push. Dead tokens are pruned
  automatically. Tokens + your Firebase credentials live in the plugin's
  settings.
- **Client** (`client/index.js`): on the native app, grabs this device's FCM
  token and registers it with the server (via the `saveFcmToken` action). Inert
  on desktop/browser.

## Prerequisites
1. **A REEF APK with Firebase Messaging built in** (Stage 2 — wires
   `@capacitor-firebase/messaging` + your `google-services.json` into the app).
   The plugin's client half is inert until the APK has the native FCM plugin.
2. **A Firebase project** (free). From it you need two things:
   - `google-services.json` (Android app config) → goes into the APK at build.
   - A **service-account key JSON** (Project settings → Service accounts →
     *Generate new private key*) → pasted into this plugin's settings.

## Install (per Sharkord server you want pushes from)
1. Copy this `reef-push/` folder into the server's data plugins dir:
   - dev: `apps/server/data/plugins/reef-push/`
   - prod: `<SHARKORD_DATA_PATH>/plugins/reef-push/`
2. Enable the plugin in the server (admin → plugins).
3. In the plugin's **settings**, set:
   - **Firebase project ID** — the `project_id` from the service-account JSON.
   - **Service account JSON** — paste the whole key file contents.
   (Leave *Device tokens* alone — it's auto-managed.)

That's it. Open the REEF app against that server while signed in; the app
registers its token, and you'll get a push on a DM or @mention.

## Notes & limitations
- **v1 scope:** DMs and @mentions only (not every channel message), by design.
- **Per-server:** each server sends its own pushes, so each needs the plugin +
  credentials. (Inherent to REEF's multi-server model.)
- **Reliability:** FCM is exempt from Android Doze / OEM battery-killers, so it
  works when the app is closed — the one thing a self-run socket can't promise.
- **Secret:** the service-account key is stored in the server's plugin settings
  (its DB). Fine for self-hosting; treat that DB as sensitive.
- **Android only** for now (iOS would need an APNs key in Firebase).
- The DM lookup reads the `direct_messages` table directly; if a future Sharkord
  renames it, DM pushes silently fall back to @mentions-only.
