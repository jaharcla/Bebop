import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, safeStorage, screen, Tray } from "electron";
import type { MenuItem } from "electron";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CreatureBrain } from "../creature/brain/CreatureBrain";
import { loadDevelopmentEnvironment } from "./developmentEnvironment";
import { InteractionController } from "../interaction/InteractionController";
import { isUserPresentFromSystemIdle } from "../interaction/basicAwareness";
import { createDialogueProvider as selectDialogueProvider } from "../interaction/dialogue/createDialogueProvider";
import type { DialogueProvider } from "../interaction/dialogue/DialogueProvider";
import { LocalDialogueProvider } from "../interaction/dialogue/LocalDialogueProvider";
import { positionSpeechWindow as calculateSpeechPosition } from "../interaction/speechPosition";
import { StateStore } from "../persistence/StateStore";
import { SecretStore } from "./SecretStore";
import type {
  Activity,
  CreaturePreferences,
  CreatureState,
  DialogueActionResult,
  DialogueProviderStatus,
  DialogueSettingsStatus,
  InteractionSession,
  Location,
  RoomPropId
} from "../shared/types";

const OVERLAY_SIZE = 192;
const SPEECH_WINDOW_SIZE = { width: 340, height: 306 };
const SPEECH_WINDOW_MIN_SIZE = { width: 340, height: 162 };
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
let dialogueProviderStatus: DialogueProviderStatus = "Local voice";
let secretStore: SecretStore;
let speechWindowSize = { ...SPEECH_WINDOW_MIN_SIZE };
let saveTimer: NodeJS.Timeout | undefined;
let movementTimer: NodeJS.Timeout | undefined;
let cursorTimer: NodeJS.Timeout | undefined;
let awarenessTimer: NodeJS.Timeout | undefined;
let qaPresenceOverride: boolean | null = null;
let displayChangedHandler: (() => void) | undefined;
let suspendHandler: (() => void) | undefined;
let resumeHandler: (() => void) | undefined;
let dragOrigin: { pointerX: number; pointerY: number; windowX: number; windowY: number } | null = null;
let desktopGoal: { x: number; y: number; kind: "wander" | "cursor" | "exit" | "enter" } | null = null;
let cursorPoint: Electron.Point | null = null;
let previousCursorPoint: Electron.Point | null = null;
let lastBroadcastLocation: Location | undefined;

const preloadPath = join(__dirname, "preload.js");
const devUrl = process.env.VITE_DEV_SERVER_URL;
loadDevelopmentEnvironment(devUrl);
const smokeUserData = process.env.TINY_MINT_SMOKE_USER_DATA;
if (smokeUserData) app.setPath("userData", smokeUserData);
app.setName("Tiny Mint");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else {
  app.on("second-instance", () => {
    if (!brain) return;
    brain.setLocation("desktop");
    overlayWindow?.showInactive();
  });
}

function rendererPath(page: "index.html" | "room.html" | "settings.html" | "speech.html"): string {
  return devUrl ? `${devUrl}/${page}` : join(app.getAppPath(), "dist", page);
}

async function loadRenderer(window: BrowserWindow, page: "index.html" | "room.html" | "settings.html" | "speech.html"): Promise<void> {
  if (devUrl) await window.loadURL(rendererPath(page));
  else await window.loadFile(rendererPath(page));
}

