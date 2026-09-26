import type { CreatureState, InteractionTrigger } from "../shared/types";

export const MIN_CREATURE_SPEECH_GAP_MS = 8 * 60_000;
export const RECENT_USER_INTERACTION_GAP_MS = 90_000;
const ignoredCooldownRanges: readonly [number, number][] = [
  [8, 15],
  [12, 20],
  [20, 35]
];

type SocialContext = Pick<CreatureState, "socialInterest" | "mood" | "currentActivity">;

function contextDelayMs(context: SocialContext | undefined): number {
  if (!context) return 0;
  const lowInterestDelay = Math.max(0, 35 - context.socialInterest) * 15_000;
  const sleepyDelay = context.mood === "sleepy" || context.currentActivity === "sleep" ? 4 * 60_000 : 0;
  const activeDelay = ["wander", "exercise", "play", "carry"].includes(context.currentActivity) ? 2 * 60_000 : 0;
  return lowInterestDelay + sleepyDelay + activeDelay;
}

export interface InteractionPolicyInput {
  state: CreatureState;
  trigger: InteractionTrigger;
  hasActiveSession: boolean;
  now: number;
  notBefore: number;
  ignoredStreak: number;
  userPresent?: boolean;
  attentionSuppressed?: boolean;
}

export function shouldInitiateInteraction(input: InteractionPolicyInput): boolean {
  const { state, now } = input;
  if (input.userPresent === false || input.attentionSuppressed === true) return false;
  if (!state.preferences.interactionsEnabled || state.preferences.quietMode || state.preferences.paused || state.location !== "desktop" || input.hasActiveSession) return false;
  if (now < input.notBefore) return false;
  const cooldownIndex = input.ignoredStreak >= 3 ? 2 : input.ignoredStreak > 0 ? 1 : 0;
  const minimumGap = ignoredCooldownRanges[cooldownIndex]![0] * 60_000 + contextDelayMs(state);
  return now - state.lastCreatureInteraction >= minimumGap
    && now - state.lastUserInteraction >= RECENT_USER_INTERACTION_GAP_MS;
}

export function nextCreatureSpeechDelayMs(
  ignoredStreak: number,
  random: () => number = Math.random,
  context?: SocialContext
): number {
  const [minimum, maximum] = ignoredCooldownRanges[ignoredStreak >= 3 ? 2 : ignoredStreak > 0 ? 1 : 0]!;
  return (minimum + Math.max(0, Math.min(1, random())) * (maximum - minimum)) * 60_000 + contextDelayMs(context);
}

export function nextAllowedInitiationAt(input: Omit<InteractionPolicyInput, "trigger" | "hasActiveSession">): number {
  const cooldownIndex = input.ignoredStreak >= 3 ? 2 : input.ignoredStreak > 0 ? 1 : 0;
  const minimumGap = ignoredCooldownRanges[cooldownIndex]![0] * 60_000 + contextDelayMs(input.state);
  return Math.max(
    input.notBefore,
    input.state.lastCreatureInteraction + minimumGap,
    input.state.lastUserInteraction + RECENT_USER_INTERACTION_GAP_MS
  );
}
