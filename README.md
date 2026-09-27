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

Create Windows installer and portable release artifacts:

```powershell
npm run dist
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
- Use Settings to toggle roaming, room visits and autonomy, cursor play, quiet mode, reduced motion, startup at login, and other preferences.
- In the room, click a prop to have Tiny Mint walk over and use it. The bonus bong sprite preview is manual-only and never enters autonomous routines. Completed drawing routines may leave a small local doodle on the corkboard.
- Optional Basic Awareness notices active/away status from local system idle time only. It can defer autonomous check-ins while you are away; it never reads screen or app content and is off by default.
- Settings can export a JSON backup of creature state and room history. The export excludes Groq credentials and ephemeral conversations; reset requires native confirmation and does not clear the saved key.
- The room's debug panel is visible only in development mode.
- Right-click Tiny Mint or the tray icon and choose **Talk** for an optional short conversation. Quick replies or a short typed reply are supported; Escape or the close button dismisses it.

Master pause stops autonomous decisions and room plans while keeping manual controls responsive; manually requested room routines can continue while paused. Reduced motion is visual-only: the app preference or the operating-system preference freezes sprite animation, but does not set or pause the creature's simulation. Quiet mode suppresses creature-initiated speech; manual Talk remains available.

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

Development automatically loads this ignored file in Electron's main process and prefers it over a securely saved key. An environment-provided `GROQ_MODEL` overrides the default. The app starts normally and stays local if no key is configured. `.env` is not bundled with packaged builds. Packaged users can save a key in Settings; Electron encrypts it with Windows secure storage under the app's user-data directory, and the saved value is never returned to the renderer. If secure storage is unavailable, Tiny Mint stays on Local voice rather than storing plaintext. Groq requests use strict structured output, time out, can be cancelled when a conversation closes, and fall back to local dialogue on service failures.

Only a compact mood/activity/personality summary and the last few conversation turns are sent to Groq. Transcripts are ephemeral and are not written to the state store. Tiny Mint does not capture the screen, keystrokes, microphone, webcam, clipboard, or browser activity.

When Basic Awareness is enabled, the main process samples only the operating system's idle-time counter locally. It is not sent to dialogue providers or persisted.

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

The optional user-supplied bong art pack remains outside the v3 mascot atlas and is integrated as a manually triggered animated room-art preview. Tiny Mint can inspect it, but autonomous behavior never selects it. The preview honors reduced motion.

## Offline-first boundary

State is stored locally in Electron's per-user application data directory. Tiny Mint validates saves, keeps a last-known-good backup, and can recover it if the primary file is damaged. The app reclamps him when display work areas change and rebases active routines after system suspend. No network, account, screen capture, Groq key, Notion integration, or activity monitoring is required for the creature to run; Basic Awareness is an optional, local-only idle-time signal.

Tiny Mint is currently a focused private alpha. Windows CI runs typecheck, unit tests, and the production renderer/main-process build. `npm run smoke` exercises the Electron windows, speech handoff, Basic Awareness settings round-trip, and bonus prop asset loading; visual review of the sprite preview and full routines remains manual QA. The room's development-only debug panel can trigger an autonomous check-in and simulate local presence. Fullscreen-app detection and battery-impact claims are intentionally deferred.

The preserved v2 and v3 prototypes in `prototypes/` are visual references only. Do not re-extract the old v2 atlas over the v3 production atlas.
