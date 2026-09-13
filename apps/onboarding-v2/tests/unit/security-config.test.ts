import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getConfig } from "@/lib/config/env";
import { allowsUiPreview } from "@/lib/config/preview";
import { PublicApiError } from "@/lib/domain/errors";
import { readJsonBody } from "@/lib/services/http";
import { openJson, sealJson, type KeyRing } from "@/lib/security/crypto";

describe("security/config invariants", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  function setProductionConfig() {
    process.env.APP_ENV = "production";
    process.env.APP_BASE_URL = "https://onboarding.example.com";
    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.INSTAGRAM_APP_ID = "prod-instagram-app";
    process.env.INSTAGRAM_APP_SECRET = randomBytes(32).toString("base64url");
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    process.env.POLICY_DOCUMENTS_APPROVED = "true";
    process.env.ONBOARDING_POLICY_BUNDLE_ID = "bundle-prod";
    process.env.POLICY_BUNDLE_VERSION = "2026-09-11";
    process.env.POLICY_BUNDLE_HASH = randomBytes(32).toString("hex");
    process.env.POLICY_TERMS_VERSION = "terms-prod";
    process.env.POLICY_PRIVACY_VERSION = "privacy-prod";
    process.env.POLICY_INSTAGRAM_TERMS_VERSION = "instagram-prod";
    process.env.POLICY_COLLECTION_CONSENT_VERSION = "collection-prod";
    process.env.CONTACT_EMAIL = "support@example.com";
  }

  function setStagingSupabaseConfig() {
    process.env.APP_ENV = "staging";
    process.env.APP_BASE_URL = "https://staging.example.com";
    process.env.ONBOARDING_PROVIDER = "mock";
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_REPOSITORY = "supabase";
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_EXPECTED_PROJECT_REF = "project";
    process.env.VERCEL_PROJECT_ID = "vercel-project";
    process.env.VERCEL_PROJECT_ID_EXPECTED = "vercel-project";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  }

  function setProductionSupabaseIdentity() {
    process.env.SUPABASE_URL = "https://prodref.supabase.co";
    process.env.SUPABASE_EXPECTED_PROJECT_REF = "prodref";
    process.env.VERCEL_PROJECT_ID = "prod-vercel";
    process.env.VERCEL_PROJECT_ID_EXPECTED = "prod-vercel";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_prod";
  }

  function jwtWithRole(role: string): string {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
    return `${header}.${payload}.signature`;
  }

  it("SE04 AUDIT checkpoint crypto binds AAD and supports key rotation", () => {
    const v1 = randomBytes(32);
    const v2 = randomBytes(32);
    const oldRing: KeyRing = { activeVersion: "v1", keys: { v1 } };
    const rotatedRing: KeyRing = { activeVersion: "v2", keys: { v1, v2 } };

    const sealedV1 = sealJson(oldRing, { code: "one-time-code" }, "attempt-a:oauth_code");
    expect(openJson(rotatedRing, sealedV1, "attempt-a:oauth_code")).toEqual({ code: "one-time-code" });

    const sealedV2 = sealJson(rotatedRing, { accessToken: "long" }, "attempt-a:long_token");
    expect(() => openJson(rotatedRing, sealedV2, "attempt-a:short_token")).toThrow();
    expect(() => openJson(rotatedRing, sealedV2, "attempt-b:long_token")).toThrow();
    expect(() => openJson({ activeVersion: "v2", keys: { v2 } }, sealedV1, "attempt-a:oauth_code")).toThrow("ENCRYPTION_KEY_VERSION_MISSING");
  });

  it("SE01 local cookie name avoids invalid non-secure __Host prefix", () => {
    process.env.APP_ENV = "local";
    process.env.APP_BASE_URL = "http://localhost:3000";
    const config = getConfig();
    expect(config.cookieName).toBe("cl-onboarding");
    expect(config.cookieSecure).toBe(false);

    process.env.APP_BASE_URL = "https://localhost:3000";
    const secureConfig = getConfig();
    expect(secureConfig.cookieName).toBe("__Host-cl-onboarding");
    expect(secureConfig.cookieSecure).toBe(true);
  });

  it("OP01 production rejects mock provider and unapproved policy bundle defaults using APP_ENV, not NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.APP_ENV = "staging";
    process.env.APP_BASE_URL = "https://staging.example.com";
    process.env.ONBOARDING_PROVIDER = "mock";
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    expect(getConfig()).toMatchObject({ appEnv: "staging", providerMode: "mock" });

    process.env.APP_ENV = "production";
    process.env.APP_BASE_URL = "https://onboarding.example.com";
    process.env.ONBOARDING_PROVIDER = "mock";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.INSTAGRAM_APP_ID = "app";
    process.env.INSTAGRAM_APP_SECRET = "secret";
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    expect(() => getConfig()).toThrow(PublicApiError);
  });

  it("OP01 UI preview bypass is never enabled for APP_ENV production", () => {
    setProductionConfig();
    setProductionSupabaseIdentity();
    expect(allowsUiPreview(getConfig())).toBe(false);
    expect(allowsUiPreview({ appEnv: "production", providerMode: "mock" })).toBe(false);
    expect(allowsUiPreview({ appEnv: "local", providerMode: "instagram" })).toBe(false);
    expect(allowsUiPreview({ appEnv: "test", providerMode: "mock" })).toBe(true);
  });

  it("OP01 invalid APP_ENV and inactive checkpoint key versions fail closed", () => {
    process.env.APP_ENV = "prodution";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.APP_ENV = "local";
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    process.env.ONBOARDING_ENCRYPTION_KEY_VERSION = "v2";
    expect(() => getConfig()).toThrow(PublicApiError);
  });

  it("DB04 DB05 local policy fixtures are allowed only outside production", () => {
    process.env.APP_ENV = "local";
    const local = getConfig();
    expect(local.policyBundleHash).toBe("0".repeat(64));

    process.env.APP_ENV = "production";
    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.APP_BASE_URL = "https://onboarding.example.com";
    process.env.INSTAGRAM_APP_ID = "app";
    process.env.INSTAGRAM_APP_SECRET = "secret";
    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    process.env.POLICY_DOCUMENTS_APPROVED = "true";
    process.env.ONBOARDING_POLICY_BUNDLE_ID = "bundle-prod";
    process.env.POLICY_BUNDLE_VERSION = "2026-09-11";
    process.env.POLICY_BUNDLE_HASH = randomBytes(32).toString("hex");
    process.env.CONTACT_EMAIL = "support@example.com";
    expect(() => getConfig()).toThrow(PublicApiError);
  });

  it("OP01 production rejects memory/test keys and invalid redirect URI shape", () => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.APP_ENV = "production";
    process.env.APP_BASE_URL = "https://onboarding.example.com";
    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.INSTAGRAM_APP_ID = "app";
    process.env.INSTAGRAM_APP_SECRET = "secret";
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.POLICY_DOCUMENTS_APPROVED = "true";
    process.env.ONBOARDING_POLICY_BUNDLE_ID = "bundle-prod";
    process.env.POLICY_BUNDLE_VERSION = "2026-09-11";
    process.env.POLICY_BUNDLE_HASH = randomBytes(32).toString("hex");
    process.env.POLICY_TERMS_VERSION = "terms-prod";
    process.env.POLICY_PRIVACY_VERSION = "privacy-prod";
    process.env.POLICY_INSTAGRAM_TERMS_VERSION = "instagram-prod";
    process.env.POLICY_COLLECTION_CONSENT_VERSION = "collection-prod";
    process.env.CONTACT_EMAIL = "support@example.com";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    process.env.INSTAGRAM_REDIRECT_URI = "https://onboarding.example.com/auth/callback?code=leak";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.INSTAGRAM_REDIRECT_URI = "https://onboarding.example.com/auth/instagram/callback";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.INSTAGRAM_REDIRECT_URI = "https://onboarding.example.com/auth/callback";
    setProductionSupabaseIdentity();
    expect(getConfig()).toMatchObject({ appEnv: "production", providerMode: "instagram" });
  });

  it("OP01 resolves the existing /auth/callback redirect from canonical and legacy env names", () => {
    process.env.APP_ENV = "local";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.ONBOARDING_PROVIDER = "mock";
    expect(getConfig().instagram.redirectUri).toBe("http://localhost:3000/auth/callback");

    process.env.OAUTH_REDIRECT_URI = "http://localhost:3000/auth/callback";
    expect(getConfig().instagram.redirectUri).toBe("http://localhost:3000/auth/callback");

    process.env.INSTAGRAM_REDIRECT_URI = "http://localhost:3000/auth/callback";
    expect(getConfig().instagram.redirectUri).toBe("http://localhost:3000/auth/callback");
  });

  it("OP01 staging instagram mode rejects missing or known mock credentials while local mock remains valid", () => {
    process.env.APP_ENV = "local";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.ONBOARDING_PROVIDER = "mock";
    expect(getConfig()).toMatchObject({ appEnv: "local", providerMode: "mock" });

    process.env.APP_ENV = "staging";
    process.env.APP_BASE_URL = "https://staging.example.com";
    process.env.ONBOARDING_PROVIDER = "instagram";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.INSTAGRAM_APP_ID = "test-client-id";
    process.env.INSTAGRAM_APP_SECRET = randomBytes(32).toString("base64url");
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.INSTAGRAM_APP_ID = "staging-instagram-app";
    process.env.INSTAGRAM_APP_SECRET = "mock-client-secret";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.INSTAGRAM_APP_SECRET = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    expect(getConfig()).toMatchObject({ appEnv: "staging", providerMode: "instagram" });
  });

  it("requires ONBOARDING_PAYLOAD_HASH_KEY to be an independent 32-byte secret in external environments", () => {
    const browserSecret = randomBytes(32).toString("base64url");
    const distinctPayloadSecret = randomBytes(32).toString("base64url");

    process.env.APP_ENV = "local";
    process.env.APP_BASE_URL = "http://localhost:3000";
    const local = getConfig();
    expect(local.payloadHashKey.equals(local.browserSecretKey)).toBe(false);

    process.env.APP_ENV = "staging";
    process.env.APP_BASE_URL = "https://staging.example.com";
    process.env.ONBOARDING_PROVIDER = "mock";
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.BROWSER_SECRET_PEPPER = browserSecret;
    delete process.env.ONBOARDING_PAYLOAD_HASH_KEY;
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.ONBOARDING_PAYLOAD_HASH_KEY = "not-a-32-byte-key";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.ONBOARDING_PAYLOAD_HASH_KEY = browserSecret;
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.ONBOARDING_PAYLOAD_HASH_KEY = distinctPayloadSecret;
    const staging = getConfig();
    expect(staging.payloadHashKey.equals(staging.browserSecretKey)).toBe(false);

    process.env.APP_ENV = "production";
    process.env.APP_BASE_URL = "https://onboarding.example.com";
    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.INSTAGRAM_APP_ID = "prod-instagram-app";
    process.env.INSTAGRAM_APP_SECRET = randomBytes(32).toString("base64url");
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    process.env.POLICY_DOCUMENTS_APPROVED = "true";
    process.env.ONBOARDING_POLICY_BUNDLE_ID = "bundle-prod";
    process.env.POLICY_BUNDLE_VERSION = "2026-09-11";
    process.env.POLICY_BUNDLE_HASH = randomBytes(32).toString("hex");
    process.env.POLICY_TERMS_VERSION = "terms-prod";
    process.env.POLICY_PRIVACY_VERSION = "privacy-prod";
    process.env.POLICY_INSTAGRAM_TERMS_VERSION = "instagram-prod";
    process.env.POLICY_COLLECTION_CONSENT_VERSION = "collection-prod";
    process.env.CONTACT_EMAIL = "support@example.com";
    setProductionSupabaseIdentity();
    const production = getConfig();
    expect(production.payloadHashKey.equals(production.browserSecretKey)).toBe(false);
  });

  it("OP01 requires exact Supabase and Vercel identity only for external Supabase-backed modes", () => {
    setStagingSupabaseConfig();
    expect(getConfig().supabase).toMatchObject({
      url: "https://project.supabase.co",
      serviceRoleKey: "sb_secret_test",
    });

    for (const badUrl of [
      "http://project.supabase.co",
      "https://project.supabase.co:444",
      "https://user:pass@project.supabase.co",
      "https://project.supabase.co/rest/v1",
      "https://project.supabase.co?apikey=leak",
      "https://project.supabase.co#fragment",
      "https://project.supabase.co.evil.example",
      "https://wrong.supabase.co",
      "https://project.supabase.co:443",
      " https://project.supabase.co",
      "https://project.supabase.co ",
      "https://project.supabase.co//",
    ]) {
      process.env.SUPABASE_URL = badUrl;
      expect(() => getConfig()).toThrow(PublicApiError);
    }

    setStagingSupabaseConfig();
    delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
    expect(() => getConfig()).toThrow(PublicApiError);

    setStagingSupabaseConfig();
    delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
    process.env.SUPABASE_PRODUCTION_PROJECT_REF = "project";
    expect(getConfig().supabase?.url).toBe("https://project.supabase.co");

    process.env.SUPABASE_EXPECTED_PROJECT_REF = "project";
    process.env.SUPABASE_PRODUCTION_PROJECT_REF = "wrong";
    expect(() => getConfig()).toThrow(PublicApiError);

    setStagingSupabaseConfig();
    delete process.env.VERCEL_PROJECT_ID_EXPECTED;
    expect(() => getConfig()).toThrow(PublicApiError);

    setStagingSupabaseConfig();
    process.env.VERCEL_PROJECT_ID = "wrong-project";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.ONBOARDING_REPOSITORY = "memory";
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
    delete process.env.SUPABASE_PRODUCTION_PROJECT_REF;
    delete process.env.VERCEL_PROJECT_ID_EXPECTED;
    expect(getConfig()).toMatchObject({ appEnv: "staging", providerMode: "mock" });

    setProductionConfig();
    setProductionSupabaseIdentity();
    delete process.env.ONBOARDING_REPOSITORY;
    expect(getConfig().supabase?.url).toBe("https://prodref.supabase.co");

    delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
    process.env.SUPABASE_PRODUCTION_PROJECT_REF = "prodref";
    expect(getConfig().supabase?.url).toBe("https://prodref.supabase.co");

    delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
    delete process.env.SUPABASE_PRODUCTION_PROJECT_REF;
    expect(() => getConfig()).toThrow(PublicApiError);
  });

  it("OP01 rejects public Supabase keys and accepts documented service-role forms in external Supabase modes", () => {
    setStagingSupabaseConfig();
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => getConfig()).toThrow(PublicApiError);

    for (const badKey of ["sb_publishable_test", "sb_anon_test", jwtWithRole("anon"), jwtWithRole("authenticated")]) {
      process.env.SUPABASE_SECRET_KEY = badKey;
      expect(() => getConfig()).toThrow(PublicApiError);
    }

    process.env.SUPABASE_SECRET_KEY = jwtWithRole("service_role");
    expect(getConfig().supabase?.serviceRoleKey).toBe(process.env.SUPABASE_SECRET_KEY);

    setStagingSupabaseConfig();
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_KEY = jwtWithRole("service_role");
    expect(getConfig().supabase?.serviceRoleKey).toBe(process.env.SUPABASE_KEY);

    process.env.SUPABASE_KEY = jwtWithRole("anon");
    expect(() => getConfig()).toThrow(PublicApiError);

    setStagingSupabaseConfig();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_different";
    expect(() => getConfig()).toThrow(PublicApiError);

    setProductionConfig();
    setProductionSupabaseIdentity();
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_prod";
    expect(getConfig().supabase).toMatchObject({
      url: "https://prodref.supabase.co",
      serviceRoleKey: "sb_secret_prod",
    });
  });

  it("G07 production requires a distinct valid public CONTACT_EMAIL", () => {
    process.env.APP_ENV = "production";
    process.env.APP_BASE_URL = "https://onboarding.example.com";
    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.INSTAGRAM_APP_ID = "prod-instagram-app";
    process.env.INSTAGRAM_APP_SECRET = randomBytes(32).toString("base64url");
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    process.env.CHECKPOINT_ENCRYPTION_KEYS = `v1:${randomBytes(32).toString("base64url")}`;
    process.env.POLICY_DOCUMENTS_APPROVED = "true";
    process.env.ONBOARDING_POLICY_BUNDLE_ID = "bundle-prod";
    process.env.POLICY_BUNDLE_VERSION = "2026-09-11";
    process.env.POLICY_BUNDLE_HASH = randomBytes(32).toString("hex");
    process.env.POLICY_TERMS_VERSION = "terms-prod";
    process.env.POLICY_PRIVACY_VERSION = "privacy-prod";
    process.env.POLICY_INSTAGRAM_TERMS_VERSION = "instagram-prod";
    process.env.POLICY_COLLECTION_CONSENT_VERSION = "collection-prod";
    setProductionSupabaseIdentity();

    delete process.env.CONTACT_EMAIL;
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.CONTACT_EMAIL = "support.example.com";
    expect(() => getConfig()).toThrow(PublicApiError);

    for (const contactEmail of [
      "\nsupport@example.com",
      "\tsupport@example.com",
      "support@example.com\n",
      "support@example.com\t",
      "support@example.com\u007f",
      "support@example.com\nbcc@example.com",
    ]) {
      process.env.CONTACT_EMAIL = contactEmail;
      expect(() => getConfig()).toThrow(PublicApiError);
    }

    process.env.CONTACT_EMAIL = " DKSSUD374@celeblife.co.kr ";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.CONTACT_EMAIL = " support@example.com ";
    expect(getConfig().publicContactEmail).toBe("support@example.com");
  });

  it("G07 local/test can omit CONTACT_EMAIL and never expose the internal notification address", () => {
    process.env.APP_ENV = "local";
    delete process.env.CONTACT_EMAIL;
    expect(getConfig().publicContactEmail).toBe("");

    process.env.CONTACT_EMAIL = "dkssud374@celeblife.co.kr";
    expect(getConfig().publicContactEmail).toBe("");

    process.env.APP_ENV = "test";
    delete process.env.CONTACT_EMAIL;
    expect(getConfig().publicContactEmail).toBe("");

    process.env.CONTACT_EMAIL = "dkssud374@celeblife.co.kr";
    expect(getConfig().publicContactEmail).toBe("");

    process.env.CONTACT_EMAIL = "public@example.com";
    expect(getConfig().publicContactEmail).toBe("public@example.com");
  });

  it("requires a valid explicit Instagram Graph API version outside local/test and rejects path-confused graph bases", () => {
    process.env.APP_ENV = "local";
    process.env.APP_BASE_URL = "http://localhost:3000";
    process.env.ONBOARDING_PROVIDER = "instagram";
    process.env.INSTAGRAM_APP_ID = "app";
    process.env.INSTAGRAM_APP_SECRET = "secret";
    expect(getConfig().instagram.graphApiVersion).toBe("v22.0");

    process.env.INSTAGRAM_GRAPH_API_VERSION = "22.0";
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.APP_ENV = "staging";
    process.env.APP_BASE_URL = "https://staging.example.com";
    process.env.BROWSER_SECRET_PEPPER = randomBytes(32).toString("base64url");
    process.env.ONBOARDING_PAYLOAD_HASH_KEY = randomBytes(32).toString("base64url");
    delete process.env.INSTAGRAM_GRAPH_API_VERSION;
    expect(() => getConfig()).toThrow(PublicApiError);

    process.env.INSTAGRAM_GRAPH_API_VERSION = "v22.0";
    process.env.INSTAGRAM_GRAPH_BASE_URL = "https://graph.instagram.com/v99.0";
    expect(() => getConfig()).toThrow(PublicApiError);

    for (const graphBase of [
      "https://user:pass@graph.instagram.com",
      "https://graph.instagram.com:444",
    ]) {
      process.env.INSTAGRAM_GRAPH_BASE_URL = graphBase;
      expect(() => getConfig()).toThrow(PublicApiError);
    }
  });

  it("SE02 bounded JSON reader rejects chunked oversized payloads before full parse", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(12 * 1024));
        controller.enqueue(new Uint8Array(8 * 1024));
        controller.close();
      },
    });
    const request = new Request("http://localhost:3000/api/onboarding/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readJsonBody(request)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
