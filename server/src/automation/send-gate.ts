
export type OncePerContact = 'ever' | 'perDay' | 'never';

export interface AutomationSettings {
    oncePerContact: OncePerContact;
    maxMessagesPerContactPerDay: number;
    maxConsecutiveFailures: number;
    muteHoursAfterFailures: number;
}

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
    oncePerContact: 'ever',
    maxMessagesPerContactPerDay: 3,
    maxConsecutiveFailures: 3,
    muteHoursAfterFailures: 24,
};

/** Old drafts only hold { oncePerContact }; fill the rest so nothing needs a migration. */
export function resolveSettings(storedSettings: unknown): AutomationSettings {
    const isPlainObject = !!storedSettings && typeof storedSettings === 'object' && !Array.isArray(storedSettings);
    const settingsOverrides = (isPlainObject ? storedSettings : {}) as Partial<AutomationSettings>;
    return { ...DEFAULT_AUTOMATION_SETTINGS, ...settingsOverrides };
}

export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60_000;
export const DM_WINDOW_MS = 24 * 60 * 60_000;

export type SendKind = 'private_reply' | 'dm'
export type SendGateSkip = 'opted_out' | 'muted' | 'outside_window' | 'too_many_failures' | 'daily_cap'

export interface SendGateInput {
    contact: {
        optedOutAt: Date | null;
        mutedUntil: Date | null;
        lastInboundMessageAt: Date | null;
        consecutiveFailures: number;
    };
    settings: AutomationSettings;
    kind: SendKind;
    /** Private reply: the comment's own timestamp (not contact.lastCommentAt). */
    anchorAt: Date | null
    /** contact_daily_stats.sent_count for today; 0 when no row. */
    dailySent: number;
    now: Date;
}

export type SendGateResult = { ok: true } | { ok: false; reason: SendGateSkip }

/**
 * Pure. Locked order; the first "no" wins. Never writes: markFailed is what
 * mutes. Once-per-contact is NOT here; it is decided under a row lock in
 * TriggerMatcherService.createRunsForEvent.
 */
export function evaluateSendGate(input: SendGateInput): SendGateResult {
    const { contact, settings, kind, anchorAt, dailySent } = input;
    const nowMs = input.now.getTime();

    if (contact.optedOutAt) return { ok: false, reason: 'opted_out' };

    const isMuted = contact.mutedUntil !== null && contact.mutedUntil.getTime() > nowMs;
    if (isMuted) return { ok: false, reason: 'muted' };

    const isPrivateReply = kind === 'private_reply';
    const windowStart = isPrivateReply ? anchorAt : contact.lastInboundMessageAt;
    const windowLengthMs = isPrivateReply ? PRIVATE_REPLY_WINDOW_MS : DM_WINDOW_MS;
    const isWindowOpen = windowStart !== null && nowMs - windowStart.getTime() <= windowLengthMs;
    if (!isWindowOpen) return { ok: false, reason: 'outside_window' };

    if (contact.consecutiveFailures >= settings.maxConsecutiveFailures) {
        return { ok: false, reason: 'too_many_failures' };
    }

    if (dailySent >= settings.maxMessagesPerContactPerDay) return { ok: false, reason: 'daily_cap' };

    return { ok: true };
}