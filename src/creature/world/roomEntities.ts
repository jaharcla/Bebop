import type { Activity, AnimationName, FacingDirection, RoomPropId, WorldPosition } from "../../shared/types";
import { roomPropById } from "../room/roomProps";

export interface Affordance {
  id: string;
  activity: Activity;
  animation: AnimationName;
  baseWeight: number;
  durationMs: [number, number];
}

export interface WorldEntity {
  id: RoomPropId;
  approachPoints: readonly WorldPosition[];
  pickupable: boolean;
  affordances: readonly Affordance[];
}

const use = (id: string, activity: Activity, animation: AnimationName, baseWeight: number, durationMs: [number, number]): Affordance =>
  ({ id, activity, animation, baseWeight, durationMs });

export const roomEntities: Readonly<Record<RoomPropId, WorldEntity>> = {
  door: { id: "door", approachPoints: [{ x: 835, y: 430 }], pickupable: false, affordances: [use("leave", "visitDesktop", "walk", 8, [700, 1_200])] },
  corkboard: { id: "corkboard", approachPoints: [{ x: 520, y: 285 }], pickupable: false, affordances: [use("inspect-sketch", "show", "carry", 8, [4_000, 7_000])] },
  bookshelf: { id: "bookshelf", approachPoints: [{ x: 700, y: 430 }], pickupable: false, affordances: [use("select-book", "inspect", "reach-right", 10, [1_200, 2_000]), use("browse", "read", "read", 8, [6_000, 12_000])] },
  plant: { id: "plant", approachPoints: [{ x: 610, y: 420 }], pickupable: false, affordances: [use("inspect", "inspect", "reach-right", 8, [2_000, 4_000]), use("water", "inspect", "reach-right", 10, [2_000, 3_500])] },
  bed: { id: "bed", approachPoints: [{ x: 260, y: 405 }], pickupable: false, affordances: [use("sleep", "sleep", "sleep", 14, [12_000, 24_000]), use("rest", "rest", "sleep", 9, [7_000, 14_000])] },
  chair: { id: "chair", approachPoints: [{ x: 390, y: 405 }], pickupable: false, affordances: [use("sit", "sit", "sit", 9, [5_000, 10_000]), use("read", "read", "read", 10, [9_000, 18_000])] },
  desk: { id: "desk", approachPoints: [{ x: 480, y: 420 }], pickupable: false, affordances: [use("draw", "draw", "draw", 13, [9_000, 17_000]), use("work", "sit", "sit", 6, [6_000, 11_000])] },
  "music-player": { id: "music-player", approachPoints: [{ x: 535, y: 380 }], pickupable: false, affordances: [use("listen", "music", "sit", 9, [8_000, 15_000])] },
  "toy-box": { id: "toy-box", approachPoints: [{ x: 760, y: 490 }], pickupable: false, affordances: [use("inspect", "inspect", "reach-left", 6, [1_500, 3_000]), use("play", "play", "tap", 10, [5_000, 9_000])] },
  rug: { id: "rug", approachPoints: [{ x: 570, y: 510 }], pickupable: false, affordances: [use("sit", "sit", "sit", 8, [5_000, 10_000]), use("play", "play", "tap", 9, [5_000, 9_000]), use("listen", "music", "sit", 7, [7_000, 13_000])] },
  cushion: { id: "cushion", approachPoints: [{ x: 265, y: 520 }], pickupable: false, affordances: [use("relax", "rest", "sit", 9, [6_000, 12_000]), use("read", "read", "read", 8, [8_000, 15_000])] },
  ball: { id: "ball", approachPoints: [{ x: 665, y: 510 }], pickupable: true, affordances: [use("play", "play", "tap", 12, [5_000, 9_000]), use("carry", "carry", "carry", 7, [3_000, 6_000])] },
  dumbbell: { id: "dumbbell", approachPoints: [{ x: 790, y: 535 }], pickupable: false, affordances: [use("exercise", "exercise", "exercise", 9, [6_000, 12_000])] },
  sketchbook: { id: "sketchbook", approachPoints: [{ x: 390, y: 535 }], pickupable: true, affordances: [use("draw", "draw", "draw", 12, [8_000, 15_000]), use("carry", "carry", "carry", 8, [3_000, 6_000])] },
  book: { id: "book", approachPoints: [{ x: 165, y: 455 }], pickupable: true, affordances: [use("read", "read", "read", 12, [9_000, 18_000]), use("carry", "carry", "carry", 7, [3_000, 6_000])] },
  "watering-can": { id: "watering-can", approachPoints: [{ x: 575, y: 535 }], pickupable: true, affordances: [use("water", "inspect", "reach-right", 11, [3_000, 6_000]), use("carry", "carry", "carry", 7, [3_000, 6_000])] },
  bong: { id: "bong", approachPoints: [{ x: 334, y: 535 }], pickupable: false, affordances: [use("inspect", "inspect", "reach-right", 4, [2_500, 3_500])] }
};

export const approachPoint = (id: RoomPropId): WorldPosition => roomEntities[id].approachPoints[0];

export function facingTowardProp(position: WorldPosition, id: RoomPropId, previous: FacingDirection): FacingDirection {
  const delta = roomPropById(id).x - position.x;
  return Math.abs(delta) <= 2 ? previous : delta < 0 ? "left" : "right";
}
