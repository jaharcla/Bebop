import { describe, expect, it, vi } from "vitest";
import { InteractionController } from "../src/interaction/InteractionController";
import { FallbackDialogueProvider, GroqDialogueProvider } from "../src/interaction/dialogue/GroqDialogueProvider";
import { LocalDialogueProvider } from "../src/interaction/dialogue/LocalDialogueProvider";
import { validateUtterance } from "../src/interaction/dialogue/responseValidation";
import { MIN_CREATURE_SPEECH_GAP_MS, nextCreatureSpeechDelayMs, shouldInitiateInteraction } from "../src/interaction/interactionPolicy";
import { positionSpeechWindow, type Bounds } from "../src/interaction/speechPosition";
import { defaultState } from "../src/creature/state/defaultState";
import type { CreatureState, CreatureUtterance, DialogueRequest, InteractionSession } from "../src/shared/types";

const request: DialogueRequest = {
  trigger: "USER_REQUESTED_TALK",
  context: {
    mood: "curious",
    energy: 70,
    currentActivity: "observe",
    location: "desktop",
    personality: { curiosity: 0.7, creativity: 0.6, independence: 0.7, sociability: 0.5 }
  },
  messages: []
};

describe("interaction policy", () => {
  const eligibleState = (): CreatureState => ({
    ...defaultState(),
    lastUserInteraction: 0,
    lastCreatureInteraction: 0
  });

  it("never initiates when interactions are disabled", () => {
    const state = { ...eligibleState(), preferences: { ...eligibleState().preferences, interactionsEnabled: false } };
    expect(shouldInitiateInteraction({ state, trigger: "BECAME_CURIOUS", hasActiveSession: false, now: 1_000_000, notBefore: 0, ignoredStreak: 0 })).toBe(false);
  });

  it("does not start a second conversation over an active session", () => {
    expect(shouldInitiateInteraction({ state: eligibleState(), trigger: "BECAME_BORED", hasActiveSession: true, now: 1_000_000, notBefore: 0, ignoredStreak: 0 })).toBe(false);
  });

  it("suppresses speech soon after either side last spoke", () => {
    const now = 1_000_000;
    expect(shouldInitiateInteraction({
      state: { ...eligibleState(), lastUserInteraction: now - 30_000 },
      trigger: "LONG_QUIET_PERIOD",
      hasActiveSession: false,
      now,
      notBefore: 0,
      ignoredStreak: 0
    })).toBe(false);
    expect(shouldInitiateInteraction({
      state: { ...eligibleState(), lastCreatureInteraction: now - MIN_CREATURE_SPEECH_GAP_MS + 1 },
      trigger: "LONG_QUIET_PERIOD",
      hasActiveSession: false,
      now,
      notBefore: 0,
      ignoredStreak: 0
    })).toBe(false);
  });

  it("uses longer minimum gaps as ignored interactions accumulate", () => {
    const now = 1_000_000;
    const state = { ...eligibleState(), lastCreatureInteraction: now - 10 * 60_000 };
    const policy = {
      state,
      trigger: "LONG_QUIET_PERIOD" as const,
      hasActiveSession: false,
      now,
      notBefore: 0
    };
    expect(shouldInitiateInteraction({ ...policy, ignoredStreak: 0 })).toBe(true);
    expect(shouldInitiateInteraction({ ...policy, ignoredStreak: 1 })).toBe(false);
    expect(shouldInitiateInteraction({ ...policy, ignoredStreak: 3 })).toBe(false);
  });

  it("increases the cooldown range after ignored bubbles", () => {
    expect(nextCreatureSpeechDelayMs(1, () => 0)).toBeGreaterThan(nextCreatureSpeechDelayMs(0, () => 0));
    expect(nextCreatureSpeechDelayMs(3, () => 0)).toBeGreaterThan(nextCreatureSpeechDelayMs(1, () => 0));
  });

  it("adds time when social interest is low or Tiny Mint is sleepy or busy", () => {
    const baseline = nextCreatureSpeechDelayMs(0, () => 0);
    const context = { ...eligibleState(), socialInterest: 10, mood: "sleepy" as const, currentActivity: "wander" as const };
    expect(nextCreatureSpeechDelayMs(0, () => 0, context)).toBeGreaterThan(baseline);
  });

  it("honors the startup and cooldown deadline", () => {
    const state = eligibleState();
    expect(shouldInitiateInteraction({ state, trigger: "LONG_QUIET_PERIOD", hasActiveSession: false, now: 100, notBefore: 101, ignoredStreak: 0 })).toBe(false);
  });
});

