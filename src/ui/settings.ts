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
  interactionsEnabled: true,
  startWithWindows: false,
  quietMode: false
};

function render(state: CreatureState): void {
  for (const input of inputs) input.checked = state.preferences[preferenceKey(input)];
}

for (const input of inputs) {
  input.addEventListener("change", () => {
    status.dataset.error = "false";
    status.textContent = "";
    window.tinyMint.updatePreferences({ [preferenceKey(input)]: input.checked });
  });
}

window.tinyMint.onState(render);
void window.tinyMint.getState().then(render).catch((error: unknown) => {
  status.dataset.error = "true";
  status.textContent = `Couldn't load settings: ${error instanceof Error ? error.message : String(error)}`;
});
