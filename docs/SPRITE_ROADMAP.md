# Sprite coverage against the product plan

Existing assets: idle, walk, blink, happy wave, four directional looks, reach left, reach right, and tap reaction. Cursor interactions operate only inside the preview. This pack is not yet a desktop application.

Create the following assets when implementing their behaviors; use STYLE-REFERENCE.md and the actual atlases as references. These are planned assets, not included sprites.

| Behavior | Required poses / animation | Playback |
|---|---|---|
| Sit nearby | stand-to-sit, seated breathing, sit-to-stand | transition, loop, transition |
| Sleep | yawn, lie down, sleeping breathing, wake and stretch | transitions plus loop |
| Doodle | take out sketchbook, draw, pause to inspect, put away | transitions plus loop |
| Carry / show object | pick up, carry idle, carry walk, present, put down | transitions and loops |
| Drag / pick up | lifted surprise, suspended wiggle, released landing | entry, loop, exit |
| Pet | notice touch, contented eyes, settle | short reaction |
| Read | open book, read, page turn, close book | transitions and loop |
| Exercise | ready pose, lift, lower, rest | loop and recovery |
| Music | gentle head bob, alternate sway | loop |
| Room travel | walk, threshold enter/exit | reuse walk plus transition |
| Expressions | focused, sleepy, concerned, confused, proud, contemplative | holds / blink variants |
| Room | bed, rug, desk, chair, bookshelf, sketchbook, toy box, plant, shelf, dumbbell, music player | static props; animated parts only when used |

Implement silent activities before extra conversation. No guilt or rejection animation for ignored interactions. Cursor attention should be brief and optional rather than compulsive chasing. Never claim room objects, activities, awareness, or Groq integration exist merely because the asset roadmap lists them.

## v3 delivery update
Supersedes the original coverage summary above: sitting, sleeping, drawing, reading, held/dangling, landing, exercise, sketchbook carry, and all sixteen initial room props now have artwork. Interactions are connected in room-preview.html. Entry/recovery frames are limited; dedicated stand-up, waking, watering, object-specific carry and music-bob sprites remain future polish. Do not interpret the earlier table as all still missing or all fully implemented.
