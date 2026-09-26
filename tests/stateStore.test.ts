import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultState } from "../src/creature/state/defaultState";
import { StateStore } from "../src/persistence/StateStore";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

describe("StateStore", () => {
  it("round trips versioned state", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    const store = new StateStore(file);
    const state = { ...defaultState(), mood: "playful" as const, position: { x: 123, y: 456 } };
    store.save(state);
    expect(store.load()).toMatchObject({ mood: "playful", position: { x: 123, y: 456 } });
    expect(JSON.parse(readFileSync(file, "utf8")).schemaVersion).toBe(2);
  });

  it("recovers from corrupt data", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    writeFileSync(file, "not-json");
    expect(new StateStore(file).load().schemaVersion).toBe(2);
  });

  it("hydrates older partial nested state from current defaults", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    const defaults = defaultState();
    writeFileSync(file, JSON.stringify({
      ...defaults,
      preferences: { alwaysOnTop: false, cursorInteraction: false, paused: false, reducedMotion: false },
      personality: { creativity: 0.2 },
      privacy: { awarenessEnabled: true },
      room: {}
    }));

    expect(new StateStore(file).load()).toMatchObject({
      preferences: {
        alwaysOnTop: false,
        cursorInteraction: false,
        roamingEnabled: true,
        roomVisitsEnabled: true,
        roomAutonomyEnabled: true,
        interactionsEnabled: true,
        startWithWindows: false
      },
      personality: { creativity: 0.2, curiosity: defaults.personality.curiosity },
      privacy: { awarenessEnabled: true, contextLevel: "minimal" },
      room: { target: "door" }
    });
  });

  it("migrates schema 1 state and clears temporary execution state", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-state-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, room: { target: "desk" }, mood: "playful" }));
    const loaded = new StateStore(file).load();
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.room.target).toBe("desk");
    expect(loaded.room.carriedItem).toBeNull();
    expect(loaded.impulse).toBeNull();
  });
});
