import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getConfig } from "@/lib/config/env";
import { createInstagramProvider } from "@/lib/providers/instagram";

describe("Instagram provider official response contract", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_ENV: "local",
      APP_BASE_URL: "http://localhost:3000",
      ONBOARDING_PROVIDER: "instagram",
      INSTAGRAM_APP_ID: "app-id",
      INSTAGRAM_APP_SECRET: "app-secret",
      BROWSER_SECRET_PEPPER: randomBytes(32).toString("base64url"),
      CHECKPOINT_ENCRYPTION_KEYS: `v1:${randomBytes(32).toString("base64url")}`,
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("AU01 FINAL11 unwraps code exchange data and uses token-exchange user_id as the account id", async () => {
    const provider = createInstagramProvider(getConfig());
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
      const parsed = new URL(String(url));
      paths.push(parsed.pathname);
      if (parsed.hostname === "api.instagram.com" && parsed.pathname === "/oauth/access_token") return jsonResponse({ data: [{ access_token: "short", user_id: "1789", permissions: "instagram_business_basic,instagram_business_manage_insights" }] });
      if (parsed.hostname === "graph.instagram.com" && parsed.pathname === "/access_token") return jsonResponse({ access_token: "long", expires_in: 5184000 });
      return jsonResponse({ user_id: "1789", username: "creator", account_type: "CREATOR" });
    }));

    const short = await provider.exchangeCodeForShortToken({ code: "code" });
    expect(short).toMatchObject({ accessToken: "short", providerUserId: "1789" });
    expect("expiresAt" in short).toBe(false);
    const long = await provider.exchangeShortTokenForLongToken({ shortToken: short });
    expect(long.expiresAt).toMatch(/Z$/);
    await expect(provider.fetchAccount({ token: long })).resolves.toMatchObject({ providerAccountId: "1789", username: "creator" });
    expect(paths).toEqual(["/oauth/access_token", "/access_token", "/v22.0/me"]);
  });

  it("accepts numeric wrapped code-exchange user_id by normalizing it to string", async () => {
    const short = await expectWithFetch(jsonResponse({ data: [{ access_token: "short", user_id: 1789, permissions: "instagram_business_basic,instagram_business_manage_insights" }] }));

    expect(short).toMatchObject({ accessToken: "short", providerUserId: "1789" });
  });

  it("preserves a large numeric code-exchange user_id JSON token without rounding", async () => {
    const short = await expectWithFetch(rawJsonResponse('{"data":[{"access_token":"short","user_id":17891234567890123,"permissions":"instagram_business_basic,instagram_business_manage_insights"}]}'));

    expect(short).toMatchObject({ accessToken: "short", providerUserId: "17891234567890123" });
  });

  it("accepts unwrapped code-exchange rows for backward compatibility", async () => {
    const short = await expectWithFetch(jsonResponse({ access_token: "short", user_id: "1789", permissions: "instagram_business_basic,instagram_business_manage_insights" }));

    expect(short).toMatchObject({ accessToken: "short", providerUserId: "1789" });
  });

  it("accepts wrapped code-exchange rows that omit permission fields by carrying required scopes", async () => {
    const short = await expectWithFetch(jsonResponse({ data: [{ access_token: "short", user_id: "1789" }] }));

    expect(short).toMatchObject({
      accessToken: "short",
      providerUserId: "1789",
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    });
  });

  it("accepts unwrapped code-exchange rows that omit permission fields by carrying required scopes", async () => {
    const short = await expectWithFetch(jsonResponse({ access_token: "short", user_id: "1789" }));

    expect(short).toMatchObject({
      accessToken: "short",
      providerUserId: "1789",
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    });
  });

  it("AU01 maps official one-row /me wrapper and media_creator account_type to creator", async () => {
    const provider = createInstagramProvider(getConfig());
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: [{ user_id: "1789", username: "creator", account_type: "media_creator" }] })));

    await expect(
      provider.fetchAccount({
        token: {
          accessToken: "long",
          providerUserId: "1789",
          expiresAt: new Date().toISOString(),
          grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
        },
      }),
    ).resolves.toMatchObject({ accountType: "creator" });
  });

  it("uses the token subject as the account id even when /me user_id is numeric", async () => {
    const provider = createInstagramProvider(getConfig());
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ user_id: 1789, username: "creator", account_type: "CREATOR" })));

    await expect(
      provider.fetchAccount({
        token: {
          accessToken: "long",
          providerUserId: "app_scoped_1789",
          expiresAt: new Date().toISOString(),
          grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
        },
      }),
    ).resolves.toMatchObject({ providerAccountId: "app_scoped_1789", username: "creator" });
  });

  it("does not round-trip /me user_id into the persisted account id", async () => {
    const provider = createInstagramProvider(getConfig());
    vi.stubGlobal("fetch", vi.fn(async () => rawJsonResponse('{"user_id":17891234567890123,"username":"creator","account_type":"CREATOR"}')));

    await expect(
      provider.fetchAccount({
        token: {
          accessToken: "long",
          providerUserId: "app_scoped_subject",
          expiresAt: new Date().toISOString(),
          grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
        },
      }),
    ).resolves.toMatchObject({ providerAccountId: "app_scoped_subject", username: "creator" });
  });

  it("rejects empty, multirow, and malformed /me data wrappers", async () => {
    const provider = createInstagramProvider(getConfig());
    const token = {
      accessToken: "long",
      providerUserId: "1789",
      expiresAt: new Date().toISOString(),
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    };

    for (const body of [
      { data: [] },
      { data: [{ user_id: "1789", username: "creator", account_type: "CREATOR" }, { user_id: "1789", username: "creator", account_type: "CREATOR" }] },
      { data: ["not-object"] },
      { data: null, user_id: "1789", username: "creator", account_type: "CREATOR" },
      { data: "not-array", user_id: "1789", username: "creator", account_type: "CREATOR" },
      { data: { user_id: "1789", username: "creator", account_type: "CREATOR" }, user_id: "1789", username: "creator", account_type: "CREATOR" },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(body)));
      await expect(provider.fetchAccount({ token })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    }
  });

  it("AU15 rejects explicitly personal accounts before finalization", async () => {
    const provider = createInstagramProvider(getConfig());
    const token = {
      accessToken: "long",
      providerUserId: "1789",
      expiresAt: new Date().toISOString(),
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    };

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ user_id: "1789", username: "creator", account_type: "PERSONAL" })));
    await expect(provider.fetchAccount({ token })).rejects.toMatchObject({ code: "UNSUPPORTED_ACCOUNT" });
  });

  it("accepts missing and unrecognized official account types as unknown", async () => {
    const provider = createInstagramProvider(getConfig());
    const token = {
      accessToken: "long",
      providerUserId: "1789",
      expiresAt: new Date().toISOString(),
      grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
    };

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ user_id: "1789", username: "creator" })));
    await expect(provider.fetchAccount({ token })).resolves.toMatchObject({ accountType: "unknown", providerAccountId: "1789" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ user_id: "1789", username: "creator", account_type: "PRIVATE" })));
    await expect(provider.fetchAccount({ token })).resolves.toMatchObject({ accountType: "unknown", providerAccountId: "1789" });
  });

  it("carries required scopes after successful code exchange regardless of returned permission metadata", async () => {
    for (const body of [
      { data: [{ access_token: "short", user_id: "1789", permissions: "instagram_business_basic" }] },
      { access_token: "short", user_id: "1789", scope: "instagram_business_basic" },
      { data: [{ access_token: "short", user_id: "1789", permissions: "" }] },
      { data: [{ access_token: "short", user_id: "1789", scope: [] }] },
      { data: [{ access_token: "short", user_id: "1789", permissions: ["instagram_business_basic"] }] },
    ]) {
      await expect(expectWithFetch(jsonResponse(body))).resolves.toMatchObject({
        accessToken: "short",
        providerUserId: "1789",
        grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"],
      });
    }
  });

  it("FINAL11 rejects malformed user_id, malformed long expiry, and oversized chunked responses", async () => {
    await expect(expectWithFetch(jsonResponse({ data: [{ user_id: "1789", permissions: "instagram_business_basic,instagram_business_manage_insights" }] }))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    await expect(expectWithFetch(jsonResponse({ data: [{ access_token: "", user_id: "1789", permissions: "instagram_business_basic,instagram_business_manage_insights" }] }))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    for (const userId of ["", 1.5, -1, Number.NaN]) {
      await expect(expectWithFetch(jsonResponse({ data: [{ access_token: "short", user_id: userId, permissions: "instagram_business_basic,instagram_business_manage_insights" }] }))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    }
    await expect(expectWithFetch(rawJsonResponse('{"data":[{"access_token":"short","user_id":1e3,"permissions":"instagram_business_basic,instagram_business_manage_insights"}]}'))).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    const provider = createInstagramProvider(getConfig());
    await expect(provider.exchangeShortTokenForLongToken({ shortToken: { accessToken: "short", providerUserId: "1789", grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"] } })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ user_id: "different", username: "creator", account_type: "CREATOR" })));
    await expect(provider.fetchAccount({ token: { accessToken: "long", providerUserId: "1789", expiresAt: new Date().toISOString(), grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"] } })).resolves.toMatchObject({ providerAccountId: "1789", username: "creator" });

    vi.stubGlobal("fetch", vi.fn(async () => oversizedResponse()));
    await expect(provider.exchangeShortTokenForLongToken({ shortToken: { accessToken: "short", providerUserId: "1789", grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"] } })).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
}

function rawJsonResponse(value: string): Response {
  return new Response(value, { status: 200, headers: { "content-type": "application/json" } });
}

async function expectWithFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  return createInstagramProvider(getConfig()).exchangeCodeForShortToken({ code: "code" });
}

function oversizedResponse(): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(40_000));
      controller.close();
    },
  }), { status: 200 });
}
