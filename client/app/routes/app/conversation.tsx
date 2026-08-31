import { useEffect, useState } from "react";
import { Megaphone, PackagePlus, Plus } from "lucide-react";
import { useSearchParams } from "react-router";

import { ConversationEmpty } from "~/components/app/conversation/conversation-empty";
import { ConversationList } from "~/components/app/conversation/conversation-list";
import {
  ConversationSidePanel,
  type PanelTab,
} from "~/components/app/conversation/conversation-side-panel";
import { ConversationThread } from "~/components/app/conversation/conversation-thread";
import { MessageComposer } from "~/components/app/conversation/message-composer";
import { ThreadSkeleton } from "~/components/app/conversation/conversation-skeletons";
import { ThreadHeader } from "~/components/app/conversation/thread-header";
import { NotYet } from "~/components/app/not-yet";
import { QueryErrorState } from "~/components/app/query-error-state";
import { Button } from "~/components/ui/button";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderTitle,
} from "~/components/ui/page-header";
import {
  useAddNoteMutation,
  useAssignConversationMutation,
  useMarkConversationReadMutation,
  useReopenConversationMutation,
  useResolveConversationMutation,
  useSendMessageMutation,
  useSnoozeConversationMutation,
  nextClientId,
} from "~/hooks/use-conversation-mutations";
import {
  useConversation,
  useConversationAssignees,
  useConversations,
  useConversationSummary,
} from "~/hooks/use-conversation-queries";
import { useDebounced } from "~/hooks/use-debounced";
import { PANEL_DEFAULT_OPEN_QUERY, useMediaQuery } from "~/hooks/use-media-query";
import {
  hasProductDrag,
  pinVariant,
  readProductDrag,
  type StagedProduct,
} from "~/lib/product-drag";
import { cn } from "~/lib/utils";
import type { ConversationFolder, ConversationSort } from "~/types/api";

export function meta() {
  return [{ title: "Chat | Collabo CRM" }];
}

const FOLDERS: ConversationFolder[] = [
  "INBOX",
  "UNASSIGNED",
  "MINE",
  "SNOOZED",
  "RESOLVED",
];

const SORTS: ConversationSort[] = ["NEWEST", "OLDEST", "UNREAD_FIRST"];

/** Narrow an untrusted `?param=` to a known value, falling back to the default. */
function readParam<T extends string>(
  raw: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}

/**
 * Chat — the shared team inbox.
 *
 * Three columns: list, thread, and a customer panel the thread header collapses
 * inline. Folder, tag, sort, search and the selected conversation live in the
 * URL so a thread is linkable and a filtered view is shareable. The composer
 * draft and the panel's open state stay local — they belong to this tab, not to
 * the address.
 */
