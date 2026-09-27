# Tiny Mint product plan

## Current stage: focused private alpha

Tiny Mint is a local-first Windows desktop companion. The current build includes:

- A transparent, draggable desktop creature with per-pixel hit testing, cursor reactions, roaming, pause, and reduced-motion controls.
- A separate room with the 16 v3 props plus a manually triggered animated bonus-art preview, personality-weighted routines, movement, item carrying, and interruption cleanup.
- Eight bounded personality traits, needs, short-lived impulses, novelty, and persisted activity/prop habits.
- Optional short conversations: limited offline voice by default, conservative first check-in, opt-in Groq replies with secure packaged credential storage, and optional local idle-only Basic Awareness.
- Local state migration and backup recovery, bounded corkboard sketch history, quiet mode, and JSON state export.
- Windows installer/portable packaging and automated Windows typecheck, test, and build validation.

This is a private alpha, not evidence of product-market fit. The product does not claim deep local language understanding or awareness of other applications. Basic Awareness only classifies the OS idle timer as active or away; it does not inspect screen or application content.

## Current work

Make the existing behavior believable and reliable: consistent facing, coherent object interactions, desktop activity animations that recover after transient cursor reactions, visible persistent room history, safe save recovery, low-attention controls, and real user observation of full routines. Keep the existing v3 sprite atlas and deterministic local simulation.

## Deferred

- Reliable fullscreen/game detection, because the current stack has no dependable cross-app foreground signal.
- Battery and long-duration resource characterization across machines; no battery impact is claimed.
- Broader desktop-world actions beyond safe movement, cursor response, and room transitions.
- New mascot sprite families, cloud accounts, screen/cross-app awareness, generated art, social progression, mobile/macOS, and commercial/distribution strategy.

Revisit deferred work only when private-alpha observation identifies a concrete need.
