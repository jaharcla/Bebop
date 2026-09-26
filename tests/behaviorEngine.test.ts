import { describe, expect, it } from "vitest";
import { chooseActivity } from "../src/creature/behavior/behaviorEngine";
import { defaultState } from "../src/creature/state/defaultState";

describe("chooseActivity", () => {
  it("only selects desktop activities while on the desktop", () => {
    const state = defaultState();
    const selected = Array.from({ length: 50 }, (_, index) => chooseActivity(state, () => index / 50));
    expect(selected).not.toContain("visitDesktop");
  });

  it("only selects room activities while in the room", () => {
    const state = { ...defaultState(), location: "room" as const };
    const selected = Array.from({ length: 50 }, (_, index) => chooseActivity(state, () => index / 50));
    expect(selected).not.toContain("wander");
    expect(selected).not.toContain("visitRoom");
  });
});
