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

import { refreshInFlight, refreshSession } from "../api/client";
import { authApi } from "../api/resources";
import type { User } from "../api/types";
import { session } from "./session";

/**
 * `keepPlace` says whether sign-in should return to the page that was showing. Yes for
 * a deep link or an expired session — the same person is coming back. No after the
 * sign-out button: whoever signs in next may be someone else, and the last page was
 * the previous user's.
 */
type AuthState =
  | { status: "loading" }
  | { status: "signed-out"; keepPlace: boolean }
  | { status: "signed-in"; user: User };

interface AuthContextValue {
  state: AuthState;
  signIn: (email: string, password: string) => Promise<void>;
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

  // A reload keeps the refresh token but not the access token: exchange it, then ask
  // who it belongs to. refreshSession is single-flight, so StrictMode's double effect
  // in development still presents the refresh token only once.
  useEffect(() => {
    if (state.status !== "loading") return;
    let cancelled = false;
    refreshSession()
      .then((outcome) => (outcome === "renewed" ? authApi.me() : null))
      .then((user) => {
        if (cancelled) return;
        setState(user ? { status: "signed-in", user } : { status: "signed-out", keepPlace: true });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signed-out", keepPlace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  // Signed out from anywhere — the button, or a refresh token the server refused.
  // The cache goes too: the next person to sign in must not see this one's data.
  // signOut sets keepPlace to false itself; arriving here otherwise means the session
  // expired under the same person.
  const deliberate = useRef(false);
  useEffect(
    () =>
      session.onSignedOut(() => {
        queryClient.clear();
        setState({ status: "signed-out", keepPlace: !deliberate.current });
        deliberate.current = false;
      }),
    [queryClient],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      session.store(await authApi.login(email, password));
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

  const signOut = useCallback(async () => {
    // A refresh in flight would store a new pair after the clear below, and revoking
    // the token it is replacing would achieve nothing. Let it land first.
    await refreshInFlight();
    const refreshToken = session.refreshToken();
    deliberate.current = true;
    session.clear(); // signed out here at once, whatever the network does next
    if (refreshToken) {
      // Revoked server-side in the background. If that fails, the token still expires.
      void authApi.logout(refreshToken).catch(() => undefined);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ state, signIn, signOut }}>{children}</AuthContext.Provider>
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
