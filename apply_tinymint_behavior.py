#!/usr/bin/env python3
# Apply the Tiny Mint context-aware behavior implementation to jaharcla/Bebop.
#
# Designed against PR #3 head:
#   51786dce77719fb38ebd6c064b640b2ddfa33187
#
# Also tolerates the partial ChatGPT implementation commit:
#   5f81e85054b5167e77785d9ce6f382fb0eeed142
#
# Usage:
#   python apply_tinymint_behavior.py /path/to/Bebop
#   python apply_tinymint_behavior.py /path/to/Bebop --validate
#   python apply_tinymint_behavior.py /path/to/Bebop --force --validate

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

EXPECTED_HEADS = {
    "51786dce77719fb38ebd6c064b640b2ddfa33187",
    "5f81e85054b5167e77785d9ce6f382fb0eeed142",
}

def run(cmd: list[str], cwd: Path, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=check)

def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")

def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")

def replace_once(path: Path, old: str, new: str) -> bool:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected replacement anchor exactly once, found {count}")
    write(path, content.replace(old, new, 1))
    return True

def append_once(path: Path, marker: str, block: str) -> bool:
    content = read(path)
    if marker in content:
        return False
    if not content.endswith("\n"):
        content += "\n"
    write(path, content + "\n" + block.strip() + "\n")
    return True

def verify_repo(root: Path, force: bool) -> None:
    package = root / "package.json"
    if not package.exists() or '"name": "tiny-mint"' not in read(package):
        raise RuntimeError(f"{root} does not look like the Tiny Mint/Bebop repository")

    try:
        head = run(["git", "rev-parse", "HEAD"], root).stdout.strip()
    except Exception:
        if not force:
            raise RuntimeError("Could not read git HEAD. Re-run with --force only if this is the intended Bebop checkout.")
        return

    if head not in EXPECTED_HEADS and not force:
        raise RuntimeError(
            "This patch was built against PR #3 head 51786dce... "
            f"but this checkout is at {head}. Re-run with --force only after reviewing the diff."
        )

