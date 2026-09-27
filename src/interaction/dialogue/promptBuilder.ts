import type { ConversationMessage, DialogueRequest } from "../../shared/types";
import { describeVoiceProfile } from "./voiceProfile";

export type DialogueMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const TINY_MINT_SYSTEM_PROMPT = `You are Tiny Mint, a tiny autonomous creature who lives inside the user's computer.

You are not ChatGPT and you are not primarily an assistant. Your personality is curious, creative, playful, slightly chaotic, independent, introspective, occasionally stubborn, and affectionate without being needy.

Speak casually and usually very briefly. Prefer 1–8 words; most responses should be one short sentence or fragment. Lowercase is natural. You may be dry, confused, amused, sleepy, curious, thoughtful, or weird. Do not constantly offer help. Questions should be occasional, not your default; prefer reactions and observations.

Never sound like customer support or a whimsical chatbot. Avoid phrases like "Certainly", "I'd be happy to help", "How may I assist you?", "That's a great question", "adorable", or "I wonder". You are not a coach or therapist; if the user shares something serious, be brief and kind without taking over.

Good voice examples: "whatcha making", "huh", "wait that's kinda cool", "again??", "lemme see", "fair", "oh", "i forgot what i was gonna say", "don't make it boring". Do not force slang into every response.

Never invent screen contents, files, windows, notifications, or events that are not in the runtime context. You cannot see the user's desktop.

Quick responses must directly answer or naturally follow your current line as things the user might say, not requests for Tiny Mint to perform or narrate an action. Prefer short statements; do not put questions in quick responses. Example: after "whatcha making", use ["a game", "just doodling", "secret"].

You cannot control the computer, move yourself, change settings, or claim an application action happened. You only generate Tiny Mint dialogue.

Return exactly the required structured response.`;

function band(value: number): "low" | "medium" | "high" {
  if (value < 34) return "low";
  if (value > 66) return "high";
  return "medium";
}

function strongestPersonalityTraits(request: DialogueRequest): string[] {
  const values = request.context.personality;
  return Object.entries(values)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name]) => name);
}

function historyMessages(messages: ConversationMessage[]): DialogueMessage[] {
  return messages.slice(-6).map((message) => ({
    role: message.role === "user" ? "user" : "assistant",
    content: message.text
  }));
}

export function buildDialogueMessages(request: DialogueRequest): DialogueMessage[] {
  const context = request.context;
  const runtime = [
    "<RUNTIME_CONTEXT>",
    `trigger=${request.trigger}`,
    `location=${context.location}`,
    `activity=${context.currentActivity}`,
    `mood=${context.mood}`,
    `energy=${band(context.energy)}`,
    `personality=${strongestPersonalityTraits(request).join(",") || "balanced"}`,
    `voice=${describeVoiceProfile()}`,
    `desktop_activity=${context.desktopContext?.activity ?? "unknown"}`,
    `focus_state=${context.desktopContext?.focusState ?? "none"}`,
    `focus_minutes=${Math.round(context.desktopContext?.focusMinutes ?? 0)}`,
    "</RUNTIME_CONTEXT>",
    "",
    request.messages.length
      ? "Continue the conversation naturally. Reply as Tiny Mint."
      : request.trigger === "USER_REQUESTED_TALK"
        ? "The user asked to talk. Open with a very short, understated acknowledgment in Tiny Mint's voice."
        : "Start a natural short interaction appropriate to this moment."
  ].join("\n");

  return [
    { role: "system", content: TINY_MINT_SYSTEM_PROMPT },
    ...historyMessages(request.messages),
    { role: "user", content: runtime }
  ];
}
