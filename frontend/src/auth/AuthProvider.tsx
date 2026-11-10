import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { ApiError, mayPresentRefreshToken, refreshSession } from "../api/client";
import { authApi } from "../api/resources";
import type { TokenPair, User } from "../api/types";
import { clearAllRecentItems } from "../components/palette/recent";
import { session } from "./session";

/**
 * `keepPlace` says whether sign-in should return to the page that was showing. Yes for
 * a deep link or an expired session — the same person is coming back. No after the
 * sign-out button: whoever signs in next may be someone else, and the last page was
 * the previous user's.
 */
type AuthState =
  | { status: "loading" }
  | { status: "unavailable" } // a session to restore, but the API did not answer
  | { status: "signed-out"; keepPlace: boolean }
  | { status: "signed-in"; user: User };

interface AuthContextValue {
  state: AuthState;
  /** From "unavailable": try restoring the session again. */
  retry: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign in with a pair some other endpoint handed out — accepting an invitation
   * answers with one, so the new recruiter does not type their password twice. */
  adoptSession: (tokens: TokenPair) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Who is signed in, for the whole app. The server decides what each role may do; the
 * console only uses the role to show the screens and buttons that apply.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() =>
    session.refreshToken() ? { status: "loading" } : { status: "signed-out", keepPlace: true },
  );
  // Set by retry(): the next restore was asked for by a person, not by a page load.
  const userRetry = useRef(false);

  // A reload keeps the refresh token but not the access token: exchange it, then ask
  // who it belongs to. refreshSession is single-flight, so StrictMode's double effect
  // in development still presents the refresh token only once.
  //
  // An API that does not answer — a deploy, a network blip — is not a sign-out. The
  // token is still good, so the user is offered a retry, not the sign-in form.
  useEffect(() => {
    if (state.status !== "loading") return;
    let cancelled = false;
    const settle = (next: AuthState) => {
      if (!cancelled) setState(next);
    };
    const userInitiated = userRetry.current;
    userRetry.current = false;
    refreshSession({ userInitiated })
      .then(async (outcome) => {
        if (outcome === "refused") return settle({ status: "signed-out", keepPlace: true });
        if (outcome === "unavailable") return settle({ status: "unavailable" });
        try {
          settle({ status: "signed-in", user: await authApi.me() });
        } catch (error) {
          // A 401 here has already signed out, through client.ts; anything else is the
          // API failing to answer.
          const refused = error instanceof ApiError && error.status === 401;
          settle(refused ? { status: "signed-out", keepPlace: true } : { status: "unavailable" });
        }
      })
      // Never left on "Signing you in…" with no way out.
      .catch(() => settle({ status: "unavailable" }));
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const retry = useCallback(() => {
    userRetry.current = true;
    setState({ status: "loading" });
  }, []);

  // Signed out by the server — a refresh token it refused. The same person is coming
  // back, so sign-in returns them to their page. The cache goes too: whoever signs in
  // next must not see this one's data.
  useEffect(
    () =>
      session.onSignedOut(() => {
        queryClient.clear();
        clearAllRecentItems();
        setState({ status: "signed-out", keepPlace: true });
      }),
    [queryClient],
  );

  // Back from the back/forward cache with a parked token, which may belong to someone
  // other than the user this page last showed: start again from the token, with an
  // empty cache, exactly as a fresh page load would.
  useEffect(
    () =>
      session.onRestored(() => {
        queryClient.clear();
        setState({ status: "loading" });
      }),
    [queryClient],
  );

  const adoptSession = useCallback(
    async (tokens: TokenPair) => {
      session.begin(tokens);
      let user: User;
      try {
        user = await authApi.me();
      } catch (error) {
        session.clear(); // all or nothing: no half-signed-in tab
        throw error;
      }
      queryClient.clear();
      setState({ status: "signed-in", user });
    },
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => adoptSession(await authApi.login(email, password)),
    [adoptSession],
  );

  const signOut = useCallback(async () => {
    // Signed out here at once, whatever the network is doing. A refresh still in flight
    // finds the session gone when it lands, and ends the pair it was given itself
    // (client.ts), so nothing is left behind by not waiting for it — which could take
    // seconds of retries, with nothing on screen.
    const refreshToken = session.refreshToken();
    session.clear();
    // Set here, after the listener: the button means whoever signs in next may be
    // someone else, so they start from the beginning, not the last user's page.
    queryClient.clear();
    setState({ status: "signed-out", keepPlace: false });
    // Ended server-side in the background; if that fails, the token still expires. Not
    // a token whose last exchange went unanswered long ago: the server would take that
    // logout for theft and end the user's other sessions too.
    if (refreshToken && mayPresentRefreshToken(refreshToken)) {
      void authApi.logout(refreshToken).catch(() => undefined);
    }
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ state, retry, signIn, adoptSession, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}

/** The signed-in user. Only for screens behind <RequireAuth>, where there always is one. */
export function useUser(): User {
  const { state } = useAuth();
  if (state.status !== "signed-in") throw new Error("useUser needs a signed-in user");
  return state.user;
}
