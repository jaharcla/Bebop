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
import bongStripUrl from "../../assets/sprites/v3-source/bonus/bong/bong-strip-384x96.png?url";

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
  "watering-can": wateringCanUrl,
  bong: bongStripUrl
};

const canvas = required<HTMLCanvasElement>("#mint");
const creature = required<HTMLElement>("#room-creature");
const carriedItem = required<HTMLImageElement>("#carried-item");
const activity = required<HTMLParagraphElement>("#activity");
const send = required<HTMLButtonElement>("#send");
const debug = required<HTMLDetailsElement>("#debug");
const stateView = required<HTMLPreElement>("#state");
const propsRoot = required<HTMLElement>("#props");
const sketchesRoot = required<HTMLElement>("#corkboard-sketches");
const qaStatus = required<HTMLParagraphElement>("#qa-status");

const animator = new SpriteAnimator(canvas);
if (!window.tinyMint.isDevelopment) debug.hidden = true;
const systemMotionPreference = matchMedia("(prefers-reduced-motion: reduce)");

const propButtons = new Map<RoomPropId, HTMLButtonElement>();

function labelFor(id: RoomPropId): string {
  return id.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const sketchArt = {
  plant: '<path d="M12 21V10m0 5C3 15 5 7 5 7s7 0 7 8m0-2c0-7 7-7 7-7s1 8-7 10" fill="none" stroke="#507d54" stroke-width="2"/>',
  book: '<path d="M4 5h7a2 2 0 0 1 2 2v13H6a2 2 0 0 0-2 2zm16 0h-7a2 2 0 0 0-2 2v13h7a2 2 0 0 1 2 2z" fill="#f4ca72" stroke="#805c38" stroke-width="1.5"/>',
  ball: '<circle cx="12" cy="12" r="8" fill="#ed907b" stroke="#8a5549" stroke-width="1.5"/><path d="M5 8c4 1 6 5 7 12m7-16c-1 5-5 7-12 8" fill="none" stroke="#fff0d3" stroke-width="1.5"/>',
  portrait: '<circle cx="12" cy="10" r="6" fill="#b9dfc3" stroke="#52776a" stroke-width="1.5"/><circle cx="10" cy="10" r="1" fill="#294b43"/><circle cx="14" cy="10" r="1" fill="#294b43"/><path d="M8 20c1-4 7-4 8 0" fill="none" stroke="#52776a" stroke-width="2"/>',
  heart: '<path d="M12 21S3 15 4 9c1-5 7-5 8-1 2-4 8-4 9 1 1 6-9 12-9 12z" fill="#e88987" stroke="#8a5554" stroke-width="1.5"/>',
  abstract: '<path d="M5 17 9 5l4 13 3-9 3 8" fill="none" stroke="#8171a3" stroke-width="2"/><circle cx="7" cy="7" r="1.5" fill="#e0a55e"/>',
  star: '<path d="m12 3 2.5 6 6.5.5-5 4.2 1.5 6.3-5.5-3.4-5.5 3.4 1.5-6.3-5-4.2L9.5 9z" fill="#efca68" stroke="#937b42" stroke-width="1.3"/>'
} as const;

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

  if (prop.id === "bong") {
    button.classList.add("bong-prop");
    button.style.setProperty("--bong-strip", `url("${bongStripUrl}")`);
    button.setAttribute("aria-label", "Use the bong");
    const art = document.createElement("span");
    art.className = "bong-art";
    art.setAttribute("aria-hidden", "true");
    art.innerHTML = '<svg viewBox="0 0 64 74" aria-hidden="true"><path d="M27 7h12v37l10 13v10H17V57l10-13Z" fill="#acd9cc" stroke="#294b43" stroke-width="3"/><path d="M20 57h26v8H20Z" fill="#71aca2"/><path d="m39 44 11-10 5 5-13 13" fill="#c3e5d4" stroke="#294b43" stroke-width="3"/></svg>';
    button.append(art);
  } else {
    const image = document.createElement("img");
    image.src = propImages[prop.id];
    image.alt = "";
    image.draggable = false;
    button.append(image);
  }
  button.addEventListener("click", () => window.tinyMint.useRoomProp(prop.id));
  propsRoot.append(button);
  propButtons.set(prop.id, button);
}

const bongPerformance = required<HTMLElement>("#bong-performance");
bongPerformance.style.setProperty("--bong-strip", 'url("' + bongStripUrl + '")');

function render(state: CreatureState): void {
  const isHome = state.location === "room";
  document.documentElement.classList.toggle(
    "reduced-motion",
    state.preferences.reducedMotion || systemMotionPreference.matches
  );
  const bongRoutine = isHome && state.room.target === "bong" && state.room.intention === "take a bong break";
  const bongPhase = bongRoutine && state.currentActivity === "inspect" ? "use"
    : bongRoutine && state.currentActivity === "play" ? "cough" : "none";
  creature.dataset.bongPhase = bongPhase;
  bongPerformance.style.animationPlayState = state.preferences.paused || state.preferences.reducedMotion || systemMotionPreference.matches ? "paused" : "running";
  creature.hidden = !isHome;
  send.textContent = isHome ? "Send Tiny Mint outside" : "Call Tiny Mint home";
  animator.setPaused(state.preferences.paused || state.preferences.reducedMotion || systemMotionPreference.matches);
  animator.setAnimation(state.currentAnimation);
  creature.classList.toggle("facing-left", state.facing === "left");

  for (const [id, button] of propButtons) {
    button.dataset.selected = String(isHome && id === state.room.target);
    button.dataset.carried = String(id === state.room.carriedItem);
    if (id === "bong") {
      button.dataset.active = String(bongPhase !== "none");
    }
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

  sketchesRoot.replaceChildren(...state.corkboardSketches.map((sketch, index) => {
    const card = document.createElement("span");
    card.className = "sketch-card";
    card.dataset.kind = sketch.kind;
    card.style.setProperty("--sketch-tilt", `${index % 2 === 0 ? -5 : 4}deg`);
    card.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${sketchArt[sketch.kind]}</svg>`;
    return card;
  }));

  stateView.textContent = JSON.stringify(state, null, 2);
  qaStatus.textContent = `Basic Awareness: ${state.privacy.awarenessEnabled ? "on" : "off"}. Presence QA override: real system signal.`;
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

required<HTMLButtonElement>("#qa-check-in").addEventListener("click", async () => {
  qaStatus.textContent = "Starting a local autonomous check-in…";
  try {
    const started = await window.tinyMint.qaAutonomousCheckIn();
    qaStatus.textContent = started
      ? "Autonomous check-in started with the configured local/provider dialogue."
      : "Check-in not started. Enable interactions, turn off Quiet mode, resume Tiny Mint, and enable Basic Awareness if simulating away.";
  } catch (error) {
    qaStatus.textContent = `QA check-in failed: ${error instanceof Error ? error.message : String(error)}`;
  }
});

document.querySelectorAll<HTMLButtonElement>("[data-qa-presence]").forEach((button) => {
  button.addEventListener("click", async () => {
    const value = button.dataset.qaPresence;
    const present = value === "active" ? true : value === "away" ? false : null;
    try {
      const current = await window.tinyMint.qaSetUserPresence(present);
      qaStatus.textContent = current === null
        ? "Enable Basic Awareness in Settings before simulating presence."
        : `Simulated local presence: ${current ? "active" : "away"}.`;
    } catch (error) {
      qaStatus.textContent = `Presence QA failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
});

window.tinyMint.onState(render);
void window.tinyMint.getState().then(render);
systemMotionPreference.addEventListener("change", () => {
  void window.tinyMint.getState().then(render);
});
