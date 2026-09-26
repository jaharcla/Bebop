# Architecture

## Processes and windows

Electron's main process owns the long-lived simulation, persistence, a 192×192 transparent overlay, the tray, and the optional room window. Closing the room destroys only that renderer; the Creature Brain continues running. Context-isolated preload IPC exposes a narrow interaction API.

The overlay is deliberately sprite-sized rather than monitor-sized. Transparent atlas pixels use Electron's forwarded click-through mode, while opaque pixels remain clickable and draggable. Movement is clamped to the nearest display work area.

## Creature Brain

`CreatureBrain` owns serializable creature state. Mood, activity, location, internal needs, personality, preferences, privacy defaults, timestamps, desktop position, and current room target are independent of UI. The local behavior engine chooses weighted non-repeating activities.

Room activities now include sitting, sleeping, drawing, reading, exercising, carrying/showing, inspecting, playing, and listening to music. Clicking a room prop sends a typed `RoomPropId` to the brain, which maps it to the appropriate activity, animation, and persistent target.

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

The room remains a view onto persistent creature state; it is not the simulation owner. When the room window closes, the brain continues selecting room activities and targets.

## Persistence and events

`StateStore` writes schema-versioned JSON atomically to Electron `userData` and falls back to defaults for corrupt or incompatible data. Existing schema-v1 saves remain compatible because the original room targets (`rug`, `bed`, `desk`) are still valid members of the expanded room target type.

## Future boundaries

Awareness and AI are intentionally absent. Future providers should consume opt-in, summarized context and return suggestions to the brain; neither should own the creature lifecycle. Conversation, memory, doodle generation, and CourseAI/Notion integration can be added on top of the current deterministic creature foundation.
