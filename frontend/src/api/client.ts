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

/** Drops undefined and empty values so unset filters do not appear in the query string. */
export function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

let refreshing: Promise<boolean> | null = null;

/**
 * Exchange the refresh token for a new pair. Single-flight: when several requests find
 * the access token expired at once, they all wait on one exchange. Each would otherwise
 * present the same refresh token, and the server — seeing a used token presented again
 * — would treat it as stolen and end the session.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = session.refreshToken();
    if (!refreshToken) return false;

    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (response.ok) {
      session.store((await response.json()) as TokenPair);
      return true;
    }
    // Refused: the session is over. Anything else (a 502 mid-deploy) is not an answer
    // about the token, so it is kept for the next attempt.
    if (response.status === 401) session.clear();
    return false;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

interface RequestOptions extends RequestInit {
  /** Send no token and never refresh — for the endpoints that hand tokens out. */
  anonymous?: boolean;
}

async function request<T>(path: string, init: RequestOptions = {}, isRetry = false): Promise<T> {
  const { anonymous, ...fetchInit } = init;
  const token = anonymous ? null : session.accessToken();
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
    if (!isRetry && (await refreshSession())) return request<T>(path, init, true);
    // Refused even with a fresh token, or nothing to refresh with: signed out.
    session.clear();
  }

  if (!response.ok) {
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
  get: <T>(path: string) => request<T>(path),
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
