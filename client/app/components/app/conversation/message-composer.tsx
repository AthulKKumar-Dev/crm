import { useState, type KeyboardEvent } from "react";
import { BookText, Lock, Send, ShoppingBag, Wallet, Zap } from "lucide-react";

import { NotYet } from "~/components/app/not-yet";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import type { StagedProduct } from "~/lib/product-drag";
import { cn } from "~/lib/utils";

import { ComposerProductTray } from "./composer-product-tray";
import { SessionWindowHint } from "./session-window-pill";

/** The composer actions that still have no backend behind them. */
const PENDING_ACTIONS = [
  { label: "Quick Replies", icon: Zap, why: "Canned replies are not stored yet" },
  { label: "Templates", icon: BookText, why: "Approved WhatsApp templates are not synced yet" },
  { label: "Payment Link", icon: Wallet, why: "Payment links need a Razorpay endpoint — not built yet" },
] as const;

/**
 * Column 2 footer — reply box, note toggle, staged products, and the action row.
 *
 * Reply and note share one input, switched by a toggle, rather than living in
 * two boxes. Two always-visible inputs is how an agent types a reply into the
 * note field; one input whose whole appearance changes with the mode makes the
 * current target unmissable.
 *
 * The product drop zone is deliberately NOT here — it wraps the whole
 * conversation column in the route, so an imprecise drop anywhere over the
 * thread still lands. See the drag helpers in lib/product-drag.ts.
 */
export function MessageComposer({
  onSend,
  onAddNote,
  onOpenCatalog,
  stagedProducts,
  onPinVariant,
  onRemoveProduct,
  sessionExpiresAt,
  isSending,
  disabled,
}: {
  onSend: (body: string) => void;
  onAddNote: (body: string) => void;
  onOpenCatalog: () => void;
  stagedProducts: StagedProduct[];
  onPinVariant: (productId: string, variantId: string | null) => void;
  onRemoveProduct: (productId: string) => void;
  sessionExpiresAt: string | null | undefined;
  isSending: boolean;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [isNoteMode, setIsNoteMode] = useState(false);

  const trimmed = draft.trim();
  const hasProducts = stagedProducts.length > 0;

  /**
   * Products alone are a valid message — a card says "this one" perfectly well
   * without a covering note. Requiring text would force the agent to type
   * something meaningless before they could send what they just dragged.
   *
   * Notes stay text-only: a note is a memo to the team, and attaching a product
   * to one has no meaning.
   */
  const canSubmit =
    !isSending &&
    !disabled &&
    (isNoteMode ? trimmed.length > 0 : trimmed.length > 0 || hasProducts);

  function submit() {
    if (!canSubmit) return;
    if (isNoteMode) onAddNote(trimmed);
    else onSend(trimmed);
    setDraft("");
  }

  /**
   * Enter sends, Shift+Enter breaks the line — the convention every messaging
   * app uses, and the one an agent's muscle memory expects.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      className={cn(
        "shrink-0 border-t px-4 py-3 transition-colors",
        isNoteMode && "bg-warning-subtle",
      )}
    >
      <ComposerProductTray
        staged={stagedProducts}
        onPinVariant={onPinVariant}
        onRemove={onRemoveProduct}
        disabled={isSending}
      />

      <div className="flex flex-wrap items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenCatalog}
          aria-label="Browse catalog"
          title="Browse catalog"
        >
          <ShoppingBag className="size-3.5" />
        </Button>

        {PENDING_ACTIONS.map((action) => (
          <NotYet key={action.label} title={`${action.label} — ${action.why}`}>
            <Button variant="ghost" size="icon-sm" disabled aria-label={action.label}>
              <action.icon className="size-3.5" />
            </Button>
          </NotYet>
        ))}

        <Button
          variant={isNoteMode ? "accent" : "ghost"}
          size="sm"
          aria-pressed={isNoteMode}
          onClick={() => setIsNoteMode((previous) => !previous)}
        >
          <Lock className="size-3.5" />
          Note
        </Button>

        <div className="ml-auto">
          {isNoteMode ? (
            <p className="text-micro font-medium text-warning">
              Internal note — the customer will not see this
            </p>
          ) : (
            <SessionWindowHint expiresAt={sessionExpiresAt} />
          )}
        </div>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          disabled={disabled}
          aria-label={isNoteMode ? "Write an internal note" : "Write a reply"}
          placeholder={
            isNoteMode
              ? "Add a note — only your team sees it"
              : hasProducts
                ? "Add a message, or send the product on its own"
                : "Write a reply…"
          }
          className="max-h-32 min-h-10 flex-1 resize-none text-body"
        />
        <Button
          variant="accent"
          size="icon"
          onClick={submit}
          disabled={!canSubmit}
          aria-label={isNoteMode ? "Save note" : "Send message"}
        >
          {isNoteMode ? <Lock className="size-3.5" /> : <Send className="size-3.5" />}
        </Button>
      </div>
    </div>
  );
}
