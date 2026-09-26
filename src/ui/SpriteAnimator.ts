import { animations, CELL_SIZE } from "../creature/animation/catalog";
import type { AnimationName } from "../shared/types";
import atlasUrl from "../../assets/sprites/mascot-atlas.png?url";

export class SpriteAnimator {
  private readonly context: CanvasRenderingContext2D;
  private readonly image = new Image();
  private requested: AnimationName = "idle";
  private active: AnimationName = "idle";
  private sequenceIndex = 0;
  private frame = 0;
  private elapsed = 0;
  private lastTime = 0;
  private paused = false;
  private directionalFrame = 0;
  private flip = false;
  private ready = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.context = context;
    this.context.imageSmoothingEnabled = false;
    this.image.onload = () => { this.ready = true; this.draw(); };
    this.image.src = atlasUrl;
    requestAnimationFrame((time) => this.tick(time));
  }

  setAnimation(name: AnimationName, restart = false): void {
    if (name === this.requested && !restart) return;
    this.requested = name;
    this.active = name;
    this.sequenceIndex = 0;
    this.frame = animations[name].sequence[0] ?? 0;
    this.elapsed = 0;
  }

  getAnimation(): AnimationName { return this.active; }

  setDirectionalFrame(frame: number): void {
    this.directionalFrame = Math.max(0, Math.min(3, frame));
    if (this.active === "look") this.frame = this.directionalFrame;
  }

  setPaused(paused: boolean): void { this.paused = paused; }
  setFlipped(flip: boolean): void { this.flip = flip; }

  isOpaqueAt(x: number, y: number): boolean {
    if (!this.ready || x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) return false;
    return this.context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 18;
  }

  private tick(time: number): void {
    const delta = Math.min(time - (this.lastTime || time), 80);
    this.lastTime = time;
    if (!this.paused) this.advance(delta);
    this.draw();
    requestAnimationFrame((next) => this.tick(next));
  }

  private advance(delta: number): void {
    const definition = animations[this.active];
    if (definition.mode === "directional") {
      this.frame = this.directionalFrame;
      return;
    }

    this.elapsed += delta;
    let guard = 0;
    while (guard++ < 8) {
      const duration = definition.durations[this.sequenceIndex] ?? definition.durations.at(-1) ?? 160;
      if (this.elapsed < duration) return;
      this.elapsed -= duration;

      const lastIndex = definition.sequence.length - 1;
      if (this.sequenceIndex < lastIndex) {
        this.sequenceIndex += 1;
        this.frame = definition.sequence[this.sequenceIndex] ?? 0;
        continue;
      }

      if (definition.mode === "once-hold") {
        this.sequenceIndex = lastIndex;
        this.frame = definition.sequence[lastIndex] ?? 0;
        this.elapsed = 0;
        return;
      }

      if (definition.mode === "once-idle") {
        this.active = "idle";
        this.sequenceIndex = 0;
        this.frame = animations.idle.sequence[0] ?? 0;
        this.elapsed = 0;
        return;
      }

      this.sequenceIndex = Math.max(0, Math.min(definition.loopFrom ?? 0, lastIndex));
      this.frame = definition.sequence[this.sequenceIndex] ?? 0;
    }
  }

  private draw(): void {
    if (!this.ready) return;
    const definition = animations[this.active];
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.save();
    if (this.flip) {
      this.context.translate(this.canvas.width, 0);
      this.context.scale(-1, 1);
    }
    this.context.imageSmoothingEnabled = false;
    this.context.drawImage(
      this.image,
      this.frame * CELL_SIZE,
      definition.row * CELL_SIZE,
      CELL_SIZE,
      CELL_SIZE,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );
    this.context.restore();
  }
}
