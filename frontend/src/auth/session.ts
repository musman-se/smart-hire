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
 * The tradeoff: a script injected into the page (XSS) could read the token from memory
 * or storage. React escapes everything it renders and this app never sets raw HTML,
 * which is the defence today. An httpOnly cookie, which no script can read, is the
 * upgrade path.
 */

import type { TokenPair } from "../api/types";

const PARKED_KEY = "smarthire.refresh_token";

let accessToken: string | null = null;
let refreshToken: string | null = takeParkedToken();
const signOutListeners = new Set<() => void>();
const restoreListeners = new Set<() => void>();

/** Read and delete in one step: once this tab holds the token, storage must not. */
function takeParkedToken(): string | null {
  try {
    const token = sessionStorage.getItem(PARKED_KEY);
    sessionStorage.removeItem(PARKED_KEY);
    return token;
  } catch {
    return null; // storage unavailable (a sandboxed frame): reloads will sign out
  }
}

function park(): void {
  try {
    if (refreshToken) sessionStorage.setItem(PARKED_KEY, refreshToken);
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
  refreshToken = takeParkedToken();
  accessToken = null;
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

  store(tokens: TokenPair): void {
    accessToken = tokens.access_token;
    refreshToken = tokens.refresh_token;
  },

  /** Forget both tokens and tell whoever is listening — the UI returns to sign-in. */
  clear(): void {
    const hadSession = accessToken !== null || refreshToken !== null;
    accessToken = null;
    refreshToken = null;
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
