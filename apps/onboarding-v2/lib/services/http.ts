import { getConfig } from "@/lib/config/env";
import type { ApiError } from "@/lib/contracts/onboarding";
import { PublicApiError, publicMessage } from "@/lib/domain/errors";
import { randomUrlToken, sha256Hmac, uuid } from "@/lib/security/crypto";

const MAX_JSON_BYTES = 16 * 1024;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export type RequestContext = {
  request: Request;
  traceId: string;
  browserSecret: string;
  browserBindingHash: string;
  csrfToken: string;
  setCookie?: string;
};

export type SetCookie = string | readonly string[] | undefined;

export async function withApi(
  request: Request,
  handler: (context: RequestContext) => Promise<Response>,
  options: { mutation?: boolean; callback?: boolean } = {},
): Promise<Response> {
  const traceId = uuid();
  try {
    rateLimit(request);
    const context = buildContext(request);
    if (options.mutation) assertBrowserMutation(request, context);
    return await handler(context);
  } catch (error) {
    return errorResponse(error, traceId);
  }
}

export async function withCallbackRedirect(
  request: Request,
  handler: (context: RequestContext) => Promise<{ redirectPath: string; setCookie?: SetCookie }>,
): Promise<Response> {
  try {
    rateLimit(request);
    const context = buildContext(request);
    const result = await handler(context);
    return redirect303(result.redirectPath, mergeSetCookies(context.setCookie, result.setCookie));
  } catch {
    return redirect303("/connection-error");
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new PublicApiError("VALIDATION_FAILED");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new PublicApiError("RATE_LIMITED", 429, { retryAfterMs: 30_000 });
  const text = await readBoundedText(request, MAX_JSON_BYTES);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new PublicApiError("VALIDATION_FAILED");
  }
}

export function jsonResponse(value: unknown, init: ResponseInit = {}, setCookie?: SetCookie): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  headers.set("x-content-type-options", "nosniff");
  appendSetCookies(headers, setCookie);
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function redirect303(path: string, setCookie?: SetCookie): Response {
  const headers = new Headers({ location: path, "cache-control": "no-store", "referrer-policy": "no-referrer" });
  appendSetCookies(headers, setCookie);
  return new Response(null, {
    status: 303,
    headers,
  });
}

export function refreshBrowserCookie(context: RequestContext): string {
  const config = getConfig();
  return serializeCookie(config.cookieName, context.browserSecret, config.cookieSecure);
}

async function readBoundedText(request: Request, limitBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new PublicApiError("RATE_LIMITED", 429, { retryAfterMs: 30_000 });
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

export function buildContext(request: Request): RequestContext {
  const config = getConfig();
  const cookies = parseCookies(request.headers.get("cookie"));
  let browserSecret = cookies[config.cookieName];
  let setCookie: string | undefined;
  if (!browserSecret || browserSecret.length < 32) {
    browserSecret = randomUrlToken();
    setCookie = serializeCookie(config.cookieName, browserSecret, config.cookieSecure);
  }
  const browserBindingHash = sha256Hmac(config.browserSecretKey, browserSecret);
  const csrfToken = sha256Hmac(config.browserSecretKey, `csrf:${browserSecret}`);
  const context: RequestContext = {
    request,
    traceId: uuid(),
    browserSecret,
    browserBindingHash,
    csrfToken,
  };
  if (setCookie) context.setCookie = setCookie;
  return context;
}

function assertBrowserMutation(request: Request, context: RequestContext): void {
  const origin = request.headers.get("origin");
  const config = getConfig();
  if (!origin || origin !== config.appOrigin) throw new PublicApiError("CSRF_REJECTED", 403);
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw new PublicApiError("CSRF_REJECTED", 403);
  }
  if (request.headers.get("x-csrf-token") !== context.csrfToken) {
    throw new PublicApiError("CSRF_REJECTED", 403);
  }
}

function errorResponse(error: unknown, traceId: string): Response {
  const apiError =
    error instanceof PublicApiError ? error : new PublicApiError("CONFIGURATION_ERROR");
  const body: ApiError = {
    error: {
      code: apiError.code,
      message: publicMessage(apiError.code),
      ...(apiError.fields ? { fields: apiError.fields } : {}),
    },
    traceId,
  };
  const headers: HeadersInit = {};
  if (apiError.retryAfterMs) {
    headers["retry-after"] = String(Math.ceil(apiError.retryAfterMs / 1000));
  }
  return jsonResponse(body, { status: apiError.status, headers });
}

function rateLimit(request: Request): void {
  const key =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + 60_000 });
    return;
  }
  bucket.count += 1;
  if (bucket.count > 120) {
    throw new PublicApiError("RATE_LIMITED", 429, { retryAfterMs: bucket.resetAt - now });
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}

function serializeCookie(name: string, value: string, secure: boolean): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=86400",
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

function mergeSetCookies(...values: SetCookie[]): string[] | undefined {
  const merged = values.flatMap((value) => value ? (Array.isArray(value) ? value : [value]) : []);
  return merged.length ? merged : undefined;
}

function appendSetCookies(headers: Headers, setCookie: SetCookie): void {
  for (const cookie of mergeSetCookies(setCookie) ?? []) {
    headers.append("set-cookie", cookie);
  }
}
