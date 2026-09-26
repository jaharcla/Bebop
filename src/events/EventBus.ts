import { EventEmitter } from "node:events";
import type { CreatureEvent } from "../shared/types";

export class EventBus {
  private readonly emitter = new EventEmitter();

  on(type: CreatureEvent["type"], listener: (event: CreatureEvent) => void): () => void {
    this.emitter.on(type, listener);
    return () => this.emitter.off(type, listener);
  }

  emit(event: CreatureEvent): void {
    this.emitter.emit(event.type, event);
  }
}
