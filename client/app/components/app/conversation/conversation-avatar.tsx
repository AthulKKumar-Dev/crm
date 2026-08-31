import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { getInitials } from "~/lib/conversation-format";
import { cn } from "~/lib/utils";

/**
 * Contact avatar with an initials fallback.
 *
 * One neutral fill for everyone, rather than the rotating pastel palette the
 * old page used. That palette keyed off the row's *index*, so a contact changed
 * colour whenever the list re-sorted — the one thing an avatar colour must not
 * do. Identity here comes from the initials and the channel badge beside them.
 */
export function ConversationAvatar({
  name,
  avatarUrl,
  size = "default",
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={cn(className)}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
      <AvatarFallback className="bg-brand/30 text-caption font-semibold text-brand-strong">
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
