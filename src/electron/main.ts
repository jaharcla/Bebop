import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } from "electron";
import type { MenuItem } from "electron";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { CreatureBrain } from "../creature/brain/CreatureBrain";
import { InteractionController } from "../interaction/InteractionController";
import { FallbackDialogueProvider, GroqDialogueProvider } from "../interaction/dialogue/GroqDialogueProvider";
import type { DialogueProvider } from "../interaction/dialogue/DialogueProvider";
import { LocalDialogueProvider } from "../interaction/dialogue/LocalDialogueProvider";
import { positionSpeechWindow as calculateSpeechPosition } from "../interaction/speechPosition";
import { StateStore } from "../persistence/StateStore";
import type {
  Activity,
  CreaturePreferences,
  CreatureState,
  InteractionSession,
  Location,
  RoomPropId
} from "../shared/types";

const OVERLAY_SIZE = 192;
const SPEECH_WINDOW_SIZE = { width: 340, height: 190 };
let overlayWindow: BrowserWindow | null = null;
let roomWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let speechWindow: BrowserWindow | null = null;
let speechWindowReady = false;
let tray: Tray | null = null;
let trayPauseItem: MenuItem | undefined;
let brain: CreatureBrain;
let store: StateStore;
let interactionController: InteractionController;
let saveTimer: NodeJS.Timeout | undefined;
let movementTimer: NodeJS.Timeout | undefined;
let dragOrigin: { pointerX: number; pointerY: number; windowX: number; windowY: number } | null = null;
let wanderDirection = 1;

const preloadPath = join(__dirname, "preload.js");
const devUrl = process.env.VITE_DEV_SERVER_URL;
const smokeUserData = process.env.TINY_MINT_SMOKE_USER_DATA;
if (smokeUserData) app.setPath("userData", smokeUserData);

function rendererPath(page: "index.html" | "room.html" | "settings.html" | "speech.html"): string {
  return devUrl ? `${devUrl}/${page}` : join(app.getAppPath(), "dist", page);
}

async function loadRenderer(window: BrowserWindow, page: "index.html" | "room.html" | "settings.html" | "speech.html"): Promise<void> {
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

function createOverlay(state: CreatureState): void {
  const position = clampPosition(state.position.x, state.position.y);
  brain.setPosition(position.x, position.y, { notify: false });
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
    alwaysOnTop: state.preferences.alwaysOnTop,
    backgroundColor: "#00000000",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false }
  });
  overlayWindow.setAlwaysOnTop(state.preferences.alwaysOnTop, "floating");
  overlayWindow.on("closed", () => { overlayWindow = null; });
  void loadRenderer(overlayWindow, "index.html");
  if (state.location === "room") overlayWindow.hide();
}

function positionSpeechWindow(): void {
  if (!speechWindow || speechWindow.isDestroyed() || !overlayWindow || overlayWindow.isDestroyed()) return;
  if (brain.snapshot().location !== "desktop") {
    speechWindow.hide();
    return;
  }
  const creature = overlayWindow.getBounds();
  const bubbleBounds = speechWindow.getBounds();
  const center = { x: creature.x + creature.width / 2, y: creature.y + creature.height / 2 };
  const workArea = screen.getDisplayNearestPoint(center).workArea;
  const position = positionSpeechWindowForDisplay(creature, workArea, bubbleBounds);
  speechWindow.setBounds({ ...position, width: bubbleBounds.width, height: bubbleBounds.height }, false);
}

function positionSpeechWindowForDisplay(
  creature: Electron.Rectangle,
  workArea: Electron.Rectangle,
  bubbleSize: Pick<Electron.Rectangle, "width" | "height"> = SPEECH_WINDOW_SIZE
): { x: number; y: number } {
  return calculateSpeechPosition(creature, bubbleSize, workArea);
}

