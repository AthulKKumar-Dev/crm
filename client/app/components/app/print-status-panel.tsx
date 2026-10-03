import type { LucideIcon } from "lucide-react";

/** The empty / error state inside a print editor's card. */
export function PrintStatusPanel({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-24 text-center">
      <div className="grid size-11 place-items-center rounded-full bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="mt-1 text-section text-foreground">{title}</p>
      <p className="max-w-sm text-body leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">{children}</div>
    </div>
  );
}
