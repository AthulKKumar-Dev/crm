import { Clock } from "lucide-react";

import { useSessionCountdown } from "~/hooks/use-session-countdown";
import { cn } from "~/lib/utils";

/**
 * The live "Session open · 6h 12m" pill.
 *
 * A leaf on purpose: it owns the only ticking state on the page, so a minute
 * passing re-renders this span and nothing else. See useSessionCountdown.
 */
export function SessionWindowPill({
  expiresAt,
  className,
}: {
  expiresAt: string | null | undefined;
  className?: string;
}) {
  const { label, isOpen, isClosingSoon } = useSessionCountdown(expiresAt);

  // Channels with no window concept (Instagram) get no pill at all rather than
  // a meaningless "—": absence is clearer than a placeholder here.
  if (!expiresAt) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap text-micro font-medium",
        !isOpen
          ? "text-danger"
          : isClosingSoon
            ? "text-warning-strong"
            : "text-muted-foreground",
        className,
      )}
    >
      <Clock className="size-3" />
      {isOpen ? `Session open · ${label}` : "Session closed"}
    </span>
  );
}

/**
 * The composer's version — a full sentence rather than a pill.
 *
 * Separate component, same hook: the composer needs to state the consequence
 * ("template required") because that is where the agent is about to type, while
 * the header only needs the status.
 */
export function SessionWindowHint({ expiresAt }: { expiresAt: string | null | undefined }) {
  const { label, isOpen, isClosingSoon } = useSessionCountdown(expiresAt);

  if (!expiresAt) return null;

  if (!isOpen) {
    return (
      <p className="text-micro text-danger">
        Session window closed — only an approved template can be sent now.
      </p>
    );
  }

  return (
    <p
      className={cn(
        "text-micro",
        isClosingSoon ? "text-warning-strong" : "text-muted-foreground",
      )}
    >
      Session window closes in {label}
    </p>
  );
}
