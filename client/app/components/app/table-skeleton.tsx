import { Skeleton } from "~/components/ui/skeleton";

/** Generic table loading skeleton that renders placeholder rows and columns. */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-gray-900 shadow-sm ring-1 ring-border">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-gray-100 dark:border-gray-800 px-5 py-3">
        {Array.from({ length: columns }).map((_, colIndex) => (
          <Skeleton key={colIndex} className="h-3 flex-1 rounded" />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-gray-50 dark:border-gray-800/50 px-5 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-3.5 flex-1 rounded"
              style={{ maxWidth: colIndex === 0 ? "40%" : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
