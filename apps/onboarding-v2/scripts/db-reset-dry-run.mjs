#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function fail(message) {
  console.error(message);
  process.exit(2);
}

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const manifestPath = args.get("--manifest");
const expectedProjectRef = args.get("--expected-project-ref");
if (!manifestPath || !expectedProjectRef) {
  fail("Usage: node scripts/db-reset-dry-run.mjs --manifest <json> --expected-project-ref <ref>");
}

if (!isExactSupabaseUrl(process.env.SUPABASE_URL, expectedProjectRef)) {
  fail("Refusing reset dry-run: SUPABASE_URL does not match --expected-project-ref.");
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest.allowedUserIds) || manifest.allowedUserIds.length === 0) {
  fail("Refusing reset dry-run: manifest.allowedUserIds must be a non-empty explicit allowlist.");
}

if (manifest.execute === true || process.env.ALLOW_DB_RESET_EXECUTE === "true") {
  fail("Refusing reset dry-run: this script never executes deletes.");
}

const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!isServerSupabaseKey(secretKey)) {
  fail("Refusing reset dry-run: SUPABASE_SECRET_KEY must be a server secret key for read-only counts.");
}

const client = createClient(process.env.SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const allowedUserIds = manifest.allowedUserIds.map(String);

async function countRows(table, column, values) {
  const { count, error } = await client
    .from(table)
    .select("*", { count: "exact", head: true })
    .in(column, values);
  if (error) fail(`Read-only count failed for ${table}: ${error.code || error.message}`);
  return count ?? 0;
}

const graph = {
  users: await countRows("users", "id", allowedUserIds),
  tokens: await countRows("tokens", "user_id", allowedUserIds),
  userConsents: await countRows("user_consents", "user_id", allowedUserIds),
  creatorProfiles: await countRows("creator_profiles", "user_id", allowedUserIds),
  onboardingRequests: await countRows("onboarding_requests", "user_id", allowedUserIds),
};

let protectedV2Requests = 0;
const { count: v2Count, error: v2Error } = await client
  .from("onboarding_requests")
  .select("*", { count: "exact", head: true })
  .in("user_id", allowedUserIds)
  .eq("connection_kind", "new");
if (!v2Error) protectedV2Requests = v2Count ?? 0;

console.log(
  JSON.stringify(
    {
      status: "NOT_RUN",
      mode: "dry-run-only",
      projectRef: expectedProjectRef,
      allowedUserIds,
      graph,
      wouldRefuseExecute: true,
      protectedV2Requests,
      destructiveStatementsExecuted: 0,
    },
    null,
    2,
  ),
);

function isExactSupabaseUrl(raw, expectedRef) {
  const canonical = `https://${expectedRef}.supabase.co`;
  if (raw !== canonical && raw !== `${canonical}/`) return false;
  try {
    const url = new URL(raw || "");
    return (
      url.protocol === "https:" &&
      url.hostname === `${expectedRef}.supabase.co` &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isServerSupabaseKey(value) {
  if (!value) return false;
  if (value.startsWith("sb_secret_")) return true;
  if (value.startsWith("sb_publishable_") || value.startsWith("sb_anon_")) return false;
  const [, payload] = value.split(".");
  if (!payload) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed?.role === "service_role";
  } catch {
    return false;
  }
}
