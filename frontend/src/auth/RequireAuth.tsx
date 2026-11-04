import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { Button, Card, EmptyState, PageLoader } from "../components/ui";
import { useAuth } from "./AuthProvider";

/** Sends anyone not signed in to /login — remembering where they were going, unless
 * they just signed out on purpose (see AuthState.keepPlace). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state, retry } = useAuth();
  const location = useLocation();

  if (state.status === "loading") return <PageLoader label="Signing you in…" />;
  if (state.status === "unavailable") {
    return (
      <div className="standalone-page">
        <Card className="standalone-card" role="alert">
          <EmptyState
            icon="alert-circle"
            title="The API is not answering"
            description="You are still signed in; it may be restarting."
            action={
              <Button variant="primary" leftIcon="refresh" onClick={retry}>
                Try again
              </Button>
            }
          />
        </Card>
      </div>
    );
  }
  if (state.status === "signed-out") {
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={state.keepPlace ? { from } : undefined} />;
  }
  return children;
}
