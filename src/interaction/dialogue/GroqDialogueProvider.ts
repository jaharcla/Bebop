import type { CreatureUtterance, DialogueRequest } from "../../shared/types";
import type { DialogueProvider } from "./DialogueProvider";
import { buildDialogueMessages } from "./promptBuilder";
import { validateUtterance } from "./responseValidation";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "quickResponses", "emotion", "endConversation"],
  properties: {
    text: { type: "string", minLength: 1, maxLength: 160 },
    quickResponses: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 40 }
    },
    emotion: {
      type: "string",
      enum: ["neutral", "chill", "curious", "excited", "playful", "sleepy", "bored"]
    },
    endConversation: { type: "boolean" }
  }
} as const;

export class GroqHttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "GroqHttpError";
  }
}

export class GroqDialogueProvider implements DialogueProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async respond(request: DialogueRequest, signal?: AbortSignal): Promise<CreatureUtterance> {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) controller.abort(signal.reason);
    else signal?.addEventListener("abort", forwardAbort, { once: true });

    const timeout = setTimeout(() => controller.abort(new Error("Groq request timed out.")), this.timeoutMs);
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
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "tiny_mint_utterance",
              strict: true,
              schema: responseSchema
            }
          },
          reasoning_effort: "low",
          include_reasoning: false,
          temperature: 0.8,
          max_completion_tokens: 256,
          stream: false
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new GroqHttpError(response.status, `Groq request failed with HTTP ${response.status}.`);
      }

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
      signal?.removeEventListener("abort", forwardAbort);
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
  private preferredDisabled = false;

  constructor(
    private readonly preferred: DialogueProvider,
    private readonly fallback: DialogueProvider,
    private readonly reportFailure: (error: unknown) => void = () => undefined
  ) {}

  async respond(request: DialogueRequest, signal?: AbortSignal): Promise<CreatureUtterance> {
    if (this.preferredDisabled) return this.fallback.respond(request, signal);

    try {
      return await this.preferred.respond(request, signal);
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error instanceof GroqHttpError && (error.status === 401 || error.status === 403)) {
        this.preferredDisabled = true;
      }
      this.reportFailure(error);
      return this.fallback.respond(request, signal);
    }
  }
}
