import { contextBridge, ipcRenderer } from "electron";
import type { InteractionSession } from "../shared/types";

contextBridge.exposeInMainWorld("tinyMint", {
  getInteraction: (): Promise<InteractionSession | null> => ipcRenderer.invoke("interaction:get"),
  onInteraction: (listener: (session: InteractionSession | null) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, session: InteractionSession | null) => listener(session);
    ipcRenderer.on("interaction:changed", handler);
    return () => ipcRenderer.off("interaction:changed", handler);
  },
  onPlacement: (listener: (placement: "top" | "bottom") => void) => {
    const handler = (_event: Electron.IpcRendererEvent, placement: "top" | "bottom") => listener(placement);
    ipcRenderer.on("interaction:placement", handler);
    return () => ipcRenderer.off("interaction:placement", handler);
  },
  resizeSpeechWindow: (height: number) => ipcRenderer.send("interaction:resize", height),
  sendQuickReply: (text: string) => ipcRenderer.send("interaction:reply", text),
  sendCustomReply: (text: string) => ipcRenderer.send("interaction:custom-reply", text),
  dismissInteraction: () => ipcRenderer.send("interaction:dismiss"),
  engageInteraction: () => ipcRenderer.send("interaction:engage")
});
