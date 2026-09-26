# Tiny Mint conversations

## Boundaries

Creature Brain continues to own simulation, mood, movement, animation, and room behavior. `InteractionController` owns whether a creature-initiated check-in is appropriate and the short-lived conversation session. A `DialogueProvider` supplies language only; it cannot direct movement or activity.

Conversation is a small desktop-only speech window, not a transcript panel. It follows overlay movement and is clamped to the active display work area. The user can start Talk from Tiny Mint's context menu or the tray, including while paused or while creature-initiated interactions are disabled. If Tiny Mint is in his room, Talk brings him to the desktop first.

While a conversation is active, the creature continues to simulate. Autonomous room transitions are temporarily excluded, but other activities and manual controls remain available. User and creature messages are kept in memory only, with a six-message limit.

## Initiation and dismissal

Autonomous speech is driven by meaningful mood/location transitions and a delayed long-quiet timer, not a per-tick language request. Startup has a 5–10 minute grace period and speech has a randomized cooldown of 8–15 minutes by default. One ignored check-in raises the delay to 12–20 minutes; repeated ignored check-ins raise it to 20–35 minutes, with additional long-quiet spacing. Recent user activity, pause, room location, disabled interactions, active sessions, low social interest, sleepiness, and busy activity stretch or suppress initiation. These timers are intentionally conservative.

Unengaged creature-initiated bubbles quietly expire after 25 seconds. Hovering, focusing, or replying cancels that timeout. The user can dismiss any session with Escape or the close button. After three exchanges, a session closes shortly after Tiny Mint's final reply.

## Providers

`LocalDialogueProvider` always works offline and uses a compact, intentionally limited vocabulary. If `GROQ_API_KEY` is present, `GroqDialogueProvider` uses Groq's OpenAI-compatible chat-completions endpoint. `GROQ_MODEL` is optional and defaults to `openai/gpt-oss-20b`:

```powershell
$env:GROQ_API_KEY = "your-key"
$env:GROQ_MODEL = "openai/gpt-oss-20b" # optional override
npm run dev
```

Use the same environment variables when launching a packaged app from a process that has them configured. `.env.example` documents the names; the application does not automatically read `.env`. The API key remains in the Electron main process and is never exposed through the context bridge. Calls have a 10-second abort timeout and are cancelled when their conversation closes. Requests preserve user/creature message roles, send only a qualitative compact creature context plus six recent messages, use Groq strict JSON Schema output, low reasoning effort, and validate/bound every returned field. HTTP, timeout, parse, and validation failures use local dialogue instead. A 401/403 disables further Groq attempts for the current runtime so bad credentials cannot create a retry storm.

## Privacy

No conversation history is persisted. When Groq is configured, only mood, energy, current activity, location, selected personality values, the interaction trigger, and up to six recent conversation messages are sent. Tiny Mint does not collect screenshots, OCR, keystrokes, browser history, clipboard contents, microphone, or webcam input.

## Tests and limitations

`npm test` covers initiation policy, ignored-bubble cooldowns, response validation, local dialogue, Groq failure fallback, and speech-window placement including negative multi-monitor coordinates. Electron smoke verifies Talk with autonomous interactions disabled, speech rendering and on-screen bounds, a quick reply, custom text, Escape dismissal, ongoing brain activity, and room handoff afterward. Groq remains optional; no credentialed request is needed for normal operation or smoke testing. The default model can be overridden if Groq's available model catalog changes.
