import { describe, expect, it } from "vitest";
import { BehaviorPlanner } from "../src/creature/behavior/BehaviorPlanner";
import { updateImpulse } from "../src/creature/behavior/behaviorImpulses";
import { chooseActivity } from "../src/creature/behavior/behaviorEngine";
import { recordHabit } from "../src/creature/behavior/habitModel";
import { scoreRoomBehaviors } from "../src/creature/behavior/behaviorScoring";
import { defaultState } from "../src/creature/state/defaultState";

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function countIntentions(state: ReturnType<typeof defaultState>, samples = 10_000): Map<string, number> {
  const planner = new BehaviorPlanner(seeded(42));
  const counts = new Map<string, number>();
  for (let index = 0; index < samples; index += 1) {
    const intention = planner.chooseRoomPlan(state, index).intention;
    counts.set(intention, (counts.get(intention) ?? 0) + 1);
  }
  return counts;
}

describe("BehaviorPlanner", () => {
  it("makes creativity and curiosity statistically visible without eliminating diversity", () => {
    const creative = defaultState();
    creative.location = "room";
    creative.personality.creativity = 1;
    creative.personality.curiosity = 0;
    const curious = defaultState();
    curious.location = "room";
    curious.personality.creativity = 0;
    curious.personality.curiosity = 1;
    const creativeCounts = countIntentions(creative);
    const curiousCounts = countIntentions(curious);
    expect(creativeCounts.get("make and show a sketch") ?? 0).toBeGreaterThan(curiousCounts.get("make and show a sketch") ?? 0);
    expect(curiousCounts.get("read a book") ?? 0).toBeGreaterThan(creativeCounts.get("read a book") ?? 0);
    expect(creativeCounts.size).toBeGreaterThanOrEqual(7);
    expect(curiousCounts.size).toBeGreaterThanOrEqual(7);
  });

  it("strongly favors rest at low energy and penalizes recent repetition", () => {
    const rested = defaultState();
    rested.location = "room";
    rested.energy = 80;
    const tired = structuredClone(rested);
    tired.energy = 5;
    expect(scoreRoomBehaviors(tired, 14).sleep).toBeGreaterThan(scoreRoomBehaviors(rested, 14).sleep * 2);

    const repeated = structuredClone(rested);
    repeated.habits.recentActivities = Array(6).fill("draw");
    repeated.habits.recentProps = Array(6).fill("desk");
    expect(scoreRoomBehaviors(repeated, 14).art).toBeLessThan(scoreRoomBehaviors(rested, 14).art / 2);
  });

  it("uses sociability and affection for company while independence favors room time", () => {
    const social = defaultState();
    social.location = "room";
    social.personality.sociability = 1;
    social.personality.affection = 1;
    social.personality.independence = 0;
    const solitary = structuredClone(social);
    solitary.personality.sociability = 0;
    solitary.personality.affection = 0;
    solitary.personality.independence = 1;
    expect(scoreRoomBehaviors(social, 14).exit).toBeGreaterThan(scoreRoomBehaviors(solitary, 14).exit);

    const socialImpulses = sampledImpulses(social, 10_000);
    const solitaryImpulses = sampledImpulses(solitary, 10_000);
    expect(socialImpulses.get("seek-company") ?? 0).toBeGreaterThan(solitaryImpulses.get("seek-company") ?? 0);

    social.location = "desktop";
    solitary.location = "desktop";
    const socialRoomVisits = sampledActivities(social, 10_000).get("visitRoom") ?? 0;
    const solitaryRoomVisits = sampledActivities(solitary, 10_000).get("visitRoom") ?? 0;
    expect(solitaryRoomVisits).toBeGreaterThan(socialRoomVisits);
  });

  it("uses patience and chaos to change commitment duration", () => {
    const patient = defaultState();
    patient.location = "room";
    patient.personality.patience = 1;
    patient.personality.chaos = 0;
    const spontaneous = structuredClone(patient);
    spontaneous.personality.patience = 0;
    spontaneous.personality.chaos = 1;
    const patientPlan = new BehaviorPlanner(() => 0).chooseRoomPlan(patient, 0);
    const spontaneousPlan = new BehaviorPlanner(() => 0).chooseRoomPlan(spontaneous, 0);
    expect(planDuration(patientPlan)).toBeGreaterThan(planDuration(spontaneousPlan));
  });

  it("bounds habit reinforcement, regresses other affinities, and retains eight recent choices", () => {
    let habits = defaultState().habits;
    habits.activityAffinity.play = 1.2;
    for (let index = 0; index < 40; index += 1) habits = recordHabit(habits, "draw", "desk");
    expect(habits.activityAffinity.draw).toBeLessThanOrEqual(1.25);
    expect(habits.propAffinity.desk).toBeLessThanOrEqual(1.25);
    expect(habits.activityAffinity.play).toBeLessThan(1.2);
    expect(habits.activityUses.draw).toBe(40);
    expect(habits.recentActivities).toHaveLength(8);
  });
});

function sampledImpulses(state: ReturnType<typeof defaultState>, samples: number): Map<string, number> {
  const random = seeded(91);
  const counts = new Map<string, number>();
  for (let index = 0; index < samples; index += 1) {
    const impulse = updateImpulse({ ...state, impulse: null }, index, random);
    counts.set(impulse.kind, (counts.get(impulse.kind) ?? 0) + 1);
  }
  return counts;
}

function sampledActivities(state: ReturnType<typeof defaultState>, samples: number): Map<string, number> {
  const random = seeded(73);
  const counts = new Map<string, number>();
  for (let index = 0; index < samples; index += 1) {
    const activity = chooseActivity(state, random);
    counts.set(activity, (counts.get(activity) ?? 0) + 1);
  }
  return counts;
}

function planDuration(plan: ReturnType<BehaviorPlanner["chooseRoomPlan"]>): number {
  return plan.steps.reduce((total, step) => total + ("durationMs" in step ? step.durationMs : 0), 0);
}
