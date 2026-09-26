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

  it("does not choose desktop roaming or room visits when those preferences are off", () => {
    const state = {
      ...defaultState(),
      preferences: { ...defaultState().preferences, roamingEnabled: false, roomVisitsEnabled: false }
    };
    const selected = Array.from({ length: 100 }, (_, index) => chooseActivity(state, () => index / 100));
    expect(selected).not.toContain("wander");
    expect(selected).not.toContain("visitRoom");
    expect(chooseActivity({ ...state, preferences: { ...state.preferences, roomVisitsEnabled: true } }, () => 0.999)).toBe("visitRoom");

    const roomState = { ...state, location: "room" as const };
    const roomSelections = Array.from({ length: 100 }, (_, index) => chooseActivity(roomState, () => index / 100));
    expect(roomSelections).not.toContain("visitDesktop");
    expect(chooseActivity({ ...roomState, preferences: { ...roomState.preferences, roomVisitsEnabled: true } }, () => 0.999)).toBe("visitDesktop");
  });

  it("keeps room choices calm when room autonomy is disabled", () => {
    const state = {
      ...defaultState(),
      location: "room" as const,
      preferences: { ...defaultState().preferences, roomAutonomyEnabled: false, roomVisitsEnabled: false }
    };
    const selected = Array.from({ length: 50 }, (_, index) => chooseActivity(state, () => index / 50));
    expect(selected.every((activity) => activity === "idle" || activity === "rest")).toBe(true);
  });

  it("does not select a new autonomous activity while paused", () => {
    const state = {
      ...defaultState(),
      currentActivity: "wander" as const,
      preferences: { ...defaultState().preferences, paused: true }
    };
    expect(chooseActivity(state, () => 0.99)).toBe("wander");
  });

  it("avoids starting an automatic room transition during an active conversation", () => {
    const state = defaultState();
    expect(chooseActivity(state, () => 0.999, true)).not.toBe("visitRoom");
  });
});
