/**
 * Recovering from a page whose code is gone. Each page is its own chunk with a hashed
 * name; a deploy replaces them, so a tab opened before it asks for a file that no
 * longer exists, and the dynamic import rejects. React caches that rejection — trying
 * to render the page again can never succeed. Reloading fetches the new build.
 *
 * So a failed import reloads the page once, by itself. A note in sessionStorage keeps
 * that from looping when the failure is not a deploy (the server is down, say): within
 * RELOAD_GUARD_MS of an automatic reload the error is thrown instead, and the error
 * screen offers a Reload button (ErrorFallback). A chunk that loads clears the note, so
 * the next deploy gets its automatic reload too.
 */

import { expectAppReload } from "../auth/session";

const RELOAD_KEY = "smarthire.chunk-reload-at";
export const RELOAD_GUARD_MS = 30_000;

/** A page's code could not be loaded. */
export class ChunkLoadError extends Error {
  constructor(cause: unknown) {
    super("This page's code could not be loaded.", { cause });
    this.name = "ChunkLoadError";
  }
}

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && error.name === "ChunkLoadError";
}

/** Reloads unless this tab already did so moments ago. False when it did not reload. */
function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (last && Date.now() - last >= 0 && Date.now() - last < RELOAD_GUARD_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false; // no storage, so no guard: never risk a reload loop
  }
  // The new build downloads uncached; give the parked session time to wait for it.
  expectAppReload();
  window.location.reload();
  return true;
}

export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  let module: T;
  try {
    module = await load();
  } catch (cause) {
    // Never settles: the page is going away, and nothing should render meanwhile.
    if (reloadOnce()) return new Promise<T>(() => {});
    throw new ChunkLoadError(cause);
  }
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    // Storage blocked: there is no note to clear.
  }
  return module;
}
