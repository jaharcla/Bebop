import type { Activity, CreatureState } from "../../shared/types";

export type RandomSource = () => number;

interface WeightedActivity {
  activity: Activity;
  weight: number;
}

export function chooseActivity(state: CreatureState, random: RandomSource = Math.random): Activity {
  const choices: WeightedActivity[] = state.location === "desktop"
    ? [
        { activity: "idle", weight: 34 + state.comfort * 0.15 },
        { activity: "wander", weight: 20 + state.boredom * 0.25 },
        { activity: "observe", weight: 12 + state.curiosity * 0.18 },
        { activity: "rest", weight: Math.max(3, 32 - state.energy * 0.3) },
        { activity: "visitRoom", weight: state.energy < 35 ? 22 : 5 }
      ]
    : [
        { activity: "idle", weight: 18 },
        { activity: "sleep", weight: 12 + Math.max(0, 45 - state.energy) },
        { activity: "sit", weight: 14 + state.comfort * 0.08 },
        { activity: "draw", weight: 9 + state.personality.creativity * 10 },
        { activity: "read", weight: 8 + state.curiosity * 0.08 },
        { activity: "exercise", weight: 5 + state.energy * 0.04 },
        { activity: "visitDesktop", weight: 18 + state.socialInterest * 0.18 }
      ];

  const filtered = choices.filter((choice) => choice.activity !== state.currentActivity || choices.length === 1);
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
  if (activity === "music") return "sit";
  return "idle";
}
