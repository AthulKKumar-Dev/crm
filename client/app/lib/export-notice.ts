import { toast } from "sonner";

/**
 * Exports are capped on the server, which reports how many orders the file
 * holds and how many matched (`X-Export-Rows` / `X-Export-Total`). A capped
 * file that says nothing reads as the complete period, so say it.
 *
 * Silent when the headers are missing (an older server) or nothing was cut.
 */
export function warnIfExportCutOff(headers: unknown): void {
  const read = (name: string): number => {
    const h = headers as { get?: (n: string) => unknown } & Record<string, unknown>;
    const raw = typeof h?.get === "function" ? h.get(name) : h?.[name.toLowerCase()];
    return Number(raw);
  };
  const rows = read("X-Export-Rows");
  const total = read("X-Export-Total");
  if (!Number.isFinite(rows) || !Number.isFinite(total) || total <= rows) return;

  toast.warning(
    `This file has the newest ${rows.toLocaleString()} of ${total.toLocaleString()} orders.`,
    {
      description: "Choose a shorter period to download the rest.",
      duration: 12_000,
    },
  );
}
