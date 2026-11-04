import { isRouteErrorResponse, useRouteError } from "react-router-dom";

import { ErrorFallback } from "./ui";

/**
 * The router's errorElement: a failed lazy import (a deploy replaced the chunk this
 * tab wanted) or a crash outside any page's own ErrorBoundary. Reloading fetches the
 * new build, so that is the retry offered.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error)
    ? `${error.status} — ${error.statusText || "Something went wrong"}`
    : "Something went wrong";

  return (
    <div className="standalone-page">
      <ErrorFallback
        error={isRouteErrorResponse(error) ? error.data : error}
        title={title}
        onRetry={() => window.location.reload()}
      />
    </div>
  );
}
