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
 */

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

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
  post: <T>(path: string, body?: unknown, options?: { idempotencyKey?: string }) =>
    request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
      headers: options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {},
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
