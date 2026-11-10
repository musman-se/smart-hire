/**
 * Typed fetch wrapper.
 *
 * The backend returns one error envelope for every failure:
 *
 *   { "error": { "code": "...", "message": "...", "request_id": "..." } }
 *
 * so this is the only place in the app that needs to know how failures look. Everything
 * above it catches an ApiError and reads `.code` — a stable identifier — instead of
 * pattern-matching prose.
 *
 * It is also the only place that knows about tokens. Every request carries the access
 * token; when one is refused as expired, the refresh token is exchanged for a new pair
 * and the request is sent once more. Pages never see an expiry — only a sign-out, when
 * the refresh token itself is no good.
 */

import { session } from "../auth/session";
import type { TokenPair } from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: the tsconfig sets
  // `erasableSyntaxOnly`, which bans any TypeScript syntax that emits runtime code.
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; request_id?: string };
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "unknown_error";
  let message = `Request failed with status ${response.status}.`;
  let requestId: string | undefined;

  try {
    const body = (await response.json()) as ErrorEnvelope;
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    requestId = body.error?.request_id;
  } catch {
    // A non-JSON body (a proxy error page, say) leaves the defaults in place.
  }

  return new ApiError(response.status, code, message, requestId);
}

/**
 * Drops undefined and empty values so unset filters do not appear in the query string.
 * A list repeats its key (`ids=a&ids=b`), which is how FastAPI reads one.
 */
export function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
      continue;
    }
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * renewed      a new pair is stored; retry the request
 * refused      the server rejected the refresh token, or there is none: signed out
 * unavailable  no answer about the token (a 502 mid-deploy): keep it, try again later
 */
export type RefreshOutcome = "renewed" | "refused" | "unavailable";

let refreshing: Promise<RefreshOutcome> | null = null;

/**
 * Waits before trying again when a refresh got no answer — all well inside the server's
 * REFRESH_REUSE_GRACE_SECONDS (10). An unanswered attempt may still have rotated the
 * token on the server. Presented again this soon, it is merely refused (signed out
 * here); presented after the window, the server would take it for theft and end every
 * session the user has.
 */
const RETRY_DELAYS_MS = [1000, 3000];

/**
 * How long after its first unanswered attempt a refresh token may still be presented
 * on its own. Two seconds short of the server's 10-second grace window: the server
 * counts from when it rotated the token — never earlier than when this tab sent it —
 * and the next attempt still has to travel there.
 */
export const UNANSWERED_LIMIT_MS = 8000;

/**
 * The refresh token whose exchange went unanswered, and when that first attempt was
 * sent. Without it, a poll that hits a 401 a minute later would present the token
 * again — after the grace window, which the server reads as theft.
 */
let unanswered: { token: string; since: number; lateAttemptUsed: boolean } | null = null;

function noteUnanswered(token: string, sentAt: number): void {
  if (unanswered?.token !== token) unanswered = { token, since: sentAt, lateAttemptUsed: false };
}

function noteAnswered(token: string): void {
  if (unanswered?.token === token) unanswered = null;
}

/**
 * Whether `token` may be sent to the server without risking every session the user
 * has: never left unanswered, or first left unanswered less than UNANSWERED_LIMIT_MS
 * ago. Sign-out asks too — the server answers a logout with a long-rotated token the
 * way it answers theft.
 */
export function mayPresentRefreshToken(token: string): boolean {
  return unanswered?.token !== token || Date.now() - unanswered.since <= UNANSWERED_LIMIT_MS;
}

/**
 * A 4xx is the server's answer about the token — 401 refused, 422 malformed (a parked
 * value that got corrupted), 403 not allowed — so the session is over. 408 and 429 are
 * about the request rather than the token: no answer, like a 5xx.
 */
function isRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * The session moved on while an exchange was in flight: change-password stored a new
 * pair, or the user signed out (and perhaps someone signed in). The answer about the
 * old token decides nothing now. "renewed" lets a waiting request go on with the new
 * pair only if it is the same sign-in — request() compares session.epoch().
 */
function outcomeNow(): RefreshOutcome {
  return session.refreshToken() ? "renewed" : "refused";
}

/** A pair issued for a token this tab no longer holds: nothing will ever use it, so it
 * is ended at once rather than left valid on the server until it expires. */
function endOrphan(refreshToken: string): void {
  void fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => undefined);
}

async function attemptRefresh(refreshToken: string): Promise<RefreshOutcome> {
  const sentAt = Date.now();
  let response: Response;
  let tokens: TokenPair | null = null;
  try {
    response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (response.ok) tokens = (await response.json()) as TokenPair;
  } catch {
    // The network, the API down, or a body that never arrived whole.
    noteUnanswered(refreshToken, sentAt);
    return "unavailable";
  }

  // Compare-and-set: an answer is applied only while the session still holds the token
  // it was about.
  const stillCurrent = session.refreshToken() === refreshToken;
  if (tokens) {
    noteAnswered(refreshToken);
    if (!stillCurrent) {
      endOrphan(tokens.refresh_token);
      return outcomeNow();
    }
    session.store(tokens);
    return "renewed";
  }
  if (isRefusal(response.status)) {
    noteAnswered(refreshToken);
    if (!stillCurrent) return outcomeNow();
    session.clear();
    return "refused";
  }
  noteUnanswered(refreshToken, sentAt); // a 502 mid-deploy: no answer about the token
  return "unavailable";
}

