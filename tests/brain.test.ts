import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CreatureBrain } from "../src/creature/brain/CreatureBrain";
import { defaultState } from "../src/creature/state/defaultState";
import { StateStore } from "../src/persistence/StateStore";
import { facingTowardProp } from "../src/creature/world/roomEntities";

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

  it("faces horizontal movement and preserves facing during vertical movement", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setPosition(20, 80, { notify: false });
    expect(brain.snapshot().facing).toBe("left");
    brain.setPosition(20, 180, { notify: false });
    expect(brain.snapshot().facing).toBe("left");
    brain.setPosition(100, 180, { notify: false });
    expect(brain.snapshot().facing).toBe("right");
  });

  it("faces the prop from its actual position and preserves orientation at near-zero horizontal delta", () => {
    expect(facingTowardProp({ x: 500, y: 400 }, "plant", "left")).toBe("right");
    expect(facingTowardProp({ x: 700, y: 400 }, "plant", "right")).toBe("left");
    expect(facingTowardProp({ x: 639, y: 400 }, "plant", "left")).toBe("left");
  });

  it("keeps a carried prop attached in state when facing changes", () => {
    const initial = { ...defaultState(), location: "room" as const, room: { ...defaultState().room, carriedItem: "book" as const } };
    const brain = new CreatureBrain(initial, () => 0.5);
    brain.setFacing("left");
    expect(brain.snapshot()).toMatchObject({ facing: "left", room: { carriedItem: "book" } });
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

  it("allows the bonus bong art only as a manually requested room inspection", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.patchPreferences({ roomAutonomyEnabled: false });
    brain.setLocation("room");
    brain.useRoomProp("bong");

    expect(brain.snapshot()).toMatchObject({
      location: "room",
      currentActivity: "wander",
      room: { target: "bong", intention: "inspect the animated bonus art" }
    });
  });

  it("persists the opt-in Basic Awareness setting", () => {
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setAwarenessEnabled(true);
    expect(brain.snapshot().privacy).toEqual({ awarenessEnabled: true, contextLevel: "minimal" });
  });

  it("keeps manual room plans usable while paused but stops autonomous plans", () => {
    vi.useFakeTimers();
    const manual = new CreatureBrain(defaultState(), () => 0.5);
    manual.setLocation("room");
    manual.useRoomProp("bookshelf");
    manual.patchPreferences({ paused: true });
    manual.start();
    vi.advanceTimersByTime(2_000);
    expect(manual.snapshot().room.intention).toBe("read a book");
    expect(manual.snapshot().room.position.x).toBeLessThan(850);
    expect(manual.snapshot().currentAnimation).toBe("reach-right");
    manual.stop();

    const autonomous = new CreatureBrain(defaultState(), () => 0.5);
    autonomous.setLocation("room");
    autonomous.patchPreferences({ paused: true });
    expect(autonomous.snapshot().room.intention).toBeNull();
    autonomous.useRoomProp("bookshelf");
    expect(autonomous.snapshot().room.intention).toBe("read a book");
    expect(autonomous.snapshot().room.target).toBe("bookshelf");
    autonomous.stop();
  });

  it("pins a small local sketch only when an art routine completes", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0);
    brain.setLocation("room");
    brain.useRoomProp("desk");
    brain.start();
    vi.advanceTimersByTime(30_000);
    expect(brain.snapshot().corkboardSketches).toHaveLength(1);
    expect(brain.snapshot().corkboardSketches[0]?.kind).toBe("plant");
    expect(brain.snapshot().room.carriedItem).toBeNull();
    brain.stop();
  });

  it("rebases active movement after suspend instead of catching up elapsed time", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.setLocation("room");
    brain.useRoomProp("desk");
    brain.start();
    vi.advanceTimersByTime(500);
    brain.suspend();
    const positionBeforeSuspend = brain.snapshot().room.position;
    vi.advanceTimersByTime(60 * 60 * 1_000);
    brain.resume();
    vi.advanceTimersByTime(100);
    const positionAfterResume = brain.snapshot().room.position;
    expect(Math.hypot(positionAfterResume.x - positionBeforeSuspend.x, positionAfterResume.y - positionBeforeSuspend.y)).toBeLessThanOrEqual(16);
    brain.stop();
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
