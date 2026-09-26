import { describe, expect, it } from "vitest";
import { animations } from "../src/creature/animation/catalog";
import { roomProps } from "../src/creature/room/roomProps";

const expectedAnimations = [
  "idle", "walk", "blink", "happy", "look", "reach-right", "reach-left", "tap",
  "sit", "sleep", "draw", "read", "held", "land", "exercise", "carry"
] as const;

const expectedProps = [
  "door", "corkboard", "bookshelf", "plant", "bed", "chair", "desk", "music-player",
  "toy-box", "rug", "cushion", "ball", "dumbbell", "sketchbook", "book", "watering-can"
] as const;

describe("v3 asset catalog", () => {
  it("registers all 16 mascot animation rows", () => {
    expect(Object.keys(animations)).toEqual(expectedAnimations);
    expect(new Set(Object.values(animations).map((animation) => animation.row)).size).toBe(16);
  });

  it("registers all 16 room props", () => {
    expect(roomProps.map((prop) => prop.id)).toEqual(expectedProps);
  });

  it("preserves the non-linear draw/read sequences and settling loops", () => {
    expect(animations.draw.sequence).toEqual([0, 1, 2, 1, 3]);
    expect(animations.read.sequence).toEqual([0, 1, 2, 1, 3]);
    expect(animations.sit.loopFrom).toBe(2);
    expect(animations.sleep.loopFrom).toBe(2);
    expect(animations.held.loopFrom).toBe(1);
    expect(animations.carry.loopFrom).toBe(1);
  });
});
