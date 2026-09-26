import type { Activity, CreaturePreferences, CreatureState, Location, RoomPropId } from "../shared/types";

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
      reset(): void;
    };
  }
}

export {};
