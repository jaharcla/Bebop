# Tiny Mint conversations

## Boundaries

Creature Brain continues to own simulation, mood, movement, animation, and room behavior. `InteractionController` owns whether a creature-initiated check-in is appropriate and the short-lived conversation session. A `DialogueProvider` supplies language only; it cannot direct movement or activity.

Conversation is a small desktop-only speech window, not a transcript panel. It follows overlay movement and is clamped to the active display work area. The user can start Talk from Tiny Mint's context menu or the tray, including while paused or while creature-initiated interactions are disabled. If Tiny Mint is in his room, Talk brings him to the desktop first.

While a conversation is active, the creature continues to simulate. Autonomous room transitions are temporarily excluded, but other activities and manual controls remain available. Quiet mode suppresses creature-initiated sessions and dismisses an unengaged autonomous bubble; a user-requested Talk session and manual room controls remain usable. User and creature messages are kept in memory only, with a six-message limit.

## Initiation and dismissal

Autonomous speech is driven by meaningful mood/location transitions and a delayed long-quiet timer, not a per-tick language request. Startup has a 5–10 minute grace period and speech has a randomized cooldown of 8–15 minutes by default. One ignored check-in raises the delay to 12–20 minutes; repeated ignored check-ins raise it to 20–35 minutes, with additional long-quiet spacing. Recent user activity, pause, room location, disabled interactions, active sessions, low social interest, sleepiness, and busy activity stretch or suppress initiation. These timers are intentionally conservative. The first check-in uses the same path and defaults to Local voice when no provider is configured.

Optional **Basic Awareness** uses Electron's local OS idle-time counter to distinguish active from away after five minutes without input. This check runs only when explicitly enabled, stays in the main process, and gates creature-initiated speech while away. It does not inspect typed input, the foreground app, or screen content, and it is not sent to Groq or persisted. Manual Talk remains available.

Unengaged creature-initiated bubbles quietly expire after 25 seconds. Hovering, focusing, or replying cancels that timeout. The user can dismiss any session with Escape or the close button. After three exchanges, a session closes shortly after Tiny Mint's final reply.

## Providers

`LocalDialogueProvider` always works offline and uses a compact, intentionally limited vocabulary. For arbitrary typed replies it uses neutral acknowledgments and follow-up prompts; it does not claim semantic understanding. During development, copy `.env.example` to `.env`, add the key, and run `npm run dev`:

```powershell
copy .env.example .env
npm run dev
```

Set `GROQ_API_KEY` and, optionally, `GROQ_MODEL=openai/gpt-oss-20b` in `.env`. Development loads it only into Electron's main process; existing parent-process variables take precedence. Without a key, the app starts with the local voice. `.env` is gitignored and is not packaged. Packaged users may save a key in Settings; it is encrypted by Electron safeStorage on supported Windows installations and is never included in creature-state exports.

The API key is never exposed through the context bridge. Calls have a 10-second abort timeout and are cancelled when their conversation closes, Tiny Mint goes home, or the app exits. Requests preserve user/creature message roles, send only a qualitative compact creature context plus six recent messages, use Groq strict JSON Schema output, low reasoning effort, and validate all returned fields. HTTP, timeout, network, parse, and schema failures use local dialogue instead. A 401/403 disables further Groq attempts for the current runtime so bad credentials cannot create a retry storm. Settings shows only **Local voice** or **Groq ready**, never the key.

## Privacy

No conversation history is persisted. When Groq is configured, only mood, energy, current activity, location, selected personality values, the interaction trigger, and up to six recent conversation messages are sent. Basic Awareness is not part of that request. Tiny Mint does not collect screenshots, OCR, keystrokes, browser history, clipboard contents, microphone, or webcam input.

## Tests and limitations

`npm test` covers initiation policy, ignored-bubble cooldowns, presence gating, first-speech QA startup, response validation, local dialogue, prompt roles/context, environment loading, request cancellation, Groq failure fallback, transient desktop animation recovery, and speech-window placement including negative multi-monitor coordinates. `npm run smoke` verifies settings round-trip for Basic Awareness, local first autonomous speech, room asset loading, Talk, speech placement, replies, and room handoff. The development-only room debug panel can trigger a cooldown-bypassing check-in and simulate active/away presence; those controls are unavailable in packaged builds. Groq remains optional; no credentialed request is needed for normal operation or smoke testing. The default model can be overridden if Groq's available model catalog changes. The provider layer owns normal local fallback; the controller has a final local safety fallback only for unexpected provider/validation failures.
