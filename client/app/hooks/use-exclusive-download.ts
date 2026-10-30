import { useRef, useState } from "react";
import { downloadBlob } from "~/lib/download-blob";

/**
 * File downloads for a group of buttons, one at a time.
 *
 * `running` names the download in flight so the page can disable EVERY button
 * in the group and show progress on the one that was clicked. Without it a
 * slow export invited repeated clicks, and each click started another full
 * export on the server.
 */
export function useExclusiveDownload<K extends string>() {
  const [running, setRunning] = useState<K | null>(null);
  // State alone lags a render behind; the ref is what stops a double-click
  // landing twice inside the same tick.
  const inFlight = useRef(false);

  const run = async (
    kind: K,
    fetchBlob: () => Promise<Blob>,
    filename: string,
    errorMessage: string,
  ) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(kind);
    try {
      await downloadBlob(fetchBlob, filename, errorMessage);
    } finally {
      inFlight.current = false;
      setRunning(null);
    }
  };

  return { running, run };
}
