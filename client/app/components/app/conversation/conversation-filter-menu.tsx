import { Check, ChevronDown, Inbox, Clock, User, UserX } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { FOLDER_LABEL, TAG_TONE_CLASSES } from "~/lib/conversation-format";
import { cn } from "~/lib/utils";
import type { ConversationFolder, ConversationInboxSummary } from "~/types/api";

const FOLDER_ORDER: ConversationFolder[] = [
  "INBOX",
  "UNASSIGNED",
  "MINE",
  "SNOOZED",
  "RESOLVED",
];

const FOLDER_ICON: Record<ConversationFolder, typeof Inbox> = {
  INBOX: Inbox,
  UNASSIGNED: UserX,
  MINE: User,
  SNOOZED: Clock,
  RESOLVED: Check,
};

/**
 * The one filter control, replacing the folders rail.
 *
 * Folders and tags share a menu because they are the same kind of decision —
 * "narrow the list" — and a rail spent ~196px of permanent width on five links
 * that are read once and then ignored.
 *
 * Counts come from the summary endpoint, so they describe the whole inbox and
 * do not collapse to the visible row count while a filter is active.
 */
export function ConversationFilterMenu({
  summary,
  activeFolder,
  activeTagId,
  onFolderChange,
  onTagChange,
}: {
  summary?: ConversationInboxSummary;
  activeFolder: ConversationFolder;
  activeTagId: string | null;
  onFolderChange: (folder: ConversationFolder) => void;
  onTagChange: (tagId: string | null) => void;
}) {
  const activeCount =
    summary?.folders.find((f) => f.folder === activeFolder)?.count ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="-ml-1 gap-1.5 px-1.5">
          <span className="text-caption font-semibold text-foreground">
            {FOLDER_LABEL[activeFolder]}
          </span>
          {activeCount > 0 && (
            <span className="text-caption tabular-nums text-muted-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Folders</DropdownMenuLabel>
        {FOLDER_ORDER.map((folder) => {
          const Icon = FOLDER_ICON[folder];
          const isActive = folder === activeFolder;
          const count = summary?.folders.find((f) => f.folder === folder)?.count ?? 0;

          return (
            <DropdownMenuItem
              key={folder}
              onSelect={() => onFolderChange(folder)}
              className={cn(isActive && "bg-muted")}
            >
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="flex-1">{FOLDER_LABEL[folder]}</span>
              {count > 0 && (
                <span className="text-caption tabular-nums text-muted-foreground">
                  {count}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}

        {summary && summary.tags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Tags</DropdownMenuLabel>
            {summary.tags.map((tag) => {
              const isActive = tag.id === activeTagId;
              return (
                <DropdownMenuItem
                  key={tag.id}
                  // Re-picking the active tag clears it, so the menu is also
                  // the way out — not only the chip below the search box.
                  onSelect={() => onTagChange(isActive ? null : tag.id)}
                  className={cn(isActive && "bg-muted")}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      TAG_TONE_CLASSES[tag.tone],
                    )}
                  />
                  <span className="flex-1">{tag.label}</span>
                  {tag.count > 0 && (
                    <span className="text-caption tabular-nums text-muted-foreground">
                      {tag.count}
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
