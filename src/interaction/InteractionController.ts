import type {
  ConversationMessage,
  CreatureState,
  CreatureUtterance,
  DialogueRequest,
  InteractionSession,
  InteractionTrigger
} from "../shared/types";
import type { DialogueProvider } from "./dialogue/DialogueProvider";
import { LocalDialogueProvider } from "./dialogue/LocalDialogueProvider";
import { nextAllowedInitiationAt, nextCreatureSpeechDelayMs, shouldInitiateInteraction } from "./interactionPolicy";
import { validateUtterance } from "./dialogue/responseValidation";

const MAX_CONVERSATION_MESSAGES = 6;
const AUTONOMOUS_BUBBLE_TIMEOUT_MS = 25_000;
const SESSION_FINISH_TIMEOUT_MS = 4_000;
const MAX_CUSTOM_REPLY_LENGTH = 500;
const initialUtterance: CreatureUtterance = { text: "...", quickResponses: [], emotion: "neutral", endConversation: false };

export interface InteractionBrain {
  setLocation(location: "desktop"): void;
  setConversationActive(active: boolean): void;
  recordConversationReply(): void;
  recordCreatureConversation(): void;
}

export interface InteractionControllerOptions {
  getState(): CreatureState;
  brain: InteractionBrain;
  provider: DialogueProvider;
  onSession(session: InteractionSession | null): void;
  now?: () => number;
  random?: () => number;
  reportFailure?: (error: unknown) => void;
  createId?: () => string;
}

export class InteractionController {
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly localProvider = new LocalDialogueProvider();
  private readonly createId: () => string;
  private session: InteractionSession | null = null;
  private previousState: CreatureState | undefined;
  private pendingTrigger: InteractionTrigger | null = null;
  private initiationTimer: ReturnType<typeof setTimeout> | undefined;
  private longQuietTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionTimer: ReturnType<typeof setTimeout> | undefined;
  private ignoredStreak = 0;
  private notBefore: number;
  private engaged = false;
  private disposed = false;
  private userPresent = true;
  private userBusy = false;
  private activeReplyController: AbortController | undefined;

