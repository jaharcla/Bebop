import { ActionExecutor } from "../actions/ActionExecutor";
import type { ActionPlan, ActionStep } from "../actions/ActionPlan";
import { roomExitRoutine, simplePropRoutine } from "../actions/actionChains";
import { BehaviorPlanner } from "../behavior/BehaviorPlanner";
import { updateImpulse } from "../behavior/behaviorImpulses";
import { animationFor, chooseActivity, type RandomSource } from "../behavior/behaviorEngine";
import { recordHabit } from "../behavior/habitModel";
import { clampState, defaultState } from "../state/defaultState";
import { approachPoint } from "../world/roomEntities";
import type { Activity, CreaturePreferences, CreatureState, Location, RoomPropId, WorldPosition } from "../../shared/types";

export type StateListener = (state: CreatureState) => void;

export class CreatureBrain {
  private state: CreatureState;
  private listener: StateListener | undefined;
  private timer: NodeJS.Timeout | undefined;
  private nextDecisionAt = Date.now() + 14_000;
  private lastNeedsUpdate = Date.now();
  private conversationActive = false;
  private readonly planner: BehaviorPlanner;
  private readonly executor: ActionExecutor;

  constructor(initial: CreatureState = defaultState(), private readonly random: RandomSource = Math.random) {
    this.state = clampState(initial);
    this.planner = new BehaviorPlanner(random);
    this.executor = new ActionExecutor({
      position: () => this.state.room.position,
      move: (position, target) => this.moveInRoom(position, target),
      begin: (step) => this.beginStep(step),
      complete: (plan) => this.completePlan(plan),
      cleanup: () => this.cleanupPlan()
    });
  }

  snapshot(): CreatureState { return structuredClone(this.state); }

  subscribe(listener: StateListener): () => void {
    this.listener = listener;
    listener(this.snapshot());
    return () => { this.listener = undefined; };
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.executor.cancel();
  }

  interact(kind: "click" | "drag"): void {
    this.executor.cancel();
    this.state.lastUserInteraction = Date.now();
    this.state.socialInterest = Math.min(100, this.state.socialInterest + 4);
    this.state.comfort = Math.min(100, this.state.comfort + 2);
    this.state.currentAnimation = kind === "click" ? "tap" : "happy";
    this.state.currentActivity = "idle";
    this.nextDecisionAt = Date.now() + (kind === "click" ? 2_200 : 4_000);
    this.publish();
  }

  setConversationActive(active: boolean): void { this.conversationActive = active; }

  recordConversationReply(): void {
    this.state.lastUserInteraction = Date.now();
    this.state.socialInterest = Math.min(100, this.state.socialInterest + 2);
    this.state.comfort = Math.min(100, this.state.comfort + 1);
    this.publish();
  }

  recordCreatureConversation(): void {
    this.state.lastCreatureInteraction = Date.now();
    this.publish();
  }

