# Tiny Mint Context-Aware Behavior Implementation

This bundle implements the revised behavior plan against:

- Repository: `jaharcla/Bebop`
- PR #3 tested head: `51786dce77719fb38ebd6c064b640b2ddfa33187`
- It also tolerates the partial ChatGPT type-only commit `5f81e85054b5167e77785d9ce6f382fb0eeed142`.

## What it changes

- Focus-session tracking with a privacy-preserving `focused / recently-finished / none` signal.
- Desktop context passed into room behavior scoring.
- Strong suppression of disruptive room actions during sustained focus.
- More relaxed/varied room behavior after focus and during media use.
- Fullscreen/away handling for room behavior.
- Origin-aware habit learning so autonomous RNG barely changes long-term affinity.
- Existing novelty/repetition tracking remains active for autonomous behavior.
- Coarse app classification for terminal/chat/presentation apps.
- A separate dialogue `VoiceProfile`.
- Coarse desktop/focus context in Groq dialogue prompts.
- Context-aware local fallback dialogue.
- Focus-aware autonomous speech suppression.
- Less intrusive cursor nudges during focused work.
- Unit/statistical tests for the new architecture.

## Deliberate choices

- Existing personality numbers are **not** silently replaced. The prior plan explicitly marked proposed values illustrative.
- Raw keystrokes, window titles, screen contents, browser contents, and document contents are not added.
- Focus-session timestamps stay in the main process and are not persisted to `CreatureState`.
- Existing autonomy/cooldown checks remain in place rather than being duplicated.
- Clock-based room weighting remains a weak prior; live context is stronger.

## Apply

```powershell
python .\apply_tinymint_behavior.py C:\path\to\Bebop --validate
```

If applying after additional commits:

```powershell
python .\apply_tinymint_behavior.py C:\path\to\Bebop --force --validate
```

Then, on Windows/Electron:

```powershell
cd C:\path\to\Bebop
npm run smoke
```

Review before committing:

```powershell
git status
git diff
```

Suggested commit message:

```text
Add context-aware Tiny Mint behavior and focus learning
```