  constructor(private readonly options: InteractionControllerOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.createId = options.createId ?? (() => `${this.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
    this.notBefore = this.now() + nextCreatureSpeechDelayMs(0, this.random, options.getState());
  }

  start(): void {
    if (this.disposed || this.previousState) return;
    this.previousState = this.options.getState();
    const startupGrace = (5 + this.random() * 5) * 60_000;
    this.scheduleLongQuiet(startupGrace);
  }

  setUserPresent(present: boolean): void {
    if (this.userPresent === present || this.disposed) return;
    this.userPresent = present;
    this.refreshAvailability();
  }

  setUserBusy(busy: boolean): void {
    if (this.userBusy === busy || this.disposed) return;
    this.userBusy = busy;
    this.refreshAvailability();
  }

  private refreshAvailability(): void {
    if (!this.userPresent || this.userBusy) {
      if (this.initiationTimer) clearTimeout(this.initiationTimer);
      this.initiationTimer = undefined;
      if (this.session?.origin === "creature" && !this.engaged) this.closeSession();
      return;
    }

    if (this.pendingTrigger) this.scheduleInitiation();
    else if (!this.session) this.scheduleLongQuiet(2 * 60_000 + this.random() * 2 * 60_000);
  }

  isUserPresent(): boolean {
    return this.userPresent;
  }

  async startAutonomousCheckInForQA(): Promise<boolean> {
    const state = this.options.getState();
    if (this.disposed || this.session || !state.preferences.interactionsEnabled || state.preferences.quietMode
      || state.preferences.paused || !this.userPresent || this.userBusy) return false;
    if (state.location !== "desktop") this.options.brain.setLocation("desktop");
    await this.openSession("creature", "LONG_QUIET_PERIOD", true);
    return this.getSession()?.origin === "creature";
  }

  observeState(state: CreatureState): void {
    if (this.disposed) return;
    const previous = this.previousState;
    this.previousState = state;
    if (!previous) return;
    if (!state.preferences.interactionsEnabled || state.preferences.quietMode || state.preferences.paused || state.location !== "desktop") {
      this.cancelInitiation();
      if (state.preferences.quietMode && this.session?.origin === "creature" && !this.engaged) this.closeSession();
      return;
    }
    if (!previous.preferences.interactionsEnabled && state.preferences.interactionsEnabled && !this.session) {
      this.scheduleLongQuiet(20 * 60_000 + this.random() * 20 * 60_000);
    }
    if (previous.preferences.paused && !state.preferences.paused && !this.session) {
      this.scheduleLongQuiet(20 * 60_000 + this.random() * 20 * 60_000);
    }
    if (previous.preferences.quietMode && !state.preferences.quietMode && !this.session) {
      this.scheduleLongQuiet(20 * 60_000 + this.random() * 20 * 60_000);
    }
    if (previous.location !== "desktop" && state.location === "desktop") {
      this.queueInitiation("RETURNED_TO_DESKTOP");
    } else if (previous.mood !== state.mood && state.mood === "curious") {
      this.queueInitiation("BECAME_CURIOUS");
    } else if (previous.mood !== state.mood && state.mood === "bored") {
      this.queueInitiation("BECAME_BORED");
    }
  }

  getSession(): InteractionSession | null {
    return this.session ? structuredClone(this.session) : null;
  }

  setProvider(provider: DialogueProvider): void {
    this.activeReplyController?.abort();
    this.options.provider = provider;
  }

  async startUserSession(): Promise<void> {
    if (this.disposed) return;
    this.cancelInitiation();
    if (this.session) {
      this.session.origin = "user";
      this.session.expiresAt = null;
      this.engage();
      this.emit();
      return;
    }
    if (this.options.getState().location !== "desktop") this.options.brain.setLocation("desktop");
    await this.openSession("user", "USER_REQUESTED_TALK");
  }

  async reply(text: string): Promise<void> {
    if (!this.session || this.session.waitingForResponse || this.session.current.endConversation || typeof text !== "string") return;
    const bounded = text.trim();
    if (!bounded || bounded.length > MAX_CUSTOM_REPLY_LENGTH || this.session.messages.length >= MAX_CONVERSATION_MESSAGES) return;
    this.engage();
    this.options.brain.recordConversationReply();
    this.session.messages.push({ role: "user", text: bounded, at: this.now() });
    this.session.messages = this.session.messages.slice(-MAX_CONVERSATION_MESSAGES);
    this.session.waitingForResponse = true;
    this.emit();
    await this.generateReply("USER_REQUESTED_TALK");
  }

  engage(): void {
    if (!this.session) return;
    this.engaged = true;
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = undefined;
    if (this.session.expiresAt !== null) {
      this.session.expiresAt = null;
      this.emit();
    }
  }

  dismiss(): void {
    if (!this.session) return;
    if (this.session.origin === "creature" && !this.engaged) this.ignoredStreak += 1;
    else if (this.session.origin === "user" || this.engaged) this.ignoredStreak = 0;
    this.closeSession();
    this.scheduleLongQuiet((30 + this.random() * 30 + Math.min(this.ignoredStreak, 5) * 8) * 60_000);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelInitiation();
    if (this.longQuietTimer) clearTimeout(this.longQuietTimer);
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.longQuietTimer = undefined;
    this.sessionTimer = undefined;
    if (this.session) this.closeSession();
  }

  private queueInitiation(trigger: InteractionTrigger): void {
    if (this.session || this.disposed) return;
    const state = this.options.getState();
    if (!state.preferences.interactionsEnabled || state.preferences.quietMode || state.preferences.paused || state.location !== "desktop") return;
    if (!this.userPresent || this.userBusy) {
      this.pendingTrigger = trigger;
      this.scheduleLongQuiet(5 * 60_000);
      return;
    }
    this.pendingTrigger = trigger;
    this.scheduleInitiation();
  }

  private scheduleInitiation(): void {
    if (this.initiationTimer) clearTimeout(this.initiationTimer);
    this.initiationTimer = undefined;
    if (!this.pendingTrigger || this.disposed) return;
    const state = this.options.getState();
    if (!state.preferences.interactionsEnabled || state.preferences.quietMode || state.preferences.paused || state.location !== "desktop" || this.session) {
      this.pendingTrigger = null;
      return;
    }
    if (!this.userPresent || this.userBusy) return;
    const eligibleAt = nextAllowedInitiationAt({
      state,
      now: this.now(),
      notBefore: this.notBefore,
      ignoredStreak: this.ignoredStreak
    });
    this.initiationTimer = setTimeout(() => {
      this.initiationTimer = undefined;
      const trigger = this.pendingTrigger;
      this.pendingTrigger = null;
      const currentState = this.options.getState();
      if (!trigger || !shouldInitiateInteraction({
        state: currentState,
        trigger,
        hasActiveSession: this.session !== null,
        now: this.now(),
        notBefore: this.notBefore,
        ignoredStreak: this.ignoredStreak,
        userPresent: this.userPresent && !this.userBusy
      })) {
        if (trigger && currentState.preferences.interactionsEnabled && !currentState.preferences.quietMode && !currentState.preferences.paused && currentState.location === "desktop") {
          this.pendingTrigger = trigger;
          this.scheduleInitiation();
        }
        return;
      }
      void this.openSession("creature", trigger).catch((error: unknown) => {
        this.options.reportFailure?.(error);
      });
    }, Math.max(0, eligibleAt - this.now()));
  }

  private scheduleLongQuiet(delay: number): void {
    if (this.longQuietTimer) clearTimeout(this.longQuietTimer);
    this.longQuietTimer = setTimeout(() => {
      this.longQuietTimer = undefined;
      this.queueInitiation("LONG_QUIET_PERIOD");
    }, delay);
  }

  private async openSession(origin: "creature" | "user", trigger: InteractionTrigger, forceForQA = false): Promise<void> {
    if (this.session || this.disposed) return;
    if (origin === "creature") {
      const currentState = this.options.getState();
      const allowed = currentState.preferences.interactionsEnabled && !currentState.preferences.quietMode
        && !currentState.preferences.paused && currentState.location === "desktop" && this.userPresent && !this.userBusy
        && (forceForQA || shouldInitiateInteraction({
        state: currentState,
        trigger,
        hasActiveSession: false,
        now: this.now(),
        notBefore: this.notBefore,
        ignoredStreak: this.ignoredStreak,
        userPresent: this.userPresent && !this.userBusy
      }));
      if (!allowed) return;
      if (!forceForQA) this.notBefore = this.now() + nextCreatureSpeechDelayMs(this.ignoredStreak, this.random, currentState);
      if (this.longQuietTimer) clearTimeout(this.longQuietTimer);
      this.longQuietTimer = undefined;
    }
    this.engaged = false;
    this.session = {
      id: this.createId(),
      origin,
      createdAt: this.now(),
      expiresAt: origin === "creature" ? this.now() + AUTONOMOUS_BUBBLE_TIMEOUT_MS : null,
      messages: [],
      current: initialUtterance,
      waitingForResponse: true
    };
    this.options.brain.setConversationActive(true);
    if (origin === "creature") this.scheduleSessionTimeout(AUTONOMOUS_BUBBLE_TIMEOUT_MS);
    this.emit();
    await this.generateReply(trigger);
  }

  private async generateReply(trigger: InteractionTrigger): Promise<void> {
    const session = this.session;
    if (!session) return;
    const request = buildRequest(trigger, this.options.getState(), session.messages);
    this.activeReplyController?.abort();
    const replyController = new AbortController();
    this.activeReplyController = replyController;
    let utterance: CreatureUtterance;
    try {
      utterance = validateUtterance(await this.options.provider.respond(request, replyController.signal));
    } catch (error) {
      if (replyController.signal.aborted) return;
      this.options.reportFailure?.(error);
      try {
        utterance = await this.localProvider.respond(request, replyController.signal);
      } catch (fallbackError) {
        if (replyController.signal.aborted) return;
        this.options.reportFailure?.(fallbackError);
        if (this.session?.id === session.id) this.closeSession();
        throw fallbackError;
      }
    } finally {
      if (this.activeReplyController === replyController) this.activeReplyController = undefined;
    }
    if (this.session?.id !== session.id || replyController.signal.aborted) return;
    session.current = utterance;
    session.waitingForResponse = false;
    session.messages.push({ role: "creature", text: utterance.text, at: this.now() });
    session.messages = session.messages.slice(-MAX_CONVERSATION_MESSAGES);
    this.options.brain.recordCreatureConversation();
    if (utterance.endConversation || session.messages.length >= MAX_CONVERSATION_MESSAGES) {
      session.expiresAt = this.now() + SESSION_FINISH_TIMEOUT_MS;
      this.scheduleSessionTimeout(SESSION_FINISH_TIMEOUT_MS);
    }
    this.emit();
  }

  private scheduleSessionTimeout(delay: number): void {
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = setTimeout(() => {
      this.sessionTimer = undefined;
      if (this.session) this.dismiss();
    }, delay);
  }

  private closeSession(): void {
    this.activeReplyController?.abort();
    this.activeReplyController = undefined;
    if (this.sessionTimer) clearTimeout(this.sessionTimer);
    this.sessionTimer = undefined;
    this.session = null;
    this.engaged = false;
    this.options.brain.setConversationActive(false);
    this.emit();
  }

  private cancelInitiation(): void {
    if (this.initiationTimer) clearTimeout(this.initiationTimer);
    this.initiationTimer = undefined;
    this.pendingTrigger = null;
  }

  private emit(): void {
    this.options.onSession(this.getSession());
  }
}

function buildRequest(trigger: InteractionTrigger, state: CreatureState, messages: ConversationMessage[]): DialogueRequest {
  return {
    trigger,
    context: {
      mood: state.mood,
      energy: state.energy,
      currentActivity: state.currentActivity,
      location: state.location,
      personality: {
        curiosity: state.personality.curiosity,
        creativity: state.personality.creativity,
        independence: state.personality.independence,
        sociability: state.personality.sociability
      }
    },
    messages: messages.slice(-MAX_CONVERSATION_MESSAGES)
  };
}
