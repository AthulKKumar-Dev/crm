import { ChevronDown, Search, X } from "lucide-react";

import { QueryErrorState } from "~/components/app/query-error-state";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { useNow } from "~/hooks/use-now";
import { TAG_TONE_CLASSES } from "~/lib/conversation-format";
import { cn } from "~/lib/utils";
import type {
  Conversation,
  ConversationFolder,
  ConversationInboxSummary,
  ConversationSort,
} from "~/types/api";

import { ConversationFilterMenu } from "./conversation-filter-menu";
import { ConversationListRow } from "./conversation-list-row";
import { ConversationListSkeleton } from "./conversation-skeletons";

const SORT_LABEL: Record<ConversationSort, string> = {
  NEWEST: "Newest",
  OLDEST: "Oldest",
  UNREAD_FIRST: "Unread first",
};

/**
 * Column 1 — search, filter, sort, and the conversation rows.
 *
 * `isPlaceholderData` dims the list instead of swapping it for a skeleton.
 * With `keepPreviousData` the previous folder's rows stay mounted during a
 * refetch, so a skeleton here would throw away the very continuity that
 * setting exists to buy.
 */
export function ConversationList({
  conversations,
  summary,
  folder,
  tagId,
  search,
  sort,
  selectedId,
  isLoading,
  isPlaceholder,
  isError,
  onRetry,
  onSearchChange,
  onSortChange,
  onFolderChange,
  onTagChange,
  onSelect,
  className,
}: {
  conversations: Conversation[];
  summary?: ConversationInboxSummary;
  folder: ConversationFolder;
  tagId: string | null;
  search: string;
  sort: ConversationSort;
  selectedId: string | null;
  isLoading: boolean;
  isPlaceholder: boolean;
  isError: boolean;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (sort: ConversationSort) => void;
  onFolderChange: (folder: ConversationFolder) => void;
  onTagChange: (tagId: string | null) => void;
  onSelect: (id: string) => void;
  className?: string;
}) {
  // Owned here, not passed down: every row must date-stamp against the same
  // instant, and the tick must not re-render the thread or the panel.
  const now = useNow(60_000);

  const activeTag = summary?.tags.find((tag) => tag.id === tagId);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="shrink-0 space-y-2.5 border-b px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, phone or order"
            aria-label="Search conversations"
            className="pl-8 text-caption"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <ConversationFilterMenu
            summary={summary}
            activeFolder={folder}
            activeTagId={tagId}
            onFolderChange={onFolderChange}
            onTagChange={onTagChange}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs" className="text-muted-foreground">
                {SORT_LABEL[sort]}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value) => onSortChange(value as ConversationSort)}
              >
                {(Object.keys(SORT_LABEL) as ConversationSort[]).map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {SORT_LABEL[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/*
          A folder is always set, so it lives in the trigger. A tag is the
          exception, and an exception needs a visible way out — hence a chip
          here rather than only a second line in the menu.
        */}
        {activeTag && (
          <button
            type="button"
            onClick={() => onTagChange(null)}
            className={cn(
              "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              TAG_TONE_CLASSES[activeTag.tone],
            )}
          >
            {activeTag.label}
            <X className="size-3" />
            <span className="sr-only">Clear tag filter</span>
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isError ? (
          <div className="p-4">
            <QueryErrorState resource="conversations" onRetry={onRetry} />
          </div>
        ) : isLoading ? (
          <ConversationListSkeleton />
        ) : conversations.length === 0 ? (
          <p className="p-6 text-center text-caption text-muted-foreground">
            {search
              ? `No conversations match “${search}”.`
              : "Nothing in this folder."}
          </p>
        ) : (
          <div
            className={cn(
              // A hairline, not a full-weight divider: enough rhythm to keep
              // sixteen rows from bleeding together, light enough that the
              // selected row's fill is still the loudest thing in the column.
              "flex flex-col divide-y divide-border/60 transition-opacity",
              isPlaceholder && "opacity-60",
            )}
          >
            {conversations.map((conversation) => (
              <ConversationListRow
                key={conversation.id}
                conversation={conversation}
                isSelected={conversation.id === selectedId}
                now={now}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
