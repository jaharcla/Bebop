import "./settings.css";
import type { CreaturePreferences, CreatureState, DialogueActionResult, DialogueSettingsStatus } from "../shared/types";

const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-preference]"));
function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Settings control is missing: ${selector}`);
  return element;
}
const status = required<HTMLParagraphElement>("#status");
const dialogueStatus = required<HTMLParagraphElement>("#dialogue-status");
const keyInput = required<HTMLInputElement>("#groq-key");
const keyState = required<HTMLParagraphElement>("#key-state");
const dialogueMessage = required<HTMLParagraphElement>("#dialogue-message");
const saveKey = required<HTMLButtonElement>("#save-key");
const clearKey = required<HTMLButtonElement>("#clear-key");
const testConnection = required<HTMLButtonElement>("#test-connection");
const exportState = required<HTMLButtonElement>("#export-state");
const exportMessage = required<HTMLParagraphElement>("#export-message");
const keyboardAwarenessInput = required<HTMLInputElement>("#keyboard-awareness");
const keyboardAwarenessMessage = required<HTMLParagraphElement>("#keyboard-awareness-message");
const desktopAwarenessInput = required<HTMLInputElement>("#desktop-awareness");
const desktopAwarenessMessage = required<HTMLParagraphElement>("#desktop-awareness-message");
const awarenessInput = required<HTMLInputElement>("#basic-awareness");
const awarenessMessage = required<HTMLParagraphElement>("#awareness-message");

function renderDialogue(value: DialogueSettingsStatus): void {
  dialogueStatus.textContent = value.provider;
  keyState.textContent = value.developmentKeyActive
    ? "Development key active"
    : value.keySaved ? "Key saved" : "No saved key — Local voice is available";
  keyInput.disabled = !value.secureStorageAvailable;
  saveKey.disabled = !value.secureStorageAvailable;
  clearKey.disabled = !value.keySaved;
  testConnection.disabled = value.provider === "Local voice" || value.provider === "Secure storage unavailable — using Local voice";
}

function showDialogueResult(result: DialogueActionResult): void {
  renderDialogue(result);
  dialogueMessage.dataset.error = String(!result.ok);
  dialogueMessage.textContent = result.message;
}

void window.tinyMint.getDialogueStatus().then((value) => {
  if (value) renderDialogue(value);
  else dialogueStatus.textContent = "Unavailable";
}).catch((error: unknown) => {
  dialogueStatus.textContent = "Unavailable";
  dialogueMessage.dataset.error = "true";
  dialogueMessage.textContent = error instanceof Error ? error.message : String(error);
});

window.tinyMint.onDialogueStatus(renderDialogue);

saveKey.addEventListener("click", async () => {
  const result = await window.tinyMint.saveGroqKey(keyInput.value);
  keyInput.value = "";
  showDialogueResult(result);
});

clearKey.addEventListener("click", async () => {
  showDialogueResult(await window.tinyMint.clearGroqKey());
});

testConnection.addEventListener("click", async () => {
  testConnection.disabled = true;
  dialogueMessage.dataset.error = "false";
  dialogueMessage.textContent = "Testing…";
  try {
    showDialogueResult(await window.tinyMint.testGroqConnection());
  } finally {
    testConnection.disabled = false;
  }
});

exportState.addEventListener("click", async () => {
  exportState.disabled = true;
  exportMessage.dataset.error = "false";
  exportMessage.textContent = "Choose where to save the backup…";
  try {
    const saved = await window.tinyMint.exportState();
    exportMessage.textContent = saved ? "Tiny Mint backup exported." : "Export cancelled.";
  } catch (error) {
    exportMessage.dataset.error = "true";
    exportMessage.textContent = `Couldn't export Tiny Mint: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    exportState.disabled = false;
  }
});

function preferenceKey(input: HTMLInputElement): keyof CreaturePreferences {
  const key = input.dataset.preference;
  if (!key || !Object.hasOwn(defaultPreferences, key)) throw new Error(`Unknown preference control: ${key ?? "(missing)"}`);
  return key as keyof CreaturePreferences;
}

