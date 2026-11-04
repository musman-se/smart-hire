import { useCallback, useState } from "react";

/**
 * The fields a user has finished with — left after typing something, or covered by a
 * submit attempt. Pair with visibleErrors() to decide which messages to show.
 */
export function useTouched<K extends string>() {
  const [touched, setTouched] = useState<ReadonlySet<K>>(() => new Set());

  const touch = useCallback((fields: readonly K[]) => {
    setTouched((current) =>
      fields.every((field) => current.has(field)) ? current : new Set([...current, ...fields]),
    );
  }, []);

  /** onBlur for a field: leaving an empty field untouched is not an error yet. */
  const touchOnBlur = useCallback(
    (field: K) => (event: { currentTarget: { value: string } }) => {
      if (event.currentTarget.value) touch([field]);
    },
    [touch],
  );

  return { touched, touch, touchOnBlur };
}