describe("dialogue response validation", () => {
  it("accepts valid structured output and bounds oversized fields", () => {
    const result = validateUtterance({
      text: ` ${"x".repeat(200)} `,
      quickResponses: ["a".repeat(60), "second", "third", "fourth"],
      emotion: "curious"
    });
    expect(result.text).toHaveLength(160);
    expect(result.quickResponses).toHaveLength(3);
    expect(result.quickResponses[0]).toHaveLength(40);
  });

  it("rejects empty text and values with the wrong shape", () => {
    expect(() => validateUtterance({ text: "  ", quickResponses: [] })).toThrow();
    expect(() => validateUtterance({ text: 42, quickResponses: [] })).toThrow();
    expect(() => validateUtterance({ text: "hey", quickResponses: ["ok", 2] })).toThrow();
    expect(() => validateUtterance(null)).toThrow();
  });
});

describe("local dialogue provider", () => {
  it("responds for core triggers and arbitrary user text without throwing", async () => {
    const provider = new LocalDialogueProvider(() => 0);
    for (const trigger of ["BECAME_CURIOUS", "BECAME_BORED", "RETURNED_TO_DESKTOP", "LONG_QUIET_PERIOD", "USER_REQUESTED_TALK"] as const) {
      const response = await provider.respond({ ...request, trigger });
      expect(response.text.length).toBeGreaterThan(0);
      expect(response.quickResponses.length).toBeLessThanOrEqual(3);
    }
    for (const mood of ["neutral", "chill", "curious", "excited", "playful", "sleepy", "bored"] as const) {
      const response = await provider.respond({ ...request, context: { ...request.context, mood } });
      expect(response.text.length).toBeGreaterThan(0);
    }
    const response = await provider.respond({
      ...request,
      messages: [{ role: "user", text: "?? \u0000 " + "x".repeat(900), at: 1 }]
    });
    expect(response.text.length).toBeGreaterThan(0);
  });
});

describe("speech window positioning", () => {
  const workArea: Bounds = { x: 0, y: 0, width: 1920, height: 1080 };
  const bubble = { width: 340, height: 260 };

  it("centers above the creature when there is room", () => {
    expect(positionSpeechWindow({ x: 800, y: 600, width: 192, height: 192 }, bubble, workArea)).toEqual({ x: 726, y: 332 });
  });

  it("places below near the top and remains on-screen near the bottom", () => {
    expect(positionSpeechWindow({ x: 800, y: 20, width: 192, height: 192 }, bubble, workArea).y).toBe(220);
    expect(positionSpeechWindow({ x: 800, y: 900, width: 192, height: 192 }, bubble, workArea).y).toBe(632);
  });

  it("clamps to the left and right edges", () => {
    expect(positionSpeechWindow({ x: 0, y: 500, width: 192, height: 192 }, bubble, workArea).x).toBe(0);
    expect(positionSpeechWindow({ x: 1780, y: 500, width: 192, height: 192 }, bubble, workArea).x).toBe(1580);
  });

  it("supports negative coordinates on secondary displays", () => {
    const secondDisplay = { x: -1600, y: -120, width: 1600, height: 900 };
    const result = positionSpeechWindow({ x: -1500, y: 300, width: 192, height: 192 }, bubble, secondDisplay);
    expect(result.x).toBeGreaterThanOrEqual(secondDisplay.x);
    expect(result.x + bubble.width).toBeLessThanOrEqual(secondDisplay.x + secondDisplay.width);
    expect(result.y).toBeGreaterThanOrEqual(secondDisplay.y);
  });
});

describe("Groq fallback", () => {
  it("falls back locally after HTTP and invalid-JSON errors", async () => {
    const responses: Response[] = [
      { ok: false, status: 503, json: async () => ({}) } as Response,
      { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "not json" } }] }) } as Response
    ];
    for (const response of responses) {
      const groq = new GroqDialogueProvider("test-key", "test-model", async () => response);
      const fallback = new FallbackDialogueProvider(groq, new LocalDialogueProvider(), () => undefined);
      expect((await fallback.respond(request)).text.length).toBeGreaterThan(0);
    }
  });

  it("falls back after a request timeout", async () => {
    const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    const groq = new GroqDialogueProvider("test-key", "test-model", fetcher, 1);
    const fallback = new FallbackDialogueProvider(groq, new LocalDialogueProvider());
    expect((await fallback.respond(request)).text.length).toBeGreaterThan(0);
  });
});

