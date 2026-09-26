import type {
  Activity,
  CreaturePreferences,
  CreatureState,
  DialogueActionResult,
  DialogueSettingsStatus,
  InteractionSession,
  Location,
  RoomPropId
} from "../shared/types";

declare global {
  interface Window {
    tinyMint: {
      isDevelopment: boolean;
      getState(): Promise<CreatureState>;
      exportState(): Promise<boolean>;
      setAwarenessEnabled(enabled: boolean): Promise<CreatureState | null>;
      qaAutonomousCheckIn(): Promise<boolean>;
      qaSetUserPresence(present: boolean | null): Promise<boolean | null>;
      getDialogueStatus(): Promise<DialogueSettingsStatus | null>;
      saveGroqKey(value: string): Promise<DialogueActionResult>;
      clearGroqKey(): Promise<DialogueActionResult>;
      testGroqConnection(): Promise<DialogueActionResult>;
      onDialogueStatus(listener: (status: DialogueSettingsStatus) => void): () => void;
      onState(listener: (state: CreatureState) => void): () => void;
      click(): void;
      startDrag(screenX: number, screenY: number): void;
      drag(screenX: number, screenY: number): void;
      endDrag(moved: boolean): void;
      setClickThrough(ignore: boolean): void;
      openMenu(): void;
      openRoom(): void;
      openSettings(): void;
      setLocation(location: Location): void;
      setActivity(activity: Activity): void;
      setFacing(facing: "left" | "right"): void;
      useRoomProp(prop: RoomPropId): void;
      updatePreferences(preferences: Partial<CreaturePreferences>): void;
      talk(): void;
      getInteraction(): Promise<InteractionSession | null>;
      onInteraction(listener: (session: InteractionSession | null) => void): () => void;
      onPlacement(listener: (placement: "top" | "bottom") => void): () => void;
      resizeSpeechWindow(height: number): void;
      sendQuickReply(text: string): void;
      sendCustomReply(text: string): void;
      dismissInteraction(): void;
      engageInteraction(): void;
      reset(): void;
    };
  }
}

export {};