  setPosition(x: number, y: number, options: { notify?: boolean; userInteraction?: boolean } = {}): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Creature position must be finite.");
    this.state.position = { x: Math.round(x), y: Math.round(y) };
    if (options.userInteraction) this.state.lastUserInteraction = Date.now();
    if (options.notify !== false) this.publish();
  }

  useRoomProp(id: RoomPropId): void {
    if (this.state.location !== "room") this.enterRoom();
    this.state.lastUserInteraction = Date.now();
    this.startPlan(simplePropRoutine(id, Date.now(), 100));
  }

  setActivity(activity: Activity): void {
    const now = Date.now();
    if (this.conversationActive && (activity === "visitRoom" || activity === "visitDesktop")) return;
    if (activity === "visitRoom") {
      this.executor.cancel();
      this.state.currentActivity = "visitRoom";
      this.state.currentAnimation = "walk";
      this.state.lastActivityChange = now;
      this.nextDecisionAt = now + 60_000;
      this.publish();
      return;
    }
    if (activity === "visitDesktop" && this.state.location === "room") { this.startPlan(roomExitRoutine(now)); return; }
    if (activity === "visitDesktop") { this.transitionLocation("desktop"); return; }
    this.executor.cancel();
    this.state.currentActivity = activity;
    this.state.currentAnimation = animationFor(activity, this.state.location);
    this.state.lastActivityChange = now;
    this.nextDecisionAt = now + this.activityDuration(activity);
    this.publish();
  }

  setLocation(location: Location): void {
    if (location === "room") this.enterRoom();
    else this.transitionLocation("desktop");
  }

  patchPreferences(patch: Partial<CreaturePreferences>): void {
    this.state.preferences = { ...this.state.preferences, ...patch };
    if (patch.paused) this.executor.cancel();
    if (Object.hasOwn(patch, "roamingEnabled") && !this.state.preferences.roamingEnabled && this.state.currentActivity === "wander") {
      this.state.currentActivity = "idle";
      this.state.currentAnimation = "idle";
    }
    if (!this.state.preferences.paused) this.nextDecisionAt = Date.now() + 2_000;
    this.publish();
  }

  reset(): void {
    const position = this.state.position;
    this.executor.cancel();
    this.state = { ...defaultState(), position };
    this.nextDecisionAt = Date.now() + 10_000;
    this.lastNeedsUpdate = Date.now();
    this.publish();
  }

  private tick(): void {
    const now = Date.now();
    if (this.state.preferences.paused) {
      if ((this.executor.activePlan()?.priority ?? 0) >= 100) this.executor.tick(now);
      return;
    }
    if (now - this.lastNeedsUpdate >= 1_000) {
      const seconds = Math.min(5, (now - this.lastNeedsUpdate) / 1_000);
      this.lastNeedsUpdate = now;
      this.updateInternalState(seconds);
    }
    if (this.executor.hasActivePlan()) {
      this.executor.tick(now);
      return;
    }
    if (now < this.nextDecisionAt) return;
    this.state.impulse = updateImpulse(this.state, now, this.random);
    if (this.state.location === "room") {
      if (!this.state.preferences.roomAutonomyEnabled) {
        this.state.currentActivity = "rest";
        this.state.currentAnimation = "sleep";
        this.nextDecisionAt = now + 15_000;
        this.publish();
        return;
      }
      this.startPlan(this.planner.chooseRoomPlan(this.state, now));
    } else {
      this.setActivity(chooseActivity(this.state, this.random, this.conversationActive));
    }
  }

  private updateInternalState(seconds: number): void {
    const resting = ["rest", "sleep", "sit"].includes(this.state.currentActivity);
    this.state.energy += (resting ? 0.7 : -0.12) * seconds;
    this.state.boredom += (this.state.currentActivity === "idle" ? 0.35 : -0.28) * seconds;
    this.state.stimulation += (["wander", "draw", "read", "exercise", "play"].includes(this.state.currentActivity) ? 0.3 : -0.08) * seconds;
    this.state = clampState(this.state);
    this.state.mood = this.state.energy < 25 ? "sleepy" : this.state.boredom > 72 ? "bored" : this.state.curiosity > 72 ? "curious" : "chill";
    this.publish();
  }

  private enterRoom(): void {
    this.executor.cancel();
    this.state.location = "room";
    this.state.room = { ...this.state.room, target: "door", position: { x: 850, y: 430 }, carriedItem: null, intention: "come home" };
    this.state.lastActivityChange = Date.now();
    this.startPlan(simplePropRoutine("rug", Date.now(), 80));
  }

  private transitionLocation(location: Location): void {
    this.executor.cancel();
    this.state.location = location;
    this.state.room.carriedItem = null;
    this.state.room.intention = null;
    this.state.currentActivity = "idle";
    this.state.currentAnimation = "idle";
    if (location === "desktop") {
      this.state.socialInterest = Math.max(0, this.state.socialInterest - 4);
      this.state.comfort = Math.min(100, this.state.comfort + 1);
    }
    this.state.lastActivityChange = Date.now();
    this.nextDecisionAt = Date.now() + 7_000 + this.random() * 10_000;
    this.publish();
  }

  private startPlan(plan: ActionPlan): void {
    if (!this.executor.start(plan, Date.now())) return;
    this.state.room.intention = plan.intention;
    this.state.lastActivityChange = Date.now();
    this.publish();
  }

  private beginStep(step: ActionStep): void {
    if (step.type === "move-to") {
      this.state.currentActivity = "wander";
      this.state.currentAnimation = this.state.room.carriedItem ? "carry" : "walk";
      if (step.entity) this.state.room.target = step.entity;
    } else if (step.type === "face") {
      const target = approachPoint(step.entity);
      this.state.currentActivity = "inspect";
      this.state.currentAnimation = target.x < this.state.room.position.x ? "reach-left" : "reach-right";
      this.state.room.target = step.entity;
    } else if (step.type === "pick-up") {
      this.state.room.carriedItem = step.entity;
      this.state.currentActivity = "carry";
      this.state.currentAnimation = "carry";
    } else if (step.type === "drop") {
      this.state.room.carriedItem = null;
      this.state.currentActivity = "idle";
      this.state.currentAnimation = "idle";
    } else if (step.type === "interact" || step.type === "animate") {
      this.state.currentActivity = step.activity;
      this.state.currentAnimation = step.animation;
      if (step.type === "interact") this.state.room.target = step.entity;
      this.applyActivityEffects(step.activity);
    } else if (step.type === "transition") {
      this.transitionLocation(step.location);
      return;
    }
    this.state.lastActivityChange = Date.now();
    this.publish();
  }

  private moveInRoom(position: WorldPosition, target?: RoomPropId): void {
    this.state.room.position = { x: Math.round(position.x), y: Math.round(position.y) };
    this.state.currentActivity = "wander";
    this.state.currentAnimation = this.state.room.carriedItem ? "carry" : "walk";
    if (target) this.state.room.target = target;
    this.publish();
  }

  private completePlan(plan: ActionPlan): void {
    this.state.habits = recordHabit(this.state.habits, plan.habitActivity, plan.habitProp);
    this.state.room.carriedItem = null;
    this.state.room.intention = null;
    this.state.currentActivity = "idle";
    this.state.currentAnimation = "idle";
    this.nextDecisionAt = Date.now() + (4_000 + this.state.personality.patience * 8_000);
    this.publish();
  }

  private cleanupPlan(): void {
    this.state.room.carriedItem = null;
    this.state.room.intention = null;
    if (this.state.location === "room") {
      this.state.currentActivity = "idle";
      this.state.currentAnimation = "idle";
    }
  }

  private applyActivityEffects(activity: Activity): void {
    if (activity === "sleep") { this.state.energy += 8; this.state.comfort += 3; }
    else if (activity === "rest" || activity === "sit") { this.state.energy += 3; this.state.comfort += 2; }
    else if (activity === "draw") { this.state.boredom -= 7; this.state.stimulation += 5; this.state.energy -= 1; }
    else if (activity === "read") { this.state.curiosity -= 5; this.state.focus += 5; this.state.comfort += 2; }
    else if (activity === "exercise") { this.state.energy -= 5; this.state.stimulation += 6; }
    else if (activity === "play") { this.state.boredom -= 9; this.state.stimulation += 8; }
    else if (activity === "music") { this.state.comfort += 4; this.state.stimulation += 3; }
    else if (activity === "inspect") this.state.curiosity -= 3;
    this.state = clampState(this.state);
  }

  private activityDuration(activity: Activity): number {
    const base = activity === "sleep" ? 20_000 : activity === "rest" ? 14_000 : 8_000;
    return base * (0.75 + this.state.personality.patience * 0.6) * (1.1 - this.state.personality.chaos * 0.2);
  }

  private publish(): void { this.listener?.(this.snapshot()); }
}
