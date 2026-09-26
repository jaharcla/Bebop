import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultState } from "../creature/state/defaultState";
import type { CreatureState } from "../shared/types";

export class StateStore {
  constructor(private readonly filePath: string) {}

  load(): CreatureState {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Omit<Partial<CreatureState>, "schemaVersion" | "room"> & {
        schemaVersion?: number;
        room?: Partial<CreatureState["room"]>;
      };
      if (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) return defaultState();
      const defaults = defaultState();
      return {
        ...defaults,
        ...parsed,
        position: { ...defaults.position, ...parsed.position },
        schemaVersion: 2,
        room: { ...defaults.room, target: parsed.room?.target ?? defaults.room.target },
        habits: {
          ...defaults.habits,
          ...parsed.habits,
          activityAffinity: { ...defaults.habits.activityAffinity, ...parsed.habits?.activityAffinity },
          propAffinity: { ...defaults.habits.propAffinity, ...parsed.habits?.propAffinity },
          activityUses: { ...defaults.habits.activityUses, ...parsed.habits?.activityUses },
          propUses: { ...defaults.habits.propUses, ...parsed.habits?.propUses },
          recentActivities: parsed.habits?.recentActivities?.slice(-8) ?? [],
          recentProps: parsed.habits?.recentProps?.slice(-8) ?? []
        },
        impulse: null,
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
    const persisted: CreatureState = {
      ...state,
      impulse: null,
      room: { ...state.room, carriedItem: null, intention: null, position: defaultState().room.position }
    };
    writeFileSync(temporary, JSON.stringify(persisted, null, 2), "utf8");
    renameSync(temporary, this.filePath);
  }
}
