import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultState } from "../creature/state/defaultState";
import type { Activity, AnimationName, CorkboardSketch, CorkboardSketchKind, CreatureState, ImpulseKind, Location, Mood, RoomPropId } from "../shared/types";

const activities: readonly Activity[] = ["idle", "wander", "observe", "rest", "sit", "sleep", "draw", "read", "exercise", "carry", "inspect", "play", "music", "show", "visitRoom", "visitDesktop"];
const animations: readonly AnimationName[] = ["idle", "walk", "blink", "happy", "look", "reach-right", "reach-left", "tap", "sit", "sleep", "draw", "read", "held", "land", "exercise", "carry"];
const moods: readonly Mood[] = ["neutral", "chill", "curious", "excited", "playful", "sleepy", "bored"];
const locations: readonly Location[] = ["desktop", "room"];
const propIds: readonly RoomPropId[] = ["door", "corkboard", "bookshelf", "plant", "bed", "chair", "desk", "music-player", "toy-box", "rug", "cushion", "ball", "dumbbell", "sketchbook", "book", "watering-can"];
const impulseKinds: readonly ImpulseKind[] = ["create", "explore", "play", "rest", "seek-company", "seek-solitude"];
const sketchKinds: readonly CorkboardSketchKind[] = ["plant", "book", "ball", "portrait", "heart", "abstract", "star"];
const schemaVersions = [1, 2, 3, 4] as const;
type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectValue(value: unknown, fallback: unknown, label: string): RecordValue {
  if (value === undefined) {
    if (isRecord(fallback)) return fallback;
    throw new Error(`Invalid saved state: default ${label} is invalid.`);
  }
  if (!isRecord(value)) throw new Error(`Invalid saved state: ${label} must be an object.`);
  return value;
}

