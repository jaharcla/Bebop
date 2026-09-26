import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { CreatureBrain } from "../creature/brain/CreatureBrain";
import { StateStore } from "../persistence/StateStore";
import type { Activity, CreatureState, Location, RoomPropId } from "../shared/types";

const OVERLAY_SIZE = 192;
let overlayWindow: BrowserWindow | null = null;
let roomWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let brain: CreatureBrain;
let store: StateStore;
let currentState: CreatureState;
let saveTimer: NodeJS.Timeout | undefined;
let movementTimer: NodeJS.Timeout | undefined;
let dragOrigin: { pointerX: number; pointerY: number; windowX: number; windowY: number } | null = null;
let wanderDirection = 1;

const preloadPath = join(__dirname, "preload.js");
const devUrl = process.env.VITE_DEV_SERVER_URL;
const smokeUserData = process.env.TINY_MINT_SMOKE_USER_DATA;
if (smokeUserData) app.setPath("userData", smokeUserData);

function rendererPath(page: "index.html" | "room.html"): string {
  return devUrl ? `${devUrl}/${page}` : join(app.getAppPath(), "dist", page);
}

async function loadRenderer(window: BrowserWindow, page: "index.html" | "room.html"): Promise<void> {
  if (devUrl) await window.loadURL(rendererPath(page));
  else await window.loadFile(rendererPath(page));
}

function clampPosition(x: number, y: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const bounds = display.workArea;
  return {
    x: Math.max(bounds.x, Math.min(Math.round(x), bounds.x + bounds.width - OVERLAY_SIZE)),
    y: Math.max(bounds.y, Math.min(Math.round(y), bounds.y + bounds.height - OVERLAY_SIZE))
  };
}

function createOverlay(): void {
  const position = clampPosition(currentState.position.x, currentState.position.y);
  overlayWindow = new BrowserWindow({
    width: OVERLAY_SIZE,
    height: OVERLAY_SIZE,
    x: position.x,
    y: position.y,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: currentState.preferences.alwaysOnTop,
    backgroundColor: "#00000000",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false }
  });
  overlayWindow.setAlwaysOnTop(currentState.preferences.alwaysOnTop, "floating");
  overlayWindow.on("closed", () => { overlayWindow = null; });
  void loadRenderer(overlayWindow, "index.html");
  if (currentState.location === "room") overlayWindow.hide();
}

function openRoom(): void {
  if (roomWindow && !roomWindow.isDestroyed()) {
    roomWindow.show();
    roomWindow.focus();
    return;
  }
  roomWindow = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 620,
    minHeight: 460,
    title: "Tiny Mint's Room",
    backgroundColor: "#d8f0dc",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false }
  });
  roomWindow.setMenuBarVisibility(false);
  roomWindow.on("closed", () => { roomWindow = null; });
  void loadRenderer(roomWindow, "room.html");
}

function sendToRoom(): void {
  brain.setLocation("room");
  if (roomWindow && !roomWindow.isDestroyed()) {
    roomWindow.show();
    roomWindow.focus();
    return;
  }
  openRoom();
}

function broadcast(state: CreatureState): void {
  currentState = state;
  for (const window of [overlayWindow, roomWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("state:changed", state);
  }
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (state.location === "desktop") overlayWindow.showInactive();
    else overlayWindow.hide();
  }
  updateMovement(state);
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    store.save(currentState);
    saveTimer = undefined;
  }, 2_500);
}

function updateMovement(state: CreatureState): void {
  const shouldMove = state.location === "desktop" && state.currentActivity === "wander" && !state.preferences.paused && !dragOrigin;
  if (!shouldMove && movementTimer) {
    clearInterval(movementTimer);
    movementTimer = undefined;
  }
  if (shouldMove && !movementTimer) {
    movementTimer = setInterval(() => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      const [x, y] = overlayWindow.getPosition();
      const proposed = clampPosition(x + wanderDirection * 3, y);
      if (proposed.x === x) wanderDirection *= -1;
      overlayWindow.setPosition(proposed.x, proposed.y);
      currentState.position = proposed;
    }, 80);
  }
}

