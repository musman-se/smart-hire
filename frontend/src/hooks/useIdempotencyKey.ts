import { useCallback, useRef } from "react";

import { ApiError, newIdempotencyKey } from "../api/client";

/**
 * One Idempotency-Key per intended action.
 *
 * The key stays the same while the input is unchanged *and the server has not
 * answered*. Pressing Submit again after a timeout or a dropped connection therefore
 * resends it — and if the first attempt did reach the server, the backend replays that
 * answer instead of acting twice.
 *
 * Once the server answers — success or refusal — that action is over: call `settle`
 * with the outcome, and the next submit is a new action with a new key. Keeping the key
 * after a refusal would replay the stored refusal for a day, even after its cause was
 * fixed (the job reopened, the candidate's profile updated). A 5xx is not an answer:
 * the server releases the key, so it is kept for the retry. Changing the input also
 * starts a new action.
 */
export function useIdempotencyKey(input: unknown) {
  const serialized = JSON.stringify(input);
  const current = useRef<{ input: string; key: string } | null>(null);

  if (current.current === null || current.current.input !== serialized) {
    current.current = { input: serialized, key: newIdempotencyKey() };
  }

  const settle = useCallback((error: unknown) => {
    const unanswered =
      error !== null &&
      error !== undefined &&
      (!(error instanceof ApiError) || error.status >= 500);
    // Cleared, so the next render — the mutation's own state change triggers one —
    // generates a fresh key.
    if (!unanswered) current.current = null;
  }, []);

  return { key: current.current.key, settle };
}
