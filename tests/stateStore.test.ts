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
    expect(JSON.parse(readFileSync(file, "utf8")).schemaVersion).toBe(4);
  });

  it("round trips Basic Awareness and the manually selected bonus prop", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-awareness-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    const store = new StateStore(file);
    store.save({
      ...defaultState(),
      privacy: { keyboardAwarenessEnabled: true, desktopAwarenessEnabled: true, awarenessEnabled: true, contextLevel: "minimal" },
      room: { ...defaultState().room, target: "bong" }
    });

    expect(store.load()).toMatchObject({
      privacy: { keyboardAwarenessEnabled: true, desktopAwarenessEnabled: true, awarenessEnabled: true, contextLevel: "minimal" },
      room: { target: "bong" }
    });
  });

  it("recovers from corrupt data", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    writeFileSync(file, "not-json");
    expect(new StateStore(file).load().schemaVersion).toBe(4);
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
      privacy: { keyboardAwarenessEnabled: false, desktopAwarenessEnabled: false, awarenessEnabled: true, contextLevel: "minimal" },
      room: { target: "door" }
    });
  });

  it("migrates schema 1 state and clears temporary execution state", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-state-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, room: { target: "desk" }, mood: "playful" }));
    const loaded = new StateStore(file).load();
    expect(loaded.schemaVersion).toBe(4);
    expect(loaded.room.target).toBe("desk");
    expect(loaded.room.carriedItem).toBeNull();
    expect(loaded.impulse).toBeNull();
  });

  it("recovers a corrupt primary save from the last known-good backup", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-backup-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    const store = new StateStore(file);
    store.save({ ...defaultState(), energy: 61 });
    store.save({ ...defaultState(), energy: 12 });
    writeFileSync(file, "{broken");

    expect(store.load().energy).toBe(61);
  });

  it("rejects impossible values and falls back safely when no backup exists", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-invalid-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    writeFileSync(file, JSON.stringify({ ...defaultState(), personality: { ...defaultState().personality, creativity: 2 } }));

    expect(new StateStore(file).load()).toMatchObject({ schemaVersion: 4, personality: defaultState().personality });
  });

  it("persists bounded corkboard history and exports no credentials or transcripts", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-export-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    const store = new StateStore(file);
    const sketches = Array.from({ length: 8 }, (_, index) => ({
      id: `sketch-${index}`,
      kind: "star" as const,
      createdAt: index
    }));
    const state = { ...defaultState(), corkboardSketches: sketches };
    store.save(state);
    const loaded = store.load();
    const exported = store.exportJson(loaded);

    expect(loaded.corkboardSketches).toHaveLength(6);
    expect(loaded.corkboardSketches[0]?.id).toBe("sketch-2");
    expect(exported).toContain("corkboardSketches");
    expect(exported).not.toMatch(/GROQ_API_KEY|conversation|transcript|secret/i);
  });
});
