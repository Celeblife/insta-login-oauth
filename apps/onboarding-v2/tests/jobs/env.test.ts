import { afterEach, describe, expect, it } from "vitest";
import { assertInternalJobRequest, buildTrustedJobContext } from "@/lib/jobs/env";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function request(secret = "secret") {
  return new Request("https://example.com/internal/token-refresh", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

function jwtWithRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function setValidJobEnv(appEnv = "production") {
  process.env.INTERNAL_JOBS_ENABLED = "true";
  process.env.TOKEN_REFRESH_ENABLED = "true";
  process.env.APP_ENV = appEnv;
  process.env.CRON_SECRET = "secret";
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_EXPECTED_PROJECT_REF = "project";
  process.env.VERCEL_PROJECT_ID = "vercel-project";
  process.env.VERCEL_PROJECT_ID_EXPECTED = "vercel-project";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
}

describe("internal job guard", () => {
  it("OP02 fails closed without explicit enable flag or Bearer CRON_SECRET", () => {
    delete process.env.INTERNAL_JOBS_ENABLED;
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED").ok).toBe(false);

    setValidJobEnv();

    expect(assertInternalJobRequest(new Request("https://example.com"), "TOKEN_REFRESH_ENABLED").ok).toBe(false);
    expect(assertInternalJobRequest(request("wrong"), "TOKEN_REFRESH_ENABLED").ok).toBe(false);

    delete process.env.TOKEN_REFRESH_ENABLED;
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "TOKEN_REFRESH_ENABLED_DISABLED",
    });
  });

  it("OP01 OP02 checks exact Supabase and Vercel project guards before running", () => {
    setValidJobEnv();
    process.env.SUPABASE_URL = "https://wrong.supabase.co";

    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_PROJECT_GUARD_FAILED",
    });

    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.VERCEL_PROJECT_ID = "wrong";
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "VERCEL_PROJECT_GUARD_FAILED",
    });

    setValidJobEnv();
    delete process.env.SUPABASE_EXPECTED_PROJECT_REF;
    process.env.SUPABASE_PRODUCTION_PROJECT_REF = "project";
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: true,
    });

    process.env.SUPABASE_EXPECTED_PROJECT_REF = "project";
    process.env.SUPABASE_PRODUCTION_PROJECT_REF = "wrong";
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_PROJECT_GUARD_FAILED",
    });
  });

  it("OP01 rejects malformed Supabase URLs, public keys, and missing expected Vercel identity with typed job codes", () => {
    setValidJobEnv();
    process.env.SUPABASE_URL = "https://project.supabase.co/rest/v1";

    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_PROJECT_GUARD_FAILED",
    });

    process.env.SUPABASE_URL = "https://project.supabase.co";
    delete process.env.VERCEL_PROJECT_ID_EXPECTED;
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "VERCEL_PROJECT_GUARD_FAILED",
    });

    process.env.VERCEL_PROJECT_ID_EXPECTED = "vercel-project";
    process.env.SUPABASE_SECRET_KEY = "sb_publishable_test";
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_SERVER_CONFIG_MISSING",
    });

    process.env.SUPABASE_SECRET_KEY = jwtWithRole("anon");
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_SERVER_CONFIG_MISSING",
    });
  });

  it("OP01 accepts SUPABASE_SERVICE_ROLE_KEY compatibility for exact job target identity", () => {
    setValidJobEnv();
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = jwtWithRole("service_role");

    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: true,
    });
  });

  it("OP02 keeps CRON_SECRET on HTTP jobs but allows trusted in-process jobs through the same target guard", () => {
    setValidJobEnv();
    delete process.env.CRON_SECRET;

    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED_JOB",
    });
    expect(buildTrustedJobContext("TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: true,
    });
  });

  it("OP01 accepts only server-role legacy SUPABASE_KEY and rejects conflicting external keys", () => {
    setValidJobEnv();
    delete process.env.SUPABASE_SECRET_KEY;
    process.env.SUPABASE_KEY = jwtWithRole("service_role");

    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: true,
    });

    process.env.SUPABASE_KEY = "sb_publishable_test";
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_SERVER_CONFIG_MISSING",
    });

    setValidJobEnv();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_different";
    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: false,
      code: "SUPABASE_SERVER_CONFIG_MISSING",
    });
  });

  it.each([undefined, "local", "test", "development", "preview", "prodution"])(
    "OP01 rejects non-external APP_ENV %s before side-effect jobs run",
    (appEnv) => {
      setValidJobEnv();
      if (appEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = appEnv;

      expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
        ok: false,
        code: "APP_ENV_GUARD_FAILED",
      });
    },
  );

  it.each(["staging", "production"])("OP01 allows exact external APP_ENV %s with otherwise valid job guard", (appEnv) => {
    setValidJobEnv(appEnv);

    expect(assertInternalJobRequest(request(), "TOKEN_REFRESH_ENABLED")).toMatchObject({
      ok: true,
    });
  });
});
