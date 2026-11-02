/**
 * Where the tokens live between requests. No React here, and no HTTP — client.ts uses
 * this to sign requests and renew the access token; AuthProvider listens for sign-out.
 *
 * - The **access token** is held in memory only. It lasts minutes, and a reload simply
 *   exchanges the refresh token for a new one.
 * - The **refresh token** is in sessionStorage: it survives a reload of this tab, and
 *   is gone when the tab closes. Not localStorage, deliberately — that is shared by
 *   every tab, and two tabs using one refresh token would each rotate it, so the second
 *   would present a used token and the server's reuse detection would sign both out.
 *
 * The tradeoff: a script injected into the page (XSS) can read sessionStorage. React
 * escapes everything it renders and this app never sets raw HTML, which is the defence
 * today. An httpOnly cookie, which no script can read, is the upgrade path.
 */

import type { TokenPair } from "../api/types";

const REFRESH_KEY = "smarthire.refresh_token";

let accessToken: string | null = null;
const signOutListeners = new Set<() => void>();

// sessionStorage can be unavailable (a privacy mode, a sandboxed frame); the session
// then lasts until the next reload instead of breaking the app.
let memoryRefreshToken: string | null = null;

function readRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return memoryRefreshToken;
  }
}

function writeRefreshToken(token: string | null): void {
  memoryRefreshToken = token;
  try {
    if (token === null) sessionStorage.removeItem(REFRESH_KEY);
    else sessionStorage.setItem(REFRESH_KEY, token);
  } catch {
    // Kept in memory above.
  }
}

export const session = {
  accessToken: (): string | null => accessToken,
  refreshToken: readRefreshToken,

  store(tokens: TokenPair): void {
    accessToken = tokens.access_token;
    writeRefreshToken(tokens.refresh_token);
  },

  /** Forget both tokens and tell whoever is listening — the UI returns to sign-in. */
  clear(): void {
    const hadSession = accessToken !== null || readRefreshToken() !== null;
    accessToken = null;
    writeRefreshToken(null);
    if (hadSession) signOutListeners.forEach((listener) => listener());
  },

  onSignedOut(listener: () => void): () => void {
    signOutListeners.add(listener);
    return () => signOutListeners.delete(listener);
  },
};
