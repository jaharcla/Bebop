import type { Activity, CreatureState, DesktopAwarenessContext } from "../../shared/types";
import { noveltyModifier } from "./habitModel";

export type RandomSource = () => number;

interface WeightedActivity {
  activity: Activity;
  weight: number;
}

export function chooseActivity(
  state: CreatureState,
  random: RandomSource = Math.random,
  conversationActive = false,
  desktopContext: DesktopAwarenessContext | null = null
): Activity {
  if (state.preferences.paused) return state.currentActivity;

  const contextActivity = desktopContext?.activity ?? "unknown";
  const userPresent = desktopContext?.userPresent ?? true;
  const fullscreen = desktopContext?.fullscreen ?? false;
  const focusedWork = ["coding", "writing", "reading", "drawing"].includes(contextActivity);
  const observeBoost = contextActivity === "drawing" ? 1.8
    : focusedWork ? 1.45
      : contextActivity === "chatting" ? 1.25
        : contextActivity === "browsing" ? 1.12
          : 1;
  const quietMultiplier = fullscreen ? 0.04 : state.preferences.quietMode ? 0.3 : 1;

  const choices: WeightedActivity[] = state.location === "desktop"
    ? [
        { activity: "idle", weight: (24 + state.comfort * 0.12) * (0.8 + state.personality.patience * 0.35) * (fullscreen ? 2.4 : 1) },
        ...(state.preferences.roamingEnabled ? [{ activity: "wander" as const, weight: (15 + state.boredom * 0.22) * (0.75 + state.personality.chaos * 0.55) * quietMultiplier * (userPresent ? 1 : 0.55) }] : []),
        { activity: "observe", weight: (8 + state.curiosity * 0.17) * (0.65 + state.personality.curiosity * 0.7 + state.personality.confidence * 0.18 + state.personality.affection * 0.15) * (1.08 - state.personality.independence * 0.18) * observeBoost * quietMultiplier * (userPresent ? 1 : 0.25) },
        { activity: "rest", weight: Math.max(3, 31 - state.energy * 0.3) * (0.8 + state.personality.patience * 0.3) * (fullscreen ? 1.6 : 1) },
        ...(desktopContext && userPresent && !fullscreen && focusedWork ? [{
          activity: "sit" as const,
          weight: (6 + state.personality.patience * 10 + state.personality.affection * 8) * (1.12 - state.personality.independence * 0.22)
        }] : []),
        ...(desktopContext && userPresent && !fullscreen && contextActivity === "reading" ? [{
          activity: "read" as const,
          weight: 5 + state.personality.curiosity * 11
        }] : []),
        ...(desktopContext && userPresent && !fullscreen && contextActivity === "media" ? [{
          activity: "music" as const,
          weight: 4 + state.personality.creativity * 8
        }] : []),
        ...(state.preferences.roomVisitsEnabled && !conversationActive ? [{
          activity: "visitRoom" as const,
          weight: (state.energy < 35 ? 22 : 5) * (0.55 + state.personality.independence * 0.9) * (1.2 - state.personality.affection * 0.25) * (!userPresent ? 1.55 : contextActivity === "drawing" ? 1 + state.personality.creativity * 0.8 : 1)
        }] : [])
      ]
    : [
        { activity: "idle", weight: 18 },
        ...(!state.preferences.roomAutonomyEnabled ? [{ activity: "rest" as const, weight: 18 }] : [
          { activity: "sleep" as const, weight: 12 + Math.max(0, 45 - state.energy) },
          { activity: "sit" as const, weight: 14 + state.comfort * 0.08 },
          { activity: "draw" as const, weight: 7 + state.personality.creativity * 15 },
          { activity: "read" as const, weight: 6 + state.curiosity * 0.08 + state.personality.curiosity * 10 },
          { activity: "exercise" as const, weight: 5 + state.energy * 0.04 }
        ]),
        ...(state.preferences.roomVisitsEnabled ? [{ activity: "visitDesktop" as const, weight: (10 + state.socialInterest * 0.16) * (0.5 + state.personality.sociability * 0.8 + state.personality.affection * 0.5) }] : [])
      ];

  for (const choice of choices) {
    choice.weight *= state.habits.activityAffinity[choice.activity] ?? 1;
    choice.weight *= noveltyModifier(state.habits.recentActivities, choice.activity);
    const strength = state.impulse?.strength ?? 0;
    if (state.impulse?.kind === "seek-company" && choice.activity === "visitDesktop") choice.weight *= 1 + strength;
    if (state.impulse?.kind === "seek-solitude" && choice.activity === "visitRoom") choice.weight *= 1 + strength;
    if (state.impulse?.kind === "explore" && choice.activity === "observe") choice.weight *= 1 + strength * 0.7;
    if (state.impulse?.kind === "rest" && choice.activity === "rest") choice.weight *= 1 + strength;
  }

  const available = choices.length ? choices : [{ activity: "idle" as const, weight: 1 }];
  const filtered = available.filter((choice) => choice.activity !== state.currentActivity || available.length === 1);
  const total = filtered.reduce((sum, choice) => sum + choice.weight, 0);
  let cursor = random() * total;
  for (const choice of filtered) {
    cursor -= choice.weight;
    if (cursor <= 0) return choice.activity;
  }
  return filtered.at(-1)?.activity ?? "idle";
}

export function animationFor(activity: Activity, location: CreatureState["location"] = "desktop"): CreatureState["currentAnimation"] {
  if (activity === "wander" || activity === "visitRoom" || activity === "visitDesktop") return "walk";
  if (activity === "observe") return "look";
  if (activity === "sit") return "sit";
  if (activity === "sleep" || (activity === "rest" && location === "room")) return "sleep";
  if (activity === "draw") return "draw";
  if (activity === "read") return "read";
  if (activity === "exercise") return "exercise";
  if (activity === "carry" || activity === "show") return "carry";
  if (activity === "inspect") return "reach-right";
  if (activity === "play") return "tap";
  if (activity === "music" || activity === "bong") return "sit";
  return "idle";
}