const defaultPreferences: CreaturePreferences = {
  alwaysOnTop: true,
  cursorInteraction: true,
  paused: false,
  reducedMotion: false,
  roamingEnabled: true,
  roomVisitsEnabled: true,
  roomAutonomyEnabled: true,
  cursorNudgesEnabled: false,
  spotifyControlEnabled: false,
  vlcControlEnabled: false,
  bongAutonomyEnabled: false,
  interactionsEnabled: true,
  startWithWindows: false,
  quietMode: false
};

function render(state: CreatureState): void {
  for (const input of inputs) input.checked = state.preferences[preferenceKey(input)];
  keyboardAwarenessInput.checked = state.privacy.keyboardAwarenessEnabled;
  desktopAwarenessInput.checked = state.privacy.desktopAwarenessEnabled;
  awarenessInput.checked = state.privacy.awarenessEnabled;
}

for (const input of inputs) {
  input.addEventListener("change", () => {
    status.dataset.error = "false";
    status.textContent = "";
    window.tinyMint.updatePreferences({ [preferenceKey(input)]: input.checked });
  });
}

const controlsStatus = required<HTMLElement>("#controls-status");
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-desktop-action]")) {
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      const result = await window.tinyMint.runDesktopAction(button.dataset.desktopAction!);
      controlsStatus.textContent = result.message;
      controlsStatus.dataset.error = String(!result.ok);
    } catch { controlsStatus.textContent = "Control unavailable."; }
    finally { button.disabled = false; }
  });
}
required<HTMLButtonElement>("#stop-controls").addEventListener("click", async () => {
  await window.tinyMint.stopDesktopControls();
  controlsStatus.textContent = "Controls stopped and permissions turned off.";
});
window.tinyMint.onState(render);
keyboardAwarenessInput.addEventListener("change", async () => {
  keyboardAwarenessInput.disabled = true;
  keyboardAwarenessMessage.dataset.error = "false";
  try {
    const state = await window.tinyMint.setKeyboardAwarenessEnabled(keyboardAwarenessInput.checked);
    if (!state) throw new Error("Keyboard awareness could not be updated.");
    render(state);
    keyboardAwarenessMessage.textContent = state.privacy.keyboardAwarenessEnabled ? "Keyboard awareness is on." : "Keyboard awareness is off.";
  } catch (error) {
    keyboardAwarenessMessage.dataset.error = "true";
    keyboardAwarenessMessage.textContent = error instanceof Error ? error.message : String(error);
    void window.tinyMint.getState().then(render);
  } finally { keyboardAwarenessInput.disabled = false; }
});
desktopAwarenessInput.addEventListener("change", async () => {
  desktopAwarenessInput.disabled = true;
  desktopAwarenessMessage.dataset.error = "false";
  try {
    const state = await window.tinyMint.setDesktopAwarenessEnabled(desktopAwarenessInput.checked);
    if (!state) throw new Error("App awareness could not be updated.");
    render(state);
    desktopAwarenessMessage.textContent = state.privacy.desktopAwarenessEnabled ? "App awareness is on." : "App awareness is off.";
  } catch (error) {
    desktopAwarenessMessage.dataset.error = "true";
    desktopAwarenessMessage.textContent = error instanceof Error ? error.message : String(error);
    void window.tinyMint.getState().then(render);
  } finally { desktopAwarenessInput.disabled = false; }
});
awarenessInput.addEventListener("change", async () => {
  awarenessInput.disabled = true;
  awarenessMessage.dataset.error = "false";
  awarenessMessage.textContent = "";
  try {
    const updated = await window.tinyMint.setAwarenessEnabled(awarenessInput.checked);
    if (!updated) throw new Error("Basic Awareness could not be updated.");
    render(updated);
    awarenessMessage.textContent = updated.privacy.awarenessEnabled
      ? "Basic Awareness is on. Local system idle time stays on this device."
      : "Basic Awareness is off.";
  } catch (error) {
    awarenessMessage.dataset.error = "true";
    awarenessMessage.textContent = error instanceof Error ? error.message : String(error);
    void window.tinyMint.getState().then(render);
  } finally {
    awarenessInput.disabled = false;
  }
});

void window.tinyMint.getState().then(render).catch((error: unknown) => {
  status.dataset.error = "true";
  status.textContent = `Couldn't load settings: ${error instanceof Error ? error.message : String(error)}`;
});
