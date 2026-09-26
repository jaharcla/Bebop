import type { CreatureUtterance, DialogueRequest } from "../../shared/types";
import type { DialogueProvider } from "./DialogueProvider";
import { validateUtterance } from "./responseValidation";

const openingLines: Record<DialogueRequest["trigger"], readonly string[]> = {
  FIRST_HELLO: ["uh hi", "okay so... this is your computer?", "hi. i’m looking around", "wait, you’re actually here"],
  BECAME_CURIOUS: ["whatcha doing", "what are you making", "wait, what’s that"],
  BECAME_BORED: ["i’ve inspected everything over here", "huh. it got quiet", "i was gonna say something but i forgot"],
  RETURNED_TO_DESKTOP: ["i’m back. what’d i miss", "hey again", "okay, where was i"],
  LONG_QUIET_PERIOD: ["what are you making", "lemme see", "you look busy over there"],
  USER_REQUESTED_TALK: ["yeah?", "what’s up", "hm?"]
};

const initialReplies = ["coding", "school stuff", "secret"];
const followUpReplies = ["no promises", "too late", "you’re welcome"];
const reactions = ["huh", "mm", "okay", "i'm listening", "not sure what to say to that", "fair", "tell me more?"];

export class LocalDialogueProvider implements DialogueProvider {
  constructor(private readonly random: () => number = Math.random) {}

  async respond(request: DialogueRequest, signal?: AbortSignal): Promise<CreatureUtterance> {
    if (signal?.aborted) throw new DOMException("Dialogue request aborted.", "AbortError");
    const previousCreatureLines = request.messages
      .filter((message) => message.role === "creature")
      .map((message) => message.text);
    const latestUserMessage = [...request.messages].reverse().find((message) => message.role === "user");
    const moodLines: Partial<Record<DialogueRequest["context"]["mood"], readonly string[]>> = {
      curious: ["whatcha doing", "what are you making", "wait, what’s that"],
      bored: ["i’ve inspected everything over here", "huh. it got quiet", "i was gonna say something but i forgot"],
      sleepy: ["i was gonna say something but i forgot", "hmm. nap soon", "can we make this quick"],
      playful: ["wait wait", "lemme see", "okay that’s kinda sick"],
      excited: ["oh wait, show me", "okay that’s kinda sick", "wait wait"]
    };
    const options = latestUserMessage
      ? reactions
      : moodLines[request.context.mood] ?? openingLines[request.trigger];
    const line = options.find((option) => !previousCreatureLines.includes(option))
      ?? options[Math.floor(this.random() * options.length)]
      ?? "huh";
    const quickResponses = latestUserMessage ? followUpReplies : initialReplies;

    return validateUtterance({
      text: line,
      quickResponses: [...quickResponses],
      emotion: request.context.mood,
      endConversation: Boolean(latestUserMessage && request.messages.length >= 5)
    });
  }
}
