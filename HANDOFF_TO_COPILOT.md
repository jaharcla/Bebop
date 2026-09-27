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

## Interaction milestone

- The separate speech window and typed `InteractionController` now own sessions and initiation timing; the Creature Brain remains deterministic and owns creature life/state.
- Right-click Tiny Mint or use the tray menu's Talk command for a short conversation. The dedicated compact bubble offers up to three quick replies or a 500-character custom response; Escape and the close button dismiss it.
- Creature-initiated check-ins use mood/location transitions and a delayed long-quiet trigger, with startup grace, an 8–15 minute baseline cooldown, and longer cooldowns after ignored bubbles. The existing `interactionsEnabled` preference controls only creature-initiated speech.
- Local dialogue works without configuration. In development, copy `.env.example` to `.env` and add `GROQ_API_KEY`; `GROQ_MODEL` defaults to `openai/gpt-oss-20b`. The main process alone reads the ignored `.env`; packaged apps do not bundle it. Requests use strict JSON Schema, qualitative runtime context, cancellation, validation, and local fallback; 401/403 credentials are latched for the runtime.
- The last six conversation messages live in memory only. No screen awareness, keystroke, microphone, webcam, clipboard, or browser monitoring was added.
- Speech placement is a pure tested calculation and follows overlay movement; active conversation discourages autonomous room transitions without pausing simulation.
- The supplied bong pack remains outside the mascot atlas and is integrated as a manually triggered animated room-art preview; autonomous behavior never selects it.

## Living behavior and alpha reliability

- Room action plans now include object-facing steps. Horizontal movement sets persistent facing; vertical movement preserves it. Facing mirrors the body and carried item together without replacing the room creature's positioning or activity transforms.
- Desktop horizontal travel and cursor approach update facing; per-pixel hit testing samples the actually rendered canvas. Room exits approach the door before transitioning; desktop arrival uses the nearest edge and faces inward.
- Completed art routines occasionally pin one of seven locally drawn SVG motifs to the room corkboard. At most six sketches are retained in the local state.
- The brain uses 100 ms updates while an action plan is active and 500 ms while idle. Suspend/resume rebases action clocks, and display changes reclamp the overlay to the current work area.
- State schema 4 validates saved values, rotates a known-good backup, recovers from a corrupt primary, and exports creature state without credentials or conversations. Reset asks for native confirmation and does not touch the secure Groq key.
- Quiet mode suppresses creature-initiated conversations; manual Talk and room interactions remain available. Offline replies to arbitrary user text are intentionally noncommittal.
- Windows CI runs `npm ci`, typecheck, tests, and build. Electron smoke and full routine visual checks remain manual QA.
- Optional Basic Awareness uses only local OS idle time, gates creature-initiated speech while away, defaults off, and is not persisted or sent to a provider.
- Desktop reach/land reactions are renderer-owned transient animations that restore the latest underlying activity; room `once-hold` animations remain indefinite until an explicit state change.
- Development room QA controls can trigger a cooldown-bypassing autonomous check-in and simulate active/away presence. Production builds omit those QA controls.

## Recommended next task

Run a focused private-alpha pass on the full book, watering, art, play, and room-exit routines on representative Windows displays. Confirm the user-facing exports and save recovery with real profile backups. Do not add new world systems or alter the v3 atlas without a concrete alpha finding.

## Toggleability and stability pass

- Creature Brain remains the authoritative owner of position; desktop wandering synchronizes position without publishing a state event every movement frame.
- Persistent preferences now cover desktop roaming, room visits, room autonomy, cursor play, future creature-initiated interactions, reduced motion, master pause, always-on-top, and Windows login startup.
- Activity choices respect pause and the roaming / room-visit / room-autonomy preferences. Manual room props and transitions remain available.
- The separate Settings window is reachable from the tray and creature context menus.
- Schema-v1 hydration merges nested position, room, privacy, personality, and preference defaults, so older partial preferences gain new controls without deleting saves.
- Reduced motion (including the Windows preference) only freezes visual sprite animation. It never silently changes master pause.
- `npm run typecheck`, `npm test`, `npm run build`, and the Electron smoke cover the preference and room-handoff paths.
