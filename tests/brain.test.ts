import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreatureBrain } from "../src/creature/brain/CreatureBrain";
import { defaultState } from "../src/creature/state/defaultState";
import { StateStore } from "../src/persistence/StateStore";

describe("CreatureBrain", () => {
  const directories: string[] = [];
  afterEach(() => {
    vi.useRealTimers();
    directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  });

  it("moves between conceptual locations without requiring a window", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setLocation("room");
    expect(brain.snapshot().location).toBe("room");
    expect(brain.snapshot().currentActivity).toBe("wander");
    expect(brain.snapshot().room.intention).toBe("use the rug");
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

  it("synchronizes autonomous positions without publishing or recording user activity", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    const lastInteraction = brain.snapshot().lastUserInteraction;
    let notifications = 0;
    brain.subscribe(() => { notifications += 1; });

    brain.setPosition(123.4, 456.6, { notify: false });

    expect(brain.snapshot().position).toEqual({ x: 123, y: 457 });
    expect(brain.snapshot().lastUserInteraction).toBe(lastInteraction);
    expect(notifications).toBe(1);
  });

  it("persists its authoritative position", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-"));
    directories.push(directory);
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setPosition(222, 333, { notify: false });
    const store = new StateStore(join(directory, "state.json"));
    store.save(brain.snapshot());

    expect(store.load().position).toEqual({ x: 222, y: 333 });
  });

  it("keeps master pause separate from reduced motion", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setActivity("wander");
    brain.patchPreferences({ paused: true });
    const pausedState = brain.snapshot();
    brain.start();

    vi.advanceTimersByTime(20_000);
    expect(brain.snapshot().currentActivity).toBe("wander");
    expect(brain.snapshot().energy).toBe(pausedState.energy);

    brain.patchPreferences({ paused: false, reducedMotion: true });
    vi.advanceTimersByTime(1_000);
    expect(brain.snapshot().preferences.paused).toBe(false);
    expect(brain.snapshot().preferences.reducedMotion).toBe(true);
    expect(brain.snapshot().energy).not.toBe(pausedState.energy);
    brain.stop();
  });

  it("keeps room props manually usable while room autonomy is disabled", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.patchPreferences({ roomAutonomyEnabled: false });
    brain.setLocation("room");
    expect(brain.snapshot().currentActivity).toBe("wander");

    brain.useRoomProp("desk");
    expect(brain.snapshot().room.target).toBe("desk");
    expect(brain.snapshot().room.intention).toBe("make and show a sketch");
    expect(brain.snapshot().currentAnimation).toBe("walk");
  });

  it("discourages automatic room transitions during conversation without stopping the creature", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.999);
    brain.setConversationActive(true);
    brain.setActivity("visitRoom");
    expect(brain.snapshot().location).toBe("desktop");

    brain.setActivity("wander");
    expect(brain.snapshot().currentActivity).toBe("wander");
  });
});
