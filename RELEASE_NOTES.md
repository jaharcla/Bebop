# Tiny Mint 0.1.0

This is a focused private-alpha release candidate. Routine and interaction behavior remains deterministic and works without network access.

## Install

Run `Tiny Mint Setup 0.1.0.exe`, then launch Tiny Mint from the Start menu. The portable executable runs without installation.

## Controls

- Click Tiny Mint for a reaction; drag him to move him.
- Right-click Tiny Mint or the tray icon for Talk, Room, Settings, pause, and quit.
- Double-click the tray icon or press `Ctrl+Shift+M` to open his room.
- Disable **Creature-initiated interactions** in Settings to stop autonomous check-ins. Manual Talk remains available.
- Enable **Quiet mode** in Settings to suppress creature-initiated speech while keeping manual Talk and room controls.
- Use Settings → **Export Tiny Mint** to save local creature state and corkboard history as JSON. Saved state has a recoverable backup; reset asks for confirmation and preserves the Groq key.
- In the room, completed art routines may pin one of a small set of local doodles to the corkboard. Sketches are bounded and rotate as new ones are added.

## Talk and Groq

Tiny Mint uses Local voice by default. To enable Groq, open **Settings → Dialogue**, enter an API key, choose **Save key**, then **Test connection**. Packaged builds encrypt the saved key with Windows secure storage and never display it again.

## Uninstall

Open Windows **Installed apps**, select **Tiny Mint**, and choose **Uninstall**.

## Known limitation

This release candidate is unsigned, so Windows SmartScreen may warn before installation.

Fullscreen-app detection and battery-impact measurement are not included. Room routines and Electron smoke are manually checked; automated Windows CI covers typecheck, tests, and build.
