import type { Activity, AnimationName, BehaviorOrigin, Location, RoomPropId, WorldPosition } from "../../shared/types";

export type ActionStep =
  | { type: "move-to"; target: WorldPosition; entity?: RoomPropId }
  | { type: "face"; entity: RoomPropId }
  | { type: "animate"; animation: AnimationName; activity: Activity; durationMs: number; entity?: RoomPropId }
  | { type: "pick-up"; entity: RoomPropId }
  | { type: "drop"; entity: RoomPropId }
  | { type: "interact"; entity: RoomPropId; affordance: string; activity: Activity; animation: AnimationName; durationMs: number }
  | { type: "wait"; durationMs: number }
  | { type: "transition"; location: Location };

export interface ActionPlan {
  id: string;
  origin?: BehaviorOrigin;
  intention: string;
  habitActivity: Activity;
  habitProp: RoomPropId;
  steps: ActionStep[];
  startedAt: number;
  priority: number;
  interruptibility: "low" | "normal" | "high";
}
