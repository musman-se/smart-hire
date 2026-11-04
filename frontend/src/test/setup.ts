/**
 * Runs before every test file: DOM matchers, cleanup between tests, and the browser
 * APIs jsdom does not implement but the app's hooks call.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Globals are off (explicit imports read better), so Testing Library cannot register
// its own afterEach cleanup.
afterEach(() => cleanup());

// useMediaQuery and ThemeProvider: report "no match" for every query.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList;
}

// Node's own experimental localStorage shadows jsdom's and is undefined unless Node is
// started with --localstorage-file. An in-memory Storage, cleared per test, stands in.
if (!window.localStorage) {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    key: (index) => [...store.keys()][index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
  Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true });
  afterEach(() => store.clear());
}

// A data router (createMemoryRouter, needed for useBlocker) builds a fetch Request per
// navigation. Node's Request rejects jsdom's AbortSignal, and test routes have no
// loaders to abort, so the signal is dropped.
class SignalFreeRequest extends Request {
  constructor(input: RequestInfo | URL, init: RequestInit = {}) {
    const { signal: _signal, ...rest } = init;
    super(input, rest);
  }
}
globalThis.Request = SignalFreeRequest;
