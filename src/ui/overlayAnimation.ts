import type { AnimationName } from "../shared/types";

export interface TransientAnimation {
  name: AnimationName;
  expiresAt: number;
}

export function canStartCursorReach(
  near: boolean,
  alreadyReacted: boolean,
  activityAnimation: AnimationName,
  now: number,
  nextReachAt: number
): boolean {
  return near && !alreadyReacted && activityAnimation !== "walk" && activityAnimation !== "carry"
    && now >= nextReachAt;
}

export function resolveOverlayAnimation(
  activityAnimation: AnimationName,
  transient: TransientAnimation | null,
  now: number
): AnimationName {
  return transient && now < transient.expiresAt ? transient.name : activityAnimation;
}
