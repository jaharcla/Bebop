export type Location = "desktop" | "room";
export type Mood = "neutral" | "chill" | "curious" | "excited" | "playful" | "sleepy" | "bored";
export type DialogueProviderStatus =
  | "Local voice"
  | "Groq configured"
  | "Groq connected"
  | "Groq unavailable — using Local voice"
  | "Secure storage unavailable — using Local voice";

export interface DialogueSettingsStatus {
  provider: DialogueProviderStatus;
  keySaved: boolean;
  secureStorageAvailable: boolean;
  developmentKeyActive: boolean;
}

export interface DialogueActionResult extends DialogueSettingsStatus {
  ok: boolean;
  message: string;
}

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
  | "watering-can"
  | "bong";

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

export type FacingDirection = "left" | "right";
export type CorkboardSketchKind = "plant" | "book" | "ball" | "portrait" | "heart" | "abstract" | "star";

export interface CorkboardSketch {
  id: string;
  kind: CorkboardSketchKind;
  createdAt: number;
}

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

export type ImpulseKind = "create" | "explore" | "play" | "rest" | "seek-company" | "seek-solitude";

export interface BehaviorImpulse {
  kind: ImpulseKind;
  strength: number;
  createdAt: number;
  expiresAt: number;
}

export interface HabitProfile {
  activityAffinity: Partial<Record<Activity, number>>;
  propAffinity: Partial<Record<RoomPropId, number>>;
  activityUses: Partial<Record<Activity, number>>;
  propUses: Partial<Record<RoomPropId, number>>;
  recentActivities: Activity[];
  recentProps: RoomPropId[];
}

export interface WorldPosition {
  x: number;
  y: number;
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
  quietMode: boolean;
}

export interface CreatureState {
  schemaVersion: 4;
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
  facing: FacingDirection;
  corkboardSketches: CorkboardSketch[];
  room: {
    target: RoomPropId;
    position: WorldPosition;
    carriedItem: RoomPropId | null;
    intention: string | null;
  };
  habits: HabitProfile;
  impulse: BehaviorImpulse | null;
  preferences: CreaturePreferences;
  privacy: { awarenessEnabled: boolean; contextLevel: "minimal" };
  personality: Personality;
}

export type ConversationRole = "user" | "creature";

export interface ConversationMessage {
  role: ConversationRole;
  text: string;
  at: number;
}

export interface CreatureUtterance {
  text: string;
  quickResponses: string[];
  emotion: Mood;
  endConversation: boolean;
}

export interface InteractionSession {
  id: string;
  origin: "creature" | "user";
  createdAt: number;
  expiresAt: number | null;
  messages: ConversationMessage[];
  current: CreatureUtterance;
  waitingForResponse: boolean;
}

export type InteractionTrigger =
  | "BECAME_CURIOUS"
  | "BECAME_BORED"
  | "RETURNED_TO_DESKTOP"
  | "LONG_QUIET_PERIOD"
  | "USER_REQUESTED_TALK";

export interface DialogueContext {
  mood: Mood;
  energy: number;
  currentActivity: Activity;
  location: Location;
  personality: Pick<Personality, "curiosity" | "creativity" | "independence" | "sociability">;
}

export interface DialogueRequest {
  trigger: InteractionTrigger;
  context: DialogueContext;
  messages: ConversationMessage[];
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
