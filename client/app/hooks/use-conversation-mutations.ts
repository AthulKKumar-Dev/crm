import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { conversationKeys } from "~/hooks/use-conversation-queries";
import { handleMutationError } from "~/lib/handle-mutation-error";
import { MOCK_ME } from "~/lib/mock/conversation-store";
import { conversationService } from "~/services/conversation.service";
import type {
  Conversation,
  ConversationDetail,
  ConversationMessage,
  InternalNote,
  MessageProduct,
  PaginatedResponse,
} from "~/types/api";

/**
 * Patch every cached list that contains this conversation.
 *
 * `setQueriesData` and not `setQueryData`: the list key includes the params
 * object, so several entries are live at once (one per folder / tag / search
 * the user has touched this session). Patching only the exact active key leaves
 * stale rows sitting behind every other folder, which surfaces the moment they
 * click back.
 *
 * Structural changes — a row that should now leave INBOX — are deliberately NOT
 * handled here. Folder membership is server-derived; recomputing it client-side
 * would fork the rule. `onSettled` invalidates, and at ~380ms of latency the row
 * leaves a beat later, which reads as the write landing rather than as a glitch.
 */
function patchListRows(
  queryClient: QueryClient,
  id: string,
  patch: (row: Conversation) => Conversation,
): void {
  queryClient.setQueriesData<PaginatedResponse<Conversation>>(
    { queryKey: [...conversationKeys.all, "list"] },
    (previous) =>
      previous
        ? {
            ...previous,
            data: previous.data.map((row) => (row.id === id ? patch(row) : row)),
          }
        : previous,
  );
}

/** Patch the open thread, if it happens to be the one being mutated. */
function patchDetail(
  queryClient: QueryClient,
  id: string,
  patch: (detail: ConversationDetail) => ConversationDetail,
): void {
  queryClient.setQueryData<ConversationDetail>(conversationKeys.detail(id), (previous) =>
    previous ? patch(previous) : previous,
  );
}

/** Snapshot both caches so `onError` can put everything back. */
function snapshot(queryClient: QueryClient, id: string) {
  return {
    detail: queryClient.getQueryData<ConversationDetail>(conversationKeys.detail(id)),
    lists: queryClient.getQueriesData<PaginatedResponse<Conversation>>({
      queryKey: [...conversationKeys.all, "list"],
    }),
  };
}

type Snapshot = ReturnType<typeof snapshot>;

function restore(queryClient: QueryClient, id: string, context?: Snapshot): void {
  if (!context) return;
  if (context.detail) {
    queryClient.setQueryData(conversationKeys.detail(id), context.detail);
  }
  for (const [key, data] of context.lists) {
    queryClient.setQueryData(key, data);
  }
}

/** Everything a write can affect: the row, the thread, and the rail counts. */
function invalidateAll(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: conversationKeys.all });
}

// ── Assignment ───────────────────────────────────────────────────────────────

/** PATCH /conversations/:id/assignee — `assigneeId: null` unassigns. */
export function useAssignConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) =>
      conversationService.assign(id, { assigneeId }),

    onMutate: async ({ id, assigneeId }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const context = snapshot(queryClient, id);

      // Resolve the name from the cached roster so the row updates instantly
      // rather than flashing the id or going blank for a round-trip.
      const roster =
        queryClient.getQueryData<{ id: string; name: string; avatarUrl: string | null }[]>(
          conversationKeys.assignees(),
        ) ?? [];
      const assignee = assigneeId ? roster.find((a) => a.id === assigneeId) ?? null : null;

      patchListRows(queryClient, id, (row) => ({ ...row, assignee }));
      patchDetail(queryClient, id, (detail) => ({ ...detail, assignee }));

      return context;
    },

    onError: (error, { id }, context) => {
      restore(queryClient, id, context);
      handleMutationError(error, "Failed to assign this conversation.");
    },

    onSuccess: (conversation) => {
      toast.success(
        conversation.assignee
          ? `Assigned to ${conversation.assignee.name}.`
          : "Conversation unassigned.",
      );
    },

    onSettled: () => invalidateAll(queryClient),
  });
}

