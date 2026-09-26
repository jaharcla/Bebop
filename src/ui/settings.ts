import "./settings.css";
import type { CreaturePreferences, CreatureState } from "../shared/types";

const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-preference]"));
const status = document.querySelector<HTMLParagraphElement>("#status");
if (!status) throw new Error("Settings status element is missing.");

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
  startWithWindows: false
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
