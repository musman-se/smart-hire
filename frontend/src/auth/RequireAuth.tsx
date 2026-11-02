import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Empty } from "../components/ui";
import { useAuth } from "./AuthProvider";

/** Sends anyone not signed in to /login — remembering where they were going, unless
 * they just signed out on purpose (see AuthState.keepPlace). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, retry } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <Empty>Signing you in…</Empty>;
  if (state.status === "unavailable") {
    return (
      <div className="auth-page">
        <div className="panel auth-card">
          <div className="notice notice-error" role="alert">
            <strong>The API is not answering</strong>
            You are still signed in; it may be restarting.
          </div>
          <button type="button" className="primary" onClick={retry}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (state.status === "signed-out") {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={state.keepPlace ? { from } : undefined} />;
  }
  return children;
}
