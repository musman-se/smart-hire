import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * How one search param is read and written. `serialize` returns null to leave the
 * param out of the URL; values equal to the default are always left out, so a page
 * with no filters set has a clean URL.
 *
 * Declared with method syntax on purpose: methods are bivariant in their parameters,
 * which lets a UrlParam<string> sit in a schema typed as UrlParam<unknown>.
 */
export interface UrlParam<T> {
  defaultValue: T;
  parse(raw: string): T;
  serialize(value: T): string | null;
  /**
   * How a change to this param meets the Back button. "push" — a tab, a page, a picked
   * option — adds a history entry, so Back undoes it. "replace" — typed text, a slider,
   * an open drawer — rewrites the current entry, so Back is not spent on every keystroke.
   */
  history: UrlHistory;
}

export type UrlHistory = "push" | "replace";

interface HistoryOption {
  /** Overrides the type's usual history mode. */
  history?: UrlHistory;
}

export type UrlSchema = Record<string, UrlParam<unknown>>;

export type UrlStateOf<S extends UrlSchema> = {
  [K in keyof S]: S[K] extends UrlParam<infer T> ? T : never;
};

export type UrlStatePatch<S extends UrlSchema> = Partial<UrlStateOf<S>>;

/**
 * Parsers for the common cases. A bad value in the URL falls back to the default.
 * Free text (`string`) replaces the history entry; every other type is a discrete
 * choice and pushes one. Pass `{ history }` to say otherwise — a range slider, say.
 */
export const urlParam = {
  string: (defaultValue = "", { history = "replace" }: HistoryOption = {}): UrlParam<string> => ({
    defaultValue,
    history,
    parse: (raw) => raw,
    serialize: (value) => value || null,
  }),

  number: (
    defaultValue = 0,
    { min, max, history = "push" }: { min?: number; max?: number } & HistoryOption = {},
  ): UrlParam<number> => ({
    defaultValue,
    history,
    parse: (raw) => {
      const value = Number(raw);
      if (raw.trim() === "" || !Number.isFinite(value)) return defaultValue;
      if (min !== undefined && value < min) return defaultValue;
      if (max !== undefined && value > max) return defaultValue;
      return value;
    },
    serialize: (value) => String(value),
  }),

  /** A number that may be unset — "any" in a filter. */
  optionalNumber: ({ history = "push" }: HistoryOption = {}): UrlParam<number | undefined> => ({
    defaultValue: undefined,
    history,
    parse: (raw) => {
      const value = Number(raw);
      return raw.trim() === "" || !Number.isFinite(value) ? undefined : value;
    },
    serialize: (value) => (value === undefined ? null : String(value)),
  }),

  boolean: (defaultValue = false): UrlParam<boolean> => ({
    defaultValue,
    history: "push",
    parse: (raw) => raw === "1" || raw === "true",
    serialize: (value) => (value ? "1" : "0"),
  }),

  /** One of a fixed set — a status, a stage, a view. Anything else reads as the default. */
  oneOf: <const V extends string, D extends V | "" = "">(
    values: readonly V[],
    defaultValue: D = "" as D,
  ): UrlParam<V | D> => ({
    defaultValue,
    history: "push",
    parse: (raw) => ((values as readonly string[]).includes(raw) ? (raw as V) : defaultValue),
    serialize: (value) => value || null,
  }),

  /** A comma-separated list: ?skills=python,sql. */
  list: (defaultValue: string[] = []): UrlParam<string[]> => ({
    defaultValue,
    history: "push",
    parse: (raw) => raw.split(",").map((item) => item.trim()).filter(Boolean),
    serialize: (value) => (value.length > 0 ? value.join(",") : null),
  }),
};

export interface UrlStateOptions<S extends UrlSchema> {
  /**
   * A key reset to its default whenever any OTHER key changes — normally "offset", so
   * a new filter starts at page one instead of an empty page four.
   */
  resetOnChange?: keyof S & string;
}

export interface SetUrlStateOptions {
  /**
   * Overrides the history mode the changed params would choose. A correction the user
   * did not ask for — snapping a stale offset back onto the last page — passes
   * "replace", or Back would land on the stale URL and be corrected forward again.
   */
  history?: UrlHistory;
}

/**
 * Page state kept in the URL's search params: filters, tabs, pagination. The URL is
 * then shareable and survives a reload. Back steps through discrete choices — a tab,
 * a page, a picked filter — but not through every keystroke of a search: each param
 * says which it is (UrlParam.history), and an update pushes a history entry when any
 * param it changes asks to.
 *
 * Define the schema at module level, so the returned state object only changes when
 * the URL does:
 *
 *   const FILTERS = { search: urlParam.string(), offset: urlParam.number(0) };
 *   const [filters, setFilters] = useUrlState(FILTERS, { resetOnChange: "offset" });
 *   setFilters({ search: "python" });   // replaces the entry; also resets offset
 *   setFilters({ offset: 20 });         // pushes one
 *
 * Params not in the schema are left untouched.
 */
export function useUrlState<S extends UrlSchema>(schema: S, options: UrlStateOptions<S> = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { resetOnChange } = options;

  const serialized = searchParams.toString();
  const state = useMemo(
    () => readState(schema, new URLSearchParams(serialized)),
    [schema, serialized],
  );

  // react-router's params are those of the last render, so two updates in one tick
  // (page size, then page) would both start from the same URL and the second would
  // undo the first. Each update builds on the previous one until the URL it wrote has
  // rendered — and replaces the entry that one pushed, so one gesture is one Back.
  const unrendered = useRef<{ params: URLSearchParams; pushed: boolean } | null>(null);
  useEffect(() => {
    unrendered.current = null;
  }, [serialized]);

  const setState = useCallback(
    (
      patch: UrlStatePatch<S> | ((current: UrlStateOf<S>) => UrlStatePatch<S>),
      { history }: SetUrlStateOptions = {},
    ) => {
      const pending = unrendered.current;
      const current = pending?.params ?? searchParams;
      const next = new URLSearchParams(current);
      const currentState = readState(schema, current);
      const changes: Record<string, unknown> = typeof patch === "function" ? patch(currentState) : patch;

      const touched = Object.keys(changes).filter(
        (key) => key in schema && !sameValue(changes[key], currentState[key]),
      );
      if (resetOnChange && touched.some((key) => key !== resetOnChange)) {
        changes[resetOnChange] = schema[resetOnChange]?.defaultValue;
      }

      for (const [key, value] of Object.entries(changes)) {
        const param = schema[key];
        if (!param) continue;
        const raw = sameValue(value, param.defaultValue) ? null : param.serialize(value);
        if (raw === null) next.delete(key);
        else next.set(key, raw);
      }
      // Clicking the tab already open is not a step to go Back through.
      if (next.toString() === current.toString()) return;

      const wantsPush = history
        ? history === "push"
        : touched.some((key) => schema[key]?.history === "push");
      const push = wantsPush && !pending?.pushed;
      unrendered.current = { params: next, pushed: push || Boolean(pending?.pushed) };
      setSearchParams(next, { replace: !push });
    },
    [searchParams, setSearchParams, schema, resetOnChange],
  );

  return [state, setState] as const;
}

function readState<S extends UrlSchema>(schema: S, params: URLSearchParams): UrlStateOf<S> {
  const result: Record<string, unknown> = {};
  for (const [key, param] of Object.entries(schema)) {
    const raw = params.get(key);
    result[key] = raw === null ? param.defaultValue : param.parse(raw);
  }
  return result as UrlStateOf<S>;
}

/** Structural equality for the value shapes params hold: primitives and string lists. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}
