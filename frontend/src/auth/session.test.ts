import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PARKED_KEY = "smarthire.refresh_token";

/** session.ts reads storage when it loads — as a new page would — so each test loads
 * it afresh. */
async function loadSession() {
  vi.resetModules();
  return import("./session");
}

function park(token: string, parkedAt: number) {
  sessionStorage.setItem(PARKED_KEY, JSON.stringify({ token, parkedAt }));
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-10T09:00:00Z") });
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  sessionStorage.clear();
});

describe("session", () => {
  // First: every load of the module adds its own listeners to window, and an earlier
  // one would take the parked token before this one could.
  it("restores from the back/forward cache with a longer window", async () => {
    const { session, PARKED_RELOAD_MS, PARKED_BFCACHE_MS } = await loadSession();
    const restored = vi.fn();
    const stop = session.onRestored(restored);

    park("refresh-c", Date.now() - PARKED_RELOAD_MS * 3);
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(session.refreshToken()).toBe("refresh-c");
    expect(restored).toHaveBeenCalledTimes(1);

    park("refresh-d", Date.now() - PARKED_BFCACHE_MS - 1);
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(session.refreshToken()).toBeNull();
    stop();
  });

  it("takes back a token parked moments ago — a reload — and deletes it from storage", async () => {
    park("refresh-a", Date.now() - 2000);
    const { session } = await loadSession();
    expect(session.refreshToken()).toBe("refresh-a");
    expect(sessionStorage.getItem(PARKED_KEY)).toBeNull();
  });

  it("refuses a token parked long ago: a closed tab reopened by whoever sits down next", async () => {
    const { PARKED_RELOAD_MS } = await loadSession();
    park("refresh-a", Date.now() - PARKED_RELOAD_MS - 1);
    const { session } = await loadSession();
    expect(session.refreshToken()).toBeNull();
    expect(sessionStorage.getItem(PARKED_KEY)).toBeNull();
  });

  it("lets a reload the app started itself wait longer, but never past its cap", async () => {
    const { PARKED_APP_RELOAD_MS } = await loadSession();
    sessionStorage.setItem(
      PARKED_KEY,
      JSON.stringify({ token: "slow-reload", parkedAt: Date.now() - 60_000, maxAgeMs: PARKED_APP_RELOAD_MS }),
    );
    expect((await loadSession()).session.refreshToken()).toBe("slow-reload");

    // A stored value asking for longer than the cap gets the cap.
    sessionStorage.setItem(
      PARKED_KEY,
      JSON.stringify({ token: "forged", parkedAt: Date.now() - PARKED_APP_RELOAD_MS - 1, maxAgeMs: 86_400_000 }),
    );
    expect((await loadSession()).session.refreshToken()).toBeNull();
  });

  it("refuses a bare token from before parking had a time, and anything malformed", async () => {
    sessionStorage.setItem(PARKED_KEY, "refresh-legacy");
    expect((await loadSession()).session.refreshToken()).toBeNull();
    sessionStorage.setItem(PARKED_KEY, JSON.stringify({ token: 42, parkedAt: Date.now() }));
    expect((await loadSession()).session.refreshToken()).toBeNull();
  });

  it("parks the token with the time on pagehide", async () => {
    const { session } = await loadSession();
    session.store({ access_token: "a", refresh_token: "refresh-b", token_type: "bearer", expires_in: 900 });
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(sessionStorage.getItem(PARKED_KEY) ?? "null")).toEqual({
      token: "refresh-b",
      parkedAt: Date.now(),
    });
    session.clear();
  });
});
