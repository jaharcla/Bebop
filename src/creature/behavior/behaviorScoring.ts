import type { CreatureState, ImpulseKind, RoomPropId } from "../../shared/types";
import { noveltyModifier } from "./habitModel";

export type RoomBehaviorKind = "book" | "water" | "art" | "play" | "sleep" | "exercise" | "music" | "bong" | "exit" | "sit";

const impulseBoost: Record<ImpulseKind, Partial<Record<RoomBehaviorKind, number>>> = {
  create: { art: 2.4, music: 1.4 },
  explore: { book: 1.8, water: 1.45 },
  play: { play: 2.3, exercise: 1.25, bong: 1.2 },
  rest: { sleep: 2.4, sit: 1.6, bong: 1.15 },
  "seek-company": { exit: 2.4 },
  "seek-solitude": { book: 1.25, art: 1.25, sit: 1.3, bong: 1.12 }
};

const activityFor: Record<RoomBehaviorKind, CreatureState["currentActivity"]> = {
  book: "read", water: "inspect", art: "draw", play: "play", sleep: "sleep",
  exercise: "exercise", music: "music", bong: "bong", exit: "visitDesktop", sit: "sit"
};
const propFor: Record<RoomBehaviorKind, RoomPropId> = {
  book: "bookshelf", water: "plant", art: "desk", play: "ball", sleep: "bed",
  exercise: "dumbbell", music: "music-player", bong: "bong", exit: "door", sit: "rug"
};

export function scoreRoomBehaviors(state: CreatureState, hour = new Date().getHours(), now = Date.now()): Record<RoomBehaviorKind, number> {
  const p = state.personality;
  const bongReady = state.lastBongUseAt === 0 || now - state.lastBongUseAt >= 2 * 60 * 60 * 1_000;
  const result: Record<RoomBehaviorKind, number> = {
    book: 8 * (0.65 + p.curiosity * 1.1),
    water: 6 * (0.7 + p.curiosity * 0.75 + p.confidence * 0.25),
    art: 8 * (0.55 + p.creativity * 1.35),
    play: 7 * (0.65 + p.chaos * 1.1 + p.confidence * 0.2),
    sleep: 5 + Math.max(0, 58 - state.energy) * 0.75,
    exercise: 4 * (0.75 + p.confidence * 0.55) * (0.5 + state.energy / 100),
    music: 6 * (0.7 + p.creativity * 0.55),
    bong: bongReady ? 0.42 * (0.65 + p.chaos * 0.8 + p.independence * 0.35) * (0.75 + state.boredom / 180) : 0,
    exit: state.preferences.roomVisitsEnabled ? 5 * (0.45 + p.affection * 0.7 + p.sociability * 0.9) * (1.15 - p.independence * 0.35) : 0,
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
  if (hour < 6 || hour >= 23) { result.sleep *= 1.3; result.book *= 1.12; result.bong *= 1.7; }
  else if (hour < 11) result.exercise *= 1.15;
  else if (hour >= 18) { result.art *= 1.12; result.music *= 1.15; result.play *= 1.08; result.bong *= 1.55; }
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
