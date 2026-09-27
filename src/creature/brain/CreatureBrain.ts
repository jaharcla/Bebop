import { ActionExecutor } from "../actions/ActionExecutor";
import type { ActionPlan, ActionStep } from "../actions/ActionPlan";
import { roomExitRoutine, simplePropRoutine } from "../actions/actionChains";
import { BehaviorPlanner } from "../behavior/BehaviorPlanner";
import { updateImpulse } from "../behavior/behaviorImpulses";
import { animationFor, chooseActivity, type RandomSource } from "../behavior/behaviorEngine";
import { recordHabit } from "../behavior/habitModel";
import { clampState, defaultState } from "../state/defaultState";
import { facingTowardProp } from "../world/roomEntities";
import type { Activity, CorkboardSketchKind, CreaturePreferences, CreatureState, DesktopAwarenessContext, FacingDirection, Location, RoomPropId, WorldPosition } from "../../shared/types";

import type { AppCategory } from "../../interaction/appAwareness";

export type StateListener = (state: CreatureState) => void;

export class CreatureBrain {
  private state: CreatureState;
  private listener: StateListener | undefined;
  private timer: NodeJS.Timeout | undefined;
  private nextDecisionAt = Date.now() + 14_000;
  private lastNeedsUpdate = Date.now();
  private conversationActive = false;
  private appCategory: AppCategory = "other";
  private keyboardActive = false;
  private environmentState: "active" | "idle" | "long-idle" = "active";
  private nextEnvironmentReactionAt = 0;
  private desktopContext: DesktopAwarenessContext | null = null;
  private suspendedAt: number | undefined;
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
    this.scheduleTick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.executor.cancel();
  }

  suspend(): void {
    if (this.suspendedAt !== undefined) return;
    this.suspendedAt = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  resume(): void {
    if (this.suspendedAt === undefined) return;
    const now = Date.now();
    const suspendedFor = now - this.suspendedAt;
    this.suspendedAt = undefined;
    this.nextDecisionAt += suspendedFor;
    this.lastNeedsUpdate = now;
    this.executor.rebaseAfterSuspend(suspendedFor, now);
    if (!this.timer) this.scheduleTick();
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
    if (!this.state.onboarding.introduced) this.state.onboarding = { introduced: true };
    this.publish();
  }

  setDesktopContext(context: DesktopAwarenessContext | null): void {
    const wasFullscreen = this.desktopContext?.fullscreen ?? false;
    this.desktopContext = context ? { ...context } : null;
    if (this.state.location !== "desktop") return;
    if (context?.fullscreen && !wasFullscreen && ["wander", "observe"].includes(this.state.currentActivity)) {
      this.state.currentActivity = "idle";
      this.state.currentAnimation = "idle";
      this.nextDecisionAt = Date.now() + 12_000;
      this.publish();
    } else if (!context?.fullscreen && wasFullscreen && !this.state.preferences.paused) {
      this.nextDecisionAt = Date.now() + 2_000;
    }
  }

  setPosition(x: number, y: number, options: { notify?: boolean; userInteraction?: boolean; preserveFacing?: boolean } = {}): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Creature position must be finite.");
    const next = { x: Math.round(x), y: Math.round(y) };
    const dx = next.x - this.state.position.x;
    const previousFacing = this.state.facing;
    if (!options.preserveFacing && Math.abs(dx) > 1) this.state.facing = dx < 0 ? "left" : "right";
    const facingChanged = this.state.facing !== previousFacing;
    this.state.position = next;
    if (options.userInteraction) this.state.lastUserInteraction = Date.now();
    if (options.notify !== false || facingChanged) this.publish();
  }

  setFacing(facing: FacingDirection): void {
    if (this.state.facing === facing) return;
    this.state.facing = facing;
    this.publish();
  }

  setKeyboardAwarenessEnabled(enabled: boolean): void {
    this.state.privacy.keyboardAwarenessEnabled = enabled;
    this.publish();
  }

  observeDesktopActivity(category: AppCategory, keyboardActive: boolean): void {
    this.appCategory = category;
    this.keyboardActive = keyboardActive;
  }

  setDesktopAwarenessEnabled(enabled: boolean): void {
    this.state.privacy.desktopAwarenessEnabled = enabled;
    this.publish();
  }

  observeEnvironment(userState: "active" | "idle" | "long-idle", appChanged = false, fullscreen = false): void {
    const returned = this.environmentState !== "active" && userState === "active";
    this.environmentState = userState;
    const now = Date.now();
    if ((!returned && !appChanged) || fullscreen || this.keyboardActive || this.state.preferences.paused || this.conversationActive
      || this.state.location !== "desktop" || this.state.currentActivity !== "idle"
      || this.state.currentAnimation !== "idle" || now < this.nextEnvironmentReactionAt) return;
    this.state.currentAnimation = returned ? "happy" : "look";
    this.nextDecisionAt = now + 2_000;
    this.nextEnvironmentReactionAt = now + 60_000;
    this.publish();
  }

  setAwarenessEnabled(enabled: boolean): void {
    if (this.state.privacy.awarenessEnabled === enabled) return;
    this.state.privacy = { ...this.state.privacy, awarenessEnabled: enabled };
    this.publish();
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
    if (patch.paused && (this.executor.activePlan()?.priority ?? 0) < 100) this.executor.cancel();
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
      this.setActivity(this.environmentState === "long-idle" && !this.conversationActive ? "sleep"
        : this.environmentState === "idle" && !this.conversationActive ? "rest"
        : !this.conversationActive && this.keyboardActive ? "sit"
        : !this.conversationActive && (this.appCategory === "coding" || this.appCategory === "writing") ? "read"
        : !this.conversationActive && this.appCategory === "media" ? "sit"
        : !this.conversationActive && this.appCategory === "creative" ? "draw"
        : chooseActivity(this.state, this.random, this.conversationActive, this.desktopContext));
    }
  }

  private scheduleTick(): void {
    const cadence = this.executor.hasActivePlan() ? 100 : 500;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.tick();
      this.scheduleTick();
    }, cadence);
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
    this.state.facing = "left";
    this.state.room = { ...this.state.room, target: "door", position: { x: 850, y: 430 }, carriedItem: null, intention: "come home" };
    this.state.lastActivityChange = Date.now();
    if (!this.state.preferences.paused) this.startPlan(simplePropRoutine("rug", Date.now(), 80));
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
      this.state.facing = facingTowardProp(this.state.room.position, step.entity, this.state.facing);
      this.state.currentActivity = this.state.room.carriedItem ? "carry" : "idle";
      this.state.currentAnimation = this.state.room.carriedItem ? "carry" : "idle";
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
      if (step.type === "interact") {
        this.state.room.target = step.entity;
        this.state.facing = facingTowardProp(this.state.room.position, step.entity, this.state.facing);
      }
      this.state.currentAnimation = step.type === "interact" && (step.animation === "reach-left" || step.animation === "reach-right")
        ? this.state.facing === "left" ? "reach-left" : "reach-right"
        : step.animation;
      this.applyActivityEffects(step.activity);
    } else if (step.type === "transition") {
      this.transitionLocation(step.location);
      return;
    }
    this.state.lastActivityChange = Date.now();
    this.publish();
  }

  private moveInRoom(position: WorldPosition, target?: RoomPropId): void {
    const dx = position.x - this.state.room.position.x;
    if (Math.abs(dx) > 1) this.state.facing = dx < 0 ? "left" : "right";
    this.state.room.position = { x: Math.round(position.x), y: Math.round(position.y) };
    this.state.currentActivity = "wander";
    this.state.currentAnimation = this.state.room.carriedItem ? "carry" : "walk";
    if (target) this.state.room.target = target;
    this.publish();
  }

  private completePlan(plan: ActionPlan): void {
    this.state.habits = recordHabit(this.state.habits, plan.habitActivity, plan.habitProp);
    if (plan.habitProp === "bong" || plan.habitActivity === "bong") this.state.lastBongUseAt = Date.now();
    if (plan.habitActivity === "draw" && this.random() < 0.65) {
      const now = Date.now();
      const recent = this.state.habits.recentProps;
      const weighted: Array<[CorkboardSketchKind, number]> = [
        ["plant", 1 + Math.min(3, (this.state.habits.propUses.plant ?? 0) * 0.1)],
        ["book", 1 + Math.min(3, (this.state.habits.propUses.bookshelf ?? 0) * 0.1)],
        ["ball", 1 + Math.min(3, (this.state.habits.propUses.ball ?? 0) * 0.1)],
        ["portrait", 1 + this.state.personality.affection],
        ["heart", 0.8 + this.state.personality.affection * 2],
        ["abstract", 0.5 + this.state.personality.creativity * 4],
        ["star", 1 + this.state.personality.curiosity]
      ];
      for (const item of weighted) {
        const associatedProp: Partial<Record<CorkboardSketchKind, RoomPropId>> = {
          plant: "plant", book: "bookshelf", ball: "ball"
        };
        if (associatedProp[item[0]] && recent.includes(associatedProp[item[0]]!)) item[1] *= 1.25;
      }
      const total = weighted.reduce((sum, [, weight]) => sum + weight, 0);
      let cursor = this.random() * total;
      let kind = weighted[0]![0];
      for (const candidate of weighted) {
        cursor -= candidate[1];
        if (cursor <= 0) { kind = candidate[0]; break; }
      }
      this.state.corkboardSketches = [...this.state.corkboardSketches, {
        id: `sketch-${now}-${this.state.corkboardSketches.length}`,
        kind,
        createdAt: now
      }].slice(-6);
    }
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
    else if (activity === "bong") { this.state.comfort += 3; this.state.boredom -= 3; this.state.stimulation += 1; }
    else if (activity === "inspect") this.state.curiosity -= 3;
    this.state = clampState(this.state);
  }

  private activityDuration(activity: Activity): number {
    const base = activity === "sleep" ? 20_000 : activity === "rest" ? 14_000 : 8_000;
    return base * (0.75 + this.state.personality.patience * 0.6) * (1.1 - this.state.personality.chaos * 0.2);
  }

  private publish(): void { this.listener?.(this.snapshot()); }
}
