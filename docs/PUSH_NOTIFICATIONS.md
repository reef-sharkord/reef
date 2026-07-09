# Push notifications — quickstart

REEF can notify you about **DMs and @mentions even when the app is closed** —
without any Google services. This guide gets it working in about 5 minutes.

Two people are involved:

| Who | Does what | Takes |
|---|---|---|
| **Server admin** | Installs the REEF plugin, flips one setting | ~5 min, once per server |
| **Each user** | Installs the free [ntfy](https://ntfy.sh) app, taps Subscribe in REEF | ~1 min, once per phone |

> **Don't need this?** While REEF is running (even in the background), you
> already get notifications with zero setup. Push is only for when the app is
> fully closed or was killed by Android.

### How notifications reach you (two paths)

- **REEF is running** (foreground or background): the app itself notifies you,
  driven by the switches at the top of **Settings → Notifications** — on the
  phone, *Mentions*, *Direct Messages* and *Replies to Me* are **on by
  default**. No push involved; the server deliberately does not double-send.
- **REEF is closed / killed**: your server pushes DMs and @mentions through
  ntfy — that's what this guide sets up. The server treats your app as closed
  after ~3 minutes of silence.

---

## Part 1 — Server admin setup (ntfy)

Prerequisite: the [REEF plugin](../plugins/reef/README.md#install) is installed
and enabled on your Sharkord server.

1. **Settings → Plugins → reef → Settings**: set **Push method** to `ntfy`.
2. **Settings → Roles**: make sure your member roles have the **Use Plugins**
   permission. *This is the #1 thing people miss* — without it, every REEF
   plugin feature (push included) silently does nothing for regular members.
3. That's it if you're fine with the public `ntfy.sh` relay. For more privacy,
   [self-host ntfy](https://docs.ntfy.sh/install/) and put your instance URL in
   **ntfy server URL** (plus an access token in **Push auth token** if your
   instance requires auth to publish).

**Privacy note:** by default, pushes say *who* wrote and *where* — never the
message text — so the relay can't read your conversations. The **Include
message text in pushes** toggle opts in to full previews; recommended only if
you self-host the relay.

## Part 2 — User setup (Android)

1. Install the **ntfy** app — free, no account needed:
   [Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy) /
   [F-Droid](https://f-droid.org/packages/io.heckel.ntfy/).
2. Open ntfy once and allow it to show notifications.
3. In REEF: **Settings → Notifications → "Push while REEF is closed"**. Each
   of your servers is listed with its push status. Next to a server marked
   **Ready**, tap **Subscribe in ntfy** — it opens the ntfy **app** directly
   on your private topic, already subscribed (this needs the ntfy app from
   step 1 — the button does nothing without it). Prefer doing it by hand? The
   copy button next to it copies your topic name to paste into ntfy's
   "Subscribe to topic".
4. Recommended: in the ntfy app's settings, allow it to run without battery
   restrictions (ntfy will prompt you). Otherwise some phones (especially
   Samsung/Xiaomi) delay or drop notifications to save power.

You subscribe **once per phone** — the same subscription covers all your
servers that use the same ntfy relay.

### What your private topic is

Your REEF app generates a random 128-bit topic name (like
`reef-3fa9c2…`). It's registered with your servers over your authenticated
connection and never shown to other users. The topic name is the only secret —
don't share it. If you ever want a fresh one, clear REEF's app data
(you'll need to re-add your servers).

---

## Troubleshooting

REEF tells you what's wrong: **Settings → Notifications → "Push while REEF is
closed"** shows a status per server.

| Status in REEF | What it means | Fix |
|---|---|---|
| **Ready — this server can push to this device** | Registration worked. | If you still get nothing: check Part 2 steps 2–4 (ntfy installed, subscribed, battery unrestricted). If it only fails while REEF is *open*, check the notification switches at the top of Settings → Notifications instead — that path doesn't use push at all. |
| **This server doesn't have the REEF plugin installed** | Push is a plugin feature. | Admin: install the [reef plugin](../plugins/reef/README.md#install). |
| **The server admin hasn't enabled push notifications** | Plugin is there, but **Push method** is `off`. | Admin: Part 1, step 1. |
| **Your role can't use plugins here** | Your role lacks the **Use Plugins** permission. | Admin: Part 1, step 2. |
| **This server pushes via Firebase, which this REEF build doesn't include** | The server chose the `fcm` method, which only works with self-built APKs. | Admin: switch to `ntfy`, or ship your own APK (see below). |
| **Couldn't set up push — retrying automatically** | A temporary error. | Wait ~30 s; if it persists, check the server's plugin logs. |

Still stuck? The classic gotchas, in order of likelihood:

1. **Use Plugins permission missing** (admin side — Part 1 step 2).
2. **ntfy app not subscribed** — open ntfy; your topic should be listed. If
   not, tap Subscribe in REEF again.
3. **Battery optimization killing ntfy** — Part 2 step 4.
4. **You're testing against yourself** — pushes are only sent when your REEF
   app looks *offline* to the server (no activity for ~3 minutes). Force-stop
   REEF, wait 3+ minutes, then have someone DM you.
5. **Notifications only for DMs and @mentions** — regular channel messages
   deliberately don't push.

---

## Other delivery methods (advanced)

The admin's **Push method** setting also offers:

- **`webhook`** — the plugin POSTs `{topic, title, body}` JSON to your own
  endpoint; delivery to phones is your infrastructure's job (Gotify,
  UnifiedPush bridge, etc.).
- **`fcm`** — Firebase Cloud Messaging, for communities that **build their own
  REEF APK** with their own Firebase project's `google-services.json`. Users
  install nothing extra, but official REEF builds are Firebase-free and cannot
  receive FCM. Setup details in the
  [plugin README](../plugins/reef/README.md#push-notifications-no-google-services-ever).

REEF itself never requires Google services: official builds contain no
Firebase code paths that run, and `off`/`ntfy`/`webhook` work fully without
them.
