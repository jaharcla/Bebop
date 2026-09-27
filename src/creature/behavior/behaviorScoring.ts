import type { CreatureState, DesktopAwarenessContext, ImpulseKind, RoomPropId } from "../../shared/types";
import { noveltyModifier } from "./habitModel";

export type RoomBehaviorKind = "bong" | "book" | "water" | "art" | "play" | "sleep" | "exercise" | "music" | "exit" | "sit";

export interface RoomBehaviorContext {
  desktopContext?: DesktopAwarenessContext | null;
  hour?: number;
  now?: number;
}

const impulseBoost: Record<ImpulseKind, Partial<Record<RoomBehaviorKind, number>>> = {
  create: { art: 2.4, music: 1.4 },
  explore: { book: 1.8, water: 1.45 },
  play: { play: 2.3, exercise: 1.25, bong: 1.2 },
  rest: { sleep: 2.4, sit: 1.6, bong: 1.15 },
  "seek-company": { exit: 2.4 },
  "seek-solitude": { book: 1.25, art: 1.25, sit: 1.3, bong: 1.12 }
};

const activityFor: Record<RoomBehaviorKind, CreatureState["currentActivity"]> = {
  bong: "rest", book: "read", water: "inspect", art: "draw", play: "play", sleep: "sleep",
  exercise: "exercise", music: "music", exit: "visitDesktop", sit: "sit"
};
const propFor: Record<RoomBehaviorKind, RoomPropId> = {
  bong: "bong", book: "bookshelf", water: "plant", art: "desk", play: "ball", sleep: "bed",
  exercise: "dumbbell", music: "music-player", exit: "door", sit: "rug"
};

export function scoreRoomBehaviors(
  state: CreatureState,
  contextOrHour: RoomBehaviorContext | number = {}
): Record<RoomBehaviorKind, number> {
  const context = typeof contextOrHour === "number" ? { hour: contextOrHour } : contextOrHour;
  const now = context.now ?? Date.now();
  const hour = context.hour ?? new Date(now).getHours();
  const desktop = context.desktopContext ?? null;
  const p = state.personality;
  const bongReady = state.lastBongUseAt === 0 || now - state.lastBongUseAt >= 2 * 60 * 60 * 1_000;

  const result: Record<RoomBehaviorKind, number> = {
    bong: state.preferences.bongAutonomyEnabled && bongReady
      ? 0.42 * (0.65 + p.chaos * 0.8 + p.independence * 0.35) * (0.75 + state.boredom / 180)
      : 0,
    book: 8 * (0.65 + p.curiosity * 1.1),
    water: 6 * (0.7 + p.curiosity * 0.75 + p.confidence * 0.25),
    art: 8 * (0.55 + p.creativity * 1.35),
    play: 7 * (0.65 + p.chaos * 1.1 + p.confidence * 0.2),
    sleep: 5 + Math.max(0, 58 - state.energy) * 0.75,
    exercise: 4 * (0.75 + p.confidence * 0.55) * (0.5 + state.energy / 100),
    music: 6 * (0.7 + p.creativity * 0.55),
    exit: state.preferences.roomVisitsEnabled
      ? 5 * (0.45 + p.affection * 0.7 + p.sociability * 0.9) * (1.15 - p.independence * 0.35)
      : 0,
    sit: 6 * (0.7 + p.patience * 0.45)
  };

  if (state.impulse) {
    const boosts = impulseBoost[state.impulse.kind];
    for (const key of Object.keys(result) as RoomBehaviorKind[]) {
      const boost = boosts[key] ?? 1;
      result[key] *= 1 + (boost - 1) * state.impulse.strength;
    }
  }

  const solitudeBoost = 1 + p.independence * 0.12;
  result.book *= solitudeBoost;
  result.art *= solitudeBoost;
  result.sit *= solitudeBoost;

  if (desktop) {
    if (!desktop.userPresent) {
      result.exit *= 0.2;
      result.sleep *= 1.35;
      result.book *= 1.22;
      result.art *= 1.14;
      result.sit *= 1.18;
    }

    if (desktop.fullscreen) {
      result.exit = 0;
      result.bong *= 0.2;
      result.play *= 0.35;
    }

    if (desktop.focusState === "focused") {
      result.bong *= 0.25;
      result.play *= 0.45;
      result.exit *= 0.55;
      result.book *= 1.12;
      result.sit *= 1.18;
      result.music *= 0.78;

      if (desktop.focusMinutes >= 8) {
        result.bong = 0;
        result.play *= 0.35;
        result.exit *= 0.4;
        result.book *= 1.18;
        result.sit *= 1.2;
        result.art *= desktop.activity === "drawing" ? 1.12 : 0.82;
      }
    } else if (desktop.focusState === "recently-finished") {
      const breakBoost = 1 + Math.min(0.35, desktop.focusMinutes / 240);
      result.music *= 1.18 * breakBoost;
      result.play *= 1.15 * breakBoost;
      result.art *= 1.08 * breakBoost;
      result.bong *= 1.12 * breakBoost;
      result.exit *= 1.12;
    }

    if (desktop.activity === "drawing") {
      result.art *= 1.35;
      result.music *= 1.1;
    } else if (desktop.activity === "media") {
      result.music *= 1.35;
      result.sit *= 1.22;
      result.play *= 1.12;
      result.bong *= 1.25;
    } else if (desktop.activity === "idle") {
      result.sit *= 1.12;
      result.bong *= 1.1;
    }
  }

  // Clock is a weak prior; current context is intentionally stronger.
  if (hour < 6 || hour >= 23) {
    result.sleep *= 1.3;
    result.book *= 1.12;
    result.bong *= 1.25;
  } else if (hour < 11) {
    result.exercise *= 1.15;
  } else if (hour >= 18) {
    result.art *= 1.08;
    result.music *= 1.12;
    result.play *= 1.05;
    result.bong *= 1.15;
  }

  for (const key of Object.keys(result) as RoomBehaviorKind[]) {
    const activity = activityFor[key];
    const prop = propFor[key];
    result[key] *= state.habits.activityAffinity[activity] ?? 1;
    result[key] *= state.habits.propAffinity[prop] ?? 1;
    result[key] *= noveltyModifier(state.habits.recentActivities, activity);
    result[key] *= noveltyModifier(state.habits.recentProps, prop);
  }
  return result;
}
