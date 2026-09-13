import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  assertExactSupabaseUrl,
  resolveSupabaseProjectRef,
  resolveSupabaseServerKey,
  validateSupabaseTargetIdentity,
  type AppEnvironment,
} from "@/lib/config/target-identity";

export type JobGuardResult =
  | { ok: true; owner: string; supabase: SupabaseClient }
  | { ok: false; status: number; code: string };

function constantTimeEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function assertInternalJobRequest(request: Request, requiredFlag: string): JobGuardResult {
  if (process.env.INTERNAL_JOBS_ENABLED !== "true") {
    return { ok: false, status: 503, code: "INTERNAL_JOBS_DISABLED" };
  }
  if (process.env[requiredFlag] !== "true") {
    return { ok: false, status: 503, code: `${requiredFlag}_DISABLED` };
  }

  const appEnv = jobAppEnv(process.env.APP_ENV);
  if (!appEnv) {
    return { ok: false, status: 412, code: "APP_ENV_GUARD_FAILED" };
  }

  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!expectedSecret || !constantTimeEqual(suppliedSecret, expectedSecret)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED_JOB" };
  }

  let expectedProjectRef;
  try {
    expectedProjectRef = resolveSupabaseProjectRef({
      expectedProjectRef: process.env.SUPABASE_EXPECTED_PROJECT_REF,
      productionProjectRef: process.env.SUPABASE_PRODUCTION_PROJECT_REF,
    });
    assertExactSupabaseUrl(process.env.SUPABASE_URL, expectedProjectRef);
  } catch {
    return { ok: false, status: 412, code: "SUPABASE_PROJECT_GUARD_FAILED" };
  }

  const expectedVercelProjectId = process.env.VERCEL_PROJECT_ID_EXPECTED?.trim() ?? "";
  if (!expectedVercelProjectId || process.env.VERCEL_PROJECT_ID !== expectedVercelProjectId) {
    return { ok: false, status: 412, code: "VERCEL_PROJECT_GUARD_FAILED" };
  }

  try {
    resolveSupabaseServerKey({
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseKey: process.env.SUPABASE_KEY,
      failOnConflict: true,
    });
  } catch {
    return { ok: false, status: 503, code: "SUPABASE_SERVER_CONFIG_MISSING" };
  }

  let supabaseIdentity;
  try {
    supabaseIdentity = validateSupabaseTargetIdentity({
      appEnv,
      repository: "supabase",
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseKey: process.env.SUPABASE_KEY,
      expectedProjectRef: process.env.SUPABASE_EXPECTED_PROJECT_REF,
      productionProjectRef: process.env.SUPABASE_PRODUCTION_PROJECT_REF,
      vercelProjectId: process.env.VERCEL_PROJECT_ID,
      expectedVercelProjectId: process.env.VERCEL_PROJECT_ID_EXPECTED,
    });
  } catch {
    return { ok: false, status: 412, code: "SUPABASE_PROJECT_GUARD_FAILED" };
  }

  if (!supabaseIdentity) {
    return { ok: false, status: 412, code: "SUPABASE_PROJECT_GUARD_FAILED" };
  }

  return {
    ok: true,
    owner: randomUUID(),
    supabase: createClient(supabaseIdentity.url, supabaseIdentity.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "celeblife-onboarding-v2-jobs" } },
    }),
  };
}

function jobAppEnv(value: string | undefined): AppEnvironment | undefined {
  if (value === "staging" || value === "production") return value;
  return undefined;
}

export async function rpc<T>(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}:${error.code || "RPC_FAILED"}`);
  return data as T;
}

export function readPositiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