function numberValue(value: unknown, fallback: number, label: string, min = -Infinity, max = Infinity): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid saved state: ${label} is outside its valid range.`);
  }
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T, label: string): T {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`Invalid saved state: unknown ${label}.`);
  return value as T;
}

function requiredEnum<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`Invalid saved state: unknown ${label}.`);
  return value as T;
}

function booleanValue(value: unknown, fallback: boolean, label: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`Invalid saved state: ${label} must be boolean.`);
  return value;
}

function affinityMap<T extends string>(value: unknown, allowed: readonly T[], label: string): Partial<Record<T, number>> {
  const source = objectValue(value, {}, label);
  const result: Partial<Record<T, number>> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!allowed.includes(key as T)) throw new Error(`Invalid saved state: unknown ${label} key.`);
    result[key as T] = numberValue(entry, 1, `${label}.${key}`, 0.75, 1.25);
  }
  return result;
}

function usageMap<T extends string>(value: unknown, allowed: readonly T[], label: string): Partial<Record<T, number>> {
  const source = objectValue(value, {}, label);
  const result: Partial<Record<T, number>> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (!allowed.includes(key as T)) throw new Error(`Invalid saved state: unknown ${label} key.`);
    const count = numberValue(entry, 0, `${label}.${key}`, 0, 1_000_000_000);
    if (!Number.isInteger(count)) throw new Error(`Invalid saved state: ${label}.${key} must be an integer.`);
    result[key as T] = count;
  }
  return result;
}

function enumArray<T extends string>(value: unknown, allowed: readonly T[], fallback: readonly T[], label: string, limit: number): T[] {
  if (value === undefined) return [...fallback];
  if (!Array.isArray(value) || value.length > 100) throw new Error(`Invalid saved state: ${label} must be a bounded array.`);
  if (!value.every((entry) => typeof entry === "string" && allowed.includes(entry as T))) {
    throw new Error(`Invalid saved state: unknown value in ${label}.`);
  }
  return value.slice(-limit) as T[];
}

function validateSketches(value: unknown): CorkboardSketch[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid saved state: corkboard history must be a bounded array.");
  return value.slice(-6).map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id || entry.id.length > 100) {
      throw new Error(`Invalid saved state: corkboard sketch ${index} has an invalid id.`);
    }
    return {
      id: entry.id,
      kind: requiredEnum(entry.kind, sketchKinds, `corkboard sketch ${index} kind`),
      createdAt: numberValue(entry.createdAt, 0, `corkboard sketch ${index} timestamp`)
    };
  });
}

function validateState(value: unknown): CreatureState {
  if (!isRecord(value)) throw new Error("Invalid saved state: root must be an object.");
  const defaults = defaultState();
  const version = value.schemaVersion;
  const position = objectValue(value.position, defaults.position, "position");
  const room = objectValue(value.room, defaults.room, "room");
  const roomPosition = objectValue(room.position, defaults.room.position, "room.position");
  const preferences = objectValue(value.preferences, defaults.preferences, "preferences");
  const personality = objectValue(value.personality, defaults.personality, "personality");
  const privacy = objectValue(value.privacy, defaults.privacy, "privacy");
  const habits = objectValue(value.habits, defaults.habits, "habits");
  if (typeof version !== "number" || !schemaVersions.includes(version as (typeof schemaVersions)[number])) {
    throw new Error("Invalid saved state: unsupported schema version.");
  }
  const carriedItem = room.carriedItem === undefined || room.carriedItem === null
    ? null
    : enumValue(room.carriedItem, propIds, "book", "carried item");
  const intention = room.intention === null || room.intention === undefined
    ? null
    : typeof room.intention === "string" && room.intention.length <= 160
      ? room.intention
      : null;
  if (room.intention !== null && room.intention !== undefined && intention === null) {
    throw new Error("Invalid saved state: room intention is invalid.");
  }

  const state: CreatureState = {
    ...defaults,
    schemaVersion: 4,
    location: enumValue(value.location, locations, defaults.location, "location"),
    currentActivity: enumValue(value.currentActivity, activities, defaults.currentActivity, "activity"),
    currentAnimation: enumValue(value.currentAnimation, animations, defaults.currentAnimation, "animation"),
    mood: enumValue(value.mood, moods, defaults.mood, "mood"),
    energy: numberValue(value.energy, defaults.energy, "energy", 0, 100),
    stimulation: numberValue(value.stimulation, defaults.stimulation, "stimulation", 0, 100),
    focus: numberValue(value.focus, defaults.focus, "focus", 0, 100),
    socialInterest: numberValue(value.socialInterest, defaults.socialInterest, "social interest", 0, 100),
    boredom: numberValue(value.boredom, defaults.boredom, "boredom", 0, 100),
    curiosity: numberValue(value.curiosity, defaults.curiosity, "curiosity", 0, 100),
    comfort: numberValue(value.comfort, defaults.comfort, "comfort", 0, 100),
    lastUserInteraction: numberValue(value.lastUserInteraction, defaults.lastUserInteraction, "last user interaction"),
    lastCreatureInteraction: numberValue(value.lastCreatureInteraction, defaults.lastCreatureInteraction, "last creature interaction"),
    lastActivityChange: numberValue(value.lastActivityChange, defaults.lastActivityChange, "last activity change"),
    position: {
      x: numberValue(position.x, defaults.position.x, "position.x"),
      y: numberValue(position.y, defaults.position.y, "position.y")
    },
    facing: enumValue(value.facing, ["left", "right"] as const, defaults.facing, "facing direction"),
    corkboardSketches: validateSketches(value.corkboardSketches),
    room: {
      target: enumValue(room.target, propIds, defaults.room.target, "room target"),
      position: {
        x: numberValue(roomPosition.x, defaults.room.position.x, "room.position.x"),
        y: numberValue(roomPosition.y, defaults.room.position.y, "room.position.y")
      },
      carriedItem,
      intention
    },
    habits: {
      activityAffinity: affinityMap(habits.activityAffinity, activities, "activityAffinity"),
      propAffinity: affinityMap(habits.propAffinity, propIds, "propAffinity"),
      activityUses: usageMap(habits.activityUses, activities, "activityUses"),
      propUses: usageMap(habits.propUses, propIds, "propUses"),
      recentActivities: enumArray(habits.recentActivities, activities, [], "recentActivities", 8),
      recentProps: enumArray(habits.recentProps, propIds, [], "recentProps", 8)
    },
    impulse: null,
    preferences: {
      alwaysOnTop: booleanValue(preferences.alwaysOnTop, defaults.preferences.alwaysOnTop, "preferences.alwaysOnTop"),
      cursorInteraction: booleanValue(preferences.cursorInteraction, defaults.preferences.cursorInteraction, "preferences.cursorInteraction"),
      paused: booleanValue(preferences.paused, defaults.preferences.paused, "preferences.paused"),
      reducedMotion: booleanValue(preferences.reducedMotion, defaults.preferences.reducedMotion, "preferences.reducedMotion"),
      roamingEnabled: booleanValue(preferences.roamingEnabled, defaults.preferences.roamingEnabled, "preferences.roamingEnabled"),
      roomVisitsEnabled: booleanValue(preferences.roomVisitsEnabled, defaults.preferences.roomVisitsEnabled, "preferences.roomVisitsEnabled"),
      roomAutonomyEnabled: booleanValue(preferences.roomAutonomyEnabled, defaults.preferences.roomAutonomyEnabled, "preferences.roomAutonomyEnabled"),
      interactionsEnabled: booleanValue(preferences.interactionsEnabled, defaults.preferences.interactionsEnabled, "preferences.interactionsEnabled"),
      startWithWindows: booleanValue(preferences.startWithWindows, defaults.preferences.startWithWindows, "preferences.startWithWindows"),
      quietMode: booleanValue(preferences.quietMode, defaults.preferences.quietMode, "preferences.quietMode")
    },
    privacy: {
      awarenessEnabled: booleanValue(privacy.awarenessEnabled, defaults.privacy.awarenessEnabled, "privacy.awarenessEnabled"),
      contextLevel: enumValue(privacy.contextLevel, ["minimal"] as const, defaults.privacy.contextLevel, "privacy context level")
    },
    personality: {
      curiosity: numberValue(personality.curiosity, defaults.personality.curiosity, "personality.curiosity", 0, 1),
      creativity: numberValue(personality.creativity, defaults.personality.creativity, "personality.creativity", 0, 1),
      chaos: numberValue(personality.chaos, defaults.personality.chaos, "personality.chaos", 0, 1),
      confidence: numberValue(personality.confidence, defaults.personality.confidence, "personality.confidence", 0, 1),
      independence: numberValue(personality.independence, defaults.personality.independence, "personality.independence", 0, 1),
      affection: numberValue(personality.affection, defaults.personality.affection, "personality.affection", 0, 1),
      patience: numberValue(personality.patience, defaults.personality.patience, "personality.patience", 0, 1),
      sociability: numberValue(personality.sociability, defaults.personality.sociability, "personality.sociability", 0, 1)
    }
  };
  return state;
}

function persistedState(state: CreatureState): CreatureState {
  const normalized = validateState(state);
  return {
    ...normalized,
    currentActivity: "idle",
    currentAnimation: "idle",
    impulse: null,
    room: { ...normalized.room, carriedItem: null, intention: null }
  };
}

type Candidate = { kind: "valid"; state: CreatureState; raw: string } | { kind: "missing" | "invalid" };

function readCandidate(path: string): Candidate {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return { kind: "missing" };
    throw error;
  }
  try {
    return { kind: "valid", state: validateState(JSON.parse(raw) as unknown), raw };
  } catch {
    return { kind: "invalid" };
  }
}

export class StateStore {
  private readonly backupPath: string;

  constructor(private readonly filePath: string, private readonly onRecovery?: (message: string) => void) {
    this.backupPath = filePath.replace(/\.json$/i, ".backup.json");
  }

  load(): CreatureState {
    const primary = readCandidate(this.filePath);
    if (primary.kind === "valid") return primary.state;
    const backup = readCandidate(this.backupPath);
    if (backup.kind === "valid") {
      this.onRecovery?.("Tiny Mint recovered his saved state from the backup file.");
      return backup.state;
    }
    if (primary.kind === "invalid" || backup.kind === "invalid") {
      this.onRecovery?.("Tiny Mint's save and backup were invalid; a fresh state was loaded.");
    }
    return defaultState();
  }

  save(state: CreatureState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    const backupTemporary = `${this.backupPath}.tmp`;
    const primary = existsSync(this.filePath) ? readCandidate(this.filePath) : { kind: "missing" as const };
    writeFileSync(temporary, JSON.stringify(persistedState(state), null, 2), "utf8");
    if (primary.kind === "valid") {
      writeFileSync(backupTemporary, primary.raw, "utf8");
      renameSync(backupTemporary, this.backupPath);
    }
    renameSync(temporary, this.filePath);
  }

  exportJson(state: CreatureState): string {
    return JSON.stringify(persistedState(state), null, 2);
  }
}
