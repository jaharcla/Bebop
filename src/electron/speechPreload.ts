import { contextBridge, ipcRenderer } from "electron";
import type { InteractionSession } from "../shared/types";

contextBridge.exposeInMainWorld("tinyMint", {
  getInteraction: (): Promise<InteractionSession | null> => ipcRenderer.invoke("interaction:get"),
  onInteraction: (listener: (session: InteractionSession | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, session: InteractionSession | null) => listener(session);
    ipcRenderer.on("interaction:changed", handler);
    return () => ipcRenderer.off("interaction:changed", handler);
  },
  sendQuickReply: (text: string) => ipcRenderer.send("interaction:reply", text),
  sendCustomReply: (text: string) => ipcRenderer.send("interaction:custom-reply", text),
  dismissInteraction: () => ipcRenderer.send("interaction:dismiss"),
  engageInteraction: () => ipcRenderer.send("interaction:engage")
});
