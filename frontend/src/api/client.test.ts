import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { session } from "../auth/session";
import { UNANSWERED_LIMIT_MS, api, mayPresentRefreshToken, refreshSession, toQuery } from "./client";

const PAIR = { access_token: "access-2", refresh_token: "refresh-2", token_type: "bearer", expires_in: 900 };

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchMock = vi.fn<typeof fetch>();

/** The refresh token each /auth/refresh call presented, in order. */
function refreshesPresented(): string[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/auth/refresh"))
    .map(([, init]) => JSON.parse(String(init?.body)).refresh_token as string);
}

function logoutsSent(): string[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith("/auth/logout"))
    .map(([, init]) => JSON.parse(String(init?.body)).refresh_token as string);
}

/** Runs a refresh to the end, through its 1 s and 3 s retry waits. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(5000);
  return promise;
}

// A fresh token per test: client.ts remembers unanswered tokens across calls, by design.
let tokenCount = 0;
let current = "";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchMock);
  current = `refresh-1-${(tokenCount += 1)}`;
  session.store({ access_token: "access-1", refresh_token: current, token_type: "bearer", expires_in: 900 });
});

afterEach(() => {
  session.clear();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("refreshSession", () => {
  it("stores the new pair", async () => {
    fetchMock.mockResolvedValue(json(200, PAIR));
    expect(await settle(refreshSession())).toBe("renewed");
    expect(session.refreshToken()).toBe("refresh-2");
  });

  it.each([401, 403, 422])("treats a %s as the server refusing the token", async (status) => {
    fetchMock.mockResolvedValue(json(status));
    expect(await settle(refreshSession())).toBe("refused");
    expect(session.refreshToken()).toBeNull();
    expect(refreshesPresented()).toEqual([current]); // no retries: that was an answer
  });

  it.each([408, 429, 502])("treats a %s as no answer, and keeps the token", async (status) => {
    fetchMock.mockResolvedValue(json(status));
    expect(await settle(refreshSession())).toBe("unavailable");
    expect(session.refreshToken()).toBe(current);
    expect(refreshesPresented()).toHaveLength(3); // the attempt, then two retries
  });

  it("never presents a long-unanswered token by itself again: it signs out instead", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await settle(refreshSession())).toBe("unavailable");
    expect(refreshesPresented()).toHaveLength(3);

    // The server may have rotated it on that first attempt. Past the window, showing it
    // again would read as theft and end every session the user has.
    await vi.advanceTimersByTimeAsync(UNANSWERED_LIMIT_MS);
    expect(mayPresentRefreshToken(current)).toBe(false);
    expect(await settle(refreshSession())).toBe("refused");
    expect(refreshesPresented()).toHaveLength(3);
    expect(session.refreshToken()).toBeNull();
  });

  it("lets a person's own retry present it once more, and no more", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await settle(refreshSession());
    await vi.advanceTimersByTimeAsync(UNANSWERED_LIMIT_MS);

    expect(await settle(refreshSession({ userInitiated: true }))).toBe("unavailable");
    expect(refreshesPresented()).toHaveLength(4);

    expect(await settle(refreshSession({ userInitiated: true }))).toBe("refused");
    expect(refreshesPresented()).toHaveLength(4);
  });

  it("stops retrying once the window has passed during the retries themselves", async () => {
    // A hung network: each attempt takes 5 s to fail.
    fetchMock.mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new TypeError("timeout")), 5000)),
    );
    const outcome = refreshSession();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await outcome).toBe("unavailable");
    // 0 s: first attempt; 6 s: second (inside 8 s); 14 s would be past it — not sent.
    expect(refreshesPresented()).toHaveLength(2);
  });

  it("drops an answer about a token the session no longer holds (compare-and-set)", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockImplementation((url) =>
      String(url).endsWith("/auth/refresh")
        ? new Promise<Response>((resolve) => (answer = resolve))
        : Promise.resolve(new Response(null, { status: 204 })),
    );
    const outcome = refreshSession();
    await vi.advanceTimersByTimeAsync(0);

    // Meanwhile a password change stored a pair of its own.
    session.store({ access_token: "access-pw", refresh_token: "refresh-pw", token_type: "bearer", expires_in: 900 });
    answer(json(200, PAIR));

    expect(await outcome).toBe("renewed");
    expect(session.refreshToken()).toBe("refresh-pw");
    // The pair nobody holds is ended rather than left valid on the server.
    expect(logoutsSent()).toEqual(["refresh-2"]);
  });

  it("does not sign out a session that moved on while a refusal was in flight", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    const outcome = refreshSession();
    await vi.advanceTimersByTimeAsync(0);

    session.store({ access_token: "access-pw", refresh_token: "refresh-pw", token_type: "bearer", expires_in: 900 });
    answer(json(401));

    expect(await outcome).toBe("renewed");
    expect(session.refreshToken()).toBe("refresh-pw");
  });
});

describe("replaying a request after a refresh", () => {
  it("replays it with the renewed token in the same sign-in", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, PAIR))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await expect(api.get("/jobs")).resolves.toEqual({ ok: true });
    const replay = fetchMock.mock.calls[2]?.[1];
    expect(new Headers(replay?.headers).get("Authorization")).toBe("Bearer access-2");
  });

  it("never replays it for someone who signed in while it waited", async () => {
    let answer!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValue(json(200, { secret: "of the next user" }));
    const pending = api.get("/applications").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);

    // Signed out, and another person signs in on this tab.
    session.clear();
    session.begin({ access_token: "access-b", refresh_token: "refresh-b", token_type: "bearer", expires_in: 900 });
    answer(json(200, PAIR));

    expect(await pending).toMatchObject({ status: 401 });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/applications"))).toHaveLength(1);
    expect(session.accessToken()).toBe("access-b"); // the new sign-in is untouched
  });
});

describe("api", () => {
  it("repeats a list parameter's key, and drops empty values", () => {
    expect(toQuery({ ids: ["a", "b"], skill: "", limit: 2 })).toBe("?ids=a&ids=b&limit=2");
  });

  it("reads an accepted failure status as the answer", async () => {
    fetchMock.mockResolvedValue(json(503, { status: "degraded", database: "unreachable" }));
    await expect(api.get("/health/ready", { acceptStatus: [503] })).resolves.toEqual({
      status: "degraded",
      database: "unreachable",
    });
  });
});
