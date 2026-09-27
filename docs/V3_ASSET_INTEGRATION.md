# Tiny Mint v3 asset integration

This pass promotes the completed v3 mascot and room art into the main Electron build.

## Mascot atlas

Production asset: `assets/sprites/mascot-atlas.png`

- 384 × 1536 PNG
- 4 columns
- 16 rows
- 96 × 96 source cells

Rows:

| Row | Animation | Main use |
|---:|---|---|
| 0 | idle | default state |
| 1 | walk | desktop wandering / leaving |
| 2 | blink | passive desktop blink |
| 3 | happy | post-drag / positive reaction |
| 4 | look | cursor direction |
| 5 | reach-right | cursor / room inspect |
| 6 | reach-left | cursor |
| 7 | tap | click reaction / room play |
| 8 | sit | chair, rug, cushion, music |
| 9 | sleep | bed / room rest |
| 10 | draw | desk |
| 11 | read | bookshelf / book |
| 12 | held | desktop pickup/drag |
| 13 | land | desktop drop |
| 14 | exercise | dumbbell |
| 15 | carry | sketchbook / corkboard show |

## Room props

All finished prop PNGs are in `assets/sprites/props/`.

| Prop | Behavior |
|---|---|
| door | return to desktop |
| corkboard | show/carry sketchbook |
| bookshelf | read |
| plant | inspect/reach |
| bed | sleep |
| chair | sit |
| desk | draw |
| music-player | sit + subtle sway |
| toy-box | play/tap |
| rug | sit |
| cushion | sit |
| ball | play/tap |
| dumbbell | exercise |
| sketchbook | carry |
| book | read |
| watering-can | inspect/reach |
| bong bonus art | manually triggered animated preview / inspect |

The room placement and anchors are derived from the v3 room prototype's 960×600 scene coordinates.

## Important implementation notes

- The v3 atlas must not be replaced by the old v2 384×768 atlas.
- `SpriteAnimator` no longer assumes four sequential frames for every animation.
- `held` and `land` are local interaction animations on the desktop; they do not need to become long-lived Creature Brain states.
- Some props intentionally reuse the nearest finished mascot animation because no dedicated v3 animation exists yet. In particular music uses `sit` plus a subtle sway, and plant/watering-can use reach/inspect.
- The supplied `assets/sprites/v3-source/bonus/bong/bong-strip-384x96.png` is rendered as a separate manual-only room prop. It is not inserted into the v3 mascot atlas and is excluded from autonomous room behavior. Its frame preview uses the supplied timing metadata and stops under reduced motion.
- Groq remains optional and separate from the sprite system. The current corkboard doodles are small local SVG motifs, not image-generation output. Notion, screen awareness, and relationship mechanics remain out of scope.
