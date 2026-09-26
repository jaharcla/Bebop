import { contextBridge, ipcRenderer } from "electron";
import type { Activity, CreatureState, Location, RoomPropId } from "../shared/types";

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
  setLocation: (location: Location) => ipcRenderer.send("state:location", location),
  setActivity: (activity: Activity) => ipcRenderer.send("state:activity", activity),
  useRoomProp: (prop: RoomPropId) => ipcRenderer.send("room:use-prop", prop),
  setPaused: (paused: boolean) => ipcRenderer.send("state:paused", paused),
  reset: () => ipcRenderer.send("state:reset")
});