function showSpeechSession(session: InteractionSession | null): void {
  if (!session) {
    speechWindow?.hide();
    return;
  }
  if (!speechWindow || speechWindow.isDestroyed()) {
    const position = calculateSpeechPosition(
      overlayWindow?.getBounds() ?? { x: 80, y: 80, width: OVERLAY_SIZE, height: OVERLAY_SIZE },
      SPEECH_WINDOW_SIZE,
      screen.getDisplayNearestPoint(overlayWindow?.getBounds() ?? { x: 80, y: 80 }).workArea
    );
    speechWindowReady = false;
    speechWindow = new BrowserWindow({
      ...SPEECH_WINDOW_SIZE,
      ...position,
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: brain.snapshot().preferences.alwaysOnTop,
      backgroundColor: "#00000000",
      webPreferences: { preload: join(__dirname, "speechPreload.js"), contextIsolation: true, nodeIntegration: false }
    });
    speechWindow.setAlwaysOnTop(brain.snapshot().preferences.alwaysOnTop, "floating");
    speechWindow.on("closed", () => {
      speechWindow = null;
      speechWindowReady = false;
    });
    speechWindow.webContents.on("did-finish-load", () => {
      speechWindowReady = true;
      const current = interactionController?.getSession();
      if (current && speechWindow && !speechWindow.isDestroyed()) {
        speechWindow.webContents.send("interaction:changed", current);
        positionSpeechWindow();
        speechWindow.showInactive();
      }
    });
    void loadRenderer(speechWindow, "speech.html");
  } else if (speechWindowReady) {
    speechWindow.webContents.send("interaction:changed", session);
  }
  positionSpeechWindow();
  if (speechWindowReady && !speechWindow.isVisible()) speechWindow.showInactive();
}

function startUserTalk(): void {
  if (brain.snapshot().location === "room") roomWindow?.hide();
  void interactionController.startUserSession().catch((error: unknown) => {
    console.warn("Could not start a Tiny Mint conversation.", error);
  });
}

function createDialogueProvider(): DialogueProvider {
  const local = new LocalDialogueProvider();
  if (process.env.TINY_MINT_SMOKE_OUTPUT) return local;
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim();
  if (!apiKey || !model) {
    if (apiKey || model) console.warn("Both GROQ_API_KEY and GROQ_MODEL are needed; Tiny Mint will use local dialogue.");
    return local;
  }
  const groq = new GroqDialogueProvider(apiKey, model);
  return new FallbackDialogueProvider(groq, local, (error) => {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`Groq dialogue unavailable; using local replies (${detail}).`);
  });
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
  roomWindow.show();
  roomWindow.focus();
}

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 460,
    height: 690,
    minWidth: 400,
    minHeight: 600,
    resizable: false,
    title: "Tiny Mint Settings",
    backgroundColor: "#edf2e9",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on("closed", () => { settingsWindow = null; });
  void loadRenderer(settingsWindow, "settings.html");
}

function sendToRoom(): void {
  interactionController?.dismiss();
  brain.setLocation("room");
  if (roomWindow && !roomWindow.isDestroyed()) {
    roomWindow.show();
    roomWindow.focus();
    return;
  }
  openRoom();
}

function broadcast(state: CreatureState): void {
  for (const window of [overlayWindow, roomWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send("state:changed", state);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send("state:changed", state);
  interactionController?.observeState(state);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (state.location === "desktop") overlayWindow.showInactive();
    else overlayWindow.hide();
  }
  if (trayPauseItem) trayPauseItem.label = state.preferences.paused ? "Resume" : "Pause";
  updateMovement(state);
  positionSpeechWindow();
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    store.save(brain.snapshot());
    saveTimer = undefined;
  }, 2_500);
}

function updateMovement(state: CreatureState): void {
  const shouldMove = state.location === "desktop" && state.currentActivity === "wander" && state.preferences.roamingEnabled && !state.preferences.paused && !dragOrigin;
  if (!shouldMove && movementTimer) {
    clearInterval(movementTimer);
    movementTimer = undefined;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const [x, y] = overlayWindow.getPosition();
      brain.setPosition(x, y, { notify: false });
    }
  }
  if (shouldMove && !movementTimer) {
    movementTimer = setInterval(() => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      const [x, y] = overlayWindow.getPosition();
      const proposed = clampPosition(x + wanderDirection * 3, y);
      if (proposed.x === x) wanderDirection *= -1;
      overlayWindow.setPosition(proposed.x, proposed.y);
      brain.setPosition(proposed.x, proposed.y, { notify: false });
      positionSpeechWindow();
    }, 80);
  }
}

function showCreatureMenu(): void {
  const state = brain.snapshot();
  Menu.buildFromTemplate([
    { label: "Open Tiny Mint's room", click: openRoom },
    { label: "Settings", click: openSettings },
    { label: "Talk", click: startUserTalk },
    { type: "separator" },
    { label: "Send to room", enabled: state.location !== "room", click: sendToRoom },
    { label: "Call to desktop", enabled: state.location !== "desktop", click: () => brain.setLocation("desktop") },
    { label: state.preferences.paused ? "Resume" : "Pause", click: () => brain.patchPreferences({ paused: !state.preferences.paused }) },
    { type: "separator" },
    { label: "Quit Tiny Mint", click: () => app.quit() }
  ]).popup({ window: overlayWindow ?? undefined });
}

