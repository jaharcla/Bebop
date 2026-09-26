import type { CreatureUtterance, DialogueRequest } from "../../shared/types";

export interface DialogueProvider {
  respond(request: DialogueRequest, signal?: AbortSignal): Promise<CreatureUtterance>;
}
