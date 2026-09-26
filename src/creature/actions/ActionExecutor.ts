import type { RoomPropId, WorldPosition } from "../../shared/types";
import type { ActionPlan, ActionStep } from "./ActionPlan";

export interface ActionExecutorHooks {
  position(): WorldPosition;
  move(position: WorldPosition, target: RoomPropId | undefined): void;
  begin(step: ActionStep): void;
  complete(plan: ActionPlan): void;
  cleanup(carriedItem: RoomPropId | null): void;
}

export class ActionExecutor {
  private plan: ActionPlan | null = null;
  private stepIndex = 0;
  private stepStartedAt = 0;
  private lastTickAt = 0;
  private carriedItem: RoomPropId | null = null;

  constructor(private readonly hooks: ActionExecutorHooks, private readonly speedPixelsPerSecond = 150) {}

  activePlan(): ActionPlan | null { return this.plan; }
  hasActivePlan(): boolean { return this.plan !== null; }

  rebaseAfterSuspend(suspendedForMs: number, now: number): void {
    if (!this.plan) return;
    this.stepStartedAt += suspendedForMs;
    this.lastTickAt = now;
  }

  start(plan: ActionPlan, now: number): boolean {
    if (this.plan && this.plan.priority > plan.priority) return false;
    if (this.plan) this.cancel();
    this.plan = plan;
    this.stepIndex = 0;
    this.stepStartedAt = now;
    this.lastTickAt = now;
    this.beginCurrent(now);
    return true;
  }

  cancel(): void {
    if (!this.plan) return;
    this.hooks.cleanup(this.carriedItem);
    this.plan = null;
    this.carriedItem = null;
    this.stepIndex = 0;
  }

  tick(now: number): void {
    const plan = this.plan;
    if (!plan) return;
    const step = plan.steps[this.stepIndex];
    if (!step) return this.finish(plan);
    if (step.type === "move-to") {
      const current = this.hooks.position();
      const dx = step.target.x - current.x;
      const dy = step.target.y - current.y;
      const distance = Math.hypot(dx, dy);
      const travel = this.speedPixelsPerSecond * Math.max(0, now - this.lastTickAt) / 1_000;
      this.lastTickAt = now;
      if (distance <= Math.max(2, travel)) {
        this.hooks.move(step.target, step.entity);
        this.advance(now);
      } else {
        this.hooks.move({ x: current.x + dx / distance * travel, y: current.y + dy / distance * travel }, step.entity);
      }
      return;
    }
    const duration = step.type === "animate" || step.type === "interact" || step.type === "wait" ? step.durationMs : 0;
    if (now - this.stepStartedAt >= duration) this.advance(now);
  }

  private beginCurrent(now: number): void {
    const step = this.plan?.steps[this.stepIndex];
    if (!step) {
      if (this.plan) this.finish(this.plan);
      return;
    }
    this.stepStartedAt = now;
    this.lastTickAt = now;
    this.hooks.begin(step);
    if (step.type === "pick-up") this.carriedItem = step.entity;
    if (step.type === "drop") this.carriedItem = null;
    if (["face", "pick-up", "drop", "transition"].includes(step.type)) this.advance(now);
  }

  private advance(now: number): void {
    if (!this.plan) return;
    this.stepIndex += 1;
    this.beginCurrent(now);
  }

  private finish(plan: ActionPlan): void {
    this.plan = null;
    this.stepIndex = 0;
    this.carriedItem = null;
    this.hooks.complete(plan);
  }
}
