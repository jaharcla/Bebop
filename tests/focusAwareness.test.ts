import { describe, expect, it } from "vitest";
import { FocusSessionTracker } from "../src/interaction/focusAwareness";

describe("FocusSessionTracker", () => {
  it("tracks focused duration and only creates a post-focus window after sustained work", () => {
    const tracker = new FocusSessionTracker(5 * 60_000, 15 * 60_000);
    const start = 1_000_000;

    expect(tracker.sample("coding", true, false, true, start)).toEqual({ focusState: "focused", focusMinutes: 0 });
    expect(tracker.sample("coding", true, false, true, start + 10 * 60_000)).toEqual({ focusState: "focused", focusMinutes: 10 });

    const finished = tracker.sample("browsing", true, false, true, start + 10 * 60_000 + 1);
    expect(finished.focusState).toBe("recently-finished");
    expect(finished.focusMinutes).toBeCloseTo(10, 3);
  });

  it("does not call a short app switch a sustained focus session", () => {
    const tracker = new FocusSessionTracker(5 * 60_000, 15 * 60_000);
    const start = 2_000_000;
    tracker.sample("writing", true, false, true, start);
    expect(tracker.sample("browsing", true, false, true, start + 60_000).focusState).toBe("none");
  });

  it("expires recent focus and resets when awareness is disabled", () => {
    const tracker = new FocusSessionTracker(60_000, 5 * 60_000);
    const start = 3_000_000;
    tracker.sample("drawing", true, false, true, start);
    tracker.sample("drawing", true, false, true, start + 2 * 60_000);
    expect(tracker.sample("idle", true, false, true, start + 2 * 60_000 + 1).focusState).toBe("recently-finished");
    expect(tracker.sample("idle", true, false, true, start + 8 * 60_000).focusState).toBe("none");

    tracker.sample("coding", true, false, true, start + 9 * 60_000);
    expect(tracker.sample("coding", true, false, false, start + 10 * 60_000)).toEqual({ focusState: "none", focusMinutes: 0 });
  });

  it("does not count fullscreen or an absent user as focused work", () => {
    const tracker = new FocusSessionTracker();
    expect(tracker.sample("coding", true, true, true, 1)).toEqual({ focusState: "none", focusMinutes: 0 });
    expect(tracker.sample("coding", false, false, true, 2)).toEqual({ focusState: "none", focusMinutes: 0 });
  });
});