function createTray(): void {
  const atlasPath = join(app.getAppPath(), "assets", "sprites", "mascot-atlas.png");
  const icon = nativeImage.createFromPath(atlasPath).crop({ x: 0, y: 0, width: 96, height: 96 }).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip("Tiny Mint");
  const menu = Menu.buildFromTemplate([
    { label: "Open room", click: openRoom },
    { label: "Settings", click: openSettings },
    { label: "Talk", click: startUserTalk },
    { label: "Call to desktop", click: () => brain.setLocation("desktop") },
    { label: "Send to room", click: sendToRoom },
    { type: "separator" },
    { label: "Pause", click: () => brain.patchPreferences({ paused: !brain.snapshot().preferences.paused }) },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() }
  ]);
  trayPauseItem = menu.items.find((item) => item.label === "Pause");
  tray.setContextMenu(menu);
  tray.on("double-click", openRoom);
}

function isApplicationWindow(sender: Electron.WebContents): boolean {
  return [overlayWindow, roomWindow, settingsWindow].some((window) => window?.webContents === sender);
}

function isSpeechWindow(sender: Electron.WebContents): boolean {
  return speechWindow?.webContents === sender;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const preferenceKeys: readonly (keyof CreaturePreferences)[] = [
  "alwaysOnTop",
  "cursorInteraction",
  "paused",
  "reducedMotion",
  "roamingEnabled",
  "roomVisitsEnabled",
  "roomAutonomyEnabled",
  "interactionsEnabled",
  "startWithWindows"
];

function isPreferencePatch(value: unknown): value is Partial<CreaturePreferences> {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, preference]) =>
    preferenceKeys.includes(key as keyof CreaturePreferences) && typeof preference === "boolean"
  );
}

function applyStartupPreference(enabled: boolean): void {
  if (process.platform !== "win32") return;
  if (!app.isPackaged) {
    if (enabled) console.warn("Windows login startup is only configured for packaged builds; the preference was saved for later.");
    return;
  }
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: []
    });
    if (app.getLoginItemSettings().openAtLogin !== enabled) {
      console.warn(`Windows login startup did not accept the requested setting (${enabled}) in this build.`);
    }
  } catch (error) {
    console.warn("Could not update Windows login startup settings.", error);
  }
}

