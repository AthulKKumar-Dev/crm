const loadedScripts = new Set<string>();

/**
 * Loads a `<script>` tag once. Subsequent calls for the same URL resolve
 * immediately. Used to fetch Razorpay Checkout.js on demand from the choose-plan
 * page (we don't bundle it because it's third-party and loads from their CDN).
 */
export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (loadedScripts.has(src)) return resolve();
    if (typeof document === "undefined") {
      return reject(new Error("loadScript requires a browser environment"));
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      loadedScripts.add(src);
      return resolve();
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}
