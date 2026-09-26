# Architecture

## Processes and windows

Electron's main process owns the long-lived simulation, persistence, a 192×192 transparent overlay, the tray, and the optional room window. Closing the room destroys only that renderer; the Creature Brain continues running. Context-isolated preload IPC exposes a narrow interaction API.

The overlay is deliberately sprite-sized rather than monitor-sized. Transparent atlas pixels use Electron's forwarded click-through mode, while opaque pixels remain clickable and draggable. Movement is clamped to the nearest display work area.

## Creature Brain

`CreatureBrain` owns serializable creature state, including horizontal facing, bounded corkboard history, needs, personality, preferences, timestamps, desktop position, and the room target. It updates at 100 ms while a physical plan is active and 500 ms while idle. Needs advance at one-second granularity; suspend/resume rebases the active plan rather than simulating missed time.

Room activities use timed multi-step plans with movement, explicit facing, interaction, pickup/drop, and safe cleanup on interruption. Horizontal movement updates facing while vertical movement preserves it. The facing wrapper mirrors the body and carried item without interfering with movement/activity transforms.

## Rendering

Both renderers use `SpriteAnimator` and the v3 `384×1536` atlas. Each mascot cell is 96×96 and all rendering keeps canvas smoothing disabled.

The animation engine supports:

- arbitrary frame sequences (for example draw/read `0→1→2→1→3`)
- custom per-step durations
- `loopFrom` settling loops
- directional held frames
- one-shot-to-idle animations
- one-shot hold animations

Desktop dragging uses `held` while Tiny Mint is picked up and `land` on release. The room renderer uses the real v3 prop PNGs and chooses sit/sleep/draw/read/exercise/carry/reach/tap animations according to the selected object.

## Room

The room renderer is a lightweight DOM scene using the same 960×600 coordinate system as the v3 room prototype. Prop positions and interaction anchors are defined in `src/creature/room/roomProps.ts`. The visual assets themselves are bundled through Vite from `assets/sprites/props/`.

The room remains a view onto persistent creature state; it is not the simulation owner. Completed art plans may pin a local motif on the corkboard; six are retained and rotate as new sketches arrive. When the room window closes, the brain continues selecting room activities and targets.

## Persistence and events

`StateStore` validates schema-versioned JSON, writes atomically, and rotates a validated primary into `creature-state.backup.json`. A corrupt primary recovers from a valid backup; if neither is usable, defaults are loaded and a development warning is emitted. Export contains creature state/history only, never Groq credentials or conversation messages.

## Future boundaries

The focused private alpha has optional Groq dialogue, quiet mode, and deterministic noncommittal local replies. Screen/activity awareness and reliable fullscreen-app detection remain absent. Dialogue providers cannot own the creature lifecycle.
