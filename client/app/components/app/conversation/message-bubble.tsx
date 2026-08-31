import { AlertCircle } from "lucide-react";

import { formatBubbleTime, MESSAGE_STATUS_LABEL } from "~/lib/conversation-format";
import { cn } from "~/lib/utils";
import type { ConversationMessage } from "~/types/api";

import { MessageProductCard } from "./message-product-card";

/**
 * One message in the thread.
 *
 * Outbound sits right on brand, inbound sits left on muted. The asymmetric
 * corner (`rounded-tr-sm` / `rounded-tl-sm`) is what makes direction readable
 * at a glance without reading the alignment.
 */
export function MessageBubble({ message }: { message: ConversationMessage }) {
  const isOutbound = message.direction === "OUTBOUND";
  const isFailed = message.status === "FAILED";
  const isPending = message.status === "QUEUED";
  const hasProducts = message.products.length > 0;

  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[min(34rem,78%)] flex-col gap-1",
          isOutbound ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            // 14px, not 12px. `text-caption` is meta-text size — timestamps and
            // labels. Message bodies are the thing being read on this page.
            "rounded-xl px-4 py-3 text-body whitespace-pre-wrap break-words",
            isOutbound
              ? "rounded-tr-sm bg-brand text-brand-foreground"
              : "rounded-tl-sm bg-muted text-foreground",
            // The optimistic bubble is dimmed rather than hidden — the agent
            // needs to see their own words land the instant they hit send.
            isPending && "opacity-70",
            isFailed && "bg-danger-subtle text-danger",
          )}
        >
          {hasProducts && (
            <div className={cn("flex flex-col gap-1.5", message.body && "mb-2")}>
              {message.products.map((product) => (
                <MessageProductCard
                  key={`${product.productId}-${product.variantId ?? "all"}`}
                  product={product}
                  isOutbound={isOutbound}
                />
              ))}
            </div>
          )}
          {/*
            A product card is a complete message on its own. Rendering an empty
            string here would leave the bubble with a stray blank line under
            the card, because the container is `whitespace-pre-wrap`.
          */}
          {message.body}
        </div>

        <div className="flex items-center gap-1.5 px-1 text-micro text-muted-foreground">
          {message.author && <span>{message.author.name}</span>}
          <span>{formatBubbleTime(message.createdAt)}</span>
          {isOutbound && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                isFailed && "text-danger",
                message.status === "READ" && "text-brand-strong",
              )}
            >
              {isFailed && <AlertCircle className="size-3" />}
              {MESSAGE_STATUS_LABEL[message.status]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
