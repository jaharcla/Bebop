# Copilot handoff — Tiny Mint after v3 sprite integration

## What is already done

The v3 art pack has been promoted into the real Electron/TypeScript app.

- Production mascot atlas is now the 16-row `384×1536` v3 atlas.
- All 16 mascot states are typed and registered: idle, walk, blink, happy, look, reach-right, reach-left, tap, sit, sleep, draw, read, held, land, exercise, carry.
- `SpriteAnimator` now supports arbitrary frame sequences, per-step durations, `loopFrom`, one-shot-to-idle, one-shot-hold, and directional frames.
- Desktop dragging uses `held`; dropping uses `land` before returning to normal state.
- All 16 finished room props are bundled and rendered in the actual room window.
- Room prop clicks are routed through typed IPC to `CreatureBrain.useRoomProp()`.
- Room behaviors are mapped to the intended finished animation: sleep, sit, draw, read, exercise, carry/show, inspect/reach, play/tap, music/sit+sway, and door→desktop.
- Autonomous room behavior can now choose sleep, sit, draw, read, exercise, or return to desktop.
- Existing schema-v1 persisted state remains compatible.
- V3 source frames, strips, GIF previews and source atlases are preserved in `assets/sprites/v3-source/`.

## Important files

- `src/ui/SpriteAnimator.ts`
- `src/creature/animation/catalog.ts`
- `src/creature/room/roomProps.ts`
- `src/creature/brain/CreatureBrain.ts`
- `src/creature/behavior/behaviorEngine.ts`
- `src/ui/overlay.ts`
- `src/ui/room.ts`
- `src/ui/room.css`
- `assets/sprites/mascot-atlas.png`
- `assets/sprites/props/`
- `docs/V3_ASSET_INTEGRATION.md`

## Validation already performed

- TypeScript renderer typecheck passed.
- TypeScript Electron/main-process typecheck passed.
- Electron/main-process sources were compiled successfully.
- Manual core check instantiated the compiled Creature Brain and verified all 16 props map to the expected target/animation.
- Asset check verified the production atlas is exactly `384×1536` and all 16 prop PNGs are present at `160×160`.

`npm test` / Vite build could not be run in the handoff environment because the uploaded `node_modules` came from Windows and lacks the Linux Rollup native optional dependency. On the target Windows machine, run a clean `npm install`, then `npm run typecheck`, `npm test`, `npm run build`, and `npm run smoke`.

## Do not regress

- Do not replace the v3 production atlas with the old v2 `384×768` atlas.
- Do not simplify `SpriteAnimator` back to a fixed four-frame sequential loop.
- Do not replace finished room prop sprites with CSS placeholder furniture.
- Keep the deterministic creature functional without Groq/Notion.

## Recommended next task

Run the app on Windows and visually QA every v3 state/prop interaction. Fix only integration/layout issues first. Once the art pass is confirmed, continue with the planned speech-bubble / quick-response interaction layer or computer-awareness layer rather than reworking the sprite system again.

## Toggleability and stability pass

- Creature Brain remains the authoritative owner of position; desktop wandering synchronizes position without publishing a state event every movement frame.
- Persistent preferences now cover desktop roaming, room visits, room autonomy, cursor play, future creature-initiated interactions, reduced motion, master pause, always-on-top, and Windows login startup.
- Activity choices respect pause and the roaming / room-visit / room-autonomy preferences. Manual room props and transitions remain available.
- The separate Settings window is reachable from the tray and creature context menus.
- Schema-v1 hydration merges nested position, room, privacy, personality, and preference defaults, so older partial preferences gain new controls without deleting saves.
- Reduced motion (including the Windows preference) only freezes visual sprite animation. It never silently changes master pause.
- `npm run typecheck`, `npm test`, `npm run build`, and the Electron smoke cover the preference and room-handoff paths.
