import { useEffect, useRef } from "react";

import { buildThreadDays } from "~/lib/conversation-format";
import { cn } from "~/lib/utils";
import type { ConversationMessage, InternalNote } from "~/types/api";

import { MessageBubble } from "./message-bubble";
import { ThreadNote } from "./thread-note";

/**
 * Column 3 body — the message stream.
 *
 * Messages and notes are separate entities but share one chronological column,
 * so they are merged into a single ordered list here (buildThreadDays) rather
 * than rendered as two passes.
 *
 * `role="log"` + `aria-live="polite"` so a screen reader announces an arriving
 * message without stealing focus from the composer mid-sentence.
 */
export function ConversationThread({
  conversationId,
  messages,
  notes,
  className,
}: {
  conversationId: string;
  messages: ConversationMessage[];
  notes: InternalNote[];
  className?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Jump (not smooth-scroll) to the bottom when the thread changes: an
  // animation on switching conversations reads as the page still loading.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [conversationId]);

  /**
   * Follow new messages only when the agent is already at the bottom.
   *
   * Yanking someone back down while they are scrolled up reading history is
   * the single most irritating bug in a chat UI, and it fires exactly when
   * they are busiest.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, notes.length]);

  // `now` is read once per render, not ticked: day separators change at
  // midnight, and re-rendering the whole stream every minute to catch that is
  // a bad trade.
  const days = buildThreadDays(messages, notes, Date.now());

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-label="Message thread"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)}
    >
      {days.length === 0 ? (
        <p className="py-8 text-center text-caption text-muted-foreground">
          No messages in this conversation yet.
        </p>
      ) : (
        days.map((day) => (
          <section key={day.key} className="flex flex-col gap-3 pb-3">
            <div className="flex items-center justify-center py-1">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-micro font-medium text-muted-foreground">
                {day.label}
              </span>
            </div>

            {day.items.map((item) =>
              item.kind === "message" ? (
                <MessageBubble key={item.message.id} message={item.message} />
              ) : (
                <ThreadNote key={item.note.id} note={item.note} />
              ),
            )}
          </section>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
