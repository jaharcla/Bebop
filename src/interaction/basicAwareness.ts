export const SYSTEM_IDLE_AWAY_THRESHOLD_SECONDS = 5 * 60;

export function isUserPresentFromSystemIdle(idleSeconds: number): boolean {
  if (!Number.isFinite(idleSeconds) || idleSeconds < 0) {
    throw new Error("System idle duration must be a finite, non-negative number.");
  }
  return idleSeconds < SYSTEM_IDLE_AWAY_THRESHOLD_SECONDS;
}
