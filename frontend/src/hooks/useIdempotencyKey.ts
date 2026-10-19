import { useRef } from "react";

import { newIdempotencyKey } from "../api/client";

/**
 * One Idempotency-Key per intended action.
 *
 * The key stays the same while the input is unchanged, so pressing Submit again after
 * a network error resends it — and if the first attempt had in fact reached the server,
 * the backend replays its answer instead of creating a duplicate. Change the input and
 * it is a different action, with a fresh key.
 */
export function useIdempotencyKey(input: unknown): string {
  const serialized = JSON.stringify(input);
  const current = useRef<{ input: string; key: string } | null>(null);

  if (current.current === null || current.current.input !== serialized) {
    current.current = { input: serialized, key: newIdempotencyKey() };
  }
  return current.current.key;
}
