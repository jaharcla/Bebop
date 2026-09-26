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
- Right-click Tiny Mint for room, pause, location, and quit controls.
- Double-click the tray icon or press `Ctrl+Shift+M` to open his room.
- In the room, click any prop to have Tiny Mint use it.
- The room's debug panel is visible only in development mode.

## V3 art integration

The main atlas is now the v3 `384×1536` mascot atlas: 16 rows of four 96×96 frame cells. The application knows all finished v3 animation families:

- idle, walk, blink, happy
- look, reach-right, reach-left, tap
- sit, sleep, draw, read
- held, land, exercise, carry

`SpriteAnimator` supports custom frame sequences and loop-from points, so draw/read and the settling loops for sit/sleep/held/carry play correctly instead of assuming a fixed `0→1→2→3` loop.

All 16 finished room props live in `assets/sprites/props/` and are used by the actual Electron room: bed, desk, chair, bookshelf, rug, plant, toy box, ball, dumbbell, music player, sketchbook, book, door, cushion, corkboard, and watering can.

See `docs/V3_ASSET_INTEGRATION.md` for the exact mappings. Individual v3 frame PNGs, strips, GIF previews, and source atlases are preserved under `assets/sprites/v3-source/` for future sprite work.

## Offline-first boundary

State is stored locally in Electron's per-user application data directory. No network, account, screen capture, Groq key, Notion integration, or activity monitoring is required for the creature to run.

The preserved v2 and v3 prototypes in `prototypes/` are visual references only. Do not re-extract the old v2 atlas over the v3 production atlas.
