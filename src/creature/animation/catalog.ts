import type { AnimationDefinition, AnimationName } from "../../shared/types";

export const CELL_SIZE = 96;
export const FRAME_COUNT = 4;

const repeatDuration = (sequence: readonly number[], ms: number): number[] => sequence.map(() => ms);

export const animations: Record<AnimationName, AnimationDefinition> = {
  idle: { row: 0, sequence: [0, 1, 2, 3], durations: [600, 600, 600, 600], mode: "loop" },
  walk: { row: 1, sequence: [0, 1, 2, 3], durations: [160, 160, 160, 160], mode: "loop" },
  blink: { row: 2, sequence: [0, 1, 2, 3], durations: [2400, 100, 140, 100], mode: "once-idle" },
  happy: { row: 3, sequence: [0, 1, 2, 3], durations: [300, 250, 350, 250], mode: "loop" },
  look: { row: 4, sequence: [0, 1, 2, 3], durations: [Infinity, Infinity, Infinity, Infinity], mode: "directional" },
  "reach-right": { row: 5, sequence: [0, 1, 2, 3], durations: [240, 240, 240, 240], mode: "once-hold" },
  "reach-left": { row: 6, sequence: [0, 1, 2, 3], durations: [240, 240, 240, 240], mode: "once-hold" },
  tap: { row: 7, sequence: [0, 1, 2, 3], durations: [160, 160, 160, 160], mode: "once-idle" },
  sit: { row: 8, sequence: [0, 1, 2, 3], durations: repeatDuration([0, 1, 2, 3], 500), mode: "loop", loopFrom: 2 },
  sleep: { row: 9, sequence: [0, 1, 2, 3], durations: repeatDuration([0, 1, 2, 3], 900), mode: "loop", loopFrom: 2 },
  draw: { row: 10, sequence: [0, 1, 2, 1, 3], durations: repeatDuration([0, 1, 2, 1, 3], 500), mode: "loop" },
  read: { row: 11, sequence: [0, 1, 2, 1, 3], durations: repeatDuration([0, 1, 2, 1, 3], 750), mode: "loop" },
  held: { row: 12, sequence: [0, 1, 2, 3], durations: repeatDuration([0, 1, 2, 3], 280), mode: "loop", loopFrom: 1 },
  land: { row: 13, sequence: [0, 1, 2, 3], durations: repeatDuration([0, 1, 2, 3], 120), mode: "once-idle" },
  exercise: { row: 14, sequence: [0, 1, 2, 3], durations: repeatDuration([0, 1, 2, 3], 400), mode: "loop" },
  carry: { row: 15, sequence: [0, 1, 2, 3], durations: repeatDuration([0, 1, 2, 3], 250), mode: "loop", loopFrom: 1 }
};
