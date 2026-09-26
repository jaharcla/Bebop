# Tiny Mint

Tiny Mint is a persistent, offline-first Windows desktop creature. He lives in a small transparent overlay, reacts to the pointer, wanders, visits a separate room, uses room objects, and preserves his state between launches.

## Run

```powershell
npm install
npm run dev
```

Build and run the production bundle:

```powershell
npm run build
npm start
```

Tests and type checks:

```powershell
npm test
npm run typecheck
```

## Controls

- Click Tiny Mint for a tap reaction.
- Drag the opaque sprite pixels to pick him up; the v3 held and landing animations are wired in.
- Right-click Tiny Mint or the tray icon for room, settings, location, pause, and quit controls.
- Double-click the tray icon or press `Ctrl+Shift+M` to open his room.
- Use Settings to toggle roaming, room visits and autonomy, cursor play, reduced motion, startup at login, and other preferences.
- In the room, click any prop to have Tiny Mint use it.
- The room's debug panel is visible only in development mode.
- Right-click Tiny Mint or the tray icon and choose **Talk** for an optional short conversation. Quick replies or a short typed reply are supported; Escape or the close button dismisses it.

Master pause stops autonomous simulation decisions while keeping windows and manual controls responsive. Reduced motion is visual-only: the app preference or the operating-system preference freezes sprite animation, but does not set or pause the creature's simulation.

Packaged Windows builds manage sign-in startup through Electron's login-item settings. Development builds retain the preference for the packaged app and log that OS startup registration is not applied; this does not prevent the app from running.

## Conversation

Tiny Mint's small speech bubble is separate from the desktop sprite window. User-requested Talk works while the creature is paused and while creature-initiated interactions are disabled. Autonomous check-ins are desktop-only, conservative, cooldown-limited, and become less frequent after ignored bubbles. Conversation does not pause his life, but automatic room transitions are discouraged until an active exchange ends.

Conversation works offline with a small deterministic local vocabulary. To enable optional Groq replies during development, copy `.env.example` to `.env`, add your key, and run `npm run dev`:

```powershell
copy .env.example .env
```

Edit `.env`:

```env
GROQ_API_KEY=<paste key>
GROQ_MODEL=openai/gpt-oss-20b
```

Development automatically loads this ignored file in Electron's main process. An environment-provided `GROQ_MODEL` overrides the default. The app starts normally and stays local if no key is configured. `.env` is not bundled with packaged builds; secret storage for packaged credentials is intentionally out of scope. The key never enters renderer code. Groq requests use strict structured output, time out, can be cancelled when a conversation closes, and fall back to local dialogue on service failures. Settings shows whether the active development voice is **Local voice** or **Groq ready** without revealing the key.

Only a compact mood/activity/personality summary and the last few conversation turns are sent to Groq. Transcripts are ephemeral and are not written to the state store. Tiny Mint does not capture the screen, keystrokes, microphone, webcam, clipboard, or browser activity.

See `docs/INTERACTIONS.md` for the interaction lifecycle, local fallback, and configuration details.

## V3 art integration

The main atlas is now the v3 `384×1536` mascot atlas: 16 rows of four 96×96 frame cells. The application knows all finished v3 animation families:

- idle, walk, blink, happy
- look, reach-right, reach-left, tap
- sit, sleep, draw, read
- held, land, exercise, carry

`SpriteAnimator` supports custom frame sequences and loop-from points, so draw/read and the settling loops for sit/sleep/held/carry play correctly instead of assuming a fixed `0→1→2→3` loop.

All 16 finished room props live in `assets/sprites/props/` and are used by the actual Electron room: bed, desk, chair, bookshelf, rug, plant, toy box, ball, dumbbell, music player, sketchbook, book, door, cushion, corkboard, and watering can.

See `docs/V3_ASSET_INTEGRATION.md` for the exact mappings. Individual v3 frame PNGs, strips, GIF previews, and source atlases are preserved under `assets/sprites/v3-source/` for future sprite work.

The optional user-supplied bong art pack is stored separately under `assets/sprites/v3-source/bonus/bong/`. It is source art only: it does not alter the production atlas, animation types, or autonomous behavior, and needs visual QA before any production use.

## Offline-first boundary

State is stored locally in Electron's per-user application data directory. No network, account, screen capture, Groq key, Notion integration, or activity monitoring is required for the creature to run.

The preserved v2 and v3 prototypes in `prototypes/` are visual references only. Do not re-extract the old v2 atlas over the v3 production atlas.
