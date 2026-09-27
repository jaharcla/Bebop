import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyApp } from "../src/interaction/appAwareness";
import { CreatureBrain } from "../src/creature/brain/CreatureBrain";
import { defaultState } from "../src/creature/state/defaultState";
import { InteractionController } from "../src/interaction/InteractionController";
import { LocalDialogueProvider } from "../src/interaction/dialogue/LocalDialogueProvider";
import { parseForegroundContext } from "../src/electron/DesktopAwareness";

afterEach(() => vi.useRealTimers());

describe("keyboard and app awareness", () => {
  it("classifies process names without inferring browser contents", () => {
    expect(classifyApp("Code.EXE")).toBe("coding");
    expect(classifyApp("WINWORD")).toBe("writing");
    expect(classifyApp("chrome")).toBe("browser");
    expect(classifyApp("Spotify")).toBe("media");
    expect(classifyApp("blender")).toBe("creative");
    expect(classifyApp("WindowsTerminal.exe")).toBe("coding");
    expect(classifyApp("Discord")).toBe("chat");
    expect(classifyApp("POWERPNT.EXE")).toBe("presentation");
    expect(classifyApp("code-unknown")).toBe("other");
    expect(classifyApp(null)).toBe("other");
  });

  it("keeps keyboard activity while ignoring Tiny Mint's own app", () => {
    expect(parseForegroundContext('{"activeApp":"electron","processId":42,"fullscreen":false,"keyboardActive":true}',42))
      .toEqual({ activeApp: null, processId: 0, fullscreen: false, keyboardActive: true });
    expect(parseForegroundContext('{"activeApp":null,"processId":0,"fullscreen":false,"keyboardActive":"text"}',42)).toBeNull();
  });

  it("selects app-specific desktop behavior and gives typing priority", () => {
    vi.useFakeTimers();
    for (const [category, typing, expected] of [
      ["coding", false, "read"], ["writing", false, "read"], ["creative", false, "draw"],
      ["media", false, "sit"], ["coding", true, "sit"]
    ] as const) {
      const brain = new CreatureBrain(defaultState(), () => 0.5);
      brain.observeDesktopActivity(category, typing);
      brain.start();
      vi.advanceTimersByTime(15_000);
      expect(brain.snapshot().currentActivity).toBe(expected);
      brain.stop();
    }
  });

  it("does not interrupt manual room actions, pause, or conversations", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.useRoomProp("book");
    const before = brain.snapshot();
    brain.observeDesktopActivity("coding", true);
    expect(brain.snapshot()).toEqual(before);
    brain.setLocation("desktop");
    brain.patchPreferences({ paused: true });
    brain.start();
    vi.advanceTimersByTime(20_000);
    expect(brain.snapshot().currentActivity).toBe("idle");
    brain.patchPreferences({ paused: false });
    brain.setConversationActive(true);
    vi.advanceTimersByTime(3_000);
    expect(brain.snapshot().currentActivity).not.toBe("sit");
    brain.stop();
  });

  it("clears app and typing effects when disabled", () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState(), () => 0.5);
    brain.observeDesktopActivity("coding", true);
    brain.observeDesktopActivity("other", false);
    brain.start();
    vi.advanceTimersByTime(15_000);
    expect(["read", "sit"]).not.toContain(brain.snapshot().currentActivity);
    brain.stop();
  });

  it("defers autonomous speech while typing but permits manual Talk", async () => {
    vi.useFakeTimers();
    const brain = new CreatureBrain(defaultState());
    const controller = new InteractionController({ getState: () => brain.snapshot(), brain, provider: new LocalDialogueProvider(), onSession: () => {} });
    controller.setUserBusy(true);
    expect(controller.isUserPresent()).toBe(true);
    expect(await controller.startAutonomousCheckInForQA()).toBe(false);
    await controller.startUserSession();
    expect(controller.getSession()?.origin).toBe("user");
    controller.dismiss();
    controller.setUserBusy(false);
    expect(await controller.startAutonomousCheckInForQA()).toBe(true);
    controller.dispose();
    brain.stop();
  });
});
