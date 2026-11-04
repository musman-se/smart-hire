import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmOptions {
  title: ReactNode;
  body?: ReactNode;
  /** Default "Confirm" — prefer the verb: "Delete job", "Withdraw". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red and focuses Cancel first, so a stray
   * Enter does not destroy anything. */
  tone?: "default" | "danger";
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Disables both buttons and spins the confirm one while the action runs. */
  busy?: boolean;
}

/** The controlled dialog. Most code wants useConfirm() instead. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      initialFocus={tone === "danger" ? cancelRef : confirmRef}
      footer={
        <>
          <Button ref={cancelRef} variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <div className="muted">{body}</div>}
    </Modal>
  );
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

interface Pending {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/**
 * Hosts one confirm dialog for the whole app, so asking is a one-liner wherever it is
 * needed:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete this job?", tone: "danger", confirmLabel: "Delete" })) …
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  // The same request, readable synchronously from confirm() without a stale closure.
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A second ask while one is open answers the first "no" — a promise is never
        // left hanging.
        pendingRef.current?.resolve(false);
        pendingRef.current = { options, resolve };
        setPending(pendingRef.current);
      }),
    [],
  );

  const settle = (confirmed: boolean) => {
    pendingRef.current?.resolve(confirmed);
    pendingRef.current = null;
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <ConfirmDialog
          open
          {...pending.options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** Resolves true on confirm; false on cancel, Escape or a click outside. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>");
  return confirm;
}
