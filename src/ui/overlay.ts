import "./overlay.css";
import { SpriteAnimator } from "./SpriteAnimator";
import type { AnimationName, CreatureState } from "../shared/types";

const canvas = document.querySelector<HTMLCanvasElement>("#mint");
if (!canvas) throw new Error("Tiny Mint canvas is missing.");

const animator = new SpriteAnimator(canvas);
const systemMotionPreference = matchMedia("(prefers-reduced-motion: reduce)");
let state: CreatureState | undefined;
let pointer: { x: number; y: number } | undefined;
let dragging = false;
let moved = false;
let dragStart = { x: 0, y: 0 };
let transient = false;
let clickThrough = false;
let transientTimer: number | undefined;
let cursorFacing: "left" | "right" | undefined;

function clearTransientTimer(): void {
  if (transientTimer !== undefined) window.clearTimeout(transientTimer);
  transientTimer = undefined;
}

function applyAnimation(): void {
  if (!state || transient) return;
  animator.setPaused(state.preferences.paused || state.preferences.reducedMotion || systemMotionPreference.matches);
  if (pointer && state.preferences.cursorInteraction && !state.preferences.paused && !["tap", "happy"].includes(state.currentAnimation)) {
    const dx = pointer.x - 96;
    const dy = pointer.y - 80;
    const near = Math.hypot(dx, dy) < 72;
    const facing = dx < -1 ? "left" : dx > 1 ? "right" : state.facing;
    if (cursorFacing !== facing) {
      cursorFacing = facing;
      window.tinyMint.setFacing(facing);
    }
    const name: AnimationName = near ? (dx < 0 ? "reach-left" : "reach-right") : "look";
    animator.setAnimation(name);
    animator.setFlipped(name !== "reach-left" && name !== "reach-right" && facing === "left");
    if (name === "look") animator.setDirectionalFrame(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 2) : (dy < 0 ? 1 : 3));
    return;
  }
  animator.setAnimation(state.currentAnimation);
  animator.setFlipped(state.currentAnimation !== "reach-left" && state.currentAnimation !== "reach-right" && state.facing === "left");
}

function setClickThrough(ignore: boolean): void {
  if (ignore === clickThrough || dragging) return;
  clickThrough = ignore;
  window.tinyMint.setClickThrough(ignore);
}

canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * canvas.width / rect.width;
  const y = (event.clientY - rect.top) * canvas.height / rect.height;
  pointer = { x, y };
  setClickThrough(!animator.isOpaqueAt(x, y));
  if (dragging) {
    moved ||= Math.hypot(event.screenX - dragStart.x, event.screenY - dragStart.y) > 4;
    window.tinyMint.drag(event.screenX, event.screenY);
  } else applyAnimation();
});

canvas.addEventListener("pointerleave", () => {
  pointer = undefined;
  if (!dragging) applyAnimation();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 2) return;
  clearTransientTimer();
  dragging = true;
  moved = false;
  transient = true;
  dragStart = { x: event.screenX, y: event.screenY };
  canvas.setPointerCapture(event.pointerId);
  animator.setAnimation("held", true);
  window.tinyMint.startDrag(event.screenX, event.screenY);
});

canvas.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  dragging = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  window.tinyMint.endDrag(moved);

  if (!moved) {
    transient = false;
    window.tinyMint.click();
    return;
  }

  animator.setAnimation("land", true);
  transientTimer = window.setTimeout(() => {
    transient = false;
    transientTimer = undefined;
    applyAnimation();
  }, 520);
});

canvas.addEventListener("pointercancel", () => {
  if (!dragging) return;
  dragging = false;
  window.tinyMint.endDrag(moved);
  transient = false;
  applyAnimation();
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.tinyMint.openMenu();
});

window.tinyMint.onState((next) => {
  state = next;
  applyAnimation();
});
void window.tinyMint.getState().then((next) => { state = next; applyAnimation(); });
systemMotionPreference.addEventListener("change", applyAnimation);

function scheduleBlink(): void {
  window.setTimeout(() => {
    const motionReduced = state?.preferences.reducedMotion || systemMotionPreference.matches;
    if (!motionReduced && state?.currentAnimation === "idle" && !pointer && !state.preferences.paused && !dragging && !transient) {
      transient = true;
      animator.setAnimation("blink", true);
      window.setTimeout(() => {
        transient = false;
        applyAnimation();
      }, 2_850);
    }
    scheduleBlink();
  }, 4_500 + Math.random() * 2_500);
}
scheduleBlink();
