import type { CreatureUtterance, Mood } from "../../shared/types";

const moods: readonly Mood[] = ["neutral", "chill", "curious", "excited", "playful", "sleepy", "bored"];
const MAX_TEXT_LENGTH = 160;
const MAX_QUICK_RESPONSE_LENGTH = 40;

export function validateUtterance(value: unknown): CreatureUtterance {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Dialogue response must be an object.");
  }
  const candidate = value as Record<string, unknown>;
  const allowedFields = new Set(["text", "quickResponses", "emotion", "endConversation"]);
  if (Object.keys(candidate).some((key) => !allowedFields.has(key))) {
    throw new Error("Dialogue response contains unsupported fields.");
  }
  if (typeof candidate.text !== "string") throw new Error("Dialogue response text must be a string.");
  const text = candidate.text.trim().slice(0, MAX_TEXT_LENGTH);
  if (!text) throw new Error("Dialogue response text cannot be empty.");

  if (!Array.isArray(candidate.quickResponses) || candidate.quickResponses.some((reply) => typeof reply !== "string")) {
    throw new Error("Dialogue quick responses must be an array of strings.");
  }
  const emotion = candidate.emotion;
  if (typeof emotion !== "string" || !moods.includes(emotion as Mood)) {
    throw new Error("Dialogue emotion is invalid.");
  }
  if (typeof candidate.endConversation !== "boolean") throw new Error("Dialogue endConversation must be a boolean.");

  return {
    text,
    quickResponses: candidate.quickResponses.slice(0, 3).map((reply: string) => (reply as string).trim().slice(0, MAX_QUICK_RESPONSE_LENGTH)).filter(Boolean),
    emotion: emotion as Mood,
    endConversation: candidate.endConversation
  };
}
