import type { DialogueRequest } from "../../shared/types";

export function buildDialogueMessages(request: DialogueRequest): Array<{ role: "system" | "user"; content: string }> {
  const context = request.context;
  const conversation = request.messages.slice(-6)
    .map((message) => `${message.role === "user" ? "User" : "Tiny Mint"}: ${message.text}`)
    .join("\n");

  return [
    {
      role: "system",
      content: "You are Tiny Mint, a curious, creative, independent little desktop creature. Be playful, quiet, occasionally dry or thoughtful, never servile, needy, a coach, or a therapist. Write casually in lowercase when natural. Reply in at most 1-2 short sentences. Return only JSON with text (string, <=160 chars), quickResponses (array of up to 3 strings <=40 chars), and emotion (one of neutral, chill, curious, excited, playful, sleepy, bored)."
    },
    {
      role: "user",
      content: [
        `Mood: ${context.mood}`,
        `Energy: ${Math.round(context.energy)} / 100`,
        `Current activity: ${context.currentActivity}`,
        `Location: ${context.location}`,
        `Personality: curiosity ${context.personality.curiosity.toFixed(2)}, creativity ${context.personality.creativity.toFixed(2)}, independence ${context.personality.independence.toFixed(2)}, sociability ${context.personality.sociability.toFixed(2)}`,
        `Trigger: ${request.trigger}`,
        conversation ? `Recent conversation:\n${conversation}` : "Conversation: just starting",
        "Generate Tiny Mint's next short utterance and up to 3 natural quick replies as the required JSON object."
      ].join("\n")
    }
  ];
}
