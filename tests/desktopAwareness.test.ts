import { afterEach, describe, expect, it, vi } from "vitest";
import { parseForegroundContext } from "../src/electron/DesktopAwareness";
import { CreatureBrain } from "../src/creature/brain/CreatureBrain";
import { defaultState } from "../src/creature/state/defaultState";

afterEach(() => vi.useRealTimers());

describe("foreground context", () => {
  it("accepts only bounded metadata and discards extra fields", () => {
    expect(parseForegroundContext(JSON.stringify({ activeApp: "chrome", processId: 12, keyboardActive: false, fullscreen: true, title: "private" }), 1))
      .toEqual({ activeApp: "chrome", processId: 12, keyboardActive: false, fullscreen: true });
    for (const input of ["null", "bad", "{}", '{"activeApp":12,"processId":2,"keyboardActive":false,"fullscreen":true}', '{"activeApp":"x","processId":-1,"keyboardActive":false,"fullscreen":false}']) {
      expect(parseForegroundContext(input, 1)).toBeNull();
    }
  });
  it("ignores Tiny Mint's own windows", () => {
    expect(parseForegroundContext('{"activeApp":"electron","processId":42,"keyboardActive":false,"fullscreen":true}', 42))
      .toEqual({ activeApp: null, processId: 0, keyboardActive: false, fullscreen: false });
  });
});

describe("environment behavior", () => {
  it("rests after idle, sleeps after long idle and resumes normal decisions", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.start();
    brain.observeEnvironment("idle");
    vi.advanceTimersByTime(20_000);
    expect(brain.snapshot().currentActivity).toBe("rest");
    brain.observeEnvironment("long-idle");
    vi.advanceTimersByTime(120_000);
    expect(brain.snapshot().currentActivity).toBe("sleep");
    brain.observeEnvironment("active");
    brain.setActivity("idle");
    vi.advanceTimersByTime(120_000);
    expect(brain.snapshot().currentActivity).not.toBe("sleep");
    brain.stop();
  });
  it("reacts to app switches with a bounded cooldown and recovers", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.start();
    brain.observeEnvironment("active", true);
    expect(brain.snapshot().currentAnimation).toBe("look");
    vi.advanceTimersByTime(2_500);
    expect(brain.snapshot().lastActivityChange).toBeGreaterThanOrEqual(Date.now() - 500);
    brain.setActivity("idle");
    brain.observeEnvironment("active", true);
    expect(brain.snapshot().currentAnimation).toBe("idle");
    brain.stop();
  });
  it("does not interrupt manual reactions, conversations, pause, fullscreen, or room routines", () => {
    for (const mode of ["click", "conversation", "paused", "fullscreen", "room"] as const) {
      const brain = new CreatureBrain(defaultState());
      if (mode === "click") brain.interact("click");
      if (mode === "conversation") brain.setConversationActive(true);
      if (mode === "paused") brain.patchPreferences({ paused: true });
      if (mode === "room") brain.setLocation("room");
      const before = brain.snapshot();
      brain.observeEnvironment("active", true, mode === "fullscreen");
      expect(brain.snapshot()).toEqual(before);
      brain.stop();
    }
  });
  it("does not persist the observed environment", () => {
    const brain = new CreatureBrain(defaultState());
    const before = brain.snapshot();
    brain.observeEnvironment("long-idle");
    expect(brain.snapshot()).toEqual(before);
  });
});
