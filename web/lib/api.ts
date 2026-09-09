export const API_URL =
  process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Carries the API's own code and details, because the UI branches on them:
 * a 409 from a version race is recoverable and gets a merge view, while a
 * 401 sends the user to sign in.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isConflict(): boolean {
    return this.status === 409;
  }

  get isUnauthorised(): boolean {
    return this.status === 401;
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      // The session is a cookie on a different origin, so it must be sent
      // explicitly; without this every request is anonymous.
      credentials: "include",
      headers: options.body ? { "content-type": "application/json" } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    // A dead API is the single most likely failure when running this locally,
    // so it gets a message that names the actual cause.
    throw new ApiError(
      0,
      "NETWORK",
      `Cannot reach the API at ${API_URL}. Is it running?`,
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = (payload as { error?: ApiErrorBody } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNKNOWN",
      error?.message ?? `Request failed with ${response.status}`,
      error?.details,
    );
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
