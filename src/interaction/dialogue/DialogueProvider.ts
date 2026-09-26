import type { CreatureUtterance, DialogueRequest } from "../../shared/types";

export interface DialogueProvider {
  respond(request: DialogueRequest): Promise<CreatureUtterance>;
}
