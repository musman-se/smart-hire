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
 * - **Two tabs never share a refresh token.** Each refresh token works once, and the
 *   server treats a second use as theft and ends every session the user has. "Duplicate
 *   tab" copies sessionStorage — but while a tab is open its sessionStorage holds no
 *   token, so the copy starts signed out instead of racing the original. localStorage,
 *   shared by every tab, would have that race on every refresh.
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
// cache does not reload this module, so the parked token is taken back on pageshow.
window.addEventListener("pagehide", park);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) refreshToken = takeParkedToken() ?? refreshToken;
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
};
