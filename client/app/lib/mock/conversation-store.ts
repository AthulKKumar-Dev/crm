/**
 * In-memory stand-in for the conversations API.
 *
 * This is the ONLY module that knows the inbox is fake. `conversation.service.ts`
 * wraps it with the exact signatures the real endpoints will have, so everything
 * above the service — key factory, optimistic patches, invalidation, toasts —
 * is production code from day one and the swap is a one-file change.
 *
 * `ssr: false` (react-router.config.ts) is load-bearing: this module is
 * instantiated exactly once, in the browser, and survives every SPA navigation.
 * A hard refresh resets it to fixtures, which is correct for a preview.
 *
 * Deliberately NOT persisted to localStorage: persisted fixtures go stale
 * against the type contract mid-build and turn a shape change into a "why is my
 * browser broken" debugging session.
 */

import { AxiosError } from "axios";

import type {
  AddNoteRequest,
  AssignConversationRequest,
  Assignee,
  Conversation,
  ConversationDetail,
  ConversationFolder,
  ConversationInboxSummary,
  ConversationListParams,
  ConversationMessage,
  ConversationTag,
  InternalNote,
  MarkReadRequest,
  MarkReadResponse,
  PaginatedResponse,
  SendMessageRequest,
  SnoozeConversationRequest,
  UpdateConversationTagsRequest,
} from "~/types/api";

import {
  buildFixtures,
  MOCK_ASSIGNEES,
  MOCK_ME,
  MOCK_TAGS,
} from "./conversation-fixtures";

// ── Knobs ────────────────────────────────────────────────────────────────────

/**
 * Latency must be non-zero. With `Promise.resolve()`, `isPending` never paints,
 * so no spinner is ever exercised and a missing `disabled` on a submit button
 * stays invisible until it meets a real network.
 */
const LATENCY = { read: 220, write: 380 };

/**
 * Set to 1 to make every write fail, to exercise rollback and error toasts.
 * Values between 0 and 1 fail that fraction of writes.
 */
const MOCK_FAILURE_RATE = 0;

/** Delivery-receipt timings, so an agent can watch SENT → DELIVERED → READ. */
const RECEIPT_DELAY = { delivered: 1500, read: 4000 };

// ── Store ────────────────────────────────────────────────────────────────────

const db = {
  conversations: new Map<string, ConversationDetail>(),
  tags: [...MOCK_TAGS],
  assignees: [...MOCK_ASSIGNEES],
};

let seeded = false;
let sequence = 0;

