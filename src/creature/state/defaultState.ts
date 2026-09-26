import type { CreatureState } from "../../shared/types";

export const defaultState = (): CreatureState => ({
  schemaVersion: 1,
  location: "desktop",
  currentActivity: "idle",
  currentAnimation: "idle",
  mood: "neutral",
  energy: 78,
  stimulation: 45,
  focus: 40,
  socialInterest: 42,
  boredom: 24,
  curiosity: 68,
  comfort: 75,
  lastUserInteraction: Date.now(),
  lastCreatureInteraction: Date.now(),
  lastActivityChange: Date.now(),
  position: { x: 80, y: 80 },
  room: { target: "rug" },
  preferences: {
    alwaysOnTop: true,
    cursorInteraction: true,
    paused: false,
    reducedMotion: false
  },
  privacy: { awarenessEnabled: false, contextLevel: "minimal" },
  personality: {
    curiosity: 0.76,
    creativity: 0.7,
    chaos: 0.34,
    confidence: 0.55,
    independence: 0.72,
    affection: 0.58,
    patience: 0.68,
    sociability: 0.48
  }
});

export const clampState = (state: CreatureState): CreatureState => {
  const bounded = (value: number) => Math.max(0, Math.min(100, value));
  return {
    ...state,
    energy: bounded(state.energy),
    stimulation: bounded(state.stimulation),
    focus: bounded(state.focus),
    socialInterest: bounded(state.socialInterest),
    boredom: bounded(state.boredom),
    curiosity: bounded(state.curiosity),
    comfort: bounded(state.comfort)
  };
};