def apply(root: Path) -> list[str]:
    changed: list[str] = []

    # Shared types: focus context, behavior origin, richer-but-compatible dialogue context.
    p = root / "src/shared/types.ts"
    content = read(p)
    if 'export type FocusState = "none" | "focused" | "recently-finished";' not in content:
        old = '''export interface DesktopAwarenessContext {
  activity: DesktopActivityKind;
  userPresent: boolean;
  fullscreen: boolean;
  sampledAt: number;
}'''
        new = '''export type FocusState = "none" | "focused" | "recently-finished";

export interface DesktopAwarenessContext {
  activity: DesktopActivityKind;
  userPresent: boolean;
  fullscreen: boolean;
  sampledAt: number;
  focusState: FocusState;
  focusMinutes: number;
}

export type BehaviorOrigin = "user" | "autonomous" | "context";'''
        replace_once(p, old, new)
        changed.append(str(p.relative_to(root)))

    old_dialogue_full = '''export interface DialogueContext {
  mood: Mood;
  energy: number;
  currentActivity: Activity;
  location: Location;
  personality: Personality;
  desktopContext: DesktopAwarenessContext | null;
}'''
    old_dialogue_original = '''export interface DialogueContext {
  mood: Mood;
  energy: number;
  currentActivity: Activity;
  location: Location;
  personality: Pick<Personality, "curiosity" | "creativity" | "independence" | "sociability">;
}'''
    new_dialogue = '''export interface DialogueContext {
  mood: Mood;
  energy: number;
  currentActivity: Activity;
  location: Location;
  personality: Pick<Personality, "curiosity" | "creativity" | "independence" | "sociability"> & Partial<Personality>;
  desktopContext?: DesktopAwarenessContext | null;
}'''
    content = read(p)
    if new_dialogue not in content:
        if old_dialogue_full in content:
            write(p, content.replace(old_dialogue_full, new_dialogue, 1))
        elif old_dialogue_original in content:
            write(p, content.replace(old_dialogue_original, new_dialogue, 1))
        else:
            raise RuntimeError(f"{p}: could not locate DialogueContext shape")
        if str(p.relative_to(root)) not in changed:
            changed.append(str(p.relative_to(root)))

    # Action origin.
    p = root / "src/creature/actions/ActionPlan.ts"
    if "BehaviorOrigin" not in read(p):
        replace_once(
            p,
            'import type { Activity, AnimationName, Location, RoomPropId, WorldPosition } from "../../shared/types";',
            'import type { Activity, AnimationName, BehaviorOrigin, Location, RoomPropId, WorldPosition } from "../../shared/types";',
        )
        replace_once(
            p,
            "export interface ActionPlan {\n  id: string;",
            "export interface ActionPlan {\n  id: string;\n  origin?: BehaviorOrigin;",
        )
        changed.append(str(p.relative_to(root)))

    p = root / "src/creature/actions/actionChains.ts"
    if 'origin: "user"' not in read(p):
        replace_once(
            p,
            'return { id: `${intention}-${now}`, intention, habitActivity, habitProp, steps, startedAt: now, priority, interruptibility: priority >= 100 ? "low" : "normal" };',
            'return { id: `${intention}-${now}`, origin: "user", intention, habitActivity, habitProp, steps, startedAt: now, priority, interruptibility: priority >= 100 ? "low" : "normal" };',
        )
        changed.append(str(p.relative_to(root)))

    # Habit learning: autonomous actions still update recency/use, but barely affect affinity.
    p = root / "src/creature/behavior/habitModel.ts"
    desired_habit = '''import type { Activity, HabitProfile, RoomPropId } from "../../shared/types";

const boundedAffinity = (value: number, learningStrength: number): number => {
  const decay = 1 - 0.015 * learningStrength;
  return Math.max(0.75, Math.min(1.25, 1 + (value - 1) * decay));
};

export function recordHabit(
  habits: HabitProfile,
  activity: Activity,
  prop?: RoomPropId,
  reinforcement = 1
): HabitProfile {
  const learning = Math.max(0, Math.min(1, reinforcement));
  const activityAffinity = Object.fromEntries(
    Object.entries(habits.activityAffinity).map(([key, value]) => [key, boundedAffinity(value ?? 1, learning)])
  );
  const propAffinity = Object.fromEntries(
    Object.entries(habits.propAffinity).map(([key, value]) => [key, boundedAffinity(value ?? 1, learning)])
  );
  activityAffinity[activity] = Math.min(1.25, (activityAffinity[activity] ?? 1) + 0.018 * learning);
  if (prop) propAffinity[prop] = Math.min(1.25, (propAffinity[prop] ?? 1) + 0.018 * learning);
  return {
    activityAffinity,
    propAffinity,
    activityUses: { ...habits.activityUses, [activity]: (habits.activityUses[activity] ?? 0) + 1 },
    propUses: prop ? { ...habits.propUses, [prop]: (habits.propUses[prop] ?? 0) + 1 } : { ...habits.propUses },
    recentActivities: [...habits.recentActivities, activity].slice(-8),
    recentProps: prop ? [...habits.recentProps, prop].slice(-8) : habits.recentProps.slice(-8)
  };
}

export function noveltyModifier<T>(recent: readonly T[], value: T): number {
  const count = recent.filter((entry) => entry === value).length;
  return Math.max(0.3, 1 - count * 0.22);
}
'''
    if read(p) != desired_habit:
        write(p, desired_habit)
        changed.append(str(p.relative_to(root)))

    # Pure focus-session tracker.
    p = root / "src/interaction/focusAwareness.ts"
    desired_focus = '''import type { DesktopActivityKind, FocusState } from "../shared/types";

export interface FocusSnapshot {
  focusState: FocusState;
  focusMinutes: number;
}

const focusedActivities = new Set<DesktopActivityKind>(["coding", "writing", "reading", "drawing"]);

export class FocusSessionTracker {
  private focusedSince: number | null = null;
  private lastFocusEndedAt: number | null = null;
  private lastFocusDurationMinutes = 0;

  constructor(
    private readonly minimumSustainedMs = 5 * 60_000,
    private readonly recentWindowMs = 15 * 60_000
  ) {}

  reset(): FocusSnapshot {
    this.focusedSince = null;
    this.lastFocusEndedAt = null;
    this.lastFocusDurationMinutes = 0;
    return { focusState: "none", focusMinutes: 0 };
  }

  sample(
    activity: DesktopActivityKind,
    userPresent: boolean,
    fullscreen: boolean,
    enabled: boolean,
    now = Date.now()
  ): FocusSnapshot {
    if (!enabled) return this.reset();

    const focused = userPresent && !fullscreen && focusedActivities.has(activity);
    if (focused) {
      this.focusedSince ??= now;
      return {
        focusState: "focused",
        focusMinutes: Math.max(0, (now - this.focusedSince) / 60_000)
      };
    }

    if (this.focusedSince !== null) {
      const durationMs = Math.max(0, now - this.focusedSince);
      this.focusedSince = null;
      if (durationMs >= this.minimumSustainedMs) {
        this.lastFocusEndedAt = now;
        this.lastFocusDurationMinutes = durationMs / 60_000;
      }
    }

    if (this.lastFocusEndedAt !== null) {
      if (now - this.lastFocusEndedAt <= this.recentWindowMs) {
        return {
          focusState: "recently-finished",
          focusMinutes: this.lastFocusDurationMinutes
        };
      }
      this.lastFocusEndedAt = null;
      this.lastFocusDurationMinutes = 0;
    }

    return { focusState: "none", focusMinutes: 0 };
  }
}
'''
    if not p.exists() or read(p) != desired_focus:
        write(p, desired_focus)
        changed.append(str(p.relative_to(root)))

    # App classification additions without inspecting window contents.
    p = root / "src/interaction/appAwareness.ts"
    content = read(p)
    if '"chat"' not in content.splitlines()[0]:
        content = content.replace(
            'export type AppCategory = "coding" | "writing" | "browser" | "media" | "creative" | "other";',
            'export type AppCategory = "coding" | "writing" | "browser" | "media" | "creative" | "chat" | "presentation" | "other";',
            1,
        )
        content = content.replace(
            'coding: ["code", "code - insiders", "cursor", "windsurf", "devenv", "idea64", "pycharm64", "webstorm64", "rider64", "notepad++"],',
            'coding: ["code", "code - insiders", "cursor", "windsurf", "devenv", "idea64", "pycharm64", "webstorm64", "rider64", "notepad++", "windowsterminal", "wt", "powershell", "pwsh", "cmd"],',
            1,
        )
        content = content.replace(
            'creative: ["figma", "photoshop", "illustrator", "blender", "krita", "inkscape", "aseprite"]',
            'creative: ["figma", "photoshop", "illustrator", "blender", "krita", "inkscape", "aseprite"],\n  chat: ["discord", "slack", "teams", "ms-teams", "zoom"],\n  presentation: ["powerpnt"]',
            1,
        )
        write(p, content)
        changed.append(str(p.relative_to(root)))

    # Context-aware room scorer.
    p = root / "src/creature/behavior/behaviorScoring.ts"
    desired_scoring = '''import type { CreatureState, DesktopAwarenessContext, ImpulseKind, RoomPropId } from "../../shared/types";
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
'''
    if read(p) != desired_scoring:
        write(p, desired_scoring)
        changed.append(str(p.relative_to(root)))

    # Planner threads context and marks autonomous plans.
    p = root / "src/creature/behavior/BehaviorPlanner.ts"
    content = read(p)
    if "DesktopAwarenessContext" not in content:
        content = content.replace(
            'import type { CreatureState } from "../../shared/types";',
            'import type { CreatureState, DesktopAwarenessContext } from "../../shared/types";',
            1,
        )
    content = content.replace(
        '''  chooseRoomPlan(state: CreatureState, now: number): ActionPlan {
    const scores = scoreRoomBehaviors(state);''',
        '''  chooseRoomPlan(state: CreatureState, now: number, desktopContext: DesktopAwarenessContext | null = null): ActionPlan {
    const scores = scoreRoomBehaviors(state, { desktopContext, now });''',
        1,
    )
    if 'origin: "autonomous"' not in content:
        content = content.replace(
            '''    return {
      ...plan,
      steps:''',
            '''    return {
      ...plan,
      origin: "autonomous",
      steps:''',
            1,
        )
    write(p, content)
    if str(p.relative_to(root)) not in changed:
        changed.append(str(p.relative_to(root)))

    # Brain passes context and origin-weights learning.
    p = root / "src/creature/brain/CreatureBrain.ts"
    content = read(p)
    content2 = content.replace(
        'this.startPlan(this.planner.chooseRoomPlan(this.state, now));',
        'this.startPlan(this.planner.chooseRoomPlan(this.state, now, this.desktopContext));',
        1,
    )
    content2 = content2.replace(
        'this.state.habits = recordHabit(this.state.habits, plan.habitActivity, plan.habitProp);',
        '''const reinforcement = plan.origin === "autonomous" ? 0.05 : plan.origin === "context" ? 0.3 : 1;
    this.state.habits = recordHabit(this.state.habits, plan.habitActivity, plan.habitProp, reinforcement);''',
        1,
    )
    content2 = content2.replace(
        'if (!this.state.preferences.paused) this.startPlan(simplePropRoutine("rug", Date.now(), 80));',
        'if (!this.state.preferences.paused) this.startPlan({ ...simplePropRoutine("rug", Date.now(), 80), origin: "context" });',
        1,
    )
    if content2 == content and "plan.origin" not in content:
        raise RuntimeError(f"{p}: expected CreatureBrain anchors were not found")
    if content2 != content:
        write(p, content2)
        changed.append(str(p.relative_to(root)))

    # Separate conversational voice profile.
    p = root / "src/interaction/dialogue/voiceProfile.ts"
    desired_voice = '''export interface VoiceProfile {
  verbosity: number;
  sarcasm: number;
  warmth: number;
  slang: number;
  weirdness: number;
  initiative: number;
  directness: number;
}

export const TINY_MINT_VOICE_PROFILE: VoiceProfile = {
  verbosity: 0.2,
  sarcasm: 0.52,
  warmth: 0.56,
  slang: 0.34,
  weirdness: 0.62,
  initiative: 0.38,
  directness: 0.78
};

export function describeVoiceProfile(profile: VoiceProfile = TINY_MINT_VOICE_PROFILE): string {
  const tags: string[] = [];
  tags.push(profile.verbosity < 0.35 ? "brief" : profile.verbosity > 0.7 ? "talkative" : "moderate");
  if (profile.directness > 0.65) tags.push("direct");
  if (profile.sarcasm > 0.45) tags.push("dry");
  if (profile.warmth > 0.5) tags.push("warm");
  if (profile.weirdness > 0.5) tags.push("weird");
  if (profile.slang > 0.55) tags.push("slangy");
  else if (profile.slang < 0.4) tags.push("light-slang");
  return tags.join(",");
}
'''
    if not p.exists() or read(p) != desired_voice:
        write(p, desired_voice)
        changed.append(str(p.relative_to(root)))

    p = root / "src/interaction/dialogue/LocalDialogueProvider.ts"
    content = read(p)
    if 'from "./voiceProfile"' not in content:
        content = content.replace(
            'import { validateUtterance } from "./responseValidation";',
            'import { validateUtterance } from "./responseValidation";\nimport { TINY_MINT_VOICE_PROFILE, type VoiceProfile } from "./voiceProfile";',
            1,
        )
    content = content.replace(
        '  constructor(private readonly random: () => number = Math.random) {}',
        '  constructor(private readonly random: () => number = Math.random, private readonly voice: VoiceProfile = TINY_MINT_VOICE_PROFILE) {}',
        1,
    )
    old_options = '''    const options = latestUserMessage
      ? reactions
      : moodLines[request.context.mood] ?? openingLines[request.trigger];'''
    new_options = '''    const focusLines = request.context.desktopContext?.focusState === "focused"
      ? (this.voice.directness >= 0.65 ? ["still working huh", "i'll be quiet", "locked in"] : ["busy?", "hmm", "okay"])
      : request.context.desktopContext?.focusState === "recently-finished"
        ? (this.voice.warmth >= 0.5 ? ["done for now?", "you survived", "okay break time"] : ["finally", "done?", "break time"])
        : undefined;
    const options = latestUserMessage
      ? reactions
      : focusLines ?? moodLines[request.context.mood] ?? openingLines[request.trigger];'''
    if old_options in content:
        content = content.replace(old_options, new_options, 1)
    elif "const focusLines =" not in content:
        raise RuntimeError(f"{p}: local dialogue options anchor not found")
    write(p, content)
    if str(p.relative_to(root)) not in changed:
        changed.append(str(p.relative_to(root)))

    p = root / "src/interaction/dialogue/promptBuilder.ts"
    content = read(p)
    if 'from "./voiceProfile"' not in content:
        content = content.replace(
            'import type { ConversationMessage, DialogueRequest } from "../../shared/types";',
            'import type { ConversationMessage, DialogueRequest } from "../../shared/types";\nimport { describeVoiceProfile } from "./voiceProfile";',
            1,
        )
    old_traits = '''  return Object.entries(values)
    .sort(([, a], [, b]) => b - a)'''
    new_traits = '''  return Object.entries(values)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(([, a], [, b]) => b - a)'''
    if old_traits in content:
        content = content.replace(old_traits, new_traits, 1)
    old_runtime = '''    `personality=${strongestPersonalityTraits(request).join(",") || "balanced"}`,
    "</RUNTIME_CONTEXT>",'''
    new_runtime = '''    `personality=${strongestPersonalityTraits(request).join(",") || "balanced"}`,
    `voice=${describeVoiceProfile()}`,
    `desktop_activity=${context.desktopContext?.activity ?? "unknown"}`,
    `focus_state=${context.desktopContext?.focusState ?? "none"}`,
    `focus_minutes=${Math.round(context.desktopContext?.focusMinutes ?? 0)}`,
    "</RUNTIME_CONTEXT>",'''
    if old_runtime in content:
        content = content.replace(old_runtime, new_runtime, 1)
    elif "focus_state=" not in content:
        raise RuntimeError(f"{p}: prompt runtime anchor not found")
    write(p, content)
    if str(p.relative_to(root)) not in changed:
        changed.append(str(p.relative_to(root)))

    # Controller gets privacy-preserving desktop context for dialogue.
    p = root / "src/interaction/InteractionController.ts"
    content = read(p)
    if "DesktopAwarenessContext" not in content.split('from "../shared/types";')[0]:
        content = content.replace(
            '''  InteractionSession,
  InteractionTrigger
} from "../shared/types";''',
            '''  InteractionSession,
  InteractionTrigger,
  DesktopAwarenessContext
} from "../shared/types";''',
            1,
        )
    if "getDesktopContext?()" not in content:
        content = content.replace(
            '''  getState(): CreatureState;
  brain: InteractionBrain;''',
            '''  getState(): CreatureState;
  getDesktopContext?(): DesktopAwarenessContext | null;
  brain: InteractionBrain;''',
            1,
        )
    content = content.replace(
        "const request = buildRequest(trigger, this.options.getState(), session.messages);",
        "const request = buildRequest(trigger, this.options.getState(), session.messages, this.options.getDesktopContext?.() ?? null);",
        1,
    )
    content = content.replace(
        "function buildRequest(trigger: InteractionTrigger, state: CreatureState, messages: ConversationMessage[]): DialogueRequest {",
        "function buildRequest(trigger: InteractionTrigger, state: CreatureState, messages: ConversationMessage[], desktopContext: DesktopAwarenessContext | null): DialogueRequest {",
        1,
    )
    old_personality = '''      personality: {
        curiosity: state.personality.curiosity,
        creativity: state.personality.creativity,
        independence: state.personality.independence,
        sociability: state.personality.sociability
      }'''
    new_personality = '''      personality: { ...state.personality },
      desktopContext'''
    if old_personality in content:
        content = content.replace(old_personality, new_personality, 1)
    elif "desktopContext" not in content[content.find("function buildRequest"):]:
        raise RuntimeError(f"{p}: buildRequest personality anchor not found")
    write(p, content)
    if str(p.relative_to(root)) not in changed:
        changed.append(str(p.relative_to(root)))

    # Main process: focus tracker, dialogue context, focus-aware speech/cursor.
    p = root / "src/electron/main.ts"
    content = read(p)
    if "FocusSessionTracker" not in content:
        content = content.replace(
            'import { classifyApp } from "../interaction/appAwareness";',
            'import { classifyApp } from "../interaction/appAwareness";\nimport { FocusSessionTracker } from "../interaction/focusAwareness";',
            1,
        )
        content = content.replace(
            'let desktopAwarenessContext: DesktopAwarenessContext | null = null;',
            'let desktopAwarenessContext: DesktopAwarenessContext | null = null;\nconst focusTracker = new FocusSessionTracker();',
            1,
        )

    old_mapping = '''  const activity: DesktopAwarenessContext["activity"] = category === "browser" ? "browsing"
    : category === "creative" ? "drawing"
      : category === "other" ? (present ? "unknown" : "idle")
        : category;
  const context = enabled
    ? { activity, userPresent: present, fullscreen: hidden, sampledAt: Date.now() }
    : null;'''
    new_mapping = '''  const activity: DesktopAwarenessContext["activity"] = category === "browser" ? "browsing"
    : category === "creative" ? "drawing"
      : category === "chat" ? "chatting"
        : category === "presentation" ? "presentation"
          : category === "other" ? (present ? "unknown" : "idle")
            : category;
  const now = Date.now();
  const focus = focusTracker.sample(activity, present, hidden, privacy.desktopAwarenessEnabled, now);
  const context = enabled
    ? { activity, userPresent: present, fullscreen: hidden, sampledAt: now, ...focus }
    : null;'''
    if old_mapping in content:
        content = content.replace(old_mapping, new_mapping, 1)
    elif "focusTracker.sample" not in content:
        raise RuntimeError(f"{p}: awareness context mapping anchor not found")

    content = content.replace(
        "interactionController.setUserBusy(keyboardActive);",
        'interactionController.setUserBusy(keyboardActive || context?.focusState === "focused");',
        1,
    )
    if "getDesktopContext: () => desktopAwarenessContext" not in content:
        content = content.replace(
            '''    getState: () => brain.snapshot(),
    brain,''',
            '''    getState: () => brain.snapshot(),
    getDesktopContext: () => desktopAwarenessContext,
    brain,''',
            1,
        )

    old_cursor = '''    if (state.preferences.cursorNudgesEnabled && state.location === "desktop" && state.currentActivity === "observe"
      && !process.env.TINY_MINT_SMOKE_OUTPUT && Math.random() < 0.03) {'''
    new_cursor = '''    const context = desktopAwarenessContext;
    const casualContext = !context || ["browsing", "media", "idle", "unknown"].includes(context.activity);
    const nudgeChance = (0.0015 + state.personality.confidence * 0.003 + state.personality.curiosity * 0.0025) * (casualContext ? 1.35 : 1);
    if (state.preferences.cursorNudgesEnabled && state.location === "desktop" && state.currentActivity === "observe"
      && context?.focusState !== "focused" && !context?.fullscreen
      && !process.env.TINY_MINT_SMOKE_OUTPUT && Math.random() < nudgeChance) {'''
    if old_cursor in content:
        content = content.replace(old_cursor, new_cursor, 1)
    elif "const nudgeChance =" not in content:
        raise RuntimeError(f"{p}: cursor nudge anchor not found")

    write(p, content)
    if str(p.relative_to(root)) not in changed:
        changed.append(str(p.relative_to(root)))

    # Tests: focus tracker.
    p = root / "tests/focusAwareness.test.ts"
    desired_focus_test = '''import { describe, expect, it } from "vitest";
import { FocusSessionTracker } from "../src/interaction/focusAwareness";

describe("FocusSessionTracker", () => {
  it("tracks focused duration and only creates a post-focus window after sustained work", () => {
    const tracker = new FocusSessionTracker(5 * 60_000, 15 * 60_000);
    const start = 1_000_000;

    expect(tracker.sample("coding", true, false, true, start)).toEqual({ focusState: "focused", focusMinutes: 0 });
    expect(tracker.sample("coding", true, false, true, start + 10 * 60_000)).toEqual({ focusState: "focused", focusMinutes: 10 });

    const finished = tracker.sample("browsing", true, false, true, start + 10 * 60_000 + 1);
    expect(finished.focusState).toBe("recently-finished");
    expect(finished.focusMinutes).toBeCloseTo(10, 3);
  });

  it("does not call a short app switch a sustained focus session", () => {
    const tracker = new FocusSessionTracker(5 * 60_000, 15 * 60_000);
    const start = 2_000_000;
    tracker.sample("writing", true, false, true, start);
    expect(tracker.sample("browsing", true, false, true, start + 60_000).focusState).toBe("none");
  });

  it("expires recent focus and resets when awareness is disabled", () => {
    const tracker = new FocusSessionTracker(60_000, 5 * 60_000);
    const start = 3_000_000;
    tracker.sample("drawing", true, false, true, start);
    tracker.sample("drawing", true, false, true, start + 2 * 60_000);
    expect(tracker.sample("idle", true, false, true, start + 2 * 60_000 + 1).focusState).toBe("recently-finished");
    expect(tracker.sample("idle", true, false, true, start + 8 * 60_000).focusState).toBe("none");

    tracker.sample("coding", true, false, true, start + 9 * 60_000);
    expect(tracker.sample("coding", true, false, false, start + 10 * 60_000)).toEqual({ focusState: "none", focusMinutes: 0 });
  });

  it("does not count fullscreen or an absent user as focused work", () => {
    const tracker = new FocusSessionTracker();
    expect(tracker.sample("coding", true, true, true, 1)).toEqual({ focusState: "none", focusMinutes: 0 });
    expect(tracker.sample("coding", false, false, true, 2)).toEqual({ focusState: "none", focusMinutes: 0 });
  });
});
'''
    if not p.exists() or read(p) != desired_focus_test:
        write(p, desired_focus_test)
        changed.append(str(p.relative_to(root)))

    # Room scoring / learning tests.
    p = root / "tests/behaviorPlanner.test.ts"
    behavior_tests = r'''
describe("desktop-aware room behavior", () => {
  const context = (overrides: Partial<{
    activity: "coding" | "browsing" | "media" | "drawing" | "idle";
    userPresent: boolean;
    fullscreen: boolean;
    focusState: "none" | "focused" | "recently-finished";
    focusMinutes: number;
  }> = {}) => ({
    activity: "coding" as const,
    userPresent: true,
    fullscreen: false,
    sampledAt: 1_000_000,
    focusState: "none" as const,
    focusMinutes: 0,
    ...overrides
  });

  it("suppresses disruptive room behavior during sustained focused work", () => {
    const state = defaultState();
    state.location = "room";
    state.preferences.bongAutonomyEnabled = true;
    const baseline = scoreRoomBehaviors(state, { hour: 20, now: 1_000_000 });
    const focused = scoreRoomBehaviors(state, {
      hour: 20,
      now: 1_000_000,
      desktopContext: context({ focusState: "focused", focusMinutes: 45 })
    });

    expect(focused.bong).toBe(0);
    expect(focused.play).toBeLessThan(baseline.play / 2);
    expect(focused.exit).toBeLessThan(baseline.exit / 2);
    expect(focused.sit).toBeGreaterThan(baseline.sit);
    expect(focused.book).toBeGreaterThan(baseline.book);
  });

  it("loosens up after focus and responds to media without making the clock dominant", () => {
    const state = defaultState();
    state.location = "room";
    state.preferences.bongAutonomyEnabled = true;
    const baseline = scoreRoomBehaviors(state, { hour: 14, now: 1_000_000 });
    const afterFocus = scoreRoomBehaviors(state, {
      hour: 14,
      now: 1_000_000,
      desktopContext: context({ activity: "browsing", focusState: "recently-finished", focusMinutes: 90 })
    });
    const media = scoreRoomBehaviors(state, {
      hour: 14,
      now: 1_000_000,
      desktopContext: context({ activity: "media" })
    });

    expect(afterFocus.play).toBeGreaterThan(baseline.play);
    expect(afterFocus.music).toBeGreaterThan(baseline.music);
    expect(media.music).toBeGreaterThan(baseline.music);
    expect(media.sit).toBeGreaterThan(baseline.sit);
  });

  it("does not try to return to a fullscreen desktop and becomes more solitary while the user is away", () => {
    const state = defaultState();
    state.location = "room";
    const baseline = scoreRoomBehaviors(state, { hour: 14, now: 1_000_000 });
    const fullscreen = scoreRoomBehaviors(state, {
      hour: 14,
      now: 1_000_000,
      desktopContext: context({ fullscreen: true })
    });
    const away = scoreRoomBehaviors(state, {
      hour: 14,
      now: 1_000_000,
      desktopContext: context({ userPresent: false, activity: "idle" })
    });

    expect(fullscreen.exit).toBe(0);
    expect(away.exit).toBeLessThan(baseline.exit);
    expect(away.book).toBeGreaterThan(baseline.book);
    expect(away.sleep).toBeGreaterThan(baseline.sleep);
  });

  it("marks planner-selected plans autonomous", () => {
    const state = defaultState();
    state.location = "room";
    expect(new BehaviorPlanner(() => 0).chooseRoomPlan(state, 1_000_000).origin).toBe("autonomous");
  });

  it("lets user-directed behavior teach affinity much more strongly than autonomous repetition", () => {
    let user = defaultState().habits;
    let autonomous = defaultState().habits;
    for (let index = 0; index < 20; index += 1) {
      user = recordHabit(user, "draw", "desk", 1);
      autonomous = recordHabit(autonomous, "draw", "desk", 0.05);
    }

    expect((user.activityAffinity.draw ?? 1) - (autonomous.activityAffinity.draw ?? 1)).toBeGreaterThan(0.1);
    expect(user.activityUses.draw).toBe(20);
    expect(autonomous.activityUses.draw).toBe(20);
    expect(autonomous.recentActivities).toHaveLength(8);
  });
});
'''
    if append_once(p, 'describe("desktop-aware room behavior"', behavior_tests):
        changed.append(str(p.relative_to(root)))

    # App classifier tests.
    p = root / "tests/keyboardApp.test.ts"
    content = read(p)
    if 'classifyApp("Discord")' not in content:
        content = content.replace(
            '''    expect(classifyApp("blender")).toBe("creative");
    expect(classifyApp("code-unknown")).toBe("other");''',
            '''    expect(classifyApp("blender")).toBe("creative");
    expect(classifyApp("WindowsTerminal.exe")).toBe("coding");
    expect(classifyApp("Discord")).toBe("chat");
    expect(classifyApp("POWERPNT.EXE")).toBe("presentation");
    expect(classifyApp("code-unknown")).toBe("other");''',
            1,
        )
        write(p, content)
        changed.append(str(p.relative_to(root)))

    # Dialogue context tests.
    p = root / "tests/interaction.test.ts"
    dialogue_tests = r'''
describe("desktop-context dialogue", () => {
  const focusedContext = {
    activity: "coding" as const,
    userPresent: true,
    fullscreen: false,
    sampledAt: 1_000_000,
    focusState: "focused" as const,
    focusMinutes: 72
  };

  it("includes only coarse desktop/focus context in the Groq runtime prompt", () => {
    const messages = buildDialogueMessages({
      ...request,
      context: { ...request.context, desktopContext: focusedContext }
    });
    const runtime = messages.at(-1)?.content ?? "";
    expect(runtime).toContain("desktop_activity=coding");
    expect(runtime).toContain("focus_state=focused");
    expect(runtime).toContain("focus_minutes=72");
    expect(runtime).toContain("voice=");
    expect(runtime).not.toMatch(/window_title|keystroke|screen_content/i);
  });

  it("keeps local fallback dialogue context-aware during focus", async () => {
    const provider = new LocalDialogueProvider(() => 0);
    const response = await provider.respond({
      ...request,
      context: { ...request.context, desktopContext: focusedContext }
    });
    expect(response.text).toBe("still working huh");
  });
});
'''
    if append_once(p, 'describe("desktop-context dialogue"', dialogue_tests):
        changed.append(str(p.relative_to(root)))

    return changed