// ── Status ───────────────────────────────────────────────────────────────────

/**
 * POST /conversations/:id/resolve
 *
 * The caller is expected to advance the selection in its own per-call
 * `onSuccess`: a resolved conversation leaves INBOX, and leaving `?c=` pointing
 * at a filtered-out row shows an empty thread column. The hook cannot do this
 * itself — only the route knows the current list order.
 */
export function useResolveConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationService.resolve(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const context = snapshot(queryClient, id);
      patchDetail(queryClient, id, (detail) => ({ ...detail, status: "RESOLVED" }));
      return context;
    },

    onError: (error, id, context) => {
      restore(queryClient, id, context);
      handleMutationError(error, "Failed to resolve this conversation.");
    },

    onSuccess: () => toast.success("Conversation resolved."),
    onSettled: () => invalidateAll(queryClient),
  });
}

/** POST /conversations/:id/reopen — back to OPEN from resolved or snoozed. */
export function useReopenConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationService.reopen(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const context = snapshot(queryClient, id);
      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        status: "OPEN",
        snoozedUntil: null,
      }));
      return context;
    },

    onError: (error, id, context) => {
      restore(queryClient, id, context);
      handleMutationError(error, "Failed to reopen this conversation.");
    },

    onSuccess: () => toast.success("Conversation reopened."),
    onSettled: () => invalidateAll(queryClient),
  });
}

/** POST /conversations/:id/snooze */
export function useSnoozeConversationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, until }: { id: string; until: string; label?: string }) =>
      conversationService.snooze(id, { until }),

    onMutate: async ({ id, until }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const context = snapshot(queryClient, id);
      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        status: "SNOOZED",
        snoozedUntil: until,
      }));
      return context;
    },

    onError: (error, { id }, context) => {
      restore(queryClient, id, context);
      handleMutationError(error, "Failed to snooze this conversation.");
    },

    onSuccess: (_data, { label }) =>
      toast.success(label ? `Snoozed until ${label}.` : "Conversation snoozed."),

    onSettled: () => invalidateAll(queryClient),
  });
}

// ── Tags ─────────────────────────────────────────────────────────────────────

/**
 * PATCH /conversations/:id/tags — sends the whole array, not a delta.
 *
 * Same convention as the customer TagsSection: a whole-array write is
 * idempotent and cannot half-apply, which matters when two agents edit the same
 * conversation's tags within a second of each other.
 */
export function useUpdateConversationTagsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, tagIds }: { id: string; tagIds: string[] }) =>
      conversationService.updateTags(id, { tagIds }),

    onMutate: async ({ id, tagIds }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.all });
      const context = snapshot(queryClient, id);

      const catalogue =
        queryClient.getQueryData<ConversationDetail["tags"]>(conversationKeys.tags()) ?? [];
      const tags = tagIds
        .map((tagId) => catalogue.find((t) => t.id === tagId))
        .filter((t): t is ConversationDetail["tags"][number] => Boolean(t));

      patchListRows(queryClient, id, (row) => ({ ...row, tags }));
      patchDetail(queryClient, id, (detail) => ({ ...detail, tags }));

      return context;
    },

    onError: (error, { id }, context) => {
      restore(queryClient, id, context);
      handleMutationError(error, "Failed to update tags.");
    },

    onSettled: () => invalidateAll(queryClient),
  });
}

// ── Messages ─────────────────────────────────────────────────────────────────

let clientIdCounter = 0;

