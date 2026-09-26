import type { DialogueProviderStatus } from "../../shared/types";
import type { DialogueProvider } from "./DialogueProvider";
import { DEFAULT_GROQ_MODEL, FallbackDialogueProvider, GroqDialogueProvider } from "./GroqDialogueProvider";
import { LocalDialogueProvider } from "./LocalDialogueProvider";

export function createDialogueProvider(
  apiKey: string | undefined,
  model: string | undefined,
  options: { fetcher?: typeof fetch; reportFailure?: (error: unknown) => void } = {}
): { provider: DialogueProvider; status: DialogueProviderStatus } {
  const local = new LocalDialogueProvider();
  const trimmedKey = apiKey?.trim();
  if (!trimmedKey) return { provider: local, status: "Local voice" };

  const trimmedModel = model?.trim();
  const groq = new GroqDialogueProvider(
    trimmedKey,
    trimmedModel || DEFAULT_GROQ_MODEL,
    options.fetcher ?? fetch
  );
  return {
    provider: new FallbackDialogueProvider(groq, local, options.reportFailure),
    status: "Groq configured"
  };
}