def validate(root: Path) -> None:
    commands = [
        ["npm", "run", "typecheck"],
        ["npm", "test"],
        ["npm", "run", "build"],
    ]
    for cmd in commands:
        print(f"\n$ {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=root)
        if result.returncode != 0:
            raise SystemExit(result.returncode)

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo", type=Path, help="Path to the Bebop repository")
    parser.add_argument("--force", action="store_true", help="Apply even when git HEAD is not one of the known base commits")
    parser.add_argument("--validate", action="store_true", help="Run typecheck, tests, and build after applying")
    args = parser.parse_args()

    root = args.repo.expanduser().resolve()
    verify_repo(root, args.force)
    changed = apply(root)

    print("\nApplied Tiny Mint context-aware behavior implementation.")
    if changed:
        print("Changed/created:")
        for path in changed:
            print(f"  - {path}")
    else:
        print("No changes were needed; the implementation already appears applied.")

    try:
        status = run(["git", "status", "--short"], root).stdout
        if status:
            print("\nGit status:")
            print(status.rstrip())
    except Exception:
        pass

    if args.validate:
        validate(root)
    else:
        print("\nValidation not run. Recommended:")
        print("  npm run typecheck")
        print("  npm test")
        print("  npm run build")
        print("  npm run smoke   # on Windows/Electron environment")

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
