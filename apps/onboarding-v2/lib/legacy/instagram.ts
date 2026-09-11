import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { PublicApiError } from "@/lib/domain/errors";

const BINDING_COOKIE_NAME = "cl_consent_binding";
const BINDING_VERSION = 1;
const STATE_VERSION = 1;
const TTL_SECONDS = 600;
const FUTURE_SKEW_SECONDS = 60;
const LEGACY_TERMS_VERSION = "influencer-v1.2-2026-08-26";
const LEGACY_PRIVACY_VERSION = "privacy-2026-08-26-v3";
const LEGACY_INSTAGRAM_VERSION = "instagram-permissions-2026-08-26";
const STATE_KEYS = new Set([
  "v",
  "iat",
  "nonce",
  "binding_id",
  "accepted_at",
  "age_confirmed",
  "terms_accepted",
  "privacy_accepted",
  "instagram_permissions_accepted",
  "terms_version",
  "privacy_version",
  "instagram_permissions_version",
  "bundle_hash",
]);

export type LegacyConsentSnapshot = {
  nonce: string;
  consentSchemaVersion: 1;
  termsVersion: string;
  privacyVersion: string;
  instagramPermissionsVersion: string;
  consentAge: true;
  consentTerms: true;
  consentPrivacy: true;
  consentInstagram: true;
  acceptedAt: string;
  bundleHash: string;
  rawPayload: Record<string, unknown>;
};

type LegacyStatePayload = {
  v: number;
  iat: number;
  nonce: string;
  binding_id: string;
  accepted_at: string;
  age_confirmed: boolean;
  terms_accepted: boolean;
  privacy_accepted: boolean;
  instagram_permissions_accepted: boolean;
  terms_version: string;
  privacy_version: string;
  instagram_permissions_version: string;
  bundle_hash: string;
};

export function clearLegacyBindingCookie(): string {
  return `${BINDING_COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax; Secure; HttpOnly`;
}

export function legacyBindingCookieName(): string {
  return BINDING_COOKIE_NAME;
}

export function verifyLegacyBindingCookie(cookieHeader: string | null, secret: string | undefined, nowMs = Date.now()): string {
  const token = parseCookies(cookieHeader)[BINDING_COOKIE_NAME];
  const payload = verifySignedToken(token, secret, "encoded-payload", parseLegacyBindingPayload);
  const now = Math.floor(nowMs / 1000);
  if (payload.iat > now || payload.exp <= payload.iat || payload.exp <= now) {
    throw new PublicApiError("INVALID_STATE");
  }
  return payload.bid;
}

export function parseLegacyState(state: string, expectedBindingId: string, appSecret: string, nowMs = Date.now()): LegacyConsentSnapshot {
  const payload = verifySignedToken(state, appSecret, "payload-bytes", parseLegacyStatePayload);
  if (!timingSafeStringEqual(payload.binding_id, expectedBindingId)) throw new PublicApiError("INVALID_STATE");
  const now = Math.floor(nowMs / 1000);
  if (now - payload.iat > TTL_SECONDS) throw new PublicApiError("SESSION_EXPIRED", 410);
  if (payload.iat - now > FUTURE_SKEW_SECONDS) throw new PublicApiError("INVALID_STATE");
  const acceptedAtMs = Date.parse(payload.accepted_at);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(payload.accepted_at) || !Number.isFinite(acceptedAtMs)) throw new PublicApiError("INVALID_STATE");
  if ((acceptedAtMs - nowMs) / 1000 > FUTURE_SKEW_SECONDS) throw new PublicApiError("INVALID_STATE");
  const expectedHash = consentBundleHash(payload);
  if (!timingSafeStringEqual(payload.bundle_hash, expectedHash)) throw new PublicApiError("INVALID_STATE");

  return {
    nonce: payload.nonce,
    consentSchemaVersion: 1,
    termsVersion: payload.terms_version,
    privacyVersion: payload.privacy_version,
    instagramPermissionsVersion: payload.instagram_permissions_version,
    consentAge: true,
    consentTerms: true,
    consentPrivacy: true,
    consentInstagram: true,
    acceptedAt: new Date(acceptedAtMs).toISOString(),
    bundleHash: payload.bundle_hash,
    rawPayload: payload,
  };
}

function parseLegacyBindingPayload(value: unknown): { v: 1; bid: string; iat: number; exp: number } {
  if (!isRecord(value) || !hasExactKeys(value, ["v", "bid", "iat", "exp"])) throw new PublicApiError("INVALID_STATE");
  if (value.v !== BINDING_VERSION || !isBindingId(value.bid) || !isInteger(value.iat) || !isInteger(value.exp)) {
    throw new PublicApiError("INVALID_STATE");
  }
  return { v: 1, bid: value.bid, iat: value.iat, exp: value.exp };
}

function parseLegacyStatePayload(value: unknown): LegacyStatePayload {
  if (!isRecord(value) || Object.keys(value).length !== STATE_KEYS.size || Object.keys(value).some((key) => !STATE_KEYS.has(key))) {
    throw new PublicApiError("INVALID_STATE");
  }
  if (
    value.v !== STATE_VERSION ||
    !isInteger(value.iat) ||
    typeof value.nonce !== "string" ||
    !value.nonce ||
    !isBindingId(value.binding_id) ||
    typeof value.accepted_at !== "string" ||
    !/^[0-9a-f]{64}$/.test(String(value.bundle_hash)) ||
    value.age_confirmed !== true ||
    value.terms_accepted !== true ||
    value.privacy_accepted !== true ||
    value.instagram_permissions_accepted !== true ||
    value.terms_version !== LEGACY_TERMS_VERSION ||
    value.privacy_version !== LEGACY_PRIVACY_VERSION ||
    value.instagram_permissions_version !== LEGACY_INSTAGRAM_VERSION
  ) {
    throw new PublicApiError("INVALID_STATE");
  }
  return value as LegacyStatePayload;
}

function verifySignedToken<T>(token: string | undefined, secret: string | undefined, signatureInput: "encoded-payload" | "payload-bytes", parser: (value: unknown) => T): T {
  if (!token || !secret || Buffer.byteLength(secret, "utf8") < 32) throw new PublicApiError("INVALID_STATE");
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new PublicApiError("INVALID_STATE");
  const [payloadPart, signaturePart] = parts;
  try {
    const payloadBytes = Buffer.from(payloadPart, "base64url");
    const signedBytes = signatureInput === "encoded-payload" ? Buffer.from(payloadPart, "ascii") : payloadBytes;
    const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(signedBytes).digest("base64url");
    if (!timingSafeStringEqual(signaturePart, expected)) throw new PublicApiError("INVALID_STATE");
    return parser(JSON.parse(payloadBytes.toString("utf8")));
  } catch (error) {
    if (error instanceof PublicApiError) throw error;
    throw new PublicApiError("INVALID_STATE");
  }
}

function consentBundleHash(payload: LegacyStatePayload): string {
  const consentItems: Partial<LegacyStatePayload> = { ...payload };
  delete consentItems.iat;
  delete consentItems.nonce;
  delete consentItems.binding_id;
  delete consentItems.bundle_hash;
  return createHash("sha256").update(stableJson(consentItems), "utf8").digest("hex");
}

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (cookieHeader ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isBindingId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24,128}$/.test(value);
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