function loadRendererInBackground(window: BrowserWindow, page: "index.html" | "room.html" | "settings.html" | "speech.html"): void {
  void loadRenderer(window, page).catch((error: unknown) => {
    console.warn(`Could not load the ${page} window.`, error);
  });
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
  brain.setPosition(position.x, position.y, { notify: false, preserveFacing: true });
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
  loadRendererInBackground(overlayWindow, "index.html");
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
  speechWindow.setBounds({ ...position, ...speechWindowSize }, false);
  const tailPlacement = position.y >= creature.y + creature.height ? "top" : "bottom";
  speechWindow.webContents.send("interaction:placement", tailPlacement);
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
    speechWindowSize = { ...SPEECH_WINDOW_MIN_SIZE };
    const position = calculateSpeechPosition(
      overlayWindow?.getBounds() ?? { x: 80, y: 80, width: OVERLAY_SIZE, height: OVERLAY_SIZE },
      SPEECH_WINDOW_SIZE,
      screen.getDisplayNearestPoint(overlayWindow?.getBounds() ?? { x: 80, y: 80 }).workArea
    );
    speechWindowReady = false;
    speechWindow = new BrowserWindow({
      ...speechWindowSize,
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
    loadRendererInBackground(speechWindow, "speech.html");
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

function developmentApiKey(): string | undefined {
  return app.isPackaged ? undefined : process.env.GROQ_API_KEY?.trim() || undefined;
}

function configuredApiKey(): string | undefined {
  return developmentApiKey() ?? secretStore?.readKey();
}

function dialogueSettingsStatus(): DialogueSettingsStatus {
  return {
    provider: dialogueProviderStatus,
    keySaved: secretStore?.hasKey() ?? false,
    secureStorageAvailable: secretStore?.isAvailable() ?? false,
    developmentKeyActive: Boolean(developmentApiKey())
  };
}

function broadcastDialogueStatus(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send("dialogue:status-changed", dialogueSettingsStatus());
  }
}

function createDialogueProvider(): DialogueProvider {
  if (process.env.TINY_MINT_SMOKE_OUTPUT) {
    dialogueProviderStatus = "Local voice";
    return new LocalDialogueProvider();
  }
  const key = configuredApiKey();
  if (!key && app.isPackaged && !secretStore.isAvailable()) {
    dialogueProviderStatus = "Secure storage unavailable — using Local voice";
    return new LocalDialogueProvider();
  }
  const configured = selectDialogueProvider(key, process.env.GROQ_MODEL, {
    reportFailure: (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`Groq dialogue unavailable; using local replies (${detail}).`);
      dialogueProviderStatus = "Groq unavailable — using Local voice";
      broadcastDialogueStatus();
    }
  });
  dialogueProviderStatus = configured.status;
  return configured.provider;
}

function refreshDialogueProvider(): void {
  interactionController.setProvider(createDialogueProvider());
  broadcastDialogueStatus();
}

async function testGroqConnection(): Promise<DialogueActionResult> {
  const key = configuredApiKey();
  if (!key) return { ...dialogueSettingsStatus(), ok: false, message: "Add a Groq API key first." };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal
    });
    if (response.ok) {
      interactionController.setProvider(createDialogueProvider());
      dialogueProviderStatus = "Groq connected";
      broadcastDialogueStatus();
      return { ...dialogueSettingsStatus(), ok: true, message: "Groq connected" };
    }
    interactionController.setProvider(new LocalDialogueProvider());
    dialogueProviderStatus = "Groq unavailable — using Local voice";
    broadcastDialogueStatus();
    return {
      ...dialogueSettingsStatus(),
      ok: false,
      message: response.status === 401 || response.status === 403
        ? "Couldn't authenticate"
        : "Groq unavailable — Local voice will still work"
    };
  } catch {
    interactionController.setProvider(new LocalDialogueProvider());
    dialogueProviderStatus = "Groq unavailable — using Local voice";
    broadcastDialogueStatus();
    return { ...dialogueSettingsStatus(), ok: false, message: "Groq unavailable — Local voice will still work" };
  } finally {
    clearTimeout(timeout);
  }
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
  loadRendererInBackground(roomWindow, "room.html");
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
    height: 790,
    minWidth: 400,
    minHeight: 700,
    resizable: false,
    title: "Tiny Mint Settings",
    backgroundColor: "#edf2e9",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.on("closed", () => { settingsWindow = null; });
  loadRendererInBackground(settingsWindow, "settings.html");
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
  const previousLocation = lastBroadcastLocation;
  lastBroadcastLocation = state.location;
  if (previousLocation === "room" && state.location === "desktop" && overlayWindow && !overlayWindow.isDestroyed()) {
    const workArea = screen.getDisplayNearestPoint(state.position).workArea;
    const leftX = workArea.x + 6;
    const rightX = rightEdge(workArea) - 6;
    const enterFromLeft = Math.abs(state.position.x - leftX) <= Math.abs(state.position.x - rightX);
    const entry = { x: enterFromLeft ? leftX : rightX, y: Math.max(workArea.y, Math.min(state.position.y, workArea.y + workArea.height - OVERLAY_SIZE)) };
    overlayWindow.setPosition(entry.x, entry.y);
    brain.setPosition(entry.x, entry.y, { notify: false });
    brain.setFacing(enterFromLeft ? "right" : "left");
    desktopGoal = { x: Math.max(workArea.x, Math.min(rightEdge(workArea), entry.x + (enterFromLeft ? 180 : -180))), y: entry.y, kind: "enter" };
    brain.setActivity("wander");
    return;
  }
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

function reclampCreature(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const [x, y] = overlayWindow.getPosition();
  const position = clampPosition(x, y);
  if (position.x !== x || position.y !== y) {
    overlayWindow.setPosition(position.x, position.y);
    brain.setPosition(position.x, position.y, { notify: false, preserveFacing: true });
  }
  desktopGoal = null;
  positionSpeechWindow();
  updateMovement(brain.snapshot());
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    store.save(brain.snapshot());
    saveTimer = undefined;
  }, 2_500);
}

function updateMovement(state: CreatureState): void {
  const movingActivity = state.currentActivity === "wander" || state.currentActivity === "observe" || state.currentActivity === "visitRoom";
  const shouldMove = state.location === "desktop" && movingActivity && state.preferences.roamingEnabled && !state.preferences.paused && !dragOrigin;
  if (!shouldMove && movementTimer) {
    clearInterval(movementTimer);
    movementTimer = undefined;
    desktopGoal = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      const [x, y] = overlayWindow.getPosition();
      brain.setPosition(x, y, { notify: false });
    }
  }
  if (shouldMove && !movementTimer) {
    desktopGoal ??= chooseDesktopGoal(state);
    movementTimer = setInterval(() => {
      if (!overlayWindow || overlayWindow.isDestroyed()) return;
      const [x, y] = overlayWindow.getPosition();
      const current = brain.snapshot();
      const staleCursorGoal = current.currentActivity === "observe" && desktopGoal?.kind === "cursor"
        && (!current.preferences.cursorInteraction || !cursorPoint);
      if (!desktopGoal || (current.currentActivity === "observe" && desktopGoal.kind !== "cursor")
        || staleCursorGoal
        || (current.currentActivity === "visitRoom" && desktopGoal.kind !== "exit")) {
        desktopGoal = chooseDesktopGoal(current);
      }
      const dx = desktopGoal.x - x;
      const dy = desktopGoal.y - y;
      const distance = Math.hypot(dx, dy);
      if (distance < 5) {
        const completed = desktopGoal.kind;
        desktopGoal = null;
        if (completed === "exit") brain.setLocation("room");
        else brain.setActivity("idle");
        return;
      }
      const proposed = clampPosition(x + dx / distance * 3, y + dy / distance * 3);
      overlayWindow.setPosition(proposed.x, proposed.y);
      brain.setPosition(proposed.x, proposed.y, { notify: false });
      positionSpeechWindow();
    }, 80);
  }
}

