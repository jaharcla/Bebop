import { describe, expect, it } from "vitest";
import { CreatureBrain } from "../src/creature/brain/CreatureBrain";
import { defaultState } from "../src/creature/state/defaultState";

describe("CreatureBrain", () => {
  it("moves between conceptual locations without requiring a window", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setLocation("room");
    expect(brain.snapshot().location).toBe("room");
    expect(brain.snapshot().currentActivity).toBe("rest");
    brain.setLocation("desktop");
    expect(brain.snapshot().location).toBe("desktop");
    expect(brain.snapshot().currentActivity).toBe("idle");
  });

  it("records interactions and preserves bounded state", () => {
    const initial = defaultState();
    const brain = new CreatureBrain(initial, () => 0.5);
    brain.interact("click");
    expect(brain.snapshot().currentAnimation).toBe("tap");
    expect(brain.snapshot().comfort).toBeLessThanOrEqual(100);
  });
});
