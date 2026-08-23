/**
 * Recovery for the one failure a deploy reliably causes.
 *
 * Every page in `App.tsx` is `lazy()`-imported, so the browser only fetches a
 * route's chunk when you navigate to it. A deploy rewrites every asset to a new
 * content hash, so a tab that was open across the deploy is still holding the
 * previous build's chunk names — the next route it opens requests a filename
 * the server no longer has, the import rejects, and the ErrorBoundary shows
 * "Failed to fetch dynamically imported module: /assets/Deals-<oldhash>.js".
 *
 * Nothing is actually broken; the tab is simply a version behind. Reloading
 * fetches the current index.html and with it the current chunk names.
 */

/** When we last reloaded for this, so a chunk that is genuinely missing shows
 *  the error screen instead of reloading in a loop. */
const LAST_RELOAD_KEY = "ovenisto-chunk-reload-at";
const RETRY_WINDOW_MS = 10_000;

/** Does this error look like a chunk the server no longer serves? Chrome,
 *  Firefox and Safari each word it differently. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css/i.test(
    message
  );
}

/**
 * Reload to pick up the current build. Returns true if a reload was started,
 * false if one was already tried moments ago — in which case the chunk really
 * is missing and the caller should surface the error rather than loop.
 */
export function reloadForStaleChunk(): boolean {
  const now = Date.now();
  let lastReload = 0;
  try {
    lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
  } catch {
    // Storage blocked (private mode, embedded webview). Without the timestamp
    // we cannot detect a loop, so refuse to auto-reload and let the error show.
    return false;
  }

  if (now - lastReload < RETRY_WINDOW_MS) return false;

  try {
    sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
  } catch {
    return false;
  }

  window.location.reload();
  return true;
}

/**
 * Vite raises `vite:preloadError` on window when a lazily-imported chunk fails
 * to load. Handling it here catches the case before React ever sees it; the
 * ErrorBoundary catches the rest.
 */
export function installStaleChunkRecovery(): void {
  window.addEventListener("vite:preloadError", (event) => {
    // Without this Vite rethrows, and the reload we are about to do would race
    // an unhandled rejection into the console.
    event.preventDefault();
    reloadForStaleChunk();
  });
}