function showCreatureMenu(): void {
  Menu.buildFromTemplate([
    { label: "Open Tiny Mint's room", click: openRoom },
    { type: "separator" },
    { label: "Send to room", enabled: currentState.location !== "room", click: sendToRoom },
    { label: "Call to desktop", enabled: currentState.location !== "desktop", click: () => brain.setLocation("desktop") },
    { label: currentState.preferences.paused ? "Resume" : "Pause", click: () => brain.patchPreferences({ paused: !currentState.preferences.paused }) },
    { type: "separator" },
    { label: "Quit Tiny Mint", click: () => app.quit() }
  ]).popup({ window: overlayWindow ?? undefined });
}

function createTray(): void {
  const atlasPath = join(app.getAppPath(), "assets", "sprites", "mascot-atlas.png");
  const icon = nativeImage.createFromPath(atlasPath).crop({ x: 0, y: 0, width: 96, height: 96 }).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip("Tiny Mint");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open room", click: openRoom },
    { label: "Call to desktop", click: () => brain.setLocation("desktop") },
    { label: "Send to room", click: sendToRoom },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]));
  tray.on("double-click", openRoom);
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => brain.snapshot());
  ipcMain.on("creature:click", () => brain.interact("click"));
  ipcMain.on("room:open", openRoom);
  ipcMain.on("menu:open", showCreatureMenu);
  ipcMain.on("state:location", (_event, location: Location) => brain.setLocation(location));
  ipcMain.on("state:activity", (_event, activity: Activity) => brain.setActivity(activity));
  ipcMain.on("room:use-prop", (_event, prop: RoomPropId) => brain.useRoomProp(prop));
  ipcMain.on("state:paused", (_event, paused: boolean) => brain.patchPreferences({ paused }));
  ipcMain.on("state:reset", () => brain.reset());
  ipcMain.on("drag:start", (_event, point: { screenX: number; screenY: number }) => {
    if (!overlayWindow) return;
    const [windowX, windowY] = overlayWindow.getPosition();
    dragOrigin = { pointerX: point.screenX, pointerY: point.screenY, windowX, windowY };
  });
  ipcMain.on("drag:move", (_event, point: { screenX: number; screenY: number }) => {
    if (!overlayWindow || !dragOrigin) return;
    const position = clampPosition(dragOrigin.windowX + point.screenX - dragOrigin.pointerX, dragOrigin.windowY + point.screenY - dragOrigin.pointerY);
    overlayWindow.setPosition(position.x, position.y);
  });
  ipcMain.on("drag:end", (_event, moved: boolean) => {
    if (!overlayWindow || !dragOrigin) return;
    dragOrigin = null;
    const [x, y] = overlayWindow.getPosition();
    brain.updatePosition(x, y);
    if (moved) brain.interact("drag");
  });
  ipcMain.on("pointer:click-through", (_event, ignore: boolean) => {
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
}

async function runSmokeTest(outputDirectory: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  if (!overlayWindow) throw new Error("Expected the Tiny Mint overlay window.");
  const overlayPixels = await overlayWindow.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('#mint');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) return true;
      return false;
    })()
  `) as boolean;
  if (!overlayPixels) throw new Error("Overlay canvas did not render the sprite atlas.");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "overlay.png"), (await overlayWindow.capturePage()).toPNG());

  sendToRoom();
  const room = roomWindow;
  if (!room) throw new Error("Sending Tiny Mint to his room did not open the room window.");
  await new Promise((resolve) => setTimeout(resolve, 400));
  const roomRender = await room.webContents.executeJavaScript(`
    (async () => {
      const canvas = document.querySelector('#mint');
      const creature = document.querySelector('#room-creature');
      const props = Array.from(document.querySelectorAll('#props img'));
      await Promise.all(props.map((image) => image.decode()));
      if (!canvas || !creature) throw new Error('Room creature elements are missing.');
      let spritePixels = false;
      const deadline = Date.now() + 3000;
      while (!spritePixels && Date.now() < deadline) {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Room creature canvas is unavailable.');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] > 0) {
            spritePixels = true;
            break;
          }
        }
        if (!spritePixels) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return { creatureVisible: !creature.hidden && spritePixels, loadedProps: props.filter((image) => image.complete && image.naturalWidth > 0).length, totalProps: props.length };
    })()
  `) as { creatureVisible: boolean; loadedProps: number; totalProps: number };
  if (!room.isVisible() || brain.snapshot().location !== "room") {
    throw new Error("Sending Tiny Mint to his room did not show the room in the room location.");
  }
  if (!roomRender.creatureVisible || roomRender.loadedProps !== 16 || roomRender.totalProps !== 16) {
    throw new Error(`Room v3 rendering failed: ${JSON.stringify(roomRender)}`);
  }
  const roomImage = await room.capturePage();
  if (roomImage.isEmpty()) throw new Error("Room window did not produce a rendered frame.");
  writeFileSync(join(outputDirectory, "room.png"), roomImage.toPNG());
  const overlayHiddenInRoom = !overlayWindow.isVisible();
  if (!overlayHiddenInRoom) throw new Error("Desktop overlay remained visible while Tiny Mint was in the room.");
  room.close();
  brain.setActivity("rest");
  const stateContinuesWithRoomClosed = brain.snapshot().location === "room" && brain.snapshot().currentActivity === "rest";
  if (!stateContinuesWithRoomClosed) throw new Error("Creature state did not persist after the room window closed.");
  brain.setLocation("desktop");
  await new Promise((resolve) => setTimeout(resolve, 150));
  const overlayVisibleOnDesktop = overlayWindow.isVisible();
  if (!overlayVisibleOnDesktop) throw new Error("Desktop overlay did not reappear after returning from the room.");
  store.save(brain.snapshot());
  const persisted = store.load();
  if (persisted.schemaVersion !== 1 || persisted.location !== "desktop") {
    throw new Error("Returned desktop state was not persisted correctly.");
  }
  const report = {
    overlayPixels,
    roomVisibleOnSend: true,
    roomCreaturePixels: roomRender.creatureVisible,
    loadedRoomProps: roomRender.loadedProps,
    overlayHiddenInRoom,
    stateContinuesWithRoomClosed,
    overlayVisibleOnDesktop,
    persistedSchemaVersion: persisted.schemaVersion,
    overlayBounds: overlayWindow.getBounds()
  };
  writeFileSync(join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
  console.log(`TINY_MINT_SMOKE ${JSON.stringify(report)}`);
  app.quit();
}

app.whenReady().then(() => {
  store = new StateStore(join(app.getPath("userData"), "creature-state.json"));
  currentState = store.load();
  brain = new CreatureBrain(currentState);
  registerIpc();
  createOverlay();
  createTray();
  brain.subscribe(broadcast);
  brain.start();
  globalShortcut.register("CommandOrControl+Shift+M", openRoom);
  if (process.env.TINY_MINT_SMOKE_OUTPUT) {
    void runSmokeTest(process.env.TINY_MINT_SMOKE_OUTPUT).catch((error) => {
      console.error("TINY_MINT_SMOKE_FAILED", error);
      app.exit(1);
    });
  }
});

app.on("window-all-closed", () => {});
app.on("before-quit", () => {
  brain?.stop();
  if (saveTimer) clearTimeout(saveTimer);
  if (movementTimer) clearInterval(movementTimer);
  if (currentState && store) store.save(currentState);
});
app.on("will-quit", () => globalShortcut.unregisterAll());
