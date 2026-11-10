import { Component, type ErrorInfo, type ReactNode } from "react";

import { isChunkLoadError } from "../../lib/chunkReload";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback; gets the error and a reset that re-renders the children. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called on reset, to clear whatever state caused the crash. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render crash in its subtree and shows a recoverable fallback instead of a
 * blank page. The shell keys one by route, so navigating away also recovers. A class,
 * because React still has no hook for this.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render error caught by ErrorBoundary", error, info.componentStack);
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    // For a lazy page whose code failed to download, ErrorFallback offers a reload
    // instead of the reset: React caches the rejected import, so re-rendering the same
    // page can never recover it.
    return <ErrorFallback error={error} onRetry={this.reset} />;
  }
}

/** The friendly crash screen, also used by the router's errorElement. */
export function ErrorFallback({
  error,
  onRetry,
  title = "Something went wrong",
}: {
  error?: unknown;
  onRetry?: () => void;
  title?: string;
}) {
  const message = error instanceof Error ? error.message : error ? String(error) : null;
  const staleBuild = isChunkLoadError(error);
  return (
    <div className="card error-fallback" role="alert">
      <span className="error-fallback-icon" aria-hidden="true">
        <Icon name="alert-triangle" size={22} />
      </span>
      <h2>{staleBuild ? "SmartHire has been updated" : title}</h2>
      <p className="muted">
        {staleBuild
          ? "This page could not load its code — usually because a new version was released while it was open. Reload to get it."
          : "This part of the page failed to load. Trying again usually fixes it; if not, reload the page."}
      </p>
      {import.meta.env.DEV && message && <pre>{message}</pre>}
      <div className="button-row">
        {staleBuild ? (
          <Button variant="primary" leftIcon="refresh" onClick={() => window.location.reload()}>
            Reload
          </Button>
        ) : (
          onRetry && (
            <Button variant="primary" leftIcon="refresh" onClick={onRetry}>
              Try again
            </Button>
          )
        )}
        <Button variant="ghost" onClick={() => window.location.assign("/")}>
          Go to start
        </Button>
      </div>
    </div>
  );
}