export default function ConversationPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Only the *initial* state: the panel is a real column at every width, and
  // the header toggle works regardless. This just avoids opening it on a
  // screen too narrow to hold three columns comfortably.
  const panelOpensByDefault = useMediaQuery(PANEL_DEFAULT_OPEN_QUERY);
  const [isPanelOpen, setIsPanelOpen] = useState(panelOpensByDefault);
  const [panelTab, setPanelTab] = useState<PanelTab>("details");
  const [isDragOver, setIsDragOver] = useState(false);

  /**
   * Products staged in the composer, keyed by conversation id.
   *
   * Per-conversation rather than one flat list: an agent who stages a product,
   * glances at another thread and comes back should find their attachment
   * intact — and must never find it attached to the wrong customer.
   */
  const [stagedByConversation, setStagedByConversation] = useState<
    Record<string, StagedProduct[]>
  >({});

  const folder = readParam(searchParams.get("folder"), FOLDERS, "INBOX");
  const sort = readParam(searchParams.get("sort"), SORTS, "NEWEST");
  const tagId = searchParams.get("tag");
  const search = searchParams.get("q") ?? "";

  // The input keeps the raw value so typing stays responsive; only the query
  // key is debounced.
  const debouncedSearch = useDebounced(search);

  /**
   * `replace: true` throughout. Selecting a conversation is a view change, not
   * a destination — without it, Back walks the last twenty threads the agent
   * glanced at instead of leaving the inbox.
   */
  function patchParams(patch: Record<string, string | null>) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  }

  const { data: summary } = useConversationSummary();
  const { data: assignees = [] } = useConversationAssignees();

  const listQuery = useConversations({
    folder,
    sort,
    tagId: tagId ?? undefined,
    search: debouncedSearch || undefined,
  });

  const conversations = listQuery.data?.data ?? [];

  /**
   * Derived, never written.
   *
   * Defaulting `?c=` in an effect would create a render → navigate → render
   * loop and fight the agent's own Back button. When `?c=` names a conversation
   * the current folder filters out, this falls through to the first row and
   * leaves the URL alone rather than rewriting it under them.
   */
  const requestedId = searchParams.get("c");
  const selectedId =
    conversations.find((c) => c.id === requestedId)?.id ??
    conversations[0]?.id ??
    null;

  const detailQuery = useConversation(selectedId);
  const conversation = detailQuery.data;

  const assign = useAssignConversationMutation();
  const resolve = useResolveConversationMutation();
  const reopen = useReopenConversationMutation();
  const snooze = useSnoozeConversationMutation();
  const send = useSendMessageMutation();
  const addNote = useAddNoteMutation();
  const markRead = useMarkConversationReadMutation();

  const isMutating =
    assign.isPending || resolve.isPending || reopen.isPending || snooze.isPending;

  /**
   * Clear the unread badge once a thread is open.
   *
   * Keyed on the id and the count, NOT on the conversation object: that
   * re-fires on every optimistic patch, including the one this very mutation
   * performs, which is an infinite loop.
   */
  const unreadCount = conversation?.unreadCount ?? 0;
  const openConversationId = conversation?.id;
  const markReadMutate = markRead.mutate;

  useEffect(() => {
    if (!openConversationId || unreadCount === 0) return;
    markReadMutate(openConversationId);
  }, [openConversationId, unreadCount, markReadMutate]);

  const stagedProducts = selectedId ? stagedByConversation[selectedId] ?? [] : [];

  /** Stage a product, ignoring a second drop of one already in the tray. */
  function addProduct(staged: StagedProduct) {
    if (!selectedId) return;
    setStagedByConversation((previous) => {
      const current = previous[selectedId] ?? [];
      if (current.some((s) => s.product.productId === staged.product.productId)) {
        return previous;
      }
      return { ...previous, [selectedId]: [...current, staged] };
    });
  }

  function removeProduct(productId: string) {
    if (!selectedId) return;
    setStagedByConversation((previous) => ({
      ...previous,
      [selectedId]: (previous[selectedId] ?? []).filter(
        (s) => s.product.productId !== productId,
      ),
    }));
  }

  function setProductVariant(productId: string, variantId: string | null) {
    if (!selectedId) return;
    setStagedByConversation((previous) => ({
      ...previous,
      [selectedId]: (previous[selectedId] ?? []).map((s) =>
        s.product.productId === productId
          ? pinVariant(s, variantId, s.product.priceRange)
          : s,
      ),
    }));
  }

  /**
   * Send, then clear the tray.
   *
   * Cleared optimistically rather than in `onSuccess`: the bubble is already on
   * screen the instant this runs, so leaving the cards in the tray would show
   * the same products twice. A failed send flips the bubble to FAILED and keeps
   * the text, which is where the retry lives.
   */
  function handleSend(body: string) {
    if (!conversation) return;
    send.mutate({
      id: conversation.id,
      body,
      clientId: nextClientId(),
      products: stagedProducts.map((s) => s.product),
    });
    setStagedByConversation((previous) => ({ ...previous, [conversation.id]: [] }));
  }

  function openCatalog() {
    setPanelTab("catalog");
    setIsPanelOpen(true);
  }

  /**
   * Resolving moves the conversation out of the current folder, so the
   * selection has to move with it — otherwise `?c=` points at a row that is no
   * longer listed and the thread column goes blank. Computed before the
   * mutation, while the row is still in the list.
   */
  function handleResolve() {
    if (!selectedId) return;
    const index = conversations.findIndex((c) => c.id === selectedId);
    const nextId =
      conversations[index + 1]?.id ?? conversations[index - 1]?.id ?? null;

    resolve.mutate(selectedId, {
      onSuccess: () => patchParams({ c: nextId }),
    });
  }

  const showPanel = Boolean(conversation) && isPanelOpen;

  return (
    <div className="flex h-full flex-col gap-2">
      <PageHeader className="shrink-0 items-center">
        <PageHeaderContent>
          <PageHeaderTitle>Chat</PageHeaderTitle>
        </PageHeaderContent>
        <PageHeaderActions>
          <NotYet title="Broadcasts need an approved WhatsApp template — not connected yet">
            <Button variant="outline" size="sm" disabled>
              <Megaphone className="size-3.5" />
              Broadcast
            </Button>
          </NotYet>
          <NotYet title="Starting a conversation needs an outbound send path — not connected yet">
            <Button variant="accent" size="sm" disabled>
              <Plus className="size-3.5" />
              New Conversation
            </Button>
          </NotYet>
        </PageHeaderActions>
      </PageHeader>

      {/*
        Grid rather than flex, with minmax(0,1fr) on the thread: a bare 1fr
        track takes its min-content width from the widest message bubble, which
        pushes the panel off-screen instead of wrapping the text.

        Below md the list and thread share one column and swap on selection —
        in CSS, not JS, because a JS breakpoint would flash the wrong pane on
        first paint.

        The card treatment (rounded-xl, ring, shadow) matches every other page;
        the inbox sits in the standard container, it is not a full-bleed app.
      */}
      <div
        className={cn(
          "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border",
          // 272px side columns rather than 300: inside a 1280px container the
          // thread is the track that has to give, and it needs every pixel.
          "md:grid-cols-[272px_minmax(0,1fr)]",
          // The panel becomes a third track from lg up. Below that, two 272px
          // columns leave the thread too narrow to be worth the trade, so the
          // header hides the toggle instead of offering a useless one.
          showPanel && "lg:grid-cols-[272px_minmax(0,1fr)_272px]",
        )}
      >
        <ConversationList
          conversations={conversations}
          summary={summary}
          folder={folder}
          tagId={tagId}
          search={search}
          sort={sort}
          selectedId={selectedId}
          isLoading={listQuery.isLoading}
          isPlaceholder={listQuery.isPlaceholderData}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          onSearchChange={(value) => patchParams({ q: value || null })}
          onSortChange={(next) => patchParams({ sort: next })}
          onFolderChange={(next) => patchParams({ folder: next, c: null })}
          onTagChange={(next) => patchParams({ tag: next, c: null })}
          onSelect={(id) => patchParams({ c: id })}
          className={cn(
            "border-r md:flex",
            // Below md, the thread takes over the single column.
            requestedId ? "hidden" : "flex",
          )}
        />

        {/*
          The whole conversation column is the drop zone, not just the reply
          box — a drag aimed roughly at the chat should land. dragover must
          preventDefault or the browser treats this as a non-target, animates
          the drag back to its origin, and never fires drop.
        */}
        <div
          onDragOver={(event) => {
            if (!hasProductDrag(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setIsDragOver(true);
          }}
          onDragLeave={(event) => {
            // Only when the pointer leaves the column itself. Crossing a child
            // boundary also fires dragleave here, which would strobe the
            // overlay on and off as the cursor moves over bubbles.
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setIsDragOver(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragOver(false);
            const staged = readProductDrag(event);
            if (staged) addProduct(staged);
          }}
          className={cn(
            "relative min-h-0 min-w-0 flex-col",
            requestedId ? "flex" : "hidden md:flex",
          )}
        >
          {detailQuery.isError ? (
            <div className="p-6">
              <QueryErrorState
                resource="this conversation"
                onRetry={() => detailQuery.refetch()}
              />
            </div>
          ) : !selectedId ? (
            <ConversationEmpty />
          ) : !conversation ? (
            <ThreadSkeleton />
          ) : (
            <>
              <ThreadHeader
                conversation={conversation}
                assignees={assignees}
                isPanelOpen={isPanelOpen}
                onTogglePanel={() => setIsPanelOpen((previous) => !previous)}
                onBack={() => patchParams({ c: null })}
                onAssign={(assigneeId) =>
                  assign.mutate({ id: conversation.id, assigneeId })
                }
                onSnooze={(until, label) =>
                  snooze.mutate({ id: conversation.id, until, label })
                }
                onResolve={handleResolve}
                onReopen={() => reopen.mutate(conversation.id)}
                isMutating={isMutating}
              />

              <ConversationThread
                conversationId={conversation.id}
                messages={conversation.messages}
                notes={conversation.notes}
              />

              <MessageComposer
                sessionExpiresAt={conversation.sessionWindow?.expiresAt}
                isSending={send.isPending}
                onSend={handleSend}
                onAddNote={(body) => addNote.mutate({ id: conversation.id, body })}
                onOpenCatalog={openCatalog}
                stagedProducts={stagedProducts}
                onPinVariant={setProductVariant}
                onRemoveProduct={removeProduct}
              />
            </>
          )}

          {/*
            pointer-events-none is load-bearing: an overlay that swallows
            pointer events would fire dragleave on the column underneath the
            instant it appeared, hiding itself in a loop.
          */}
          {isDragOver && conversation && (
            <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand bg-brand/15 text-body font-medium text-foreground">
              <PackagePlus className="size-5" />
              Drop to attach product
            </div>
          )}
        </div>

        {/*
          A docked column, never an overlay. A Sheet dismisses on outside click,
          which would throw away a half-typed reply — and the agent reads this
          panel *while* composing, not instead of it.
        */}
        {conversation && (
          <ConversationSidePanel
            conversation={conversation}
            tab={panelTab}
            onTabChange={setPanelTab}
            isSavingNote={addNote.isPending}
            onAddNote={(body) => addNote.mutate({ id: conversation.id, body })}
            onAddProduct={addProduct}
            // lg:flex, not lg:block — the wrapper is a flex column so the tab
            // strip stays put while the panel body scrolls under it.
            className={cn("border-l", showPanel ? "hidden lg:flex" : "hidden")}
          />
        )}
      </div>
    </div>
  );
}
