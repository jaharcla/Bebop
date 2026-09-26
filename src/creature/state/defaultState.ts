import type { CreatureState } from "../../shared/types";

export const defaultState = (): CreatureState => ({
  schemaVersion: 4,
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
  facing: "right",
  corkboardSketches: [],
  room: { target: "door", position: { x: 850, y: 430 }, carriedItem: null, intention: null },
  habits: {
    activityAffinity: {},
    propAffinity: {},
    activityUses: {},
    propUses: {},
    recentActivities: [],
    recentProps: []
  },
  impulse: null,
  preferences: {
    alwaysOnTop: true,
    cursorInteraction: true,
    paused: false,
    reducedMotion: false,
    roamingEnabled: true,
    roomVisitsEnabled: true,
    roomAutonomyEnabled: true,
    interactionsEnabled: true,
    startWithWindows: false,
    quietMode: false
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
    comfort: bounded(state.comfort),
    personality: {
      curiosity: Math.max(0, Math.min(1, state.personality.curiosity)),
      creativity: Math.max(0, Math.min(1, state.personality.creativity)),
      chaos: Math.max(0, Math.min(1, state.personality.chaos)),
      confidence: Math.max(0, Math.min(1, state.personality.confidence)),
      independence: Math.max(0, Math.min(1, state.personality.independence)),
      affection: Math.max(0, Math.min(1, state.personality.affection)),
      patience: Math.max(0, Math.min(1, state.personality.patience)),
      sociability: Math.max(0, Math.min(1, state.personality.sociability))
    }
  };
};
