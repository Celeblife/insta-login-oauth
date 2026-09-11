import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = "supabase/migrations/0001_onboarding_v2.sql";
const rollback = "supabase/rollback/0001_onboarding_v2_rollback.sql";
const resetDryRunScript = "scripts/db-reset-dry-run.mjs";

function normalizeFunctionSignature(signature: string) {
  return signature.replace(/\s+/g, " ").trim();
}

function serviceRoleFunctionGrants(sql: string) {
  return [...sql.matchAll(/GRANT EXECUTE ON FUNCTION public\.([^;]+?)\s+TO service_role;/gi)]
    .map((match) => normalizeFunctionSignature(match[1] ?? ""))
    .sort();
}

function rollbackFunctionRevokes(sql: string) {
  return new Set(
    [...sql.matchAll(/REVOKE ALL ON FUNCTION public\.([^;]+?)\s+FROM PUBLIC, anon, authenticated, service_role;/gi)].map((match) =>
      normalizeFunctionSignature(match[1] ?? ""),
    ),
  );
}

describe("onboarding v2 migration static safety", () => {
  it("DB03 OP07 is additive and keeps v1 objects intact", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+FUNCTION\s+public\.complete_instagram_onboarding\s*\(/i);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.creator_profiles");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.onboarding_sessions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.notification_outbox");
    expect(sql).toContain("RETURNS jsonb");
    expect(sql).toContain("'kind', 'v2'");
  });

  it("DB06 locks down v2 RPCs and uses fixed search_path", async () => {
    const sql = await readFile(migration, "utf8");
    for (const functionName of [
      "complete_instagram_onboarding_v2",
      "claim_notification_outbox_v2",
      "commit_token_refresh_success_v2",
      "commit_token_refresh_failure_v2",
      "cleanup_onboarding_v2",
      "start_instagram_onboarding_v2",
      "record_instagram_callback_code_v2",
      "claim_instagram_completion_lease_v2",
      "complete_guarded_legacy_instagram_callback_v2",
    ]) {
      expect(sql).toContain(`FUNCTION public.${functionName}`);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${functionName}`, "i"));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${functionName}[\\s\\S]+TO service_role`, "i"));
    }
    expect(sql.match(/SET search_path = public, pg_temp/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(sql).not.toContain("payload jsonb NOT NULL");
    expect(sql).toContain("draft_payload_encrypted jsonb");
  });

  it("OP07 has a non-destructive rollback companion outside migrations", async () => {
    const sql = await readFile(rollback, "utf8");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sql).toContain("V2_ROLLBACK_DISABLED");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.complete_instagram_onboarding_v2/i);
  });

  it("DB06 OP07 rollback revokes every forward service_role function grant", async () => {
    const forwardSql = await readFile(migration, "utf8");
    const rollbackSql = await readFile(rollback, "utf8");
    const rollbackRevokes = rollbackFunctionRevokes(rollbackSql);

    const missingRevokes = serviceRoleFunctionGrants(forwardSql).filter((signature) => !rollbackRevokes.has(signature));

    expect(missingRevokes).toEqual([]);
  });

  it("OP01 reset dry-run uses exact Supabase URL and server-key guards before client creation", async () => {
    const script = await readFile(resetDryRunScript, "utf8");
    expect(script).toContain("const canonical = `https://${expectedRef}.supabase.co`;");
    expect(script).toContain("raw !== canonical && raw !== `${canonical}/`");
    expect(script).toContain('url.protocol === "https:"');
    expect(script).toContain("!url.port");
    expect(script).toContain('url.pathname === "/"');
    expect(script).toContain('value.startsWith("sb_publishable_")');
    expect(script).toContain('value.startsWith("sb_anon_")');
    expect(script).toContain('parsed?.role === "service_role"');
    expect(script.indexOf("isExactSupabaseUrl(process.env.SUPABASE_URL, expectedProjectRef)")).toBeLessThan(script.indexOf("createClient("));
    expect(script.indexOf("isServerSupabaseKey(secretKey)")).toBeLessThan(script.indexOf("createClient("));
  });
});
