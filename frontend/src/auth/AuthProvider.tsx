import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { refreshSession } from "../api/client";
import { authApi } from "../api/resources";
import type { User } from "../api/types";
import { session } from "./session";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
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
    session.refreshToken() ? { status: "loading" } : { status: "signed-out" },
  );

  // A reload keeps the refresh token but not the access token: exchange it, then ask
  // who it belongs to. refreshSession is single-flight, so StrictMode's double effect
  // in development still presents the refresh token only once.
  useEffect(() => {
    if (state.status !== "loading") return;
    let cancelled = false;
    refreshSession()
      .then((renewed) => (renewed ? authApi.me() : null))
      .then((user) => {
        if (!cancelled) setState(user ? { status: "signed-in", user } : { status: "signed-out" });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "signed-out" });
      });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  // Signed out from anywhere — the button, or a refresh token the server refused.
  // The cache goes too: the next person to sign in must not see this one's data.
  useEffect(
    () =>
      session.onSignedOut(() => {
        queryClient.clear();
        setState({ status: "signed-out" });
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
    const refreshToken = session.refreshToken();
    if (refreshToken) {
      // Revoke it server-side. If that fails the token still expires on its own, and
      // this tab forgets it either way.
      await authApi.logout(refreshToken).catch(() => undefined);
    }
    session.clear();
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
