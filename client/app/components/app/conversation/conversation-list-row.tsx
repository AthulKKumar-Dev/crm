import { memo } from "react";

import { CHANNEL_ICON } from "~/components/app/channel-badge";
import { formatRowTime } from "~/lib/conversation-format";
import { cn } from "~/lib/utils";
import type { Conversation } from "~/types/api";

import { ConversationAvatar } from "./conversation-avatar";
import { ConversationTagChip } from "./conversation-tag-chip";

/**
 * One row in the conversation list.
 *
 * Memoised because the list re-renders on every keystroke in the search box and
 * on every optimistic patch to any sibling row; the rows that did not change
 * should not re-render with it.
 *
 * `now` is passed in rather than read here so all rows date-stamp against one
 * instant — otherwise two rows a millisecond apart can straddle a minute
 * boundary and read "1m" and "2m" for the same message.
 */
export const ConversationListRow = memo(function ConversationListRow({
  conversation,
  isSelected,
  now,
  onSelect,
}: {
  conversation: Conversation;
  isSelected: boolean;
  now: number;
  onSelect: (id: string) => void;
}) {
  const { customer, lastMessage, unreadCount, assignee, tags, channel } = conversation;

  // The channel's own mark, at badge size. ChannelBadge always renders a label
  // (falling back to "—"), which is right for the thread header but too wide
  // for a row already carrying a name, a preview, tags and an assignee.
  const ChannelIcon = CHANNEL_ICON[channel];

  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        // Flat fill for the selected row rather than an accent rule down the
        // side: at list density a coloured bar reads as a second, competing
        // divider between every pair of rows.
        "flex w-full items-start gap-3 px-3 py-3.5 text-left transition-colors",
        isSelected ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <div className="relative shrink-0">
        <ConversationAvatar name={customer.name} avatarUrl={customer.avatarUrl} />
        {ChannelIcon && (
          <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-card ring-1 ring-border">
            <ChannelIcon width={10} height={10} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-caption",
              unreadCount > 0 ? "font-semibold text-foreground" : "text-foreground",
            )}
          >
            {customer.name}
          </span>
          {lastMessage && (
            <span className="shrink-0 text-micro text-muted-foreground">
              {formatRowTime(lastMessage.createdAt, now)}
            </span>
          )}
        </div>

        <p
          className={cn(
            "mt-0.5 truncate text-caption",
            unreadCount > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {lastMessage?.preview ?? "No messages yet"}
        </p>

        {(tags.length > 0 || assignee) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {tags.map((tag) => (
              <ConversationTagChip key={tag.id} tag={tag} />
            ))}
            <span className="truncate text-micro text-muted-foreground">
              {assignee ? assignee.name : "Unassigned"}
            </span>
          </div>
        )}
      </div>

      {unreadCount > 0 && (
        <span
          className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-brand text-micro font-semibold text-brand-foreground"
          aria-label={`${unreadCount} unread`}
        >
          {unreadCount}
        </span>
      )}
    </button>
  );
});
