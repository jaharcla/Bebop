import type { CreatureState } from "../../shared/types";
import type { ActionPlan } from "../actions/ActionPlan";
import { artRoutine, bongRoutine, bookRoutine, playRoutine, roomExitRoutine, simplePropRoutine, wateringRoutine } from "../actions/actionChains";
import type { RandomSource } from "./behaviorEngine";
import { scoreRoomBehaviors, type RoomBehaviorKind } from "./behaviorScoring";

export class BehaviorPlanner {
  constructor(private readonly random: RandomSource = Math.random) {}

  chooseRoomPlan(state: CreatureState, now: number): ActionPlan {
    const scores = scoreRoomBehaviors(state);
    const entries = Object.entries(scores).filter(([, weight]) => weight > 0) as Array<[RoomBehaviorKind, number]>;
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let cursor = this.random() * total;
    let kind = entries[0]?.[0] ?? "sit";
    for (const entry of entries) {
      cursor -= entry[1];
      if (cursor <= 0) { kind = entry[0]; break; }
    }
    const plan = kind === "book" ? bookRoutine(now)
      : kind === "water" ? wateringRoutine(now)
      : kind === "art" ? artRoutine(now)
      : kind === "play" ? playRoutine(now)
      : kind === "bong" ? bongRoutine(now)
      : kind === "exit" ? roomExitRoutine(now)
      : simplePropRoutine(kind === "sleep" ? "bed" : kind === "exercise" ? "dumbbell" : kind === "music" ? "music-player" : "rug", now, 40);
    const patienceFactor = 0.8 + state.personality.patience * 0.45;
    const chaosFactor = 1.08 - state.personality.chaos * 0.18;
    return {
      ...plan,
      steps: plan.steps.map((step) => step.type === "interact" || step.type === "animate" || step.type === "wait"
        ? { ...step, durationMs: Math.round(step.durationMs * patienceFactor * chaosFactor) }
        : step)
    };
  }
}