function registerIpc(): void {
  ipcMain.handle("state:get", () => brain.snapshot());
  ipcMain.handle("interaction:get", (event) => isSpeechWindow(event.sender) ? interactionController.getSession() : null);
  ipcMain.on("creature:click", (event) => { if (isApplicationWindow(event.sender)) brain.interact("click"); });
  ipcMain.on("room:open", (event) => { if (isApplicationWindow(event.sender)) openRoom(); });
  ipcMain.on("settings:open", (event) => { if (isApplicationWindow(event.sender)) openSettings(); });
  ipcMain.on("menu:open", (event) => { if (isApplicationWindow(event.sender)) showCreatureMenu(); });
  ipcMain.on("state:location", (event, location: unknown) => {
    if (!isApplicationWindow(event.sender)) return;
    if (location === "desktop" || location === "room") {
      if (location === "room") interactionController.dismiss();
      brain.setLocation(location as Location);
    } else console.warn("Ignored invalid location update from renderer.", location);
  });
  ipcMain.on("state:activity", (event, activity: unknown) => {
    if (!isApplicationWindow(event.sender)) return;
    const activities: readonly Activity[] = ["idle", "wander", "observe", "rest", "sit", "sleep", "draw", "read", "exercise", "carry", "inspect", "play", "music", "show", "visitRoom", "visitDesktop"];
    if (typeof activity === "string" && activities.includes(activity as Activity)) brain.setActivity(activity as Activity);
    else console.warn("Ignored invalid activity update from renderer.", activity);
  });
  ipcMain.on("room:use-prop", (event, prop: unknown) => {
    if (!isApplicationWindow(event.sender)) return;
    const props: readonly RoomPropId[] = ["door", "corkboard", "bookshelf", "plant", "bed", "chair", "desk", "music-player", "toy-box", "rug", "cushion", "ball", "dumbbell", "sketchbook", "book", "watering-can"];
    if (typeof prop === "string" && props.includes(prop as RoomPropId)) brain.useRoomProp(prop as RoomPropId);
    else console.warn("Ignored invalid room prop update from renderer.", prop);
  });
  ipcMain.on("preferences:update", (event, preferences: unknown) => {
    if (!isApplicationWindow(event.sender)) return;
    if (!isPreferencePatch(preferences)) {
      console.warn("Ignored invalid preference update from renderer.", preferences);
      return;
    }
    if (Object.hasOwn(preferences, "startWithWindows")) applyStartupPreference(preferences.startWithWindows!);
    if (Object.hasOwn(preferences, "alwaysOnTop")) {
      overlayWindow?.setAlwaysOnTop(preferences.alwaysOnTop!, "floating");
      speechWindow?.setAlwaysOnTop(preferences.alwaysOnTop!, "floating");
    }
    brain.patchPreferences(preferences);
  });
  ipcMain.on("interaction:start", (event) => {
    if (isApplicationWindow(event.sender) && !isSpeechWindow(event.sender)) startUserTalk();
  });
  ipcMain.on("interaction:reply", (event, reply: unknown) => {
    const session = interactionController.getSession();
    if (!isSpeechWindow(event.sender) || typeof reply !== "string" || reply.length > 40 || !session || session.waitingForResponse
      || !session?.current.quickResponses.includes(reply)) {
      console.warn("Ignored invalid quick reply from renderer.");
      return;
    }
    void interactionController.reply(reply);
  });
  ipcMain.on("interaction:custom-reply", (event, reply: unknown) => {
    const session = interactionController.getSession();
    if (!isSpeechWindow(event.sender) || typeof reply !== "string" || reply.length > 500 || !reply.trim()
      || !session || session.waitingForResponse) {
      console.warn("Ignored invalid custom reply from renderer.");
      return;
    }
    void interactionController.reply(reply);
  });
  ipcMain.on("interaction:dismiss", (event) => {
    if (isSpeechWindow(event.sender)) interactionController.dismiss();
  });
  ipcMain.on("interaction:engage", (event) => {
    if (isSpeechWindow(event.sender)) interactionController.engage();
  });
  ipcMain.on("state:reset", (event) => { if (isApplicationWindow(event.sender)) brain.reset(); });
  ipcMain.on("drag:start", (event, point: unknown) => {
    if (!isApplicationWindow(event.sender) || !isRecord(point) || typeof point.screenX !== "number" || typeof point.screenY !== "number" || !Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return;
    if (!overlayWindow) return;
    const [windowX, windowY] = overlayWindow.getPosition();
    dragOrigin = { pointerX: point.screenX, pointerY: point.screenY, windowX, windowY };
    updateMovement(brain.snapshot());
  });
  ipcMain.on("drag:move", (event, point: unknown) => {
    if (!isApplicationWindow(event.sender) || !isRecord(point) || typeof point.screenX !== "number" || typeof point.screenY !== "number" || !Number.isFinite(point.screenX) || !Number.isFinite(point.screenY)) return;
    if (!overlayWindow || !dragOrigin) return;
    const position = clampPosition(dragOrigin.windowX + point.screenX - dragOrigin.pointerX, dragOrigin.windowY + point.screenY - dragOrigin.pointerY);
    overlayWindow.setPosition(position.x, position.y);
    positionSpeechWindow();
  });
  ipcMain.on("drag:end", (event, moved: unknown) => {
    if (!isApplicationWindow(event.sender) || typeof moved !== "boolean") return;
    if (!overlayWindow || !dragOrigin) return;
    dragOrigin = null;
    const [x, y] = overlayWindow.getPosition();
    brain.setPosition(x, y, { userInteraction: true });
    if (moved) brain.interact("drag");
  });
  ipcMain.on("pointer:click-through", (event, ignore: unknown) => {
    if (!isApplicationWindow(event.sender) || typeof ignore !== "boolean") return;
    overlayWindow?.setIgnoreMouseEvents(ignore, { forward: true });
  });
}

async function runSmokeTest(outputDirectory: string): Promise<void> {
  const watchdog = setTimeout(() => {
    console.error(`TINY_MINT_SMOKE_FAILED Timed out after 30 seconds (location=${brain.snapshot().location}, activity=${brain.snapshot().currentActivity}, roomWindow=${Boolean(roomWindow)}, roomUrl=${roomWindow?.webContents.getURL() ?? "none"}).`);
    app.exit(1);
  }, 30_000);
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

  openSettings();
  const settings = settingsWindow;
  if (!settings) throw new Error("Settings did not open.");
  const settingsControlCount = await settings.webContents.executeJavaScript(
    "document.querySelectorAll('input[data-preference]').length"
  ) as number;
  if (settingsControlCount !== 9) throw new Error(`Expected 9 settings controls; found ${settingsControlCount}.`);
  const setCheckbox = async (key: keyof CreaturePreferences, checked: boolean): Promise<void> => {
    await settings.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[data-preference="${key}"]');
        input.checked = ${checked};
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await new Promise((resolve) => setTimeout(resolve, 100));
  };
  await setCheckbox("interactionsEnabled", false);
  const userInteractionTime = brain.snapshot().lastUserInteraction;
  await overlayWindow.webContents.executeJavaScript("window.tinyMint.talk()");
  const speechDeadline = Date.now() + 5_000;
  while ((!speechWindow || !speechWindowReady || !speechWindow.isVisible()
    || !interactionController.getSession() || interactionController.getSession()?.waitingForResponse)
    && Date.now() < speechDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const speech = speechWindow;
  const session = interactionController.getSession();
  if (!speech || speech.isDestroyed() || !speech.isVisible() || !session || session.waitingForResponse || session.current.text === "...") {
    throw new Error("User-requested Talk did not produce a visible local speech bubble.");
  }
  const energyAtConversationStart = brain.snapshot().energy;
  const speechDoesNotStealFocus = !speech.isFocused();
  if (!speechDoesNotStealFocus) throw new Error("An appearing speech bubble stole focus.");
  const speechBounds = speech.getBounds();
  const overlayBoundsForSpeech = overlayWindow.getBounds();
  const speechDisplay = screen.getDisplayNearestPoint({
    x: overlayBoundsForSpeech.x + overlayBoundsForSpeech.width / 2,
    y: overlayBoundsForSpeech.y + overlayBoundsForSpeech.height / 2
  });
  const workArea = speechDisplay.workArea;
  const speechWindowOnScreen = speechBounds.x >= workArea.x && speechBounds.y >= workArea.y
    && speechBounds.x + speechBounds.width <= workArea.x + workArea.width
    && speechBounds.y + speechBounds.height <= workArea.y + workArea.height;
  if (!speechWindowOnScreen) throw new Error(`Speech window is outside the display work area: ${JSON.stringify(speechBounds)}`);
  const positionBeforeWander = speech.getBounds();
  brain.setActivity("wander");
  await new Promise((resolve) => setTimeout(resolve, 320));
  const positionAfterWander = speech.getBounds();
  const speechFollowsWander = positionAfterWander.x !== positionBeforeWander.x
    || positionAfterWander.y !== positionBeforeWander.y;
  if (!speechFollowsWander) throw new Error("Speech window did not follow autonomous desktop movement.");
  brain.setActivity("idle");

  const dragStartBounds = overlayWindow.getBounds();
  await overlayWindow.webContents.executeJavaScript(`
    (() => {
      window.tinyMint.startDrag(${dragStartBounds.x + 96}, ${dragStartBounds.y + 96});
      window.tinyMint.drag(${dragStartBounds.x + 108}, ${dragStartBounds.y + 104});
      window.tinyMint.endDrag(true);
    })()
  `);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const draggedCreatureBounds = overlayWindow.getBounds();
  const draggedDisplay = screen.getDisplayNearestPoint({
    x: draggedCreatureBounds.x + draggedCreatureBounds.width / 2,
    y: draggedCreatureBounds.y + draggedCreatureBounds.height / 2
  });
  const expectedSpeechPosition = positionSpeechWindowForDisplay(draggedCreatureBounds, draggedDisplay.workArea, speech.getBounds());
  const actualSpeechPosition = speech.getBounds();
  const speechFollowsDrag = Math.abs(actualSpeechPosition.x - expectedSpeechPosition.x) <= 1
    && Math.abs(actualSpeechPosition.y - expectedSpeechPosition.y) <= 1;
  if (!speechFollowsDrag) throw new Error(`Speech window did not follow the user's drag (actual=${JSON.stringify(actualSpeechPosition)}, expected=${JSON.stringify(expectedSpeechPosition)}, creature=${JSON.stringify(draggedCreatureBounds)}, workArea=${JSON.stringify(draggedDisplay.workArea)}).`);

  await new Promise((resolve) => setTimeout(resolve, 100));
  const renderedOpening = await speech.webContents.executeJavaScript("document.querySelector('#utterance')?.textContent ?? ''") as string;
  if (!renderedOpening || renderedOpening === "...") throw new Error("Speech renderer did not display Tiny Mint's opening line.");
  const bridgeMethods = await speech.webContents.executeJavaScript("Object.keys(window.tinyMint).sort().join(',')") as string;
  const speechNodeAccessDisabled = await speech.webContents.executeJavaScript(
    "typeof window.require === 'undefined' && typeof process === 'undefined'"
  ) as boolean;
  const speechPreloadLockedDown = bridgeMethods === "dismissInteraction,engageInteraction,getInteraction,onInteraction,sendCustomReply,sendQuickReply"
    && speechNodeAccessDisabled;
  if (!speechPreloadLockedDown) throw new Error(`Speech preload exposed an unexpected surface: ${bridgeMethods}`);

  await speech.webContents.executeJavaScript("document.querySelector('.quick-replies button')?.click()");
  const quickReplyDeadline = Date.now() + 3_000;
  while (!interactionController.getSession()?.messages.some((message) => message.role === "user") && Date.now() < quickReplyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  let activeSession = interactionController.getSession();
  if (!activeSession?.messages.some((message) => message.role === "user")) throw new Error("Quick response did not enter the conversation.");
  const speechQuickResponse = activeSession.messages.some((message) => message.role === "user");

  const customReply = "i'm making your brain";
  await speech.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#reply');
      input.value = ${JSON.stringify(customReply)};
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    })()
  `);
  const customReplyDeadline = Date.now() + 3_000;
  while (!interactionController.getSession()?.messages.some((message) => message.role === "user" && message.text === customReply)
    && Date.now() < customReplyDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  activeSession = interactionController.getSession();
  if (!activeSession?.messages.some((message) => message.role === "user" && message.text === customReply)) {
    throw new Error("Custom text did not enter the conversation.");
  }
  const speechCustomReply = true;
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  const brainActiveDuringConversation = !brain.snapshot().preferences.paused
    && brain.snapshot().lastUserInteraction >= userInteractionTime
    && brain.snapshot().energy !== energyAtConversationStart;
  await speech.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const speechEscapeDismiss = !speech.isVisible() && interactionController.getSession() === null;
  if (!speechEscapeDismiss) throw new Error("Escape did not dismiss and hide the speech window.");
  await setCheckbox("interactionsEnabled", true);

  await settings.webContents.executeJavaScript(`
    (() => {
      const reducedMotion = document.querySelector('[data-preference="reducedMotion"]');
      reducedMotion.checked = true;
      reducedMotion.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (!brain.snapshot().preferences.reducedMotion || brain.snapshot().preferences.paused) {
    throw new Error("Reduced motion changed the master pause state or failed to update.");
  }
  await setCheckbox("reducedMotion", false);

  let startupSettingRoundTrip: boolean | "unsupported" = "unsupported";
  let originalStartupSetting: boolean | undefined;
  if (process.platform === "win32" && app.isPackaged) {
    try {
      originalStartupSetting = app.getLoginItemSettings().openAtLogin;
    } catch (error) {
      console.warn("Could not inspect Windows login settings during smoke.", error);
    }
  }
  if (typeof originalStartupSetting === "boolean") {
    const savedStartupPreference = brain.snapshot().preferences.startWithWindows;
    try {
      await setCheckbox("startWithWindows", !originalStartupSetting);
      const updatedStartupSetting = app.getLoginItemSettings().openAtLogin;
      if (updatedStartupSetting !== !originalStartupSetting) {
        throw new Error(`Windows login setting did not update (requested=${!originalStartupSetting}, actual=${updatedStartupSetting}).`);
      }
      startupSettingRoundTrip = true;
    } finally {
      await setCheckbox("startWithWindows", savedStartupPreference);
      applyStartupPreference(originalStartupSetting);
      if (app.getLoginItemSettings().openAtLogin !== originalStartupSetting) {
        throw new Error("Could not restore the original Windows login setting after smoke.");
      }
    }
  } else if (process.platform === "win32") {
    const savedStartupPreference = brain.snapshot().preferences.startWithWindows;
    await setCheckbox("startWithWindows", !savedStartupPreference);
    if (brain.snapshot().preferences.startWithWindows === savedStartupPreference) {
      throw new Error("Start with Windows preference did not update in the development build.");
    }
    await setCheckbox("startWithWindows", savedStartupPreference);
  }

  const startPosition = overlayWindow.getPosition();
  await settings.webContents.executeJavaScript(`
    (() => {
      const roaming = document.querySelector('[data-preference="roamingEnabled"]');
      roaming.checked = false;
      roaming.dispatchEvent(new Event('change', { bubbles: true }));
    })()
  `);
  await new Promise((resolve) => setTimeout(resolve, 100));
  brain.setActivity("wander");
  await new Promise((resolve) => setTimeout(resolve, 320));
  if (brain.snapshot().preferences.roamingEnabled || overlayWindow.getPosition()[0] !== startPosition[0]) {
    throw new Error("Turning roaming off did not keep Tiny Mint in place.");
  }
  await setCheckbox("cursorInteraction", false);
  await overlayWindow.webContents.executeJavaScript("window.tinyMint.click()");
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (brain.snapshot().preferences.cursorInteraction || brain.snapshot().currentAnimation !== "tap") {
    throw new Error("Clicking Tiny Mint failed when cursor reactions were disabled.");
  }
  const dragStartPosition = overlayWindow.getPosition();
  await overlayWindow.webContents.executeJavaScript(`
    (() => {
      window.tinyMint.startDrag(${dragStartPosition[0] + 96}, ${dragStartPosition[1] + 96});
      window.tinyMint.drag(${dragStartPosition[0] + 124}, ${dragStartPosition[1] + 96});
      window.tinyMint.endDrag(true);
    })()
  `);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const dragEndPosition = overlayWindow.getPosition();
  if (dragEndPosition[0] !== dragStartPosition[0] + 28 || brain.snapshot().position.x !== dragEndPosition[0]) {
    throw new Error("Dragging did not move the overlay and synchronize Brain position.");
  }

  await setCheckbox("roamingEnabled", true);
  brain.setActivity("wander");
  await new Promise((resolve) => setTimeout(resolve, 320));
  if (overlayWindow.getPosition()[0] === dragEndPosition[0]) {
    throw new Error("Turning roaming on did not resume desktop movement.");
  }

  await setCheckbox("roomVisitsEnabled", false);
  await setCheckbox("roomAutonomyEnabled", false);
  await setCheckbox("paused", true);
  sendToRoom();
  const room = roomWindow;
  if (!room) throw new Error("Sending Tiny Mint to his room did not open the room window.");
  await new Promise((resolve) => setTimeout(resolve, 400));
  let roomRenderTimeout: ReturnType<typeof setTimeout> | undefined;
  const roomRender = await Promise.race([
    room.webContents.executeJavaScript(`
    (async () => {
      const canvas = document.querySelector('#mint');
      const creature = document.querySelector('#room-creature');
      const props = Array.from(document.querySelectorAll('#props img'));
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
  `) as Promise<{ creatureVisible: boolean; loadedProps: number; totalProps: number }>,
    new Promise<never>((_resolve, reject) => {
      roomRenderTimeout = setTimeout(() => reject(new Error("Room renderer did not finish its smoke check in time.")), 7_000);
    })
  ]).finally(() => {
    if (roomRenderTimeout) clearTimeout(roomRenderTimeout);
  });
  if (!room.isVisible() || brain.snapshot().location !== "room") {
    throw new Error(`Sending Tiny Mint to his room did not show the room in the room location (visible=${room.isVisible()}, location=${brain.snapshot().location}).`);
  }
  if (!roomRender.creatureVisible || roomRender.loadedProps !== 16 || roomRender.totalProps !== 16) {
    throw new Error(`Room v3 rendering failed: ${JSON.stringify(roomRender)}`);
  }
  await room.webContents.executeJavaScript(`document.querySelector('[data-prop="desk"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (brain.snapshot().currentActivity !== "draw" || brain.snapshot().room.target !== "desk") {
    throw new Error("Manual room prop interaction failed with room autonomy disabled.");
  }
  const overlayHiddenInRoom = !overlayWindow.isVisible();
  if (!overlayHiddenInRoom) throw new Error("Desktop overlay remained visible while Tiny Mint was in the room.");
  room.close();
  brain.setActivity("rest");
  const stateContinuesWithRoomClosed = brain.snapshot().location === "room" && brain.snapshot().currentActivity === "rest";
  if (!stateContinuesWithRoomClosed) throw new Error("Creature state did not persist after the room window closed.");
  await new Promise((resolve) => setTimeout(resolve, 100));
  openRoom();
  const roomForTalk = roomWindow;
  if (!roomForTalk) throw new Error("The room did not reopen for the room-origin Talk check.");
  await roomForTalk.webContents.executeJavaScript("window.tinyMint.talk()");
  const roomTalkDeadline = Date.now() + 5_000;
  while ((!interactionController.getSession() || interactionController.getSession()?.waitingForResponse) && Date.now() < roomTalkDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const roomTalkSession = interactionController.getSession();
  const talkFromRoomReturnsToDesktop = brain.snapshot().location === "desktop"
    && roomForTalk.isVisible() === false
    && speechWindow?.isVisible() === true
    && roomTalkSession?.origin === "user"
    && roomTalkSession.waitingForResponse === false;
  if (!talkFromRoomReturnsToDesktop) throw new Error("Talk from the room did not bring Tiny Mint to the desktop.");
  interactionController.dismiss();
  sendToRoom();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const roomHandoffAfterConversation = roomWindow?.isVisible() === true && brain.snapshot().location === "room";
  if (!roomHandoffAfterConversation) throw new Error("Room handoff failed after the room-origin Talk session.");
  roomWindow?.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  brain.setLocation("desktop");
  await setCheckbox("paused", false);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const overlayVisibleOnDesktop = overlayWindow.isVisible();
  if (!overlayVisibleOnDesktop) throw new Error("Desktop overlay did not reappear after returning from the room.");
  store.save(brain.snapshot());
  const persisted = store.load();
  if (persisted.schemaVersion !== 1 || persisted.location !== "desktop") {
    throw new Error("Returned desktop state was not persisted correctly.");
  }
  const overlayBounds = overlayWindow.getBounds();
  if (persisted.position.x !== overlayBounds.x || persisted.position.y !== overlayBounds.y) {
    throw new Error(`Persisted position does not match the visible overlay (saved=${JSON.stringify(persisted.position)}, bounds=${JSON.stringify(overlayBounds)}).`);
  }
  const report = {
    overlayPixels,
    roomVisibleOnSend: true,
    roomCreaturePixels: roomRender.creatureVisible,
    loadedRoomProps: roomRender.loadedProps,
    settingsControlCount,
    manualTalkWhileInitiationDisabled: true,
    speechWindowOnScreen,
    speechDoesNotStealFocus,
    speechPreloadLockedDown,
    speechFollowsWander,
    speechFollowsDrag,
    speechQuickResponse,
    speechCustomReply,
    brainActiveDuringConversation,
    speechEscapeDismiss,
    reducedMotionIndependentOfPause: !brain.snapshot().preferences.paused,
    startupSettingRoundTrip,
    overlayHiddenInRoom,
    stateContinuesWithRoomClosed,
    talkFromRoomReturnsToDesktop,
    roomHandoffAfterConversation,
    overlayVisibleOnDesktop,
    persistedSchemaVersion: persisted.schemaVersion,
    persistedPosition: persisted.position,
    overlayBounds
  };
  writeFileSync(join(outputDirectory, "report.json"), JSON.stringify(report, null, 2));
  console.log(`TINY_MINT_SMOKE ${JSON.stringify(report)}`);
  clearTimeout(watchdog);
  app.quit();
}

app.whenReady().then(() => {
  store = new StateStore(join(app.getPath("userData"), "creature-state.json"));
  const initialState = store.load();
  brain = new CreatureBrain(initialState);
  interactionController = new InteractionController({
    getState: () => brain.snapshot(),
    brain,
    provider: createDialogueProvider(),
    onSession: showSpeechSession,
    reportFailure: (error) => console.warn("Dialogue provider failed; using Tiny Mint's local voice.", error),
    random: Math.random
  });
  registerIpc();
  createOverlay(initialState);
  createTray();
  interactionController.start();
  brain.subscribe(broadcast);
  brain.start();
  screen.on("display-metrics-changed", positionSpeechWindow);
  screen.on("display-added", positionSpeechWindow);
  screen.on("display-removed", positionSpeechWindow);
  globalShortcut.register("CommandOrControl+Shift+M", openRoom);
  if (!process.env.TINY_MINT_SMOKE_OUTPUT && !process.env.TINY_MINT_SMOKE_USER_DATA) {
    applyStartupPreference(brain.snapshot().preferences.startWithWindows);
  }
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
  interactionController?.dispose();
  if (saveTimer) clearTimeout(saveTimer);
  if (movementTimer) clearInterval(movementTimer);
  if (brain && store) store.save(brain.snapshot());
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  screen.removeListener("display-metrics-changed", positionSpeechWindow);
  screen.removeListener("display-added", positionSpeechWindow);
  screen.removeListener("display-removed", positionSpeechWindow);
});
