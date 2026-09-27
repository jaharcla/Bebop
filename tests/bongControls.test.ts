import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatureBrain } from "../src/creature/brain/CreatureBrain";
import { defaultState } from "../src/creature/state/defaultState";
import { scoreRoomBehaviors } from "../src/creature/behavior/behaviorScoring";
import { BehaviorPlanner } from "../src/creature/behavior/BehaviorPlanner";
import { actionAllowed, DesktopControl, isDesktopAction, desktopActionScript } from "../src/electron/DesktopControl";

afterEach(() => vi.useRealTimers());

describe("bong routine", () => {
  it("walks over, uses the bong, coughs, relaxes and returns to idle", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    const phases: string[] = [];
    brain.subscribe(state => {
      if (state.room.target === "bong" && phases.at(-1) !== state.currentActivity) phases.push(state.currentActivity);
    });
    brain.useRoomProp("bong");
    brain.start();
    vi.advanceTimersByTime(16_000);
    expect(phases).toEqual(["wander", "idle", "inspect", "play", "rest", "idle"]);
    expect(brain.snapshot().room.intention).toBeNull();
    expect(brain.snapshot().habits.propUses.bong).toBe(1);
    brain.stop();
  });
  it("cleans up on interruption and does not record an unfinished use", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState());
    brain.useRoomProp("bong");
    brain.start();
    vi.advanceTimersByTime(5_000);
    brain.setLocation("desktop");
    vi.advanceTimersByTime(2_000);
    expect(brain.snapshot().room.intention).toBeNull();
    expect(brain.snapshot().habits.propUses.bong).toBeUndefined();
    brain.stop();
  });
  it("requires a separate autonomous opt-in and limits repeat breaks", () => {
    const state = defaultState();
    expect(scoreRoomBehaviors(state).bong).toBe(0);
    state.preferences.bongAutonomyEnabled = true;
    expect(scoreRoomBehaviors(state).bong).toBeGreaterThan(0);
    const planner = new BehaviorPlanner(() => 0);
    expect(planner.chooseRoomPlan(state, 1).habitProp).toBe("bong");
    expect(planner.chooseRoomPlan(state, 2).habitProp).not.toBe("bong");
    expect(planner.chooseRoomPlan(state, 1_800_001).habitProp).toBe("bong");
  });
});

describe("desktop action permissions", () => {
  it("denies unknown commands and independently gates each app", async () => {
    const permissions = defaultState().preferences;
    expect(isDesktopAction("run-shell")).toBe(false);
    expect(actionAllowed("cursor-nudge", permissions)).toBe(false);
    permissions.spotifyControlEnabled = true;
    expect(actionAllowed("spotify-next", permissions)).toBe(true);
    expect(actionAllowed("vlc-next", permissions)).toBe(false);
    const controls = new DesktopControl(() => false);
    expect((await controls.run("cursor-nudge")).ok).toBe(false);
  });
  it("targets one approved media session and never sends global media keys", () => {
    const script = desktopActionScript("spotify-next");
    expect(script).toContain("SpotifyAB");
    expect(script).toContain("TrySkipNextAsync");
    expect(script).not.toContain("SendInput");
    expect(script).not.toContain("WM_APPCOMMAND");
    expect(script).not.toContain("VideoLAN");
  });
});
