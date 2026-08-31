import { cn } from "~/lib/utils";
import { TAG_TONE_CLASSES } from "~/lib/conversation-format";
import type { ConversationTag } from "~/types/api";

/**
 * A conversation tag.
 *
 * The colour comes from the tag's semantic `tone` via one shared map, never
 * from the API — see the ConversationTag docblock in types/api.ts. Three call
 * sites (list row, rail filter, thread header) share this so a "VIP" chip
 * cannot drift between them.
 */
export function ConversationTagChip({
  tag,
  className,
}: {
  tag: ConversationTag;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-micro font-medium",
        TAG_TONE_CLASSES[tag.tone],
        className,
      )}
    >
      {tag.label}
    </span>
  );
}
