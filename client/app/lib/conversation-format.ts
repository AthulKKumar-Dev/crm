/**
 * Display formatting for the inbox.
 *
 * Pure, and every function that needs the current time takes it as an argument
 * — same rule as lib/session-window.ts, for the same reason.
 */

import type {
  ConversationFolder,
  ConversationMessage,
  ConversationTag,
  InternalNote,
  MessageStatus,
} from "~/types/api";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * List-row timestamp: "now" · "14m" · "3h" · "Yesterday" · "12 Aug".
 *
 * Deliberately terse — the column is ~40px and a row already carries a name,
 * a preview, tags and an assignee competing for the same glance.
 */
export function formatRowTime(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const diff = now - then;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (isYesterday(then, now)) return "Yesterday";

  return new Date(then).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

/** Bubble timestamp — always a clock time, since the day separator carries the date. */
export function formatBubbleTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Day-separator label: "Today" · "Yesterday" · "Tue, 12 Aug". */
export function formatDaySeparator(iso: string, now: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  if (isSameDay(then, now)) return "Today";
  if (isYesterday(then, now)) return "Yesterday";
  return new Date(then).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Stable YYYY-MM-DD key for grouping a thread into days, in local time. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "invalid";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function isYesterday(then: number, now: number): boolean {
  return isSameDay(then, now - DAY);
}

/** Delivery-receipt wording under an outbound bubble. */
export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  QUEUED: "Sending…",
  SENT: "Sent",
  DELIVERED: "Delivered",
  READ: "Read",
  FAILED: "Failed to send",
};

export const FOLDER_LABEL: Record<ConversationFolder, string> = {
  INBOX: "Inbox",
  UNASSIGNED: "Unassigned",
  MINE: "Assigned to me",
  SNOOZED: "Snoozed",
  RESOLVED: "Resolved",
};

/**
 * Tag tone → token classes.
 *
 * The one place a tag's colour is decided. The API sends a tone, never a hex —
 * see the ConversationTag docblock. `brand/30` matches the PAID pill in
 * lib/order-status.ts so a "VIP" chip and a "Paid" badge sit at the same weight.
 */
export const TAG_TONE_CLASSES: Record<ConversationTag["tone"], string> = {
  brand: "bg-brand/30 text-brand-strong",
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  neutral: "bg-muted text-muted-foreground",
};

/** Two-letter initials for an avatar fallback. Falls back to "?" for an empty name. */
export function getInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("");
  return letters.slice(0, 2).toUpperCase() || "?";
}

/**
 * One item in the rendered thread.
 *
 * Messages and notes are separate entities (see the InternalNote docblock) but
 * share one chronological column, so the render pass needs a discriminated
 * union rather than two interleaved lists.
 */
export type ThreadItem =
  | { kind: "message"; at: string; message: ConversationMessage }
  | { kind: "note"; at: string; note: InternalNote };

/** One rendered day, with its items already in order. */
export interface ThreadDay {
  key: string;
  label: string;
  items: ThreadItem[];
}

/**
 * Merge messages and notes into day-grouped, chronologically ordered items.
 *
 * Ties break messages-before-notes: a note is almost always written *about* the
 * message that prompted it, so on an identical timestamp that order reads right.
 */
export function buildThreadDays(
  messages: ConversationMessage[],
  notes: InternalNote[],
  now: number,
): ThreadDay[] {
  const items: ThreadItem[] = [
    ...messages.map((message): ThreadItem => ({
      kind: "message",
      at: message.createdAt,
      message,
    })),
    ...notes.map((note): ThreadItem => ({ kind: "note", at: note.createdAt, note })),
  ];

  items.sort((a, b) => {
    const delta = new Date(a.at).getTime() - new Date(b.at).getTime();
    if (delta !== 0) return delta;
    if (a.kind === b.kind) return 0;
    return a.kind === "message" ? -1 : 1;
  });

  const days: ThreadDay[] = [];
  for (const item of items) {
    const key = dayKey(item.at);
    const last = days[days.length - 1];
    if (last?.key === key) {
      last.items.push(item);
    } else {
      days.push({ key, label: formatDaySeparator(item.at, now), items: [item] });
    }
  }
  return days;
}