/** Correlation id for an optimistic bubble. Echoed back by the API. */
export function nextClientId(): string {
  clientIdCounter += 1;
  return `local-${clientIdCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * POST /conversations/:id/messages
 *
 * The optimistic bubble uses `clientId` as its temporary `id`, so `onSuccess`
 * can swap in the server record by matching `clientId` rather than appending a
 * second copy.
 *
 * On failure the bubble is flipped to FAILED and LEFT IN PLACE. Removing it
 * would make the agent's typed text vanish, which reads as data loss — the one
 * thing a messaging UI must never do.
 */
export function useSendMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
      clientId,
      products,
    }: {
      id: string;
      body: string;
      clientId: string;
      products?: MessageProduct[];
    }) =>
      conversationService.send(id, {
        body,
        clientId,
        products,
        // A message carrying products is a catalogue share even when the agent
        // also typed something alongside it.
        kind: products?.length ? "CATALOG" : "TEXT",
      }),

    onMutate: async ({ id, body, clientId, products }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) });
      const context = snapshot(queryClient, id);

      const optimistic: ConversationMessage = {
        id: clientId,
        conversationId: id,
        clientId,
        direction: "OUTBOUND",
        kind: products?.length ? "CATALOG" : "TEXT",
        body,
        attachments: [],
        products: products ?? [],
        status: "QUEUED",
        author: MOCK_ME,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        failureReason: null,
      };

      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        messages: [...detail.messages, optimistic],
      }));

      patchListRows(queryClient, id, (row) => ({
        ...row,
        lastMessage: {
          preview: body,
          direction: "OUTBOUND",
          createdAt: optimistic.createdAt,
        },
      }));

      return context;
    },

    onError: (error, { id, clientId }, _context) => {
      // Note: no `restore()` here. Rolling back would delete the bubble.
      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        messages: detail.messages.map((m) =>
          m.clientId === clientId
            ? { ...m, status: "FAILED", failureReason: "Send failed" }
            : m,
        ),
      }));
      handleMutationError(error, "Failed to send this message.");
    },

    onSuccess: (message, { id, clientId }) => {
      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        messages: detail.messages.map((m) => (m.clientId === clientId ? message : m)),
      }));
    },

    onSettled: () => invalidateAll(queryClient),
  });
}

// ── Notes ────────────────────────────────────────────────────────────────────

/**
 * POST /conversations/:id/notes
 *
 * A note never touches `lastMessage`: it is not what the customer said, and
 * surfacing internal team chatter as the list preview would leak it into a row
 * that represents the customer's own thread.
 */
export function useAddNoteMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      conversationService.addNote(id, { body }),

    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: conversationKeys.detail(id) });
      const context = snapshot(queryClient, id);

      const optimistic: InternalNote = {
        id: nextClientId(),
        conversationId: id,
        body,
        author: MOCK_ME,
        createdAt: new Date().toISOString(),
      };

      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        notes: [...detail.notes, optimistic],
      }));

      return { ...context, optimisticId: optimistic.id };
    },

    onError: (error, { id }, context) => {
      restore(queryClient, id, context);
      handleMutationError(error, "Failed to save this note.");
    },

    onSuccess: (note, { id }, context) => {
      patchDetail(queryClient, id, (detail) => ({
        ...detail,
        notes: detail.notes.map((n) => (n.id === context?.optimisticId ? note : n)),
      }));
      toast.success("Note added — only your team can see it.");
    },

    onSettled: () => invalidateAll(queryClient),
  });
}

// ── Read state ───────────────────────────────────────────────────────────────

/**
 * POST /conversations/:id/read
 *
 * No toast: marking read is a side effect of looking at something, not an
 * action the agent took. Invalidates the summary so the rail's unread counts
 * follow, but does not invalidate the detail — the thread is already open and
 * refetching it would scroll-jump.
 */
export function useMarkConversationReadMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => conversationService.markRead(id),

    onMutate: async (id) => {
      patchListRows(queryClient, id, (row) => ({ ...row, unreadCount: 0 }));
      patchDetail(queryClient, id, (detail) => ({ ...detail, unreadCount: 0 }));
    },

    // Deliberately quiet on failure. An unread badge that stays put is a
    // cosmetic miss; a red toast for it would be noise the agent cannot act on.
    onError: () => {},

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.summary() });
    },
  });
}
