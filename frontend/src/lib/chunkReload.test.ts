import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChunkLoadError, RELOAD_GUARD_MS, isChunkLoadError, loadChunk } from "./chunkReload";

const reload = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-10T09:00:00Z") });
  sessionStorage.clear();
  vi.stubGlobal("location", { ...window.location, reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  reload.mockReset();
});

const missing = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));

describe("loadChunk", () => {
  it("reloads once when a page's code is gone after a deploy", async () => {
    void loadChunk(missing);
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("throws instead of reloading again moments later, so it can never loop", async () => {
    void loadChunk(missing);
    await vi.advanceTimersByTimeAsync(0);
    // The reloaded page fails too: the server, not a deploy.
    const error = await loadChunk(missing).catch((caught: unknown) => caught);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ChunkLoadError);
    expect(isChunkLoadError(error)).toBe(true);
  });

  it("reloads again for a later deploy, once a chunk has loaded in between", async () => {
    void loadChunk(missing);
    await vi.advanceTimersByTimeAsync(0);
    await loadChunk(() => Promise.resolve({ Page: "ok" }));
    void loadChunk(missing);
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("reloads again once the guard has run out", async () => {
    void loadChunk(missing);
    await vi.advanceTimersByTimeAsync(RELOAD_GUARD_MS);
    void loadChunk(missing);
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
