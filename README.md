<div align="center">
  <h1>🪸 REEF</h1>
  <p><strong>A multi-server lobby client for <a href="https://github.com/Sharkord/sharkord">Sharkord</a></strong></p>
  <p>One app for all your Sharkord servers.</p>
</div>

## What is REEF?

REEF is a fork of [Sharkord](https://github.com/Sharkord/sharkord) focused on the **client**: instead of one browser tab per server, REEF connects to all your Sharkord servers at once — like a game lobby for your communities. Servers run stock Sharkord; everything REEF adds on the server side ships as a normal Sharkord plugin that admins can drop in (or not — REEF degrades gracefully).

> REEF is unofficial and not affiliated with the Sharkord project. Sharkord is by [Diogo Martino](https://github.com/diogomartino) and contributors — all the heavy lifting (voice/video engine, server, protocol) is theirs.

## What REEF adds

**Multi-server, natively**
- **Server rail** — connect to many servers simultaneously; reorder, recolor, rename tiles
- **Quick switcher** — a cross-server command palette
- **Unified inbox** — notifications from every server in one place, with Do-Not-Disturb and quiet hours
- **Saved messages** — bookmark messages across servers, stored on your device
- Stay in a voice call on one server while chatting on another

**Voice & sharing**
- **Push-to-talk and voice-activated** input modes — on the desktop app, push-to-talk works **globally** (while you're in a game) via a privacy-guarded OS hook
- **Soundboard** — mix clips into your outgoing mic
- **Switch screen-share source mid-share** — no black gap for viewers
- Noise suppression, noise gate, quality controls (from upstream Sharkord)

**Quality of life**
- **Push notifications without Google** — DMs and @mentions reach your phone even when the app is closed, via [ntfy](https://ntfy.sh) ([setup guide](docs/PUSH_NOTIFICATIONS.md))
- **GIF picker** (Klipy/Giphy) — searches proxied through the server plugin so API keys stay server-side
- **Custom status** — short status text visible to other REEF users on the server
- **In-app bug reports** — users report issues straight to the server operator's email
- Appearance settings (accent color, text scale), desktop tray/startup options, custom title bar

**For server admins: the REEF companion plugin**
A single plugin (`plugins/reef`) with an **admin switchboard** — every REEF feature above that touches the server has its own on/off toggle in Settings → Plugins. Runs on a stock Sharkord server; harmless to clients that don't use it. See [plugins/reef/README.md](plugins/reef/README.md).

## Download

Grab the latest from the [Releases](https://github.com/reef-sharkord/reef/releases) page:

- **Windows desktop** — `REEF-Setup-<version>.exe` (auto-updates) or the portable exe. Builds are unsigned, so SmartScreen will warn on first run: **More info → Run anyway**.
- **Android (⚠️ work in progress)** — `REEF-Android-<version>-WIP.apk`. A debug-signed preview build: expect rough edges, battery-hungry background behavior, and missing features. Install by opening the APK on the phone (allow "install from unknown sources").
- **Server admins** — `reef-plugin-<version>.zip`: unzip into your Sharkord server's `plugins/reef` and enable it in Settings → Plugins. The server itself is stock [Sharkord](https://github.com/Sharkord/sharkord/releases).

## Apps

| App | Status |
| --- | --- |
| Web client (`apps/client`) | ✅ the core of REEF |
| Desktop (`desktop/`, Electron) | ✅ auto-updating shell with global PTT, tray, unread badges, in-app screen picker |
| Mobile (`mobile/`, Capacitor) | ⚠️ **work in progress** — installable Android preview, expect rough edges |
| Server (`apps/server`) | tracks upstream Sharkord — REEF deliberately does not fork server internals |

## Development

REEF uses [Bun](https://bun.sh) workspaces, same as upstream:

```bash
bun install
# terminal 1 — server
cd apps/server && bun dev
# terminal 2 — client
cd apps/client && bun dev
```

`bun run magic` runs the full format + typecheck + lint gate. See [DEVELOPMENT.md](DEVELOPMENT.md) for more.

## License

MIT, same as upstream — see [LICENSE](LICENSE). Portions copyright the Sharkord contributors; REEF additions copyright the REEF contributors.

## Acknowledgments

Sharkord is built with [Bun](https://bun.sh), [tRPC](https://trpc.io), [Mediasoup](https://mediasoup.org), [Drizzle ORM](https://orm.drizzle.team), [React](https://react.dev), [Radix UI](https://www.radix-ui.com), [ShadCN UI](https://ui.shadcn.com/) and [Tailwind CSS](https://tailwindcss.com). Support the upstream project: [ko-fi](https://ko-fi.com/B0B71U3476).

<div align="center">
  <p>🦈 REEF — A Sharkord Lobby</p>
</div>
