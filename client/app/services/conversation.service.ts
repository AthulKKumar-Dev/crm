/**
 * Conversations API.
 *
 * Currently backed by an in-memory mock (lib/mock/conversation-store.ts) because
 * no conversations module exists on the server yet — there is no Conversation
 * model, no inbound webhook, and no free-text send path.
 *
 * Every method below carries the real request it will make as a comment, and
 * every signature already matches it. Swapping to the live API means replacing
 * the bodies in THIS FILE ONLY: hooks, optimistic patches, cache invalidation
 * and the components above never learn the difference.
 *
 * `apiClient` unwraps the `{ success, data }` envelope in its response
 * interceptor (lib/api-client.ts:55-61), which is why the real calls below read
 * `.then((r) => r.data)` and not `.then((r) => r.data.data)`.
 */

import { mockConversationApi } from "~/lib/mock/conversation-store";
import type {
  AddNoteRequest,
  AssignConversationRequest,
  Assignee,
  Conversation,
  ConversationDetail,
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

export const conversationService = {
  /** GET /conversations */
  list: (params?: ConversationListParams): Promise<PaginatedResponse<Conversation>> =>
    // apiClient.get("/conversations", { params }).then((r) => r.data),
    mockConversationApi.list(params),

  /** GET /conversations/summary */
  summary: (): Promise<ConversationInboxSummary> =>
    // apiClient.get("/conversations/summary").then((r) => r.data),
    mockConversationApi.summary(),

  /** GET /conversations/:id */
  detail: (id: string): Promise<ConversationDetail> =>
    // apiClient.get(`/conversations/${id}`).then((r) => r.data),
    mockConversationApi.detail(id),

  /**
   * GET /conversations/assignable-agents
   *
   * Its own endpoint rather than reusing the org-members list: assignable
   * agents are a filtered subset (by UserRole, and by whether the member is
   * active), and the assignee dropdown showing a member who cannot be assigned
   * is worse than one extra request.
   */
  assignees: (): Promise<Assignee[]> =>
    // apiClient.get("/conversations/assignable-agents").then((r) => r.data),
    mockConversationApi.assignees(),

  /** GET /conversations/tags */
  tags: (): Promise<ConversationTag[]> =>
    // apiClient.get("/conversations/tags").then((r) => r.data),
    mockConversationApi.tags(),

  /** PATCH /conversations/:id/assignee */
  assign: (id: string, body: AssignConversationRequest): Promise<Conversation> =>
    // apiClient.patch(`/conversations/${id}/assignee`, body).then((r) => r.data),
    mockConversationApi.assign(id, body),

  /** POST /conversations/:id/resolve */
  resolve: (id: string): Promise<Conversation> =>
    // apiClient.post(`/conversations/${id}/resolve`).then((r) => r.data),
    mockConversationApi.resolve(id),

  /** POST /conversations/:id/reopen */
  reopen: (id: string): Promise<Conversation> =>
    // apiClient.post(`/conversations/${id}/reopen`).then((r) => r.data),
    mockConversationApi.reopen(id),

  /** POST /conversations/:id/snooze */
  snooze: (id: string, body: SnoozeConversationRequest): Promise<Conversation> =>
    // apiClient.post(`/conversations/${id}/snooze`, body).then((r) => r.data),
    mockConversationApi.snooze(id, body),

  /** PATCH /conversations/:id/tags */
  updateTags: (
    id: string,
    body: UpdateConversationTagsRequest,
  ): Promise<Conversation> =>
    // apiClient.patch(`/conversations/${id}/tags`, body).then((r) => r.data),
    mockConversationApi.updateTags(id, body),

  /** POST /conversations/:id/messages */
  send: (id: string, body: SendMessageRequest): Promise<ConversationMessage> =>
    // apiClient.post(`/conversations/${id}/messages`, body).then((r) => r.data),
    mockConversationApi.send(id, body),

  /** POST /conversations/:id/notes */
  addNote: (id: string, body: AddNoteRequest): Promise<InternalNote> =>
    // apiClient.post(`/conversations/${id}/notes`, body).then((r) => r.data),
    mockConversationApi.addNote(id, body),

  /** POST /conversations/:id/read */
  markRead: (id: string, body?: MarkReadRequest): Promise<MarkReadResponse> =>
    // apiClient.post(`/conversations/${id}/read`, body).then((r) => r.data),
    mockConversationApi.markRead(id, body),
};
