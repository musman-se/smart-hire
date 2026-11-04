import { useCallback, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";

/** Where values go when storage is blocked (private mode, a sandboxed frame). */
const memory = new Map<string, string>();
/** Every hook instance in this tab, so a write reaches all readers of the key at once. */
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string) {
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Still applied in memory for this session.
    memory.set(key, raw);
  }
  listeners.forEach((notify) => notify());
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A value that is not ours.
    return fallback;
  }
}

/** Same-tab writes notify through `listeners`; other tabs' through the storage event. */
function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/**
 * useState that survives a reload, for UI preferences only — never for anything
 * sensitive (tokens live in auth/session.ts, by design not here). Every component
 * using the same key sees the same value, in this tab and in others: the shell's
 * sidebar and the profile page's "Compact sidebar" switch stay in step.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // Kept from the first render, so a caller's fresh literal is not a new value each time.
  const [fallback] = useState(initialValue);
  // The raw string is the snapshot: strings compare by value, so reads are stable.
  const raw = useSyncExternalStore(subscribe, () => readRaw(key));
  const value = useMemo(() => parse(raw, fallback), [raw, fallback]);

  const update = useCallback(
    (next: SetStateAction<T>) => {
      // Read back from storage, not from the render, so two updates in a row compose.
      const current = parse(readRaw(key), fallback);
      const resolved = next instanceof Function ? next(current) : next;
      writeRaw(key, JSON.stringify(resolved));
    },
    [key, fallback],
  );

  return [value, update] as const;
}
