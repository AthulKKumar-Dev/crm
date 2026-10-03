import { Checkbox } from "~/components/ui/checkbox";
import { AVAILABLE_SECTIONS, type SectionId } from "~/lib/sections";

/**
 * Checkbox grid of the app sections a member may open. Used on the invite form
 * and the per-member access editor. At least one section stays ticked — a
 * member with none would read as "not configured", which means full access.
 */
export function SectionAccessPicker({
  value,
  onChange,
  disabled,
}: {
  value: SectionId[];
  onChange: (next: SectionId[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
      {AVAILABLE_SECTIONS.map((section) => {
        const checked = value.includes(section.id);
        const isLast = checked && value.length === 1;
        return (
          <label
            key={section.id}
            className="flex cursor-pointer items-center gap-2 text-xs text-gray-700 dark:text-gray-300"
          >
            <Checkbox
              checked={checked}
              disabled={disabled || isLast}
              onCheckedChange={(next) =>
                onChange(
                  next === true
                    ? [...value, section.id]
                    : value.filter((id) => id !== section.id),
                )
              }
            />
            {section.label}
          </label>
        );
      })}
    </div>
  );
}