function sampleSystemAwareness(): void {
  if (!brain || !interactionController || !brain.snapshot().privacy.awarenessEnabled) return;
  if (qaPresenceOverride !== null) {
    interactionController.setUserPresent(qaPresenceOverride);
    return;
  }
  try {
    interactionController.setUserPresent(isUserPresentFromSystemIdle(powerMonitor.getSystemIdleTime()));
  } catch (error) {
    console.warn("Could not read local system idle time for Basic Awareness.", error);
  }
}

function refreshSystemAwareness(): void {
  if (!brain || !interactionController) return;
  if (!brain.snapshot().privacy.awarenessEnabled) {
    if (awarenessTimer) clearInterval(awarenessTimer);
    awarenessTimer = undefined;
    qaPresenceOverride = null;
    interactionController.setUserPresent(true);
    return;
  }
  sampleSystemAwareness();
  if (!awarenessTimer) awarenessTimer = setInterval(sampleSystemAwareness, 15_000);
}

function chooseDesktopGoal(state: CreatureState): { x: number; y: number; kind: "wander" | "cursor" | "exit" | "enter" } {
  const bounds = screen.getDisplayNearestPoint(state.position).workArea;
  if (state.currentActivity === "visitRoom") {
    const leftDistance = Math.abs(state.position.x - bounds.x);
    const rightX = bounds.x + bounds.width - OVERLAY_SIZE;
    return { x: leftDistance < Math.abs(rightX - state.position.x) ? bounds.x : rightX, y: state.position.y, kind: "exit" };
  }
  if (state.currentActivity === "observe" && state.preferences.cursorInteraction && cursorPoint) {
    const preferredDistance = 150 - state.personality.confidence * 55;
    const direction = cursorPoint.x < state.position.x ? 1 : -1;
    return {
      x: Math.max(bounds.x, Math.min(rightEdge(bounds), cursorPoint.x + direction * preferredDistance - OVERLAY_SIZE / 2)),
      y: Math.max(bounds.y, Math.min(bounds.y + bounds.height - OVERLAY_SIZE, cursorPoint.y - OVERLAY_SIZE / 2)),
      kind: "cursor"
    };
  }
  return {
    x: bounds.x + Math.random() * Math.max(1, bounds.width - OVERLAY_SIZE),
    y: bounds.y + Math.random() * Math.max(1, bounds.height - OVERLAY_SIZE),
    kind: "wander"
  };
}

const rightEdge = (bounds: Electron.Rectangle): number => bounds.x + bounds.width - OVERLAY_SIZE;

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

