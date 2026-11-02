import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Empty } from "../components/ui";
import { useAuth } from "./AuthProvider";

/** Sends anyone not signed in to /login — remembering where they were going, unless
 * they just signed out on purpose (see AuthState.keepPlace). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <Empty>Signing you in…</Empty>;
  if (state.status === "signed-out") {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={state.keepPlace ? { from } : undefined} />;
  }
  return children;
}
