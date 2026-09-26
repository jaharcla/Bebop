import type { CreatureUtterance, DialogueRequest } from "../../shared/types";
import type { DialogueProvider } from "./DialogueProvider";
import { buildDialogueMessages } from "./promptBuilder";
import { validateUtterance } from "./responseValidation";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export class GroqDialogueProvider implements DialogueProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = 10_000
  ) {}

  async respond(request: DialogueRequest): Promise<CreatureUtterance> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: buildDialogueMessages(request),
          response_format: { type: "json_object" },
          temperature: 0.8,
          max_tokens: 180
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Groq request failed with HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      const content = getMessageContent(payload);
      let parsed: unknown;
      try {
        parsed = JSON.parse(content);
      } catch {
        throw new Error("Groq returned invalid JSON.");
      }
      return validateUtterance(parsed);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function getMessageContent(payload: unknown): string {
  if (typeof payload !== "object" || payload === null || !("choices" in payload)) {
    throw new Error("Groq response did not contain a completion.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("Groq returned no completion choices.");
  const message = (choices[0] as { message?: unknown } | undefined)?.message;
  if (typeof message !== "object" || message === null || !("content" in message) || typeof message.content !== "string") {
    throw new Error("Groq response content was empty or invalid.");
  }
  return message.content;
}

export class FallbackDialogueProvider implements DialogueProvider {
  constructor(
    private readonly preferred: DialogueProvider,
    private readonly fallback: DialogueProvider,
    private readonly reportFailure: (error: unknown) => void = () => undefined
  ) {}

  async respond(request: DialogueRequest): Promise<CreatureUtterance> {
    try {
      return await this.preferred.respond(request);
    } catch (error) {
      this.reportFailure(error);
      return this.fallback.respond(request);
    }
  }
}