function confirmReset(sender: Electron.WebContents): void {
  const parent = [roomWindow, settingsWindow, overlayWindow].find((window) => window?.webContents === sender);
  if (!parent || parent.isDestroyed()) return;
  void dialog.showMessageBox(parent, {
    type: "warning",
    title: "Reset Tiny Mint?",
    message: "Start over with a fresh Tiny Mint?",
    detail: "This clears his creature state, habits, and corkboard sketches. It does not clear his saved Groq key.",
    buttons: ["Reset Tiny Mint", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  }).then(({ response }) => {
    if (response === 0) brain.reset();
  }).catch((error: unknown) => console.warn("Could not confirm Tiny Mint reset.", error));
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
  "startWithWindows",
  "quietMode"
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
  ipcMain.handle("state:export", async (event) => {
    if (settingsWindow?.webContents !== event.sender) return false;
    const result = await dialog.showSaveDialog(settingsWindow, {
      title: "Export Tiny Mint",
      defaultPath: "tiny-mint-backup.json",
      filters: [{ name: "JSON backup", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return false;
    try {
      writeFileSync(result.filePath, store.exportJson(brain.snapshot()), "utf8");
    } catch (error) {
      console.warn("Could not export Tiny Mint's state.", error);
      throw error;
    }
    return true;
  });
  ipcMain.handle("privacy:awareness", (event, enabled: unknown) => {
    if (settingsWindow?.webContents !== event.sender || typeof enabled !== "boolean") return null;
    brain.setAwarenessEnabled(enabled);
    refreshSystemAwareness();
    return brain.snapshot();
  });
  ipcMain.handle("qa:autonomous-check-in", async (event) => {
    if (!devUrl || roomWindow?.webContents !== event.sender) return false;
    return interactionController.startAutonomousCheckInForQA();
  });
  ipcMain.handle("qa:user-presence", (event, present: unknown) => {
    if (!devUrl || roomWindow?.webContents !== event.sender
      || (present !== null && typeof present !== "boolean")) return null;
    if (!brain.snapshot().privacy.awarenessEnabled) return null;
    qaPresenceOverride = present;
    sampleSystemAwareness();
    return interactionController.isUserPresent();
  });
  ipcMain.handle("interaction:get", (event) => isSpeechWindow(event.sender) ? interactionController.getSession() : null);
  ipcMain.handle("dialogue:status", (event) => isApplicationWindow(event.sender) ? dialogueSettingsStatus() : null);
  ipcMain.handle("dialogue:save-key", (event, value: unknown): DialogueActionResult => {
    if (settingsWindow?.webContents !== event.sender || typeof value !== "string" || value.length > 512) {
      return { ...dialogueSettingsStatus(), ok: false, message: "Could not save that key." };
    }
    try {
      secretStore.saveKey(value);
      refreshDialogueProvider();
      return { ...dialogueSettingsStatus(), ok: true, message: "Key saved securely" };
    } catch (error) {
      return {
        ...dialogueSettingsStatus(),
        ok: false,
        message: error instanceof Error ? error.message : "Could not save that key."
      };
    }
  });
  ipcMain.handle("dialogue:clear-key", (event): DialogueActionResult => {
    if (settingsWindow?.webContents !== event.sender) {
      return { ...dialogueSettingsStatus(), ok: false, message: "Could not clear the key." };
    }
    try {
      secretStore.clearKey();
      refreshDialogueProvider();
      return {
        ...dialogueSettingsStatus(),
        ok: true,
        message: developmentApiKey() ? "Saved key cleared; development key is still active" : "Saved key cleared"
      };
    } catch {
      return { ...dialogueSettingsStatus(), ok: false, message: "Could not clear the key." };
    }
  });
  ipcMain.handle("dialogue:test", (event) => settingsWindow?.webContents === event.sender
    ? testGroqConnection()
    : Promise.resolve({ ...dialogueSettingsStatus(), ok: false, message: "Unavailable" }));
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
  ipcMain.on("state:facing", (event, facing: unknown) => {
    if (!isApplicationWindow(event.sender)) return;
    if (facing === "left" || facing === "right") brain.setFacing(facing);
    else console.warn("Ignored invalid facing update from renderer.", facing);
  });
  ipcMain.on("room:use-prop", (event, prop: unknown) => {
    if (!isApplicationWindow(event.sender)) return;
    const props: readonly RoomPropId[] = ["door", "corkboard", "bookshelf", "plant", "bed", "chair", "desk", "music-player", "toy-box", "rug", "cushion", "ball", "dumbbell", "sketchbook", "book", "watering-can", "bong"];
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
    void interactionController.reply(reply).catch((error: unknown) => {
      console.warn("Could not send a quick Tiny Mint reply.", error);
    });
  });
  ipcMain.on("interaction:custom-reply", (event, reply: unknown) => {
    const session = interactionController.getSession();
    if (!isSpeechWindow(event.sender) || typeof reply !== "string" || reply.length > 500 || !reply.trim()
      || !session || session.waitingForResponse) {
      console.warn("Ignored invalid custom reply from renderer.");
      return;
    }
    void interactionController.reply(reply).catch((error: unknown) => {
      console.warn("Could not send a Tiny Mint reply.", error);
    });
  });
  ipcMain.on("interaction:dismiss", (event) => {
    if (isSpeechWindow(event.sender)) interactionController.dismiss();
  });
  ipcMain.on("interaction:resize", (event, height: unknown) => {
    if (!isSpeechWindow(event.sender)) return;
    if (typeof height !== "number" || !Number.isFinite(height)) {
      console.warn("Ignored invalid speech window size request.", height);
      return;
    }
    const boundedHeight = Math.max(SPEECH_WINDOW_MIN_SIZE.height, Math.min(SPEECH_WINDOW_SIZE.height, Math.round(height)));
    if (boundedHeight === speechWindowSize.height) return;
    speechWindowSize = { ...SPEECH_WINDOW_SIZE, height: boundedHeight };
    speechWindow?.setSize(speechWindowSize.width, speechWindowSize.height, false);
    positionSpeechWindow();
  });
  ipcMain.on("interaction:engage", (event) => {
    if (isSpeechWindow(event.sender)) interactionController.engage();
  });
  ipcMain.on("state:reset", (event) => { if (isApplicationWindow(event.sender)) confirmReset(event.sender); });
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
    console.error(`TINY_MINT_SMOKE_FAILED Timed out after 180 seconds (location=${brain.snapshot().location}, activity=${brain.snapshot().currentActivity}, roomWindow=${Boolean(roomWindow)}, roomUrl=${roomWindow?.webContents.getURL() ?? "none"}).`);
    app.exit(1);
  }, 180_000);
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
  if (settingsControlCount !== 10) throw new Error(`Expected 10 settings controls; found ${settingsControlCount}.`);
  const awarenessEnabledState = await settings.webContents.executeJavaScript("window.tinyMint.setAwarenessEnabled(true)") as CreatureState | null;
  const awarenessDisabledState = await settings.webContents.executeJavaScript("window.tinyMint.setAwarenessEnabled(false)") as CreatureState | null;
  const basicAwarenessRoundTrip = awarenessEnabledState?.privacy.awarenessEnabled === true
    && awarenessDisabledState?.privacy.awarenessEnabled === false;
  if (!basicAwarenessRoundTrip) throw new Error("Basic Awareness did not round-trip through the Settings IPC.");
  const providerDeadline = Date.now() + 2_000;
  let dialogueProvider = "";
  while (dialogueProvider !== "Local voice" && Date.now() < providerDeadline) {
    dialogueProvider = await settings.webContents.executeJavaScript(
      "document.querySelector('#dialogue-status')?.textContent ?? ''"
    ) as string;
    if (dialogueProvider !== "Local voice") await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (dialogueProvider !== "Local voice") throw new Error(`Expected local dialogue in smoke mode; found ${dialogueProvider}.`);
  const smokeSecret = "tiny-mint-smoke-secret";
  const saveSecretResult = await settings.webContents.executeJavaScript(
    `window.tinyMint.saveGroqKey(${JSON.stringify(smokeSecret)})`
  ) as DialogueActionResult;
  if (!saveSecretResult.ok || !saveSecretResult.keySaved || JSON.stringify(saveSecretResult).includes(smokeSecret)) {
    throw new Error("Secure Groq key save returned an invalid or secret-bearing renderer result.");
  }
  const encryptedSecret = readFileSync(join(app.getPath("userData"), "groq-key.bin"));
  if (encryptedSecret.includes(Buffer.from(smokeSecret)) || secretStore.readKey() !== smokeSecret) {
    throw new Error("Secure Groq key storage did not encrypt and recover the test value.");
  }
  const clearSecretResult = await settings.webContents.executeJavaScript(
    "window.tinyMint.clearGroqKey()"
  ) as DialogueActionResult;
  if (!clearSecretResult.ok || clearSecretResult.keySaved || secretStore.hasKey()) {
    throw new Error("Secure Groq key clear did not remove the test value.");
  }
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
  await setCheckbox("quietMode", true);
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
  const manualTalkDuringQuietMode = brain.snapshot().preferences.quietMode
    && session.origin === "user"
    && !session.waitingForResponse;
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
  const speechContentBounds = speech.getContentBounds();
  if (speechContentBounds.width < SPEECH_WINDOW_MIN_SIZE.width || speechContentBounds.height < SPEECH_WINDOW_MIN_SIZE.height
    || speechContentBounds.width > SPEECH_WINDOW_SIZE.width + 16 || speechContentBounds.height > SPEECH_WINDOW_SIZE.height + 16) {
    throw new Error(`Speech window content has unexpected dimensions (window=${JSON.stringify(speechBounds)}, content=${JSON.stringify(speechContentBounds)}).`);
  }

  const originalOverlayBounds = overlayWindow.getBounds();
  const edgeDisplay = screen.getDisplayNearestPoint({
    x: originalOverlayBounds.x + originalOverlayBounds.width / 2,
    y: originalOverlayBounds.y + originalOverlayBounds.height / 2
  });
  const edgeArea = edgeDisplay.workArea;
  const edgePositions = [
    { x: edgeArea.x + Math.round((edgeArea.width - OVERLAY_SIZE) / 2), y: edgeArea.y },
    { x: edgeArea.x + Math.round((edgeArea.width - OVERLAY_SIZE) / 2), y: edgeArea.y + edgeArea.height - OVERLAY_SIZE },
    { x: edgeArea.x, y: edgeArea.y + Math.round((edgeArea.height - OVERLAY_SIZE) / 2) },
    { x: edgeArea.x + edgeArea.width - OVERLAY_SIZE, y: edgeArea.y + Math.round((edgeArea.height - OVERLAY_SIZE) / 2) }
  ];
  let speechEdgeBoundsValid = true;
  let speechTailAdapts = true;
  const speechTailChecks: Array<{ position: { x: number; y: number }; bounds: Electron.Rectangle; expectedTop: boolean; actualTop: boolean }> = [];
  const speechEdgeChecks: Array<{ bounds: Electron.Rectangle; inside: boolean }> = [];
  for (let index = 0; index < edgePositions.length; index += 1) {
    const position = edgePositions[index];
    overlayWindow.setPosition(position.x, position.y);
    brain.setPosition(position.x, position.y, { notify: false });
    positionSpeechWindow();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const bounds = speech.getBounds();
    const inside = bounds.x >= edgeArea.x && bounds.y >= edgeArea.y
      && bounds.x + bounds.width <= edgeArea.x + edgeArea.width
      && bounds.y + bounds.height <= edgeArea.y + edgeArea.height;
    speechEdgeChecks.push({ bounds, inside });
    speechEdgeBoundsValid &&= inside;
    const tailAtTop = await speech.webContents.executeJavaScript(
      "document.querySelector('#bubble')?.classList.contains('tail-top')"
    ) as boolean;
    const expectedTop = bounds.y >= position.y + OVERLAY_SIZE;
    speechTailChecks.push({ position, bounds, expectedTop, actualTop: tailAtTop });
    speechTailAdapts &&= tailAtTop === expectedTop;
  }
  overlayWindow.setPosition(originalOverlayBounds.x, originalOverlayBounds.y);
  brain.setPosition(originalOverlayBounds.x, originalOverlayBounds.y, { notify: false });
  positionSpeechWindow();
  if (!speechEdgeBoundsValid) throw new Error(`Speech window escaped the display work area when Tiny Mint was at a screen edge: ${JSON.stringify({ edgeArea, speechEdgeChecks })}.`);
  if (!speechTailAdapts) throw new Error(`Speech tail did not track whether the bubble was above or below Tiny Mint: ${JSON.stringify(speechTailChecks)}.`);
  await new Promise((resolve) => setTimeout(resolve, 60));
  await speech.webContents.executeJavaScript(`
    (() => {
      const user = document.querySelector('#you');
      const line = document.querySelector('#utterance');
      const replies = document.querySelector('#quick-replies');
      window.__tinyMintSmokeSpeechOriginal = {
        userText: user.textContent,
        userHidden: user.hidden,
        userTitle: user.title,
        lineText: line.textContent,
        replies: Array.from(replies.children, (button) => button.textContent)
      };
      user.hidden = false;
      user.textContent = 'you: ' + 'typed reply '.repeat(8) + '…';
      user.title = 'typed reply '.repeat(40);
      line.textContent = 'wait '.repeat(32);
      Array.from(replies.children).forEach((button) => { button.textContent = 'x'.repeat(40); });
      window.dispatchEvent(new Event('resize'));
    })()
  `);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const longContentWindowHeight = speech.getBounds().height;
  const speechContentLayout = await speech.webContents.executeJavaScript(`
    (() => {
      const user = document.querySelector('#you');
      const line = document.querySelector('#utterance');
      const replies = document.querySelector('#quick-replies');
      const layout = {
        user: { scrollHeight: user.scrollHeight, clientHeight: user.clientHeight, width: user.clientWidth },
        userTitleLength: user.title.length,
        line: { scrollHeight: line.scrollHeight, clientHeight: line.clientHeight, width: line.clientWidth },
        replies: { scrollHeight: replies.scrollHeight, clientHeight: replies.clientHeight, width: replies.clientWidth },
        viewport: {
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth
        }
      };
      const original = window.__tinyMintSmokeSpeechOriginal;
      user.textContent = original.userText;
      user.hidden = original.userHidden;
      user.title = original.userTitle;
      line.textContent = original.lineText;
      Array.from(replies.children).forEach((button, index) => { button.textContent = original.replies[index] ?? ""; });
      delete window.__tinyMintSmokeSpeechOriginal;
      window.dispatchEvent(new Event('resize'));
      return layout;
    })()
  `) as { user: { scrollHeight: number; clientHeight: number; width: number }; userTitleLength: number; line: { scrollHeight: number; clientHeight: number; width: number }; replies: { scrollHeight: number; clientHeight: number; width: number }; viewport: { scrollHeight: number; clientHeight: number; scrollWidth: number; clientWidth: number } };
  const speechContentFits = speechContentLayout.user.scrollHeight <= speechContentLayout.user.clientHeight + 1
    && speechContentLayout.userTitleLength >= 400
    && speechContentLayout.line.scrollHeight <= speechContentLayout.line.clientHeight + 1
    && speechContentLayout.replies.scrollHeight <= speechContentLayout.replies.clientHeight + 1
    && speechContentLayout.viewport.scrollHeight <= speechContentLayout.viewport.clientHeight
    && speechContentLayout.viewport.scrollWidth <= speechContentLayout.viewport.clientWidth;
  if (!speechContentFits) throw new Error(`Maximum-length speech content overflows or clips inside the speech window: ${JSON.stringify(speechContentLayout)}.`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const compactContentWindowHeight = speech.getBounds().height;
  const speechResizesForContent = longContentWindowHeight > compactContentWindowHeight
    && longContentWindowHeight <= SPEECH_WINDOW_SIZE.height + 16
    && compactContentWindowHeight <= SPEECH_WINDOW_MIN_SIZE.height + 16;
  if (!speechResizesForContent) {
    throw new Error(`Speech window did not resize to its content (long=${longContentWindowHeight}, compact=${compactContentWindowHeight}).`);
  }
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
  const speechPreloadLockedDown = bridgeMethods === "dismissInteraction,engageInteraction,getInteraction,onInteraction,onPlacement,resizeSpeechWindow,sendCustomReply,sendQuickReply"
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
  await setCheckbox("quietMode", false);
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
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const stoppedPosition = overlayWindow.getPosition();
  if (brain.snapshot().preferences.roamingEnabled || stoppedPosition[0] !== startPosition[0] || stoppedPosition[1] !== startPosition[1]) {
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
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  const roamingPosition = overlayWindow.getPosition();
  if (roamingPosition[0] === dragEndPosition[0] && roamingPosition[1] === dragEndPosition[1]) {
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
      const props = Array.from(document.querySelectorAll('#props .room-prop'));
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
      const loadedProps = props.filter((button) => {
        const image = button.querySelector('img');
        const bonusArt = button.querySelector('.bong-art');
        return Boolean((image && image.complete && image.naturalWidth > 0)
          || (bonusArt && getComputedStyle(bonusArt).backgroundImage !== 'none'));
      }).length;
      return { creatureVisible: !creature.hidden && spritePixels, loadedProps, totalProps: props.length };
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
  if (!roomRender.creatureVisible || roomRender.loadedProps !== 17 || roomRender.totalProps !== 17) {
    throw new Error(`Room v3 rendering failed: ${JSON.stringify(roomRender)}`);
  }
  await room.webContents.executeJavaScript(`document.querySelector('[data-prop="desk"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const manualRoomWalksFirst = brain.snapshot().currentActivity === "wander" && brain.snapshot().room.target === "desk";
  const manualRoomDeadline = Date.now() + 7_000;
  while (brain.snapshot().currentActivity !== "draw" && Date.now() < manualRoomDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!manualRoomWalksFirst || brain.snapshot().currentActivity !== "draw" || brain.snapshot().room.target !== "desk") {
    throw new Error("Manual room prop interaction failed with room autonomy disabled.");
  }
  await setCheckbox("paused", false);
  const sketchDeadline = Date.now() + 60_000;
  while (brain.snapshot().corkboardSketches.length === 0 && Date.now() < sketchDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const corkboardSketchesRendered = await room.webContents.executeJavaScript(
    "document.querySelectorAll('#corkboard-sketches .sketch-card').length"
  ) as number;
  if (brain.snapshot().corkboardSketches.length === 0 || corkboardSketchesRendered !== brain.snapshot().corkboardSketches.length) {
    throw new Error(`Completed art routine did not persist and render a corkboard sketch (count=${brain.snapshot().corkboardSketches.length}, activity=${brain.snapshot().currentActivity}, animation=${brain.snapshot().currentAnimation}, target=${brain.snapshot().room.target}, position=${JSON.stringify(brain.snapshot().room.position)}, intention=${brain.snapshot().room.intention}).`);
  }
  await room.webContents.executeJavaScript(`document.querySelector('[data-prop="watering-can"]').click()`);
  const waterDeadline = Date.now() + 10_000;
  while (!(brain.snapshot().room.target === "plant" && brain.snapshot().currentAnimation === "reach-right")
    && Date.now() < waterDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const wateringOrientedTowardPlant = brain.snapshot().room.target === "plant"
    && brain.snapshot().currentActivity === "inspect"
    && brain.snapshot().currentAnimation === "reach-right"
    && brain.snapshot().facing === "right"
    && brain.snapshot().room.carriedItem === "watering-can";
  if (!wateringOrientedTowardPlant) throw new Error("Watering routine did not carry the can to the plant and reach toward it.");
  const wateringCompleteDeadline = Date.now() + 5_000;
  while (brain.snapshot().room.carriedItem && Date.now() < wateringCompleteDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (brain.snapshot().room.carriedItem !== null) throw new Error("Watering routine did not return the can.");
  await room.webContents.executeJavaScript(`document.querySelector('[data-prop="toy-box"]').click()`);
  const playDeadline = Date.now() + 10_000;
  while (!(brain.snapshot().currentActivity === "play" && brain.snapshot().room.carriedItem === "ball")
    && Date.now() < playDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const connectedPlayRoutine = brain.snapshot().currentActivity === "play"
    && brain.snapshot().room.carriedItem === "ball"
    && brain.snapshot().facing === "left";
  if (!connectedPlayRoutine) throw new Error("Play routine did not carry the ball toward the rug and play while facing it.");
  const playCompleteDeadline = Date.now() + 10_000;
  while (brain.snapshot().room.carriedItem && Date.now() < playCompleteDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (brain.snapshot().room.carriedItem !== null) throw new Error("Play routine did not return the ball.");
  await room.webContents.executeJavaScript(`document.querySelector('[data-prop="bookshelf"]').click()`);
  const bookReachDeadline = Date.now() + 8_000;
  let shelfReachCorrect = false;
  while (Date.now() < bookReachDeadline) {
    const snapshot = brain.snapshot();
    if (snapshot.room.target === "bookshelf" && snapshot.facing === "right"
      && snapshot.currentAnimation === "reach-right") {
      shelfReachCorrect = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!shelfReachCorrect) throw new Error("Book routine did not face and reach toward the bookshelf.");
  const carryDeadline = Date.now() + 7_000;
  while (brain.snapshot().room.carriedItem !== "book" && Date.now() < carryDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const carriedBookRender = await room.webContents.executeJavaScript(`
    (() => {
      const carried = document.querySelector('#carried-item');
      const home = document.querySelector('[data-prop="book"]');
      const creature = document.querySelector('#room-creature');
      return {
        carriedVisible: Boolean(carried && !carried.hidden && carried.complete && carried.naturalWidth > 0),
        homeHidden: home?.dataset.carried === 'true' && getComputedStyle(home).visibility === 'hidden',
        facingMatchesState: creature?.classList.contains('facing-left') === ${brain.snapshot().facing === "left"},
        itemSharesFacingWrapper: carried?.parentElement?.id === 'facing-wrapper'
      };
    })()
  `) as { carriedVisible: boolean; homeHidden: boolean; facingMatchesState: boolean; itemSharesFacingWrapper: boolean };
  if (brain.snapshot().room.carriedItem !== "book" || brain.snapshot().currentAnimation !== "carry"
    || !carriedBookRender.carriedVisible || !carriedBookRender.homeHidden
    || !carriedBookRender.facingMatchesState || !carriedBookRender.itemSharesFacingWrapper) {
    throw new Error(`Carried book did not render consistently: ${JSON.stringify(carriedBookRender)}.`);
  }
  await room.webContents.executeJavaScript(`document.querySelector('[data-prop="bed"]').click()`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const interruptedBookRender = await room.webContents.executeJavaScript(`
    (() => {
      const carried = document.querySelector('#carried-item');
      const home = document.querySelector('[data-prop="book"]');
      return { carriedHidden: carried?.hidden === true, homeVisible: getComputedStyle(home).visibility !== 'hidden' };
    })()
  `) as { carriedHidden: boolean; homeVisible: boolean };
  const manualRoomCarryRestoresOnInterrupt = brain.snapshot().room.carriedItem === null
    && brain.snapshot().room.target === "bed"
    && interruptedBookRender.carriedHidden
    && interruptedBookRender.homeVisible;
  if (!manualRoomCarryRestoresOnInterrupt) throw new Error("Interrupting a carried-book plan did not restore the room item.");
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
  await setCheckbox("quietMode", false);
  await setCheckbox("interactionsEnabled", true);
  const autonomousSpeechStarted = await interactionController.startAutonomousCheckInForQA();
  const autonomousSpeechDeadline = Date.now() + 5_000;
  while ((!speechWindow?.isVisible() || interactionController.getSession()?.waitingForResponse) && Date.now() < autonomousSpeechDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const autonomousSpeechVisible = autonomousSpeechStarted
    && interactionController.getSession()?.origin === "creature"
    && interactionController.getSession()?.waitingForResponse === false
    && speechWindow?.isVisible() === true;
  if (!autonomousSpeechVisible) throw new Error("The QA autonomous check-in did not produce a visible creature-origin speech bubble.");
  interactionController.dismiss();
  await setCheckbox("interactionsEnabled", false);
  await setCheckbox("quietMode", true);
  store.save(brain.snapshot());
  const persisted = store.load();
  if (persisted.schemaVersion !== 4 || persisted.location !== "desktop") {
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
    basicAwarenessRoundTrip,
    autonomousSpeechVisible,
    dialogueProvider,
    secureKeyEncrypted: true,
    secureKeyRendererRedacted: true,
    secureKeyClear: true,
    manualTalkDuringQuietMode,
    speechWindowOnScreen,
    speechEdgeBoundsValid,
    speechTailAdapts,
    speechContentFits,
    speechResizesForContent,
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
    manualRoomWalksFirst,
    corkboardSketchesRendered,
    wateringOrientedTowardPlant,
    connectedPlayRoutine,
    shelfReachCorrect,
    carriedBookRender,
    manualRoomCarryRestoresOnInterrupt,
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
  if (!hasSingleInstanceLock) return;
  app.setAppUserModelId("com.tinymint.desktop");
  store = new StateStore(join(app.getPath("userData"), "creature-state.json"), process.env.VITE_DEV_SERVER_URL
    ? (message) => console.warn(message)
    : undefined);
  secretStore = new SecretStore(join(app.getPath("userData"), "groq-key.bin"), safeStorage);
  const initialState = store.load();
  brain = new CreatureBrain(initialState, process.env.TINY_MINT_SMOKE_OUTPUT ? () => 0 : Math.random);
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
  refreshSystemAwareness();
  const updateCursor = () => {
    const state = brain.snapshot();
    previousCursorPoint = cursorPoint;
    cursorPoint = state.preferences.cursorInteraction && state.location === "desktop" ? screen.getCursorScreenPoint() : null;
    if (cursorPoint && previousCursorPoint && state.currentActivity === "observe"
      && Math.hypot(cursorPoint.x - previousCursorPoint.x, cursorPoint.y - previousCursorPoint.y) >= 48) {
      desktopGoal = null;
    }
  };
  cursorTimer = setInterval(updateCursor, 600);
  displayChangedHandler = () => { reclampCreature(); positionSpeechWindow(); };
  suspendHandler = () => {
    brain.suspend();
    if (movementTimer) clearInterval(movementTimer);
    movementTimer = undefined;
    if (cursorTimer) clearInterval(cursorTimer);
    if (awarenessTimer) clearInterval(awarenessTimer);
    cursorTimer = undefined;
    awarenessTimer = undefined;
  };
  resumeHandler = () => {
    brain.resume();
    reclampCreature();
    updateCursor();
    cursorTimer = setInterval(updateCursor, 600);
    refreshSystemAwareness();
    updateMovement(brain.snapshot());
  };
  screen.on("display-metrics-changed", displayChangedHandler);
  screen.on("display-added", displayChangedHandler);
  screen.on("display-removed", displayChangedHandler);
  powerMonitor.on("suspend", suspendHandler);
  powerMonitor.on("resume", resumeHandler);
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
  if (cursorTimer) clearInterval(cursorTimer);
  if (brain && store) store.save(brain.snapshot());
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (displayChangedHandler) {
    screen.removeListener("display-metrics-changed", displayChangedHandler);
    screen.removeListener("display-added", displayChangedHandler);
    screen.removeListener("display-removed", displayChangedHandler);
  }
  if (suspendHandler) powerMonitor.removeListener("suspend", suspendHandler);
  if (resumeHandler) powerMonitor.removeListener("resume", resumeHandler);
});
