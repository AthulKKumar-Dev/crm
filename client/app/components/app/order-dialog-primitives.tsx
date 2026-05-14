import { Loader2, X } from "lucide-react";

/**
 * Centered modal shell used by every order action dialog.
 * Click on the backdrop or the X button to dismiss. Body content is rendered
 * as children so each caller controls its own padding and layout.
 */
export function ModalShell({
  title,
  subtitle,
  onClose,
  children,
  maxWidthClass = "max-w-md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidthClass} rounded-xl bg-white dark:bg-gray-900 shadow-xl max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4 sticky top-0 bg-white dark:bg-gray-900">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h2>
            {subtitle && (
              <p className="text-[10px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DialogFooter({
  confirmLabel,
  confirmTone = "primary",
  onConfirm,
  onClose,
  pending,
  confirmDisabled,
}: {
  confirmLabel: string;
  confirmTone?: "primary" | "destructive";
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
  confirmDisabled?: boolean;
}) {
  const primaryClass =
    confirmTone === "destructive"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-[#cdff8c] text-gray-900 hover:bg-[#b8e67d]";
  return (
    <div className="flex items-center gap-2 border-t px-6 py-4">
      <button
        onClick={onConfirm}
        disabled={pending || confirmDisabled}
        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50 ${primaryClass}`}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {confirmLabel}
      </button>
      <button
        onClick={onClose}
        disabled={pending}
        className="rounded-lg px-4 py-2 text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        Close
      </button>
    </div>
  );
}

export function CheckboxRow({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-xs">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span>
        <span className="font-medium text-gray-900 dark:text-gray-100">{label}</span>
        {help && (
          <span className="block text-[10px] text-muted-foreground">{help}</span>
        )}
      </span>
    </label>
  );
}
