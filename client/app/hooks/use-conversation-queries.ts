import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { conversationService } from "~/services/conversation.service";
import type { ConversationListParams } from "~/types/api";

/** React Query key factory for all conversation-related queries. */
export const conversationKeys = {
  all: ["conversations"] as const,
  summary: () => [...conversationKeys.all, "summary"] as const,
  list: (params?: ConversationListParams) =>
    [...conversationKeys.all, "list", params ?? {}] as const,
  detail: (id: string) => [...conversationKeys.all, "detail", id] as const,
  assignees: () => [...conversationKeys.all, "assignees"] as const,
  tags: () => [...conversationKeys.all, "tags"] as const,
};

/**
 * The filtered, sorted conversation list.
 *
 * `keepPreviousData` is not optional here. The params object is part of the key,
 * so every folder switch and every debounced keystroke is a *fresh* cache entry
 * — without it the list blanks to a skeleton on each one and the inbox strobes
 * while you type. No other list page in the app needs this because none of them
 * re-key on a filter this often.
 */
export function useConversations(params?: ConversationListParams) {
  return useQuery({
    queryKey: conversationKeys.list(params),
    queryFn: () => conversationService.list(params),
    placeholderData: keepPreviousData,
  });
}

/**
 * Folder and tag counts.
 *
 * Separate from the list on purpose: the rail must read "Inbox 12" while you
 * are looking at Unassigned. Counts derived from the list response would be
 * scoped to the active filter and every number would collapse to the row count.
 */
export function useConversationSummary() {
  return useQuery({
    queryKey: conversationKeys.summary(),
    queryFn: () => conversationService.summary(),
  });
}

/**
 * One conversation, with its messages, notes and commerce snapshot.
 *
 * Polls while any outbound message is still in flight, then stops by itself —
 * the same conditional-`refetchInterval` idiom as use-channel-queries.ts:21.
 * QUEUED and SENT are non-terminal: delivery and read receipts arrive after the
 * send responds (from Meta's webhooks in the real system), so without this a
 * bubble would sit on "Sent" until the user navigated away and back.
 */
export function useConversation(id?: string | null) {
  return useQuery({
    queryKey: conversationKeys.detail(id!),
    queryFn: () => conversationService.detail(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.messages.some(
        (m) =>
          m.direction === "OUTBOUND" &&
          (m.status === "QUEUED" || m.status === "SENT" || m.status === "DELIVERED"),
      )
        ? 1500
        : false,
  });
}

/** Agents a conversation can be assigned to. */
export function useConversationAssignees() {
  return useQuery({
    queryKey: conversationKeys.assignees(),
    queryFn: () => conversationService.assignees(),
    // The roster changes on team-membership edits, not during a shift.
    staleTime: 5 * 60_000,
  });
}

/** Every tag available to put on a conversation. */
export function useConversationTags() {
  return useQuery({
    queryKey: conversationKeys.tags(),
    queryFn: () => conversationService.tags(),
    staleTime: 5 * 60_000,
  });
}
