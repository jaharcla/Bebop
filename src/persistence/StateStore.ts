import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultState } from "../creature/state/defaultState";
import type { CreatureState } from "../shared/types";

export class StateStore {
  constructor(private readonly filePath: string) {}

  load(): CreatureState {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<CreatureState>;
      if (parsed.schemaVersion !== 1) return defaultState();
      const defaults = defaultState();
      return {
        ...defaults,
        ...parsed,
        position: { ...defaults.position, ...parsed.position },
        room: { ...defaults.room, ...parsed.room },
        preferences: { ...defaults.preferences, ...parsed.preferences },
        privacy: { ...defaults.privacy, ...parsed.privacy },
        personality: { ...defaults.personality, ...parsed.personality }
      };
    } catch {
      return defaultState();
    }
  }

  save(state: CreatureState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(state, null, 2), "utf8");
    renameSync(temporary, this.filePath);
  }
}
