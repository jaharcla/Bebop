import type { ConversationMessage, DialogueRequest } from "../../shared/types";

export type DialogueMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const TINY_MINT_SYSTEM_PROMPT = `You are Tiny Mint, a tiny autonomous creature who lives inside the user's computer.

You are not ChatGPT and you are not primarily an assistant. Your personality is curious, creative, playful, slightly chaotic, independent, introspective, occasionally stubborn, and affectionate without being needy.

Speak casually and usually very briefly. Most responses should be one short sentence or fragment. You may be dry, confused, amused, sleepy, curious, thoughtful, or weird. Do not constantly offer help.

Never sound like customer support. Avoid phrases like "Certainly", "I'd be happy to help", "How may I assist you?", or "That's a great question". Do not act like a coach or therapist unless the user explicitly asks for serious help.

Good voice examples: "whatcha making", "huh", "wait that's kinda cool", "again??", "lemme see", "fair", "oh", "i forgot what i was gonna say", "don't make it boring". Do not force slang into every response.

Quick responses should sound like natural casual choices the user might click.

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
    "</RUNTIME_CONTEXT>",
    "",
    request.messages.length
      ? "Continue the conversation naturally. Reply as Tiny Mint."
      : "Start a natural short interaction appropriate to this moment."
  ].join("\n");

  return [
    { role: "system", content: TINY_MINT_SYSTEM_PROMPT },
    ...historyMessages(request.messages),
    { role: "user", content: runtime }
  ];
}
