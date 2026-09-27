import type { Activity, AnimationName, RoomPropId } from "../../shared/types";
import { approachPoint, roomEntities } from "../world/roomEntities";
import type { ActionPlan, ActionStep } from "./ActionPlan";

const move = (entity: RoomPropId): ActionStep => ({ type: "move-to", target: approachPoint(entity), entity });
const use = (entity: RoomPropId, affordance: string, activity: Activity, animation: AnimationName, durationMs: number): ActionStep =>
  ({ type: "interact", entity, affordance, activity, animation, durationMs });

function plan(intention: string, habitActivity: Activity, habitProp: RoomPropId, steps: ActionStep[], now: number, priority: number): ActionPlan {
  return { id: `${intention}-${now}`, origin: "user", intention, habitActivity, habitProp, steps, startedAt: now, priority, interruptibility: priority >= 100 ? "low" : "normal" };
}

export const bookRoutine = (now: number, priority = 40): ActionPlan => plan("read a book", "read", "bookshelf", [
  move("bookshelf"), { type: "face", entity: "bookshelf" }, use("bookshelf", "select-book", "inspect", "reach-right", 1_400),
  { type: "pick-up", entity: "book" }, move("chair"), { type: "face", entity: "chair" }, use("chair", "read", "read", "read", 10_000),
  move("bookshelf"), { type: "face", entity: "bookshelf" }, { type: "drop", entity: "book" }
], now, priority);

export const wateringRoutine = (now: number, priority = 40): ActionPlan => plan("water the plant", "inspect", "plant", [
  move("watering-can"), { type: "face", entity: "watering-can" }, use("watering-can", "pick-up", "inspect", "reach-right", 1_100),
  { type: "pick-up", entity: "watering-can" }, move("plant"), { type: "face", entity: "plant" }, use("plant", "water", "inspect", "reach-right", 2_600),
  move("watering-can"), { type: "face", entity: "watering-can" }, { type: "drop", entity: "watering-can" }
], now, priority);

export const artRoutine = (now: number, priority = 40): ActionPlan => plan("make and show a sketch", "draw", "desk", [
  move("desk"), { type: "face", entity: "desk" }, use("desk", "draw", "draw", "draw", 9_000), move("sketchbook"),
  { type: "face", entity: "sketchbook" }, { type: "pick-up", entity: "sketchbook" }, move("corkboard"), { type: "face", entity: "corkboard" },
  use("corkboard", "inspect-sketch", "show", "carry", 4_000), move("sketchbook"), { type: "face", entity: "sketchbook" }, { type: "drop", entity: "sketchbook" }
], now, priority);

export const playRoutine = (now: number, priority = 40): ActionPlan => plan("play with the ball", "play", "ball", [
  move("toy-box"), { type: "face", entity: "toy-box" }, use("toy-box", "inspect", "inspect", "reach-left", 1_800), move("ball"),
  { type: "face", entity: "ball" }, { type: "pick-up", entity: "ball" }, move("rug"), { type: "face", entity: "rug" }, use("rug", "play", "play", "tap", 6_000),
  move("ball"), { type: "face", entity: "ball" }, { type: "drop", entity: "ball" }
], now, priority);

export const bongRoutine = (now: number, priority = 100): ActionPlan => plan("take a bong break", "rest", "bong", [
  move("bong"), { type: "face", entity: "bong" },
  use("bong", "use", "inspect", "sit", 5_900),
  use("bong", "cough", "play", "tap", 900),
  use("bong", "relax", "rest", "sit", 3_000)
], now, priority);

export const roomExitRoutine = (now: number, priority = 40): ActionPlan => plan("go see the desktop", "visitDesktop", "door", [
  move("door"), { type: "face", entity: "door" }, use("door", "leave", "visitDesktop", "walk", 700), { type: "transition", location: "desktop" }
], now, priority);

export function simplePropRoutine(entity: RoomPropId, now: number, priority = 100): ActionPlan {
  if (entity === "bookshelf" || entity === "book") return bookRoutine(now, priority);
  if (entity === "plant" || entity === "watering-can") return wateringRoutine(now, priority);
  if (entity === "desk" || entity === "sketchbook" || entity === "corkboard") return artRoutine(now, priority);
  if (entity === "ball" || entity === "toy-box") return playRoutine(now, priority);
  if (entity === "door") return roomExitRoutine(now, priority);
  if (entity === "bong") return bongRoutine(now, priority);
  const affordance = roomEntities[entity].affordances[0];
  const duration = (affordance.durationMs[0] + affordance.durationMs[1]) / 2;
  return plan(`use the ${entity}`, affordance.activity, entity, [move(entity), use(entity, affordance.id, affordance.activity, affordance.animation, duration)], now, priority);
}
