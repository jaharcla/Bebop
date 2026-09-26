import type { Activity, AnimationName, RoomPropId } from "../../shared/types";

export interface RoomPropDefinition {
  id: RoomPropId;
  x: number;
  y: number;
  w: number;
  h: number;
  action: "visit" | "show" | "read" | "inspect" | "sleep" | "sit" | "draw" | "music" | "play" | "exercise" | "carry";
  activity: Activity;
  animation: AnimationName;
  message: string;
}

export const roomProps: readonly RoomPropDefinition[] = [
  { id: "door", x: 875, y: 248, w: 115, h: 168, action: "visit", activity: "visitDesktop", animation: "walk", message: "A quick wander outside. Back soon." },
  { id: "corkboard", x: 490, y: 68, w: 126, h: 110, action: "show", activity: "show", animation: "carry", message: "Showing you his sketchbook." },
  { id: "bookshelf", x: 730, y: 250, w: 124, h: 150, action: "read", activity: "read", animation: "read", message: "One more page." },
  { id: "plant", x: 640, y: 290, w: 66, h: 90, action: "inspect", activity: "inspect", animation: "reach-right", message: "A closer look." },
  { id: "bed", x: 123, y: 251, w: 204, h: 145, action: "sleep", activity: "sleep", animation: "sleep", message: "A little nap." },
  { id: "chair", x: 381, y: 255, w: 86, h: 100, action: "sit", activity: "sit", animation: "sit", message: "Just hanging out." },
  { id: "desk", x: 445, y: 291, w: 174, h: 109, action: "draw", activity: "draw", animation: "draw", message: "Making a tiny sketch." },
  { id: "music-player", x: 493, y: 249, w: 76, h: 66, action: "music", activity: "music", animation: "sit", message: "A quiet little sway." },
  { id: "toy-box", x: 796, y: 395, w: 118, h: 92, action: "play", activity: "play", animation: "tap", message: "Play time." },
  { id: "rug", x: 477, y: 432, w: 246, h: 126, action: "sit", activity: "sit", animation: "sit", message: "Just hanging out." },
  { id: "cushion", x: 212, y: 468, w: 109, h: 66, action: "sit", activity: "sit", animation: "sit", message: "Just hanging out." },
  { id: "ball", x: 674, y: 468, w: 48, h: 48, action: "play", activity: "play", animation: "tap", message: "Play time." },
  { id: "dumbbell", x: 820, y: 514, w: 72, h: 44, action: "exercise", activity: "exercise", animation: "exercise", message: "Tiny reps." },
  { id: "sketchbook", x: 371, y: 527, w: 77, h: 61, action: "carry", activity: "carry", animation: "carry", message: "Bringing his sketchbook along." },
  { id: "book", x: 120, y: 393, w: 60, h: 66, action: "read", activity: "read", animation: "read", message: "One more page." },
  { id: "watering-can", x: 588, y: 530, w: 60, h: 58, action: "inspect", activity: "inspect", animation: "reach-right", message: "A closer look." }
] as const;

export const roomPropById = (id: RoomPropId): RoomPropDefinition => {
  const found = roomProps.find((prop) => prop.id === id);
  if (!found) throw new Error(`Unknown room prop: ${id}`);
  return found;
};
