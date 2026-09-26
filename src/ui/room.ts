import "./room.css";
import { SpriteAnimator } from "./SpriteAnimator";
import { roomPropById, roomProps } from "../creature/room/roomProps";
import type { CreatureState, RoomPropId } from "../shared/types";

import ballUrl from "../../assets/sprites/props/ball.png?url";
import bedUrl from "../../assets/sprites/props/bed.png?url";
import bookUrl from "../../assets/sprites/props/book.png?url";
import bookshelfUrl from "../../assets/sprites/props/bookshelf.png?url";
import chairUrl from "../../assets/sprites/props/chair.png?url";
import corkboardUrl from "../../assets/sprites/props/corkboard.png?url";
import cushionUrl from "../../assets/sprites/props/cushion.png?url";
import deskUrl from "../../assets/sprites/props/desk.png?url";
import doorUrl from "../../assets/sprites/props/door.png?url";
import dumbbellUrl from "../../assets/sprites/props/dumbbell.png?url";
import musicPlayerUrl from "../../assets/sprites/props/music-player.png?url";
import plantUrl from "../../assets/sprites/props/plant.png?url";
import rugUrl from "../../assets/sprites/props/rug.png?url";
import sketchbookUrl from "../../assets/sprites/props/sketchbook.png?url";
import toyBoxUrl from "../../assets/sprites/props/toy-box.png?url";
import wateringCanUrl from "../../assets/sprites/props/watering-can.png?url";

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Room element is missing: ${selector}`);
  return element;
}

const propImages: Record<RoomPropId, string> = {
  ball: ballUrl,
  bed: bedUrl,
  book: bookUrl,
  bookshelf: bookshelfUrl,
  chair: chairUrl,
  corkboard: corkboardUrl,
  cushion: cushionUrl,
  desk: deskUrl,
  door: doorUrl,
  dumbbell: dumbbellUrl,
  "music-player": musicPlayerUrl,
  plant: plantUrl,
  rug: rugUrl,
  sketchbook: sketchbookUrl,
  "toy-box": toyBoxUrl,
  "watering-can": wateringCanUrl
};

const canvas = required<HTMLCanvasElement>("#mint");
const creature = required<HTMLElement>("#room-creature");
const carriedItem = required<HTMLImageElement>("#carried-item");
const activity = required<HTMLParagraphElement>("#activity");
const send = required<HTMLButtonElement>("#send");
const debug = required<HTMLDetailsElement>("#debug");
const stateView = required<HTMLPreElement>("#state");
const propsRoot = required<HTMLElement>("#props");

const animator = new SpriteAnimator(canvas);
if (!window.tinyMint.isDevelopment) debug.hidden = true;
const systemMotionPreference = matchMedia("(prefers-reduced-motion: reduce)");

const propButtons = new Map<RoomPropId, HTMLButtonElement>();

function labelFor(id: RoomPropId): string {
  return id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

for (const prop of roomProps) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "room-prop";
  button.dataset.prop = prop.id;
  button.setAttribute("aria-label", labelFor(prop.id));
  button.style.left = `${(prop.x / 960) * 100}%`;
  button.style.top = `${(prop.y / 600) * 100}%`;
  button.style.width = `${(prop.w / 960) * 100}%`;
  button.style.height = `${(prop.h / 600) * 100}%`;
  button.style.zIndex = String(20 + Math.round(prop.y));

  const image = document.createElement("img");
  image.src = propImages[prop.id];
  image.alt = "";
  image.draggable = false;
  button.append(image);
  button.addEventListener("click", () => window.tinyMint.useRoomProp(prop.id));
  propsRoot.append(button);
  propButtons.set(prop.id, button);
}

function render(state: CreatureState): void {
  const isHome = state.location === "room";
  document.documentElement.classList.toggle(
    "reduced-motion",
    state.preferences.reducedMotion || systemMotionPreference.matches
  );
  creature.hidden = !isHome;
  send.textContent = isHome ? "Send Tiny Mint outside" : "Call Tiny Mint home";
  animator.setPaused(state.preferences.paused || state.preferences.reducedMotion || systemMotionPreference.matches);
  animator.setAnimation(state.currentAnimation);

  for (const [id, button] of propButtons) {
    button.dataset.selected = String(isHome && id === state.room.target);
    button.dataset.carried = String(id === state.room.carriedItem);
  }

  if (isHome) {
    const target = roomPropById(state.room.target);
    const position = state.room.position;
    creature.style.left = `${(position.x / 960) * 100}%`;
    creature.style.top = `${(position.y / 600) * 100}%`;
    creature.style.zIndex = String(40 + Math.round(position.y));
    creature.classList.toggle("music", state.currentActivity === "music");
    creature.classList.toggle("play", state.currentActivity === "play");
    carriedItem.hidden = !state.room.carriedItem;
    if (state.room.carriedItem) carriedItem.src = propImages[state.room.carriedItem];
    activity.textContent = `${state.room.intention ?? target.message} · ${state.mood}`;
  } else {
    creature.classList.remove("music", "play");
    carriedItem.hidden = true;
    activity.textContent = "Away on the desktop";
  }

  stateView.textContent = JSON.stringify(state, null, 2);
}

send.addEventListener("click", async () => {
  const state = await window.tinyMint.getState();
  window.tinyMint.setLocation(state.location === "room" ? "desktop" : "room");
});

document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "desktop" || action === "room") window.tinyMint.setLocation(action);
    else if (action === "tap") window.tinyMint.click();
    else if (action === "reset") window.tinyMint.reset();
  });
});

window.tinyMint.onState(render);
void window.tinyMint.getState().then(render);
systemMotionPreference.addEventListener("change", () => {
  void window.tinyMint.getState().then(render);
});
