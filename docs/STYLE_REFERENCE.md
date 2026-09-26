# Tiny Mint — standing sprite direction

User preference, September 25, 2026: For future requests in this companion project that need sprites, create the sprites in this same style and include the animation frames required for the requested behavior. Do not leave requested sprite-dependent features with placeholder art. Reuse existing matching assets where appropriate. Apply this as the default unless the user changes the visual direction.

## Visual identity
Reference: `source-atlas.png`, `cursor-source-atlas.png`, and `mascot-atlas.png` in the Tiny Mint Mascot Pack v2. Use these actual images as generation references rather than relying only on this description.

- Huge rounded head, roughly 65–75% of visual mass; exceptionally small bipedal torso.
- Mint/light green main color, powder-blue rounded ears, beige face/belly/feet, dark teal outline.
- Large dark expressive eyes, simple mouth, tiny arms and short separated feet.
- Cute, curious, slightly goofy, comforting; compact silhouette.
- Simple chunky pixel art, limited shading, no thin details or cluttered accessories.
- Match existing palette, outline weight, head/body scale, and facial geometry.
- For new objects, environments, props, or characters, preserve this palette and pixel-art treatment; only the mascot must preserve its exact character identity.

## Export and animation convention
Transparent PNG, consistent 96 × 96 frame cells for this character, four columns. Keep baseline and scale aligned. Size larger props/scenes as needed; document their cell dimensions. Do not force every animation into four frames if it needs more. Include timing and looping/hold/one-shot behavior in JSON. Deliver an updated working preview and GIF previews when useful. Inspect frames for crop errors and identity drift.

Current states: idle, walk, blink, happy wave, directional look (left/up/right/down), reach right, reach left, tap reaction. Reach plays once then holds; direction frames are selected by cursor location rather than cycled as a loop; tap is one-shot. Retain room for idle recovery and state transitions.

Future chats: use this document plus the latest asset pack as the handoff reference. This file preserves the preference; it does not install an account-wide skill or guarantee that another chat will automatically load it.

## v3 assets
The current pack extends to 64 character frames plus 16 room props. Added character rows: sit, sleep, draw, read, held/dangling, landing, exercise, and carrying a sketchbook. Use the latest source atlases as references. The interactive room demonstrates prop sizing and anchors; refer to room-engine.js. The earlier sprite roadmap is a planning document and has not been fully implemented (e.g. genuine watering, eight-direction views and distinct wake-up transitions still need dedicated art).
