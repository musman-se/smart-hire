import { useEffect, useState } from "react";

/**
 * The value, once it has stopped changing for `delay` ms. For search boxes: the input
 * stays instant, the query keyed on the debounced value fires once per pause.
 */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
