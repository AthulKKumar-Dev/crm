import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Centered empty-state placeholder for pages or tables with no data. */
export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-white dark:bg-gray-900 px-6 py-16 text-center shadow-sm ring-1 ring-border">
      <div className="flex size-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
        <Icon className="size-6 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
