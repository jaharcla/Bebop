import { animationFor, chooseActivity, type RandomSource } from "../behavior/behaviorEngine";
import { roomPropById } from "../room/roomProps";
import { clampState, defaultState } from "../state/defaultState";
import type { Activity, CreaturePreferences, CreatureState, Location, RoomPropId } from "../../shared/types";

export type StateListener = (state: CreatureState) => void;

export class CreatureBrain {
  private state: CreatureState;
  private listener: StateListener | undefined;
  private timer: NodeJS.Timeout | undefined;
  private nextDecisionAt = Date.now() + 14_000;

  constructor(initial: CreatureState = defaultState(), private readonly random: RandomSource = Math.random) {
    this.state = clampState(initial);
  }

  snapshot(): CreatureState {
    return structuredClone(this.state);
  }

  subscribe(listener: StateListener): () => void {
    this.listener = listener;
    listener(this.snapshot());
    return () => { this.listener = undefined; };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 1_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  interact(kind: "click" | "drag"): void {
    this.state.lastUserInteraction = Date.now();
    this.state.socialInterest = Math.min(100, this.state.socialInterest + 4);
    this.state.comfort = Math.min(100, this.state.comfort + 2);
    this.state.currentAnimation = kind === "click" ? "tap" : "happy";
    this.state.currentActivity = "idle";
    this.nextDecisionAt = Date.now() + (kind === "click" ? 2_200 : 4_000);
    this.publish();
  }

  setPosition(x: number, y: number, options: { notify?: boolean; userInteraction?: boolean } = {}): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Creature position must be finite.");
    this.state.position = { x: Math.round(x), y: Math.round(y) };
    if (options.userInteraction) this.state.lastUserInteraction = Date.now();
    if (options.notify !== false) this.publish();
  }

  useRoomProp(id: RoomPropId): void {
    const prop = roomPropById(id);
    if (prop.action === "visit") {
      this.setLocation("desktop");
      return;
    }
    this.state.location = "room";
    this.state.room.target = id;
    this.state.currentActivity = prop.activity;
    this.state.currentAnimation = prop.animation;
    this.state.lastUserInteraction = Date.now();
    this.state.lastActivityChange = Date.now();
    this.nextDecisionAt = Date.now() + this.activityDuration(prop.activity);
    this.publish();
  }

  setActivity(activity: Activity): void {
    const now = Date.now();
    if (activity === "visitRoom") {
      this.setLocation("room");
      return;
    }
    if (activity === "visitDesktop") {
      this.setLocation("desktop");
      return;
    }
    this.state.currentActivity = activity;
    this.state.currentAnimation = animationFor(activity, this.state.location);
    if (this.state.location === "room") this.state.room.target = this.roomTargetFor(activity);
    this.state.lastActivityChange = now;
    this.nextDecisionAt = now + this.activityDuration(activity);
    this.publish();
  }

  setLocation(location: Location): void {
    this.state.location = location;
    if (location === "room") {
      const roll = this.random();
      const activity: Activity = !this.state.preferences.roomAutonomyEnabled
        ? "rest"
        : this.state.energy < 35
        ? "sleep"
        : roll < 0.2
          ? "draw"
          : roll < 0.4
            ? "read"
            : "rest";
      this.state.currentActivity = activity;
      this.state.currentAnimation = animationFor(activity, "room");
      this.state.room.target = this.roomTargetFor(activity);
    } else {
      this.state.currentActivity = "idle";
      this.state.currentAnimation = "idle";
    }
    this.state.lastActivityChange = Date.now();
    this.nextDecisionAt = Date.now() + (location === "room" ? 9_000 + this.random() * 14_000 : 7_000 + this.random() * 13_000);
    this.publish();
  }

  patchPreferences(patch: Partial<CreaturePreferences>): void {
    this.state.preferences = { ...this.state.preferences, ...patch };
    const schedulingPreferenceChanged = ["paused", "roamingEnabled", "roomVisitsEnabled", "roomAutonomyEnabled"]
      .some((key) => Object.hasOwn(patch, key));
    if (schedulingPreferenceChanged && !this.state.preferences.paused) {
      this.nextDecisionAt = Date.now() + this.activityDuration(this.state.currentActivity);
    }
    if (Object.hasOwn(patch, "roamingEnabled") && !this.state.preferences.roamingEnabled && this.state.currentActivity === "wander") {
      this.state.currentActivity = "idle";
      this.state.currentAnimation = "idle";
    }
    this.publish();
  }

  reset(): void {
    const position = this.state.position;
    this.state = { ...defaultState(), position };
    this.nextDecisionAt = Date.now() + 10_000;
    this.publish();
  }

  private tick(): void {
    if (this.state.preferences.paused) return;
    const resting = ["rest", "sleep", "sit"].includes(this.state.currentActivity);
    this.state.energy += resting ? 0.7 : -0.12;
    this.state.boredom += this.state.currentActivity === "idle" ? 0.35 : -0.28;
    this.state.stimulation += ["wander", "draw", "read", "exercise", "play"].includes(this.state.currentActivity) ? 0.3 : -0.08;
    this.state = clampState(this.state);
    this.state.mood = this.state.energy < 25 ? "sleepy" : this.state.boredom > 72 ? "bored" : this.state.curiosity > 72 ? "curious" : "chill";
    if (Date.now() >= this.nextDecisionAt && !this.state.preferences.paused) {
      this.setActivity(chooseActivity(this.state, this.random));
      return;
    }
    this.publish();
  }

  private roomTargetFor(activity: Activity): RoomPropId {
    if (activity === "sleep" || activity === "rest") return "bed";
    if (activity === "draw") return "desk";
    if (activity === "read") return this.random() < 0.5 ? "bookshelf" : "book";
    if (activity === "exercise") return "dumbbell";
    if (activity === "carry" || activity === "show") return "sketchbook";
    if (activity === "inspect") return this.random() < 0.5 ? "plant" : "watering-can";
    if (activity === "play") return this.random() < 0.5 ? "ball" : "toy-box";
    if (activity === "music") return "music-player";
    if (activity === "sit") {
      const choices: RoomPropId[] = ["chair", "rug", "cushion"];
      return choices[Math.floor(this.random() * choices.length)] ?? "rug";
    }
    return "rug";
  }

  private activityDuration(activity: Activity): number {
    const ranges: Record<Activity, [number, number]> = {
      idle: [7_000, 16_000],
      wander: [7_000, 16_000],
      observe: [5_000, 11_000],
      rest: [12_000, 24_000],
      sit: [8_000, 18_000],
      sleep: [16_000, 30_000],
      draw: [10_000, 20_000],
      read: [10_000, 22_000],
      exercise: [7_000, 14_000],
      carry: [7_000, 13_000],
      inspect: [4_000, 9_000],
      play: [5_000, 10_000],
      music: [8_000, 16_000],
      show: [6_000, 12_000],
      visitRoom: [1, 1],
      visitDesktop: [1, 1]
    };
    const [min, max] = ranges[activity];
    return min + this.random() * (max - min);
  }

  private publish(): void {
    this.listener?.(this.snapshot());
  }
}
