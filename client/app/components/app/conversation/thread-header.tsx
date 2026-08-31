import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  PanelRight,
  RotateCcw,
  UserPlus,
} from "lucide-react";

import { ChannelBadge } from "~/components/app/channel-badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";
import type { Assignee, ConversationDetail } from "~/types/api";

import { ConversationAvatar } from "./conversation-avatar";
import { SessionWindowPill } from "./session-window-pill";

/**
 * Snooze presets.
 *
 * Fixed options rather than a date picker: no date-picker primitive exists in
 * the design system, and in practice an agent snoozes to "after lunch" or "next
 * week", not to a specific minute. Offsets are computed at click time, not at
 * module load, so "Tomorrow 9am" is right regardless of how long the tab sat open.
 */
const SNOOZE_PRESETS: { label: string; resolve: () => Date }[] = [
  {
    label: "1 hour",
    resolve: () => new Date(Date.now() + 60 * 60_000),
  },
  {
    label: "3 hours",
    resolve: () => new Date(Date.now() + 3 * 60 * 60_000),
  },
  {
    label: "Tomorrow 9am",
    resolve: () => {
      const date = new Date();
      date.setDate(date.getDate() + 1);
      date.setHours(9, 0, 0, 0);
      return date;
    },
  },
  {
    label: "Next Monday",
    resolve: () => {
      const date = new Date();
      // getDay(): 0 = Sunday. Always lands on the NEXT Monday, never today.
      const daysUntilMonday = ((8 - date.getDay()) % 7) || 7;
      date.setDate(date.getDate() + daysUntilMonday);
      date.setHours(9, 0, 0, 0);
      return date;
    },
  },
];

/** Column 3 header — identity, session state, and the status actions. */
export function ThreadHeader({
  conversation,
  assignees,
  isPanelOpen,
  onTogglePanel,
  onBack,
  onAssign,
  onSnooze,
  onResolve,
  onReopen,
  isMutating,
}: {
  conversation: ConversationDetail;
  assignees: Assignee[];
  isPanelOpen: boolean;
  onTogglePanel: () => void;
  onBack: () => void;
  onAssign: (assigneeId: string | null) => void;
  onSnooze: (until: string, label: string) => void;
  onResolve: () => void;
  onReopen: () => void;
  isMutating: boolean;
}) {
  const { customer, assignee, channel, sessionWindow, status } = conversation;
  const isResolved = status === "RESOLVED";

  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {/* Mobile only — the list and the thread share one column below md. */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onBack}
          aria-label="Back to conversations"
          className="md:hidden"
        >
          <ArrowLeft className="size-4" />
        </Button>

        <ConversationAvatar name={customer.name} avatarUrl={customer.avatarUrl} />

        <div className="min-w-0">
          <p className="truncate text-body font-semibold text-foreground">
            {customer.name}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-micro text-muted-foreground">
            <ChannelBadge platform={channel} size={11} />
            {customer.phone && <span>{customer.phone}</span>}
            <SessionWindowPill expiresAt={sessionWindow?.expiresAt} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {/*
          Ghost, not outline. Resolve is the only action on this header that
          should read as a button; the rest are state the agent glances at.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isMutating}>
              {assignee ? (
                <ConversationAvatar
                  name={assignee.name}
                  avatarUrl={assignee.avatarUrl}
                  size="sm"
                />
              ) : (
                <UserPlus className="size-3.5 text-muted-foreground" />
              )}
              <span className="hidden lg:inline">
                {assignee?.name ?? "Unassigned"}
              </span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={assignee?.id ?? "none"}
              onValueChange={(value) => onAssign(value === "none" ? null : value)}
            >
              <DropdownMenuRadioItem value="none">Unassigned</DropdownMenuRadioItem>
              {assignees.map((agent) => (
                <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                  {agent.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {!isResolved && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={isMutating}
                aria-label="Snooze conversation"
                title="Snooze"
              >
                <Clock className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {SNOOZE_PRESETS.map((preset) => (
                <DropdownMenuItem
                  key={preset.label}
                  onSelect={() =>
                    onSnooze(preset.resolve().toISOString(), preset.label)
                  }
                >
                  {preset.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {isResolved ? (
          <Button variant="ghost" size="sm" onClick={onReopen} disabled={isMutating}>
            <RotateCcw className="size-3.5" />
            Reopen
          </Button>
        ) : (
          <Button variant="accent" size="sm" onClick={onResolve} disabled={isMutating}>
            <Check className="size-3.5" />
            Resolve
          </Button>
        )}

        {/*
          Hidden below lg: there the panel has no room to become a column, so
          the control would be inert. A dead toggle reads as a bug.
        */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onTogglePanel}
          aria-pressed={isPanelOpen}
          aria-label={isPanelOpen ? "Hide customer details" : "Show customer details"}
          title={isPanelOpen ? "Hide details" : "Show details"}
          className={cn("hidden lg:inline-flex", isPanelOpen && "bg-muted")}
        >
          <PanelRight className="size-4" />
        </Button>
      </div>
    </header>
  );
}
