import type { DesktopActivityKind, FocusState } from "../shared/types";

export interface FocusSnapshot {
  focusState: FocusState;
  focusMinutes: number;
}

const focusedActivities = new Set<DesktopActivityKind>(["coding", "writing", "reading", "drawing"]);

export class FocusSessionTracker {
  private focusedSince: number | null = null;
  private lastFocusEndedAt: number | null = null;
  private lastFocusDurationMinutes = 0;

  constructor(
    private readonly minimumSustainedMs = 5 * 60_000,
    private readonly recentWindowMs = 15 * 60_000
  ) {}

  reset(): FocusSnapshot {
    this.focusedSince = null;
    this.lastFocusEndedAt = null;
    this.lastFocusDurationMinutes = 0;
    return { focusState: "none", focusMinutes: 0 };
  }

  sample(
    activity: DesktopActivityKind,
    userPresent: boolean,
    fullscreen: boolean,
    enabled: boolean,
    now = Date.now()
  ): FocusSnapshot {
    if (!enabled) return this.reset();

    const focused = userPresent && !fullscreen && focusedActivities.has(activity);
    if (focused) {
      this.focusedSince ??= now;
      return {
        focusState: "focused",
        focusMinutes: Math.max(0, (now - this.focusedSince) / 60_000)
      };
    }

    if (this.focusedSince !== null) {
      const durationMs = Math.max(0, now - this.focusedSince);
      this.focusedSince = null;
      if (durationMs >= this.minimumSustainedMs) {
        this.lastFocusEndedAt = now;
        this.lastFocusDurationMinutes = durationMs / 60_000;
      }
    }

    if (this.lastFocusEndedAt !== null) {
      if (now - this.lastFocusEndedAt <= this.recentWindowMs) {
        return {
          focusState: "recently-finished",
          focusMinutes: this.lastFocusDurationMinutes
        };
      }
      this.lastFocusEndedAt = null;
      this.lastFocusDurationMinutes = 0;
    }

    return { focusState: "none", focusMinutes: 0 };
  }
}