/**
 * Exchange the refresh token for a new pair. Single-flight: when several requests find
 * the access token expired at once, they all wait on one exchange. Each would otherwise
 * present the same refresh token, and the server would refuse all but the first — or,
 * after a few seconds, treat the repeat as theft and end every session.
 *
 * A token left unanswered for longer than UNANSWERED_LIMIT_MS is never presented again
 * automatically: the next 401 signs this tab out locally instead. `userInitiated` — the
 * "Try again" a person presses when SmartHire could not be reached — may present it
 * once more. If the unanswered attempt never reached the server, that is the only way
 * back into the session; if it did, the server ends every session the user has, a risk
 * the person chose over signing in again. A second press signs out.
 */
export function refreshSession({
  userInitiated = false,
}: { userInitiated?: boolean } = {}): Promise<RefreshOutcome> {
  refreshing ??= (async (): Promise<RefreshOutcome> => {
    const refreshToken = session.refreshToken();
    if (!refreshToken) return "refused";

    if (!mayPresentRefreshToken(refreshToken)) {
      if (!userInitiated || !unanswered || unanswered.lateAttemptUsed) {
        session.clear();
        return "refused";
      }
      unanswered.lateAttemptUsed = true;
      return attemptRefresh(refreshToken);
    }

    let outcome = await attemptRefresh(refreshToken);
    for (const delay of RETRY_DELAYS_MS) {
      if (outcome !== "unavailable") break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (session.refreshToken() !== refreshToken) return outcomeNow();
      // A slow network can use the window up inside these retries. That stays
      // "unavailable": the next automatic attempt signs out, a person's "Try again"
      // gets one more.
      if (!mayPresentRefreshToken(refreshToken)) break;
      outcome = await attemptRefresh(refreshToken);
    }
    return outcome;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/** Resolves once any refresh under way has settled. */
export async function refreshInFlight(): Promise<void> {
  await refreshing?.catch(() => undefined);
}

interface RequestOptions extends RequestInit {
  /** Send no token and never refresh — for the endpoints that hand tokens out. */
  anonymous?: boolean;
  /** Failure statuses whose JSON body is the answer rather than an error envelope —
   * /health/ready says *what* is down in its 503. */
  acceptStatus?: readonly number[];
}

async function request<T>(path: string, init: RequestOptions = {}, isRetry = false): Promise<T> {
  const { anonymous, acceptStatus, ...fetchInit } = init;
  const token = anonymous ? null : session.accessToken();
  const signedIn = session.epoch();
  const response = await fetch(`${BASE_URL}${path}`, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchInit.headers,
    },
  });

  if (response.status === 401 && !anonymous) {
    // No access token yet (a reload) or an expired one: renew it, then try once more.
    // A refresh that got no answer leaves the session alone and reports this 401.
    const outcome = isRetry ? "refused" : await refreshSession();
    // Replayed only for the sign-in that sent it. Signed out and back in meanwhile —
    // perhaps as someone else — the request is not theirs: it fails as the 401 it got.
    if (outcome === "renewed" && session.epoch() === signedIn) return request<T>(path, init, true);
    // Refused with a fresh token, or nothing to refresh with: signed out — unless the
    // session moved on after this request was signed (change-password stored a new
    // pair), when this 401 says nothing about it.
    if (outcome === "refused" && session.accessToken() === token) session.clear();
  }

  if (!response.ok) {
    if (acceptStatus?.includes(response.status)) {
      try {
        return (await response.clone().json()) as T;
      } catch {
        // Not JSON (a proxy's error page): an error after all.
      }
    }
    throw await toApiError(response);
  }

  // 204 No Content has no body to parse — DELETE endpoints return it.
  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/**
 * A fresh Idempotency-Key. Create one per *intended action* and resend the same one if
 * that action is retried; the backend then replays its first answer instead of acting
 * twice. See backend/app/core/idempotency.py.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  // randomUUID exists only in secure contexts — HTTPS, or localhost. Opened over plain
  // HTTP from another machine (http://192.168.x.x:3000, say) it is undefined, and the
  // console would crash. getRandomValues works everywhere: build a version-4 UUID.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const api = {
  get: <T>(path: string, options?: { acceptStatus?: readonly number[] }) =>
    request<T>(path, { acceptStatus: options?.acceptStatus }),
  post: <T>(
    path: string,
    body?: unknown,
    options?: { idempotencyKey?: string; anonymous?: boolean },
  ) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      headers: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {},
      anonymous: options?.anonymous,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
