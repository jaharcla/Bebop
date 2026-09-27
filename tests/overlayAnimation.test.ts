import { describe, expect, it } from "vitest";
import { canStartCursorReach, resolveOverlayAnimation } from "../src/ui/overlayAnimation";

describe("desktop transient animation recovery", () => {
  it("restores the current activity animation after a cursor reach expires", () => {
    const transient = { name: "reach-right" as const, expiresAt: 1_000 };
    expect(resolveOverlayAnimation("walk", transient, 999)).toBe("reach-right");
    expect(resolveOverlayAnimation("walk", transient, 1_000)).toBe("walk");
    expect(resolveOverlayAnimation("carry", transient, 1_001)).toBe("carry");
  });

  it("follows the latest activity while a transient animation is active", () => {
    const transient = { name: "reach-left" as const, expiresAt: 1_000 };
    expect(resolveOverlayAnimation("walk", transient, 500)).toBe("reach-left");
    expect(resolveOverlayAnimation("carry", transient, 1_001)).toBe("carry");
  });

  it("limits cursor reaches to idle approach edges and the cooldown window", () => {
    expect(canStartCursorReach(true, false, "idle", 1_000, 1_000)).toBe(true);
    expect(canStartCursorReach(true, true, "idle", 2_000, 1_000)).toBe(false);
    expect(canStartCursorReach(false, false, "idle", 2_000, 1_000)).toBe(false);
    expect(canStartCursorReach(true, false, "walk", 2_000, 1_000)).toBe(false);
    expect(canStartCursorReach(true, false, "carry", 2_000, 1_000)).toBe(false);
    expect(canStartCursorReach(true, false, "idle", 1_999, 2_000)).toBe(false);
  });
});