describe("user-requested Talk", () => {
  it("remains available with creature-initiated interactions disabled and supports short exchanges", async () => {
    let state = {
      ...defaultState(),
      preferences: { ...defaultState().preferences, interactionsEnabled: false, paused: true }
    };
    const updates: Array<InteractionSession | null> = [];
    let conversationActive = false;
    const brain = {
      setLocation: () => { state = { ...state, location: "desktop" }; },
      setConversationActive: (active: boolean) => { conversationActive = active; },
      recordConversationReply: () => { state = { ...state, lastUserInteraction: Date.now() }; },
      recordCreatureConversation: () => { state = { ...state, lastCreatureInteraction: Date.now() }; }
    };
    const controller = new InteractionController({
      getState: () => state,
      brain,
      provider: new LocalDialogueProvider(() => 0),
      onSession: (session) => updates.push(session),
      createId: () => "test-session"
    });

    await controller.startUserSession();
    expect(controller.getSession()?.current.text).toBe("yeah?");
    expect(conversationActive).toBe(true);
    await controller.reply("i’m making your brain");
    expect(controller.getSession()?.messages.map((message) => message.role)).toEqual(["creature", "user", "creature"]);
    controller.dismiss();
    expect(controller.getSession()).toBeNull();
    expect(conversationActive).toBe(false);
    expect(updates.at(-1)).toBeNull();
    controller.dispose();
    vi.useRealTimers();
  });

  it("brings Tiny Mint to the desktop for Talk when he is home", async () => {
    let state: CreatureState = { ...defaultState(), location: "room" };
    let conversationActive = false;
    const controller = new InteractionController({
      getState: () => state,
      brain: {
        setLocation: (location) => { state = { ...state, location }; },
        setConversationActive: (active) => { conversationActive = active; },
        recordConversationReply: () => undefined,
        recordCreatureConversation: () => undefined
      },
      provider: new LocalDialogueProvider(() => 0),
      onSession: () => undefined
    });

    await controller.startUserSession();

    expect(state.location).toBe("desktop");
    expect(conversationActive).toBe(true);
    expect(controller.getSession()?.current.text).toBe("yeah?");
    controller.dispose();
  });

  it("ignores a second reply while the provider is still responding", async () => {
    let completeResponse: ((response: CreatureUtterance) => void) | undefined;
    let responseCount = 0;
    const controller = new InteractionController({
      getState: defaultState,
      brain: {
        setLocation: () => undefined,
        setConversationActive: () => undefined,
        recordConversationReply: () => undefined,
        recordCreatureConversation: () => undefined
      },
      provider: {
        respond: () => {
          responseCount += 1;
          return new Promise((resolve) => { completeResponse = resolve; });
        }
      },
      onSession: () => undefined
    });

    const starting = controller.startUserSession();
    completeResponse?.({ text: "yeah?", quickResponses: ["okay"] });
    await starting;
    const firstReply = controller.reply("one");
    await controller.reply("double");
    expect(controller.getSession()?.messages.filter((message) => message.role === "user").map((message) => message.text)).toEqual(["one"]);
    completeResponse?.({ text: "huh", quickResponses: [] });
    await firstReply;
    expect(responseCount).toBe(2);
    controller.dispose();
  });
});

describe("ignored autonomous check-ins", () => {
  it("delays the next creature-initiated bubble after an ignored session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    let state: CreatureState = {
      ...defaultState(),
      lastUserInteraction: 0,
      lastCreatureInteraction: 0
    };
    const controller = new InteractionController({
      getState: () => state,
      brain: {
        setLocation: (location) => { state = { ...state, location }; },
        setConversationActive: () => undefined,
        recordConversationReply: () => { state = { ...state, lastUserInteraction: Date.now() }; },
        recordCreatureConversation: () => { state = { ...state, lastCreatureInteraction: Date.now() }; }
      },
      provider: new LocalDialogueProvider(() => 0),
      onSession: () => undefined,
      random: () => 0
    });
    try {
      controller.start();
      await vi.advanceTimersByTimeAsync(7 * 60_000);
      expect(controller.getSession()).toBeNull();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(controller.getSession()?.origin).toBe("creature");

      controller.dismiss();
      state = { ...state, mood: "curious" };
      controller.observeState(state);
      await vi.advanceTimersByTimeAsync(12 * 60_000 - 1);
      expect(controller.getSession()).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(controller.getSession()?.origin).toBe("creature");
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });
});
