import { toast } from "sonner";

/**
 * Fetch a Blob and save it, surfacing failures as a toast rather than silence.
 *
 * One copy, three consumers. This lived as a private helper in
 * `routes/app/orders.tsx` and again, near-identically, in
 * `routes/app/orders/invoices.tsx` — the invoices copy also had to thread an
 * `isDownloading` flag through by hand. Import this instead of writing a fourth.
 */
export async function downloadBlob(
  fetchBlob: () => Promise<Blob>,
  filename: string,
  errorMessage: string,
): Promise<void> {
  let url: string | null = null;
  try {
    const blob = await fetchBlob();
    url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } catch {
    toast.error(errorMessage);
  } finally {
    // Revoked in `finally` so a click() that throws mid-flight cannot leak the
    // object URL for the lifetime of the document.
    if (url) URL.revokeObjectURL(url);
  }
}
