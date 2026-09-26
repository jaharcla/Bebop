import { describe, expect, it } from "vitest";
import { ActionExecutor } from "../src/creature/actions/ActionExecutor";
import { bookRoutine, wateringRoutine } from "../src/creature/actions/actionChains";
import type { ActionStep } from "../src/creature/actions/ActionPlan";
import type { RoomPropId, WorldPosition } from "../src/shared/types";

function runPlan(plan: ReturnType<typeof bookRoutine>) {
  let position: WorldPosition = { x: 0, y: 0 };
  let carried: RoomPropId | null = null;
  const events: string[] = [];
  const executor = new ActionExecutor({
    position: () => position,
    move: (next) => { position = next; },
    begin: (step: ActionStep) => {
      if (step.type === "move-to") events.push(`move ${step.entity}`);
      else if (step.type === "interact") events.push(`${step.affordance} ${step.entity}`);
      else if (step.type === "pick-up") { carried = step.entity; events.push(`pickup ${step.entity}`); }
      else if (step.type === "drop") { carried = null; events.push(`drop ${step.entity}`); }
      else if (step.type === "face") events.push(`face ${step.entity}`);
    },
    complete: () => events.push("complete"),
    cleanup: () => { carried = null; events.push("cleanup"); }
  }, 10_000);
  executor.start(plan, 0);
  for (let now = 1_000; executor.hasActivePlan() && now < 100_000; now += 20_000) executor.tick(now);
  return { events, carried, executor };
}

describe("ActionExecutor", () => {
  it("executes the book routine in physical order", () => {
    expect(runPlan(bookRoutine(0)).events).toEqual([
      "move bookshelf", "face bookshelf", "select-book bookshelf", "pickup book",
      "move chair", "read chair", "move bookshelf", "drop book", "complete"
    ]);
  });

  it("executes watering as pickup, plant interaction, and return", () => {
    expect(runPlan(wateringRoutine(0)).events).toEqual([
      "move watering-can", "face watering-can", "pick-up watering-can", "pickup watering-can",
      "move plant", "water plant", "move watering-can", "drop watering-can", "complete"
    ]);
  });

  it("cleans up a carried item when a manual plan interrupts", () => {
    let position: WorldPosition = { x: 0, y: 0 };
    let cleaned: RoomPropId | null | undefined;
    const executor = new ActionExecutor({
      position: () => position,
      move: (next) => { position = next; },
      begin: () => undefined,
      complete: () => undefined,
      cleanup: (item) => { cleaned = item; }
    }, 10_000);
    executor.start(bookRoutine(0), 0);
    executor.tick(1_000);
    executor.tick(3_000);
    executor.start(wateringRoutine(4_000, 100), 4_000);
    expect(cleaned).toBe("book");
    expect(executor.activePlan()?.intention).toBe("water the plant");
  });
});
