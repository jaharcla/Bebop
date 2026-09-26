import type {
  Activity,
  CreaturePreferences,
  CreatureState,
  InteractionSession,
  Location,
  RoomPropId
} from "../shared/types";

declare global {
  interface Window {
    tinyMint: {
      isDevelopment: boolean;
      getState(): Promise<CreatureState>;
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
      useRoomProp(prop: RoomPropId): void;
      updatePreferences(preferences: Partial<CreaturePreferences>): void;
      talk(): void;
      getInteraction(): Promise<InteractionSession | null>;
      onInteraction(listener: (session: InteractionSession | null) => void): () => void;
      sendQuickReply(text: string): void;
      sendCustomReply(text: string): void;
      dismissInteraction(): void;
      engageInteraction(): void;
      reset(): void;
    };
  }
}

export {};