function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}-${Math.random().toString(36).slice(2, 8)}`;
}

function seed(): void {
  if (seeded) return;
  for (const conversation of buildFixtures()) {
    db.conversations.set(conversation.id, finalize(conversation));
  }
  seeded = true;
}

// ── Derivation ───────────────────────────────────────────────────────────────

/**
 * Folder membership, derived — never stored.
 *
 * The server owns these rules in the real API; deriving them in one place here
 * keeps seeded and runtime-created records consistent, and means assigning or
 * resolving a conversation cannot leave a stale folder behind.
 */
function deriveFolders(conversation: ConversationDetail): ConversationFolder[] {
  if (conversation.status === "RESOLVED") return ["RESOLVED"];
  if (conversation.status === "SNOOZED") return ["SNOOZED"];

  const folders: ConversationFolder[] = ["INBOX"];
  if (!conversation.assignee) folders.push("UNASSIGNED");
  else if (conversation.assignee.id === MOCK_ME.id) folders.push("MINE");
  return folders;
}

/** Recompute everything denormalised off the message list. */
function finalize(conversation: ConversationDetail): ConversationDetail {
  const last = conversation.messages[conversation.messages.length - 1] ?? null;
  return {
    ...conversation,
    folders: deriveFolders(conversation),
    lastMessage: last
      ? {
          preview: last.body,
          direction: last.direction,
          createdAt: last.createdAt,
        }
      : null,
  };
}

/** Strip a detail record down to the list projection. */
function toListItem(conversation: ConversationDetail): Conversation {
  const { messages: _m, notes: _n, insights: _i, ...rest } = conversation;
  return rest;
}

// ── Transport simulation ─────────────────────────────────────────────────────

/**
 * `structuredClone` is not decoration.
 *
 * Handing back the live object caches a reference INTO the store. A later
 * mutation then mutates the cached object in place: components do not re-render
 * (the reference is unchanged) and optimistic rollback restores an object that
 * has already been mutated. A real HTTP boundary gives a fresh object per
 * response for free; the mock has to fake that or every optimistic path is
 * subtly wrong.
 */
function respond<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(structuredClone(value)), ms);
  });
}

/**
 * A real AxiosError, not a plain Error.
 *
 * `handleMutationError` branches on `isAxiosError` (lib/handle-mutation-error.ts:18);
 * a plain Error would only ever reach the generic "Something went wrong"
 * fallback, so the server-message branch would never be exercised.
 */
function mockError(message: string, status = 500): AxiosError {
  const error = new AxiosError(message, "ERR_BAD_RESPONSE");
  error.response = {
    data: { message },
    status,
    statusText: "Mock Error",
    headers: {},
    config: { headers: {} } as never,
  };
  return error;
}

function maybeFail(action: string): void {
  if (MOCK_FAILURE_RATE > 0 && Math.random() < MOCK_FAILURE_RATE) {
    throw mockError(`Could not ${action}. The channel rejected the request.`);
  }
}

function requireConversation(id: string): ConversationDetail {
  const conversation = db.conversations.get(id);
  if (!conversation) throw mockError("Conversation not found.", 404);
  return conversation;
}

/** Write a mutated record back, re-deriving folders and lastMessage. */
function commit(conversation: ConversationDetail): ConversationDetail {
  const next = finalize({ ...conversation, updatedAt: new Date().toISOString() });
  db.conversations.set(next.id, next);
  return next;
}

// ── Filtering ────────────────────────────────────────────────────────────────

function matchesSearch(conversation: ConversationDetail, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    conversation.customer.name,
    conversation.customer.phone ?? "",
    conversation.customer.email ?? "",
    conversation.lastMessage?.preview ?? "",
    conversation.insights.lastOrder?.name ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function sortConversations(
  list: ConversationDetail[],
  sort: ConversationListParams["sort"],
): ConversationDetail[] {
  const byRecency = (a: ConversationDetail, b: ConversationDetail) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();

  switch (sort) {
    case "OLDEST":
      return [...list].sort((a, b) => -byRecency(a, b));
    case "UNREAD_FIRST":
      return [...list].sort(
        (a, b) => b.unreadCount - a.unreadCount || byRecency(a, b),
      );
    default:
      return [...list].sort(byRecency);
  }
}

// ── API surface ──────────────────────────────────────────────────────────────

export const mockConversationApi = {
  list(params: ConversationListParams = {}): Promise<PaginatedResponse<Conversation>> {
    seed();

    const { folder = "INBOX", tagId, search = "", sort, page = 1, limit = 50 } = params;

    const filtered = [...db.conversations.values()]
      .filter((c) => c.folders.includes(folder))
      .filter((c) => (tagId ? c.tags.some((t) => t.id === tagId) : true))
      .filter((c) => matchesSearch(c, search));

    const sorted = sortConversations(filtered, sort);
    const start = (page - 1) * limit;
    const pageItems = sorted.slice(start, start + limit).map(toListItem);

    return respond(
      {
        data: pageItems,
        meta: {
          total: sorted.length,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
        },
      },
      LATENCY.read,
    );
  },

  /**
   * Counts across ALL folders, ignoring the active filter.
   *
   * This is why the summary is its own endpoint: the rail must read "Inbox 12"
   * while you are looking at Unassigned. Counts riding on the list response
   * would be scoped to the filter and every number would collapse to the
   * visible row count.
   */
  summary(): Promise<ConversationInboxSummary> {
    seed();
    const all = [...db.conversations.values()];

    const folders: ConversationFolder[] = [
      "INBOX",
      "UNASSIGNED",
      "MINE",
      "SNOOZED",
      "RESOLVED",
    ];

    return respond(
      {
        folders: folders.map((folder) => ({
          folder,
          count: all.filter((c) => c.folders.includes(folder)).length,
        })),
        tags: db.tags.map((tag) => ({
          ...tag,
          // Tag counts are scoped to the open inbox — a tag count that includes
          // resolved threads is a number nobody can act on.
          count: all.filter(
            (c) => c.folders.includes("INBOX") && c.tags.some((t) => t.id === tag.id),
          ).length,
        })),
      },
      LATENCY.read,
    );
  },

  detail(id: string): Promise<ConversationDetail> {
    seed();
    return respond(requireConversation(id), LATENCY.read);
  },

  assignees(): Promise<Assignee[]> {
    seed();
    return respond(db.assignees, LATENCY.read);
  },

  tags(): Promise<ConversationTag[]> {
    seed();
    return respond(db.tags, LATENCY.read);
  },

  assign(id: string, body: AssignConversationRequest): Promise<Conversation> {
    seed();
    maybeFail("assign this conversation");
    const conversation = requireConversation(id);
    const assignee = body.assigneeId
      ? db.assignees.find((a) => a.id === body.assigneeId) ?? null
      : null;
    return respond(toListItem(commit({ ...conversation, assignee })), LATENCY.write);
  },

  resolve(id: string): Promise<Conversation> {
    seed();
    maybeFail("resolve this conversation");
    const conversation = requireConversation(id);
    return respond(
      toListItem(
        commit({ ...conversation, status: "RESOLVED", snoozedUntil: null }),
      ),
      LATENCY.write,
    );
  },

  reopen(id: string): Promise<Conversation> {
    seed();
    maybeFail("reopen this conversation");
    const conversation = requireConversation(id);
    return respond(
      toListItem(commit({ ...conversation, status: "OPEN", snoozedUntil: null })),
      LATENCY.write,
    );
  },

  snooze(id: string, body: SnoozeConversationRequest): Promise<Conversation> {
    seed();
    maybeFail("snooze this conversation");
    const conversation = requireConversation(id);
    return respond(
      toListItem(
        commit({ ...conversation, status: "SNOOZED", snoozedUntil: body.until }),
      ),
      LATENCY.write,
    );
  },

  updateTags(
    id: string,
    body: UpdateConversationTagsRequest,
  ): Promise<Conversation> {
    seed();
    maybeFail("update tags");
    const conversation = requireConversation(id);
    const tags = body.tagIds
      .map((tagId) => db.tags.find((t) => t.id === tagId))
      .filter((t): t is ConversationTag => Boolean(t));
    return respond(toListItem(commit({ ...conversation, tags })), LATENCY.write);
  },

  /**
   * Accept an outbound message.
   *
   * Returns at SENT — the server has handed it to the channel, nothing more.
   * DELIVERED and READ are scheduled to land later, exactly as Meta's delivery
   * webhooks would. The detail query polls while any message is non-terminal
   * (see use-conversation-queries.ts), which is the same conditional-polling
   * idiom the app already uses for channel sync.
   */
  send(id: string, body: SendMessageRequest): Promise<ConversationMessage> {
    seed();
    maybeFail("send this message");
    const conversation = requireConversation(id);

    const message: ConversationMessage = {
      id: nextId("msg"),
      conversationId: id,
      clientId: body.clientId,
      direction: "OUTBOUND",
      kind: body.kind ?? "TEXT",
      body: body.body,
      attachments: [],
      products: body.products ?? [],
      status: "SENT",
      author: MOCK_ME,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      readAt: null,
      failureReason: null,
    };

    commit({ ...conversation, messages: [...conversation.messages, message] });
    scheduleReceipts(id, message.id);

    return respond(message, LATENCY.write);
  },

  addNote(id: string, body: AddNoteRequest): Promise<InternalNote> {
    seed();
    maybeFail("save this note");
    const conversation = requireConversation(id);

    const note: InternalNote = {
      id: nextId("note"),
      conversationId: id,
      body: body.body,
      author: MOCK_ME,
      createdAt: new Date().toISOString(),
    };

    // Notes do not touch `lastMessage` — an internal note is not what the
    // customer last said, and showing it as the list preview would leak team
    // chatter into the row that represents the customer's own thread.
    db.conversations.set(id, {
      ...conversation,
      notes: [...conversation.notes, note],
    });

    return respond(note, LATENCY.write);
  },

  markRead(id: string, _body: MarkReadRequest = {}): Promise<MarkReadResponse> {
    seed();
    const conversation = requireConversation(id);
    const now = new Date().toISOString();

    db.conversations.set(id, {
      ...conversation,
      unreadCount: 0,
      messages: conversation.messages.map((m) =>
        m.direction === "INBOUND" && !m.readAt
          ? { ...m, readAt: now, status: "READ" }
          : m,
      ),
    });

    return respond({ conversationId: id, unreadCount: 0 }, LATENCY.read);
  },
};

/** Advance an outbound message through its delivery receipts. */
function scheduleReceipts(conversationId: string, messageId: string): void {
  const patch = (status: "DELIVERED" | "READ") => {
    const conversation = db.conversations.get(conversationId);
    if (!conversation) return;

    const now = new Date().toISOString();
    db.conversations.set(conversationId, {
      ...conversation,
      messages: conversation.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              status,
              deliveredAt: m.deliveredAt ?? now,
              readAt: status === "READ" ? now : m.readAt,
            }
          : m,
      ),
    });
  };

  setTimeout(() => patch("DELIVERED"), RECEIPT_DELAY.delivered);
  setTimeout(() => patch("READ"), RECEIPT_DELAY.read);
}

// Re-exported so components can render "me" without importing the fixtures
// module directly — one import site to change when the real user arrives.
export { MOCK_ME } from "./conversation-fixtures";
