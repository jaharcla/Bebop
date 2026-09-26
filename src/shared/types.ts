export type Location = "desktop" | "room";
export type Mood = "neutral" | "chill" | "curious" | "excited" | "playful" | "sleepy" | "bored";

export type RoomPropId =
  | "door"
  | "corkboard"
  | "bookshelf"
  | "plant"
  | "bed"
  | "chair"
  | "desk"
  | "music-player"
  | "toy-box"
  | "rug"
  | "cushion"
  | "ball"
  | "dumbbell"
  | "sketchbook"
  | "book"
  | "watering-can";

export type Activity =
  | "idle"
  | "wander"
  | "observe"
  | "rest"
  | "sit"
  | "sleep"
  | "draw"
  | "read"
  | "exercise"
  | "carry"
  | "inspect"
  | "play"
  | "music"
  | "show"
  | "visitRoom"
  | "visitDesktop";

export type AnimationName =
  | "idle"
  | "walk"
  | "blink"
  | "happy"
  | "look"
  | "reach-right"
  | "reach-left"
  | "tap"
  | "sit"
  | "sleep"
  | "draw"
  | "read"
  | "held"
  | "land"
  | "exercise"
  | "carry";

export interface Personality {
  curiosity: number;
  creativity: number;
  chaos: number;
  confidence: number;
  independence: number;
  affection: number;
  patience: number;
  sociability: number;
}

export interface CreaturePreferences {
  alwaysOnTop: boolean;
  cursorInteraction: boolean;
  paused: boolean;
  reducedMotion: boolean;
  roamingEnabled: boolean;
  roomVisitsEnabled: boolean;
  roomAutonomyEnabled: boolean;
  interactionsEnabled: boolean;
  startWithWindows: boolean;
}

export interface CreatureState {
  schemaVersion: 1;
  location: Location;
  currentActivity: Activity;
  currentAnimation: AnimationName;
  mood: Mood;
  energy: number;
  stimulation: number;
  focus: number;
  socialInterest: number;
  boredom: number;
  curiosity: number;
  comfort: number;
  lastUserInteraction: number;
  lastCreatureInteraction: number;
  lastActivityChange: number;
  position: { x: number; y: number };
  room: { target: RoomPropId };
  preferences: CreaturePreferences;
  privacy: { awarenessEnabled: boolean; contextLevel: "minimal" };
  personality: Personality;
}

export type CreatureEvent =
  | { type: "APP_STARTED" }
  | { type: "USER_CLICKED_CREATURE" }
  | { type: "USER_DRAGGED_CREATURE"; position: CreatureState["position"] }
  | { type: "CREATURE_ACTIVITY_FINISHED" }
  | { type: "ENTERED_ROOM" }
  | { type: "ENTERED_DESKTOP" };

export interface AnimationDefinition {
  row: number;
  sequence: readonly number[];
  durations: readonly number[];
  mode: "loop" | "once-hold" | "directional" | "once-idle";
  loopFrom?: number;
}
