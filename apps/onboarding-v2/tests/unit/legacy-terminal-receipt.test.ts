import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getConfig } from "@/lib/config/env";
import { createLegacyTerminalReceiptCookie, readLegacyTerminalReceipt } from "@/lib/legacy/terminal-receipt";
import { sha256Hmac } from "@/lib/security/crypto";

describe("legacy terminal receipt", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    process.env = {
      ...originalEnv,
      APP_ENV: "local",
      APP_BASE_URL: "http://localhost:3000",
      ONBOARDING_PROVIDER: "mock",
      BROWSER_SECRET_PEPPER: randomBytes(32).toString("base64url"),
      CHECKPOINT_ENCRYPTION_KEYS: `v1:${randomBytes(32).toString("base64url")}`,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("opens only in the issuing browser binding and expires quickly", () => {
    const config = getConfig();
    const browserSecret = "browser-secret-with-enough-entropy";
    const browserBindingHash = sha256Hmac(config.browserSecretKey, browserSecret);
    const receiptCookie = createLegacyTerminalReceiptCookie(config, browserBindingHash, { instagramUsername: "@legacy_user" }).split(";")[0] ?? "";
    const cookieHeader = `${config.cookieName}=${encodeURIComponent(browserSecret)}; ${receiptCookie}`;

    expect(readLegacyTerminalReceipt(config, browserBindingHash, cookieHeader)).toEqual({ instagramUsername: "legacy_user" });
    expect(readLegacyTerminalReceipt(config, sha256Hmac(config.browserSecretKey, "different-browser-secret"), cookieHeader)).toBeNull();

    vi.setSystemTime(new Date("2026-09-11T00:05:01.000Z"));
    expect(readLegacyTerminalReceipt(config, browserBindingHash, cookieHeader)).toBeNull();
  });

  it("rejects tampered ciphertext without exposing a success receipt", () => {
    const config = getConfig();
    const browserBindingHash = sha256Hmac(config.browserSecretKey, "browser-secret-with-enough-entropy");
    const cookie = createLegacyTerminalReceiptCookie(config, browserBindingHash, { instagramUsername: "legacy_user" }).split(";")[0] ?? "";
    const tampered = `${cookie.slice(0, -1)}x`;

    expect(readLegacyTerminalReceipt(config, browserBindingHash, tampered)).toBeNull();
  });
});
