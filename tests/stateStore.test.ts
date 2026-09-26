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
    expect(JSON.parse(readFileSync(file, "utf8")).schemaVersion).toBe(1);
  });

  it("recovers from corrupt data", () => {
    const directory = mkdtempSync(join(tmpdir(), "tiny-mint-"));
    directories.push(directory);
    const file = join(directory, "state.json");
    writeFileSync(file, "not-json");
    expect(new StateStore(file).load().schemaVersion).toBe(1);
  });
});
