import { contextBridge, ipcRenderer } from "electron";
import type {
  Activity,
  CreaturePreferences,
  CreatureState,
  InteractionSession,
  Location,
  RoomPropId
} from "../shared/types";

contextBridge.exposeInMainWorld("tinyMint", {
  isDevelopment: Boolean(process.env.VITE_DEV_SERVER_URL),
  getState: (): Promise<CreatureState> => ipcRenderer.invoke("state:get"),
  onState: (listener: (state: CreatureState) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: CreatureState) => listener(state);
    ipcRenderer.on("state:changed", handler);
    return () => ipcRenderer.off("state:changed", handler);
  },
  click: () => ipcRenderer.send("creature:click"),
  startDrag: (screenX: number, screenY: number) => ipcRenderer.send("drag:start", { screenX, screenY }),
  drag: (screenX: number, screenY: number) => ipcRenderer.send("drag:move", { screenX, screenY }),
  endDrag: (moved: boolean) => ipcRenderer.send("drag:end", moved),
  setClickThrough: (ignore: boolean) => ipcRenderer.send("pointer:click-through", ignore),
  openMenu: () => ipcRenderer.send("menu:open"),
  openRoom: () => ipcRenderer.send("room:open"),
  openSettings: () => ipcRenderer.send("settings:open"),
  setLocation: (location: Location) => ipcRenderer.send("state:location", location),
  setActivity: (activity: Activity) => ipcRenderer.send("state:activity", activity),
  useRoomProp: (prop: RoomPropId) => ipcRenderer.send("room:use-prop", prop),
  updatePreferences: (preferences: Partial<CreaturePreferences>) => ipcRenderer.send("preferences:update", preferences),
  talk: () => ipcRenderer.send("interaction:start"),
  getInteraction: (): Promise<InteractionSession | null> => ipcRenderer.invoke("interaction:get"),
  onInteraction: (listener: (session: InteractionSession | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, session: InteractionSession | null) => listener(session);
    ipcRenderer.on("interaction:changed", handler);
    return () => ipcRenderer.off("interaction:changed", handler);
  },
  sendQuickReply: (text: string) => ipcRenderer.send("interaction:reply", text),
  sendCustomReply: (text: string) => ipcRenderer.send("interaction:custom-reply", text),
  dismissInteraction: () => ipcRenderer.send("interaction:dismiss"),
  engageInteraction: () => ipcRenderer.send("interaction:engage"),
  reset: () => ipcRenderer.send("state:reset")
});
