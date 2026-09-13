import type { AppConfig } from "@/lib/config/env";
import { openJson, sealJson } from "@/lib/security/crypto";

const RECEIPT_VERSION = 1;
const RECEIPT_TTL_SECONDS = 5 * 60;

type LegacyTerminalReceiptPayload = {
  v: 1;
  iat: number;
  exp: number;
  instagramUsername: string;
};

export type LegacyTerminalReceipt = {
  instagramUsername: string;
};

export function createLegacyTerminalReceiptCookie(config: AppConfig, browserBindingHash: string, input: LegacyTerminalReceipt): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: LegacyTerminalReceiptPayload = {
    v: RECEIPT_VERSION,
    iat: now,
    exp: now + RECEIPT_TTL_SECONDS,
    instagramUsername: normalizeInstagramUsername(input.instagramUsername),
  };
  const sealed = sealJson(config.encryptionKeys, payload, receiptAad(browserBindingHash));
  return serializeCookie(receiptCookieName(config.cookieSecure), Buffer.from(JSON.stringify(sealed), "utf8").toString("base64url"), config.cookieSecure, RECEIPT_TTL_SECONDS);
}

export function readLegacyTerminalReceipt(config: AppConfig, browserBindingHash: string, cookieHeader: string | null, nowMs = Date.now()): LegacyTerminalReceipt | null {
  const token = parseCookies(cookieHeader)[receiptCookieName(config.cookieSecure)];
  if (!token) return null;
  try {
    const sealed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    const payload = openJson<LegacyTerminalReceiptPayload>(config.encryptionKeys, sealed, receiptAad(browserBindingHash));
    const now = Math.floor(nowMs / 1000);
    if (payload.v !== RECEIPT_VERSION || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat || payload.exp <= now) return null;
    return { instagramUsername: normalizeInstagramUsername(payload.instagramUsername) };
  } catch {
    return null;
  }
}

export function clearLegacyTerminalReceiptCookie(config: AppConfig): string {
  return `${receiptCookieName(config.cookieSecure)}=; Max-Age=0; Path=/; SameSite=Lax; ${config.cookieSecure ? "Secure; " : ""}HttpOnly`;
}

export function legacyTerminalReceiptCookieName(config: Pick<AppConfig, "cookieSecure">): string {
  return receiptCookieName(config.cookieSecure);
}

function receiptAad(browserBindingHash: string): string {
  return `legacy-terminal:${browserBindingHash}`;
}

function receiptCookieName(secure: boolean): string {
  return secure ? "__Host-cl-legacy-terminal" : "cl-legacy-terminal";
}

function serializeCookie(name: string, value: string, secure: boolean, maxAge: number): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
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

function normalizeInstagramUsername(value: unknown): string {
  if (typeof value !== "string") throw new Error("INVALID_LEGACY_RECEIPT");
  const normalized = value.trim().replace(/^@+/, "");
  if (!/^[A-Za-z0-9._]{1,30}$/.test(normalized)) throw new Error("INVALID_LEGACY_RECEIPT");
  return normalized;
}
