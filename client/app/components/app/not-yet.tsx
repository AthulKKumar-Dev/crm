/**
 * Wrapper for a control the app cannot fulfil yet.
 *
 * The wrapping span is load-bearing, not decoration: browsers suppress pointer
 * events on a disabled element, so a `title` placed on the disabled button
 * itself never fires. Without this the control reads as broken rather than
 * pending.
 *
 * Use it only where the design calls for a visible-but-inert affordance. Where
 * an action simply has no backing endpoint and nothing in the design demands it,
 * prefer leaving the control out entirely.
 */
export function NotYet({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span title={title} className="inline-flex">
      {children}
    </span>
  );
}
