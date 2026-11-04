import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button, IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { describeError } from "./Notice";
import { Spinner } from "./Spinner";

export type ToastTone = "success" | "error" | "info" | "loading";

export interface ToastOptions {
  description?: ReactNode;
  /** One follow-up, e.g. { label: "Undo", onClick }. Clicking it dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it dismisses itself; 0 keeps it until closed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  tone: ToastTone;
  title: ReactNode;
}

export interface PromiseMessages<T> {
  loading: ReactNode;
  success: ReactNode | ((value: T) => ReactNode);
  /** Defaults to the error's own title (RULE_COPY), as ErrorNotice would show it. */
  error?: ReactNode | ((error: unknown) => ReactNode);
}

export interface ToastApi {
  success: (title: ReactNode, options?: ToastOptions) => number;
  /** A message, or the caught error itself (an Error / ApiError), which is described
   * the way ErrorNotice would: RULE_COPY title, server message underneath. */
  error: (messageOrError: unknown, options?: ToastOptions) => number;
  info: (title: ReactNode, options?: ToastOptions) => number;
  /** A "loading" toast that turns into success or error when the promise settles.
   * Returns the promise, so `await toast.promise(save(), …)` still yields its value. */
  promise: <T>(promise: Promise<T>, messages: PromiseMessages<T>) => Promise<T>;
  dismiss: (id: number) => void;
}

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 5000,
  error: 8000,
  loading: 0,
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_ICON: Record<Exclude<ToastTone, "loading">, IconName> = {
  success: "check-circle",
  error: "alert-circle",
  info: "info",
};

/**
 * Transient confirmations ("Job published") in the corner. Two lists, each a live
 * region that is always mounted (a region has to exist before its content arrives to
 * be announced): errors in an assertive one, everything else in a polite one, so each
 * toast is announced once and at the right urgency. A loading toast that fails moves
 * across and is announced as the error. Hovering a toast pauses its timer.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, title: ReactNode, options: ToastOptions = {}) => {
    const id = nextId.current++;
    // Newest last; at most five, oldest dropped — a burst should not wall off the page.
    setToasts((current) => [...current, { id, tone, title, ...options }].slice(-5));
    return id;
  }, []);

  const update = useCallback((id: number, patch: Partial<ToastItem>) => {
    setToasts((current) =>
      current.map((toast) => (toast.id === id ? { ...toast, ...patch } : toast)),
    );
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, options) => show("success", title, options),
      info: (title, options) => show("info", title, options),
      error: (messageOrError, options) => {
        if (!(messageOrError instanceof Error)) {
          return show("error", messageOrError as ReactNode, options);
        }
        const { title, message } = describeError(messageOrError);
        return show("error", title, { description: message, ...options });
      },
      promise: (promise, messages) => {
        const id = show("loading", messages.loading);
        promise.then(
          (value) => {
            const title =
              typeof messages.success === "function" ? messages.success(value) : messages.success;
            update(id, { tone: "success", title, duration: DEFAULT_DURATION.success });
          },
          (error: unknown) => {
            const described = describeError(error);
            const title =
              messages.error === undefined
                ? described.title
                : typeof messages.error === "function"
                  ? messages.error(error)
                  : messages.error;
            update(id, {
              tone: "error",
              title,
              description: described.message,
              duration: DEFAULT_DURATION.error,
            });
          },
        );
        return promise;
      },
      dismiss,
    }),
    [show, update, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        <ol className="toast-list" aria-live="polite" aria-label="Notifications">
          {toasts
            .filter((toast) => toast.tone !== "error")
            .map((toast) => (
              <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
        </ol>
        <ol className="toast-list" aria-live="assertive" aria-label="Errors">
          {toasts
            .filter((toast) => toast.tone === "error")
            .map((toast) => (
              <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
        </ol>
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const duration = toast.duration ?? DEFAULT_DURATION[toast.tone];
  const { id } = toast;

  // Restarts from the full duration after a pause — simpler than tracking the
  // remainder, and a toast someone just hovered deserves the time anyway.
  useEffect(() => {
    if (paused || duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [paused, duration, onDismiss, id]);

  return (
    <li
      className={`toast toast-${toast.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {toast.tone === "loading" ? (
        <Spinner size="sm" label="" />
      ) : (
        <Icon name={TONE_ICON[toast.tone]} size={18} />
      )}
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.description && <div className="toast-description">{toast.description}</div>}
        {toast.action && (
          <Button
            size="sm"
            className="toast-action"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(id);
            }}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      <IconButton
        icon="x"
        size="sm"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
      />
    </li>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside <ToastProvider>");
  return toast;
}
