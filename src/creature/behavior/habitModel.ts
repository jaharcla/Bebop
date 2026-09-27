import type { Activity, HabitProfile, RoomPropId } from "../../shared/types";

const boundedAffinity = (value: number, learningStrength: number): number => {
  const decay = 1 - 0.015 * learningStrength;
  return Math.max(0.75, Math.min(1.25, 1 + (value - 1) * decay));
};

export function recordHabit(
  habits: HabitProfile,
  activity: Activity,
  prop?: RoomPropId,
  reinforcement = 1
): HabitProfile {
  const learning = Math.max(0, Math.min(1, reinforcement));
  const activityAffinity = Object.fromEntries(
    Object.entries(habits.activityAffinity).map(([key, value]) => [key, boundedAffinity(value ?? 1, learning)])
  );
  const propAffinity = Object.fromEntries(
    Object.entries(habits.propAffinity).map(([key, value]) => [key, boundedAffinity(value ?? 1, learning)])
  );
  activityAffinity[activity] = Math.min(1.25, (activityAffinity[activity] ?? 1) + 0.018 * learning);
  if (prop) propAffinity[prop] = Math.min(1.25, (propAffinity[prop] ?? 1) + 0.018 * learning);
  return {
    activityAffinity,
    propAffinity,
    activityUses: { ...habits.activityUses, [activity]: (habits.activityUses[activity] ?? 0) + 1 },
    propUses: prop ? { ...habits.propUses, [prop]: (habits.propUses[prop] ?? 0) + 1 } : { ...habits.propUses },
    recentActivities: [...habits.recentActivities, activity].slice(-8),
    recentProps: prop ? [...habits.recentProps, prop].slice(-8) : habits.recentProps.slice(-8)
  };
}

export function noveltyModifier<T>(recent: readonly T[], value: T): number {
  const count = recent.filter((entry) => entry === value).length;
  return Math.max(0.3, 1 - count * 0.22);
}
