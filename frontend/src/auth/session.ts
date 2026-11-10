/**
 * Where the tokens live between requests. No React here, and no HTTP — client.ts uses
 * this to sign requests and renew the access token; AuthProvider listens for sign-out.
 *
 * Both tokens are held in memory while the tab is open. The refresh token is *parked*
 * in sessionStorage only while the page unloads (`pagehide`), and taken back out — and
 * deleted from storage — the moment the next page loads. So:
 *
 * - **A reload keeps you signed in.** The new page finds the parked token and exchanges
 *   it for a fresh access token.
 * - **Two tabs never share a refresh token.** Each refresh token works once; the server
 *   refuses a second use, and a few seconds later treats it as theft and ends every
 *   session the user has. "Duplicate tab" copies sessionStorage — but while a tab is
 *   open its sessionStorage holds no token, so the copy starts signed out instead of
 *   racing the original. localStorage, shared by every tab, would have that race on
 *   every refresh.
 *
 * - **Closing the tab signs you out.** pagehide fires on tab close too, and browsers
 *   bring sessionStorage back with a reopened tab (Ctrl+Shift+T, "continue where you
 *   left off") — on a shared computer, into the next person's hands. So the token is
 *   parked with the time it was parked, and taken back only if that was moments ago
 *   (PARKED_RELOAD_MS): long enough for a reload, far too short for a closed tab to be
 *   reopened by someone else. The cost: a reload that takes longer than that — a very
 *   slow network fetching the app again — lands on the sign-in page.
 *
 * The tradeoff: a script injected into the page (XSS) could read the token from memory
 * or storage. React escapes everything it renders and this app never sets raw HTML,
 * which is the defence today. An httpOnly cookie, which no script can read, is the
 * upgrade path.
 */

import type { TokenPair } from "../api/types";

const PARKED_KEY = "smarthire.refresh_token";

/** A fresh page load takes back a token parked at most this long ago. */
export const PARKED_RELOAD_MS = 10_000;
/**
 * A page restored from the back/forward cache waits longer: it was alive in this very
 * tab, the user simply went elsewhere and pressed Back. The cache belongs to a tab that
 * stayed open — closing the tab evicts it, and a reopened tab loads afresh under the
 * short limit — so the limit here only keeps a token from waiting in storage for ever.
 */
export const PARKED_BFCACHE_MS = 30 * 60_000;

/**
 * A reload this app starts itself — a new build's page could not load (lib/chunkReload)
 * — may take longer: the whole new bundle downloads, uncached. Nobody is reopening a
 * closed tab in the middle of it, so the token may wait this long. Capped here, so a
 * value written to storage can never ask for more.
 */
export const PARKED_APP_RELOAD_MS = 2 * 60_000;

interface Parked {
  token: string;
  parkedAt: number;
  /** How long this token may wait, if longer than the default (an app-started reload). */
  maxAgeMs?: number;
}

let parkFor: number | undefined;

/** The next park is for a reload this app is about to start itself. */
export function expectAppReload(): void {
  parkFor = PARKED_APP_RELOAD_MS;
}

let accessToken: string | null = null;
let refreshToken: string | null = takeParkedToken(PARKED_RELOAD_MS);
let epoch = 0;
const signOutListeners = new Set<() => void>();
const restoreListeners = new Set<() => void>();

function isParked(value: unknown): value is Parked {
  if (typeof value !== "object" || value === null) return false;
  const parked = value as Record<string, unknown>;
  return typeof parked.token === "string" && parked.token !== "" && typeof parked.parkedAt === "number";
}

/**
 * Read and delete in one step: once this tab holds the token, storage must not. A token
 * parked longer ago than `maxAgeMs` — or by a clock that has since gone backwards — is
 * deleted and not used: signed out.
 */
function takeParkedToken(maxAgeMs: number): string | null {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(PARKED_KEY);
    sessionStorage.removeItem(PARKED_KEY);
  } catch {
    return null; // storage unavailable (a sandboxed frame): reloads will sign out
  }
  if (raw === null) return null;
  let parked: unknown;
  try {
    parked = JSON.parse(raw);
  } catch {
    return null; // not ours, or from before tokens were parked with a time
  }
  if (!isParked(parked)) return null;
  const allowed = Math.max(
    maxAgeMs,
    typeof parked.maxAgeMs === "number" ? Math.min(parked.maxAgeMs, PARKED_APP_RELOAD_MS) : 0,
  );
  const age = Date.now() - parked.parkedAt;
  return age >= 0 && age <= allowed ? parked.token : null;
}

function park(): void {
  try {
    if (refreshToken) {
      const parked: Parked = { token: refreshToken, parkedAt: Date.now(), maxAgeMs: parkFor };
      sessionStorage.setItem(PARKED_KEY, JSON.stringify(parked));
    }
  } catch {
    // Nothing to do: the next page load starts signed out.
  }
}

// pagehide fires on reload, navigation away and tab close — unlike beforeunload, also
// on mobile and when the page enters the back/forward cache. Coming back from that
// cache does not reload this module, so the parked token is taken back on pageshow —
// and only the parked one. What this page held in memory may have been used since by
// a later page in this tab, or ended by a sign-out there; presenting it would look
// like theft. Nothing parked means signed out. The access token goes too: the session
// it belonged to may be over.
//
// A tab the browser discards to save memory, or a mobile OS kills in the background,
// gets no pagehide and comes back signed out. Parking earlier (on freeze, or when the
// tab is hidden) would leave the token in storage while the tab lives — exactly what
// lets a duplicated tab share it.
window.addEventListener("pagehide", park);
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  const hadSession = accessToken !== null || refreshToken !== null;
  refreshToken = takeParkedToken(PARKED_BFCACHE_MS);
  accessToken = null;
  epoch += 1; // whatever this tab held before is not this session
  // The UI still shows whoever was signed in when the page was cached. Nothing parked:
  // they are signed out. A token parked: it may be someone else's — a later page in
  // this tab could have signed in as another user — so the session is re-established
  // from it rather than assumed.
  if (refreshToken !== null) restoreListeners.forEach((listener) => listener());
  else if (hadSession) signOutListeners.forEach((listener) => listener());
});

export const session = {
  accessToken: (): string | null => accessToken,
  refreshToken: (): string | null => refreshToken,

  /**
   * Which sign-in the tokens belong to. It moves on a sign-in and a sign-out — never on
   * a refresh or a password change, which carry the same person's session on. A
   * request signed in one epoch is never replayed in another: after a sign-out and a
   * sign-in it would run as someone else.
   */
  epoch: (): number => epoch,

  /** A new sign-in: possibly a different person from whoever held the tab before. */
  begin(tokens: TokenPair): void {
    epoch += 1;
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
  },

  /** The same session carried on: a refreshed pair, or the pair change-password returns. */
  store(tokens: TokenPair): void {
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
  },

  /** Forget both tokens and tell whoever is listening — the UI returns to sign-in. */
  clear(): void {
    const hadSession = accessToken !== null || refreshToken !== null;
    accessToken = null;
    refreshToken = null;
    epoch += 1;
    if (hadSession) signOutListeners.forEach((listener) => listener());
  },

  onSignedOut(listener: () => void): () => void {
    signOutListeners.add(listener);
    return () => signOutListeners.delete(listener);
  },

  /** The page came back from the back/forward cache holding a parked token. */
  onRestored(listener: () => void): () => void {
    restoreListeners.add(listener);
    return () => restoreListeners.delete(listener);
  },
};
