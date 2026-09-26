import type { BehaviorImpulse, CreatureState, ImpulseKind } from "../../shared/types";
import type { RandomSource } from "./behaviorEngine";

export function updateImpulse(state: CreatureState, now: number, random: RandomSource): BehaviorImpulse {
  if (state.impulse && state.impulse.expiresAt > now) return state.impulse;
  const weights: Array<[ImpulseKind, number]> = [
    ["create", 8 + state.boredom * 0.18 + state.personality.creativity * 22],
    ["explore", 8 + state.curiosity * 0.2 + state.personality.curiosity * 20],
    ["play", 6 + state.boredom * 0.2 + state.personality.chaos * 18],
    ["rest", 5 + Math.max(0, 55 - state.energy) * 0.8],
    ["seek-company", 4 + state.socialInterest * 0.14 + state.personality.sociability * 14 + state.personality.affection * 8],
    ["seek-solitude", 4 + state.personality.independence * 20 + Math.max(0, 45 - state.socialInterest) * 0.12]
  ];
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let cursor = random() * total;
  let kind = weights[0][0];
  for (const candidate of weights) {
    cursor -= candidate[1];
    if (cursor <= 0) { kind = candidate[0]; break; }
  }
  return {
    kind,
    strength: 0.55 + random() * 0.35,
    createdAt: now,
    expiresAt: now + (3 + random() * 5) * 60_000
  };
}
