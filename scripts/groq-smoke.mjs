import { createRequire } from "node:module";

process.loadEnvFile(".env");
const key = process.env.GROQ_API_KEY?.trim();
if (!key) throw new Error("GROQ_API_KEY is not configured.");

const require = createRequire(import.meta.url);
const { DEFAULT_GROQ_MODEL, GroqDialogueProvider } = require("../dist-electron/interaction/dialogue/GroqDialogueProvider.js");
const provider = new GroqDialogueProvider(key, process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL);
const context = {
  mood: "curious",
  energy: 68,
  currentActivity: "observe",
  location: "desktop",
  personality: { curiosity: 0.8, creativity: 0.75, independence: 0.7, sociability: 0.45 }
};
const messages = [];

async function exchange(userText) {
  if (userText) messages.push({ role: "user", text: userText, at: Date.now() });
  const response = await provider.respond({ trigger: "USER_REQUESTED_TALK", context, messages });
  messages.push({ role: "creature", text: response.text, at: Date.now() });
  return response;
}

const first = await exchange();
const quick = first.quickResponses[0] || "show me";
const second = await exchange(quick);
const third = await exchange("i'm making a tiny pixel garden");

const cancellation = new AbortController();
const pending = provider.respond({ trigger: "USER_REQUESTED_TALK", context, messages: [] }, cancellation.signal);
cancellation.abort();
let cancellationAborted = false;
try {
  await pending;
} catch {
  cancellationAborted = true;
}
if (!cancellationAborted) throw new Error("Groq cancellation did not abort.");

console.log(JSON.stringify({
  credentialedGroq: true,
  structuredResponses: [first, second, third],
  quickReplyUsed: quick,
  customReplyUsed: true,
  cancellationAborted
}, null, 2));
