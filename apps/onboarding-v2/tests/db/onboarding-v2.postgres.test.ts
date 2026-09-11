import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { attemptFromRecord } from "@/lib/persistence/supabase";

const pgBinDir = process.env.TEST_POSTGRES_BIN_DIR;
const pgShareDir = process.env.TEST_POSTGRES_SHARE_DIR;
const pgLibraryDir = process.env.TEST_POSTGRES_LIBRARY_DIR;
const canRunPostgres = Boolean(pgBinDir && pgShareDir && pgLibraryDir);

type PgHarness = {
  tempDir: string;
  socketDir: string;
  port: number;
  process: ChildProcess;
  client: Client;
};

function pgEnv() {
  return { ...process.env, LD_LIBRARY_PATH: pgLibraryDir };
}

function run(bin: string, args: string[]) {
  const result = spawnSync(path.join(pgBinDir!, bin), args, { env: pgEnv(), encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${bin} failed\n${result.stderr}`);
}

async function startPostgres(): Promise<PgHarness> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "celeblife-pg16-run."));
  const dataDir = path.join(tempDir, "data");
  const socketDir = path.join(tempDir, "socket");
  const port = 32_000 + Math.floor(Math.random() * 1_000);
  run("initdb", ["-D", dataDir, "-L", pgShareDir!, "--encoding=UTF8", "--locale=C.UTF-8", "--auth=trust", "--no-sync"]);
  await mkdir(socketDir, { recursive: true });
  const pgProcess = spawn(path.join(pgBinDir!, "postgres"), ["-D", dataDir, "-k", socketDir, "-p", String(port), "-F"], {
    env: pgEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const ready = spawnSync(path.join(pgBinDir!, "pg_isready"), ["-h", socketDir, "-p", String(port), "-d", "postgres"], {
      env: pgEnv(),
      encoding: "utf8",
    });
    if (ready.status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const client = new Client({ host: socketDir, port, database: "postgres" });
  await client.connect();
  return { tempDir, socketDir, port, process: pgProcess, client };
}

async function stopPostgres(harness: PgHarness) {
  await harness.client.end().catch(() => undefined);
  harness.process.kill("SIGTERM");
  await new Promise((resolve) => harness.process.once("exit", resolve));
  await rm(harness.tempDir, { recursive: true, force: true });
}

async function seedBaseSchema(client: Client) {
  await client.query(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.users (
      id BIGSERIAL PRIMARY KEY, instagram_id TEXT UNIQUE NOT NULL,
      instagram_username TEXT NOT NULL, facebook_page_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE public.tokens (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      token_type TEXT NOT NULL, access_token TEXT NOT NULL, expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT tokens_user_type_unique UNIQUE (user_id, token_type)
    );
    CREATE TABLE public.user_consents (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      state_nonce TEXT NOT NULL UNIQUE, consent_schema_version INTEGER NOT NULL CHECK (consent_schema_version = 1),
      terms_version TEXT NOT NULL, privacy_version TEXT NOT NULL, instagram_permissions_version TEXT NOT NULL,
      consent_age BOOLEAN NOT NULL CHECK (consent_age IS TRUE),
      consent_terms BOOLEAN NOT NULL CHECK (consent_terms IS TRUE),
      consent_privacy BOOLEAN NOT NULL CHECK (consent_privacy IS TRUE),
      consent_instagram BOOLEAN NOT NULL CHECK (consent_instagram IS TRUE),
      accepted_at TIMESTAMPTZ NOT NULL, bundle_hash TEXT NOT NULL CHECK (bundle_hash ~ '^[0-9a-f]{64}$'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function applyMigrationChain(client: Client) {
  const migrationDir = path.resolve("supabase/migrations");
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort();
  expect(files).toEqual(["0001_onboarding_v2.sql"]);
  for (const file of files) await client.query(await readFile(path.join(migrationDir, file), "utf8"));
}

async function withDb<T>(fn: (client: Client) => Promise<T>) {
  const harness = await startPostgres();
  try {
    await seedBaseSchema(harness.client);
    await applyMigrationChain(harness.client);
    return await fn(harness.client);
  } finally {
    await stopPostgres(harness);
  }
}

const browserA = "a".repeat(64);
const ownerA = "00000000-0000-4000-8000-000000000001";
const sealedEnvelope = { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "ciphertext" };

async function callNamed(client: Client, functionName: string, params: Record<string, unknown>) {
  const keys = Object.keys(params);
  return client.query(
    `SELECT public.${functionName}(${keys.map((key, index) => `${key} => $${index + 1}`).join(", ")}) AS result`,
    Object.values(params),
  );
}

function startArgs(overrides: Record<string, unknown> = {}) {
  const started = new Date();
  return {
    p_attempt_id: "00000000-0000-4000-8000-000000000101",
    p_browser_binding_hash: browserA,
    p_request_key: "00000000-0000-4000-8000-000000000201",
    p_payload_hash: "1".repeat(64),
    p_draft_payload_encrypted: sealedEnvelope,
    p_policy_snapshot: {
      bundleId: "bundle-v2",
      bundleVersion: "bundle-version-v2",
      bundleHash: "b".repeat(64),
      documents: {
        termsVersion: "terms-v2",
        privacyVersion: "privacy-v2",
        instagramTermsVersion: "instagram-v2",
        collectionConsentVersion: "collection-v2",
      },
      acceptedAt: started.toISOString(),
      consents: { age: true, terms: true, privacy: true, instagramData: true },
    },
    p_replace_attempt_id: null,
    p_parent_attempt_id: null,
    p_oauth_state_hash: "2".repeat(64),
    p_encrypted_oauth_state: sealedEnvelope,
    p_state_expires_at: new Date(started.getTime() + 10 * 60_000).toISOString(),
    p_draft_expires_at: new Date(started.getTime() + 30 * 60_000).toISOString(),
    p_started_at: started.toISOString(),
    ...overrides,
  };
}

function finalizePayload(overrides: Record<string, unknown> = {}) {
  return {
    requestKey: "00000000-0000-4000-8000-000000000201",
    policyBundleId: "bundle-v2",
    fullName: "Creator",
    email: "creator@example.com",
    phone: "+821012345678",
    instagramUsername: "actual.creator",
    consents: { age: true, terms: true, privacy: true, instagramData: true },
    bundleHash: "b".repeat(64),
    ...overrides,
  };
}

function legacyConsentSnapshot(nonce: string) {
  return {
    nonce,
    consentSchemaVersion: 1,
    termsVersion: "influencer-v1.2-2026-08-26",
    privacyVersion: "privacy-2026-08-26-v3",
    instagramPermissionsVersion: "instagram-permissions-2026-08-26",
    consentAge: true,
    consentTerms: true,
    consentPrivacy: true,
    consentInstagram: true,
    acceptedAt: "2026-09-11T00:00:00.000Z",
    bundleHash: "c".repeat(64),
  };
}

async function startAttempt(client: Client, overrides: Record<string, unknown> = {}) {
  return callNamed(client, "start_instagram_onboarding_v2", startArgs(overrides));
}

async function putSavingAttempt(client: Client, overrides: { id?: string; browser?: string; startedAt?: string; candidate?: Record<string, unknown> | null; encryptedLongToken?: Record<string, unknown> | null } = {}) {
  const id = overrides.id ?? "00000000-0000-4000-8000-000000000301";
  const browser = overrides.browser ?? browserA;
  const candidateAccount = {
    enteredUsername: "actual.creator",
    connectedUsername: "actual.creator",
    account: { providerAccountId: "ig-1", username: "actual.creator", accountType: "creator" },
    token: { providerUserId: "ig-1", expiresAt: "2026-12-01T00:00:00Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
  };
  const stateHash = id.replaceAll("-", "").padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "a");
  await client.query(
    `
      INSERT INTO public.onboarding_sessions(
        id, browser_binding_hash, request_key, payload_hash, draft_payload_encrypted, consent_snapshot, oauth_state_hash,
        oauth_state_encrypted, long_token_encrypted, state_expires_at, draft_expires_at, status, stage, candidate_account,
        revision, lease_owner, lease_expires_at, fencing_token, started_at, updated_at
      ) VALUES (
        $1, $2, '00000000-0000-4000-8000-000000000201', repeat('3',64),
        $6::jsonb,
        jsonb_build_object(
          'bundleId', 'bundle-v2',
          'bundleVersion', 'bundle-version-v2',
          'bundleHash', repeat('b',64),
          'documents', jsonb_build_object(
            'termsVersion', 'terms-v2',
            'privacyVersion', 'privacy-v2',
            'instagramTermsVersion', 'instagram-v2',
            'collectionConsentVersion', 'collection-v2'
          ),
          'acceptedAt', '2026-09-11T00:00:00Z',
          'consents', jsonb_build_object('age', true, 'terms', true, 'privacy', true, 'instagramData', true)
        ),
        $5, $6::jsonb, $8::jsonb, now() + interval '10 minutes',
        now() + interval '30 minutes', 'saving', 'submission', $7::jsonb, 0, $3,
        now() + interval '90 seconds', 1, $4, now()
      )
    `,
    [id, browser, ownerA, overrides.startedAt ?? "2026-09-11T00:00:00Z", stateHash, sealedEnvelope, overrides.candidate === undefined ? candidateAccount : overrides.candidate, overrides.encryptedLongToken === undefined ? sealedEnvelope : overrides.encryptedLongToken],
  );
  return { id, browser };
}

async function finalize(client: Client, overrides: Record<string, unknown> = {}) {
  return callNamed(client, "complete_instagram_onboarding_v2", {
    p_attempt_id: "00000000-0000-4000-8000-000000000301",
    p_browser_binding_hash: browserA,
    p_owner: ownerA,
    p_fencing_token: "1",
    p_expected_revision: 0,
    p_payload: finalizePayload(),
    p_account: { providerAccountId: "ig-1", username: "actual.creator", accountType: "creator" },
    p_access_token: "token-1",
    p_token_metadata: { providerUserId: "ig-1", expiresAt: "2026-12-01T00:00:00Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
    p_now: "2026-09-11T00:01:00Z",
    ...overrides,
  });
}

function tokenHash(accessToken: string) {
  return createHash("sha256").update(accessToken, "utf8").digest("hex");
}

describe.skipIf(!canRunPostgres)("onboarding v2 postgres migration", () => {
  it("DB06 OP07 excludes rollback from chain and keeps v2 RPCs service-only", async () => {
    await withDb(async (client) => {
      await expect(client.query("SET ROLE anon; SELECT public.cleanup_onboarding_v2();")).rejects.toThrow(/permission denied/i);
      await client.query("ROLLBACK").catch(() => undefined);
      expect(await readFile(path.resolve("supabase/rollback/0001_onboarding_v2_rollback.sql"), "utf8")).toContain("non-destructive rollback");
      const policies = await client.query("SELECT roles FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'onboarding_%'");
      expect(policies.rows.every((row) => row.roles.includes("service_role"))).toBe(true);

      await client.query(await readFile(path.resolve("supabase/rollback/0001_onboarding_v2_rollback.sql"), "utf8"));
      await client.query("SET ROLE service_role");
      try {
        for (const deniedProbe of [
          "SELECT public.expire_onboarding_attempts_v2(repeat('a', 64), now())",
          "SELECT public.get_active_onboarding_attempt_v2(repeat('a', 64), now())",
          "SELECT public.get_onboarding_attempt_by_request_key_v2(repeat('a', 64), gen_random_uuid())",
          "SELECT public.get_onboarding_attempt_by_state_v2(repeat('a', 64))",
          "SELECT public.get_onboarding_attempt_v2(gen_random_uuid())",
          "SELECT public.onboarding_attempt_to_json_v2(NULL::public.onboarding_sessions)",
          "SELECT public.require_onboarding_lease_v2(gen_random_uuid(), gen_random_uuid(), 1, now())",
        ]) {
          await expect(client.query(deniedProbe)).rejects.toThrow(/permission denied/i);
        }
      } finally {
        await client.query("RESET ROLE");
      }
    });
  });

  it("FINAL01 FINAL02 RESET01 handles start idempotency, replacement, and active guards", async () => {
    await withDb(async (client) => {
      expect((await startAttempt(client)).rows[0].result.kind).toBe("created");
      expect((await startAttempt(client)).rows[0].result.kind).toBe("replayed");
      expect((await startAttempt(client, { p_payload_hash: "9".repeat(64) })).rows[0].result.kind).toBe("idempotency_conflict");
      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000102",
          p_request_key: "00000000-0000-4000-8000-000000000202",
          p_oauth_state_hash: "5".repeat(64),
        })).rows[0].result.kind,
      ).toBe("active_attempt_exists");
      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000103",
          p_request_key: "00000000-0000-4000-8000-000000000203",
          p_oauth_state_hash: "6".repeat(64),
          p_replace_attempt_id: "00000000-0000-4000-8000-000000000101",
        })).rows[0].result.kind,
      ).toBe("created");
      await client.query(
        `
          INSERT INTO public.onboarding_sessions(
            id, browser_binding_hash, request_key, payload_hash, draft_payload_encrypted, consent_snapshot,
            oauth_state_hash, oauth_state_encrypted, state_expires_at, draft_expires_at,
            status, stage, started_at, updated_at
          )
          SELECT gen_random_uuid(), $1, gen_random_uuid(), repeat('d',64), $2::jsonb, $3::jsonb,
            encode(gen_random_bytes(32), 'hex'), $2::jsonb, now()+interval '10 minutes',
            now()+interval '30 minutes', 'failed', 'account', now(), now()
          FROM generate_series(1, 10)
        `,
        [browserA, sealedEnvelope, startArgs().p_policy_snapshot],
      );
      expect((await startAttempt(client)).rows[0].result.kind).toBe("replayed");
      await expect(
        startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000199",
          p_request_key: "00000000-0000-4000-8000-000000000299",
          p_oauth_state_hash: "e".repeat(64),
        }),
      ).rejects.toThrow(/RATE_LIMITED/);
    });
  });

  it("FINAL01 DB07 returns RFC3339 UTC sealed attempts and state-expired replay is restart-safe", async () => {
    await withDb(async (client) => {
      const created = await startAttempt(client);
      const parsed = attemptFromRecord(created.rows[0].result.attempt);
      expect(parsed.draftPayloadEncrypted).toEqual(sealedEnvelope);
      expect(parsed).not.toHaveProperty("payload");
      expect(parsed.startedAt).toMatch(/Z$/);
      expect(parsed.stateExpiresAt).toMatch(/Z$/);

      await client.query(
        "UPDATE public.onboarding_sessions SET state_expires_at=now()-interval '1 second' WHERE id=$1",
        ["00000000-0000-4000-8000-000000000101"],
      );
      const replayed = await startAttempt(client);
      expect(replayed.rows[0].result.kind).toBe("replayed");
      expect(replayed.rows[0].result.attempt.status).toBe("expired");
      expect(replayed.rows[0].result.attempt.encryptedOAuthState).toBeNull();
      expect(replayed.rows[0].result.attempt.draftPayloadEncrypted).toBeNull();
    });
  });

  it("LIFE02 FINAL01 expires state-expired pending drafts before bootstrap or new start", async () => {
    await withDb(async (client) => {
      await startAttempt(client);
      await client.query(
        "UPDATE public.onboarding_sessions SET state_expires_at=now()-interval '1 second', draft_expires_at=now()+interval '20 minutes' WHERE id=$1",
        ["00000000-0000-4000-8000-000000000101"],
      );
      expect(
        (await callNamed(client, "get_active_onboarding_attempt_v2", {
          p_browser_binding_hash: browserA,
          p_now: new Date().toISOString(),
        })).rows[0].result,
      ).toBeNull();
      expect(
        (await client.query("SELECT status, draft_payload_encrypted FROM public.onboarding_sessions WHERE id=$1", [
          "00000000-0000-4000-8000-000000000101",
        ])).rows[0],
      ).toEqual({ status: "expired", draft_payload_encrypted: null });
      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000119",
          p_request_key: "00000000-0000-4000-8000-000000000219",
          p_oauth_state_hash: "9".repeat(64),
        })).rows[0].result.kind,
      ).toBe("created");
    });
  });

  it("FINAL01 LIFE01 preserves only live same-browser OAUTH_CANCELLED drafts for bootstrap and scrubs on restart", async () => {
    await withDb(async (client) => {
      const parentArgs = startArgs();
      await startAttempt(client, parentArgs);
      const cancelled = await callNamed(client, "fail_instagram_onboarding_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_code: "OAUTH_CANCELLED",
        p_status: "cancelled",
        p_now: new Date().toISOString(),
      });
      expect(cancelled.rows[0].result.draftPayloadEncrypted).toEqual(sealedEnvelope);
      expect(cancelled.rows[0].result.encryptedOAuthState).toBeNull();

      const active = await callNamed(client, "get_active_onboarding_attempt_v2", {
        p_browser_binding_hash: browserA,
        p_now: new Date().toISOString(),
      });
      expect(active.rows[0].result.status).toBe("cancelled");
      expect(active.rows[0].result.draftPayloadEncrypted).toEqual(sealedEnvelope);

      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000118",
          p_request_key: "00000000-0000-4000-8000-000000000218",
          p_oauth_state_hash: "8".repeat(64),
          p_replace_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_parent_attempt_id: "00000000-0000-4000-8000-000000000999",
        })).rows[0].result.kind,
      ).toBe("idempotency_conflict");
      expect(
        (await client.query("SELECT draft_payload_encrypted FROM public.onboarding_sessions WHERE id='00000000-0000-4000-8000-000000000101'")).rows[0].draft_payload_encrypted,
      ).toEqual(sealedEnvelope);

      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000120",
          p_request_key: "00000000-0000-4000-8000-000000000220",
          p_oauth_state_hash: "f".repeat(64),
          p_replace_attempt_id: "00000000-0000-4000-8000-000000000101",
        })).rows[0].result.kind,
      ).toBe("created");
      expect(
        (await client.query("SELECT draft_payload_encrypted FROM public.onboarding_sessions WHERE id='00000000-0000-4000-8000-000000000101'")).rows[0].draft_payload_encrypted,
      ).toBeNull();
    });
  });

  it("FINAL01 RESET01 replays same child parent key after parent scrub and conflicts on different parent", async () => {
    await withDb(async (client) => {
      const parentArgs = startArgs();
      await startAttempt(client, parentArgs);
      await callNamed(client, "fail_instagram_onboarding_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_code: "OAUTH_CANCELLED",
        p_status: "cancelled",
        p_now: new Date().toISOString(),
      });
      const childArgs = {
        p_attempt_id: "00000000-0000-4000-8000-000000000121",
        p_request_key: "00000000-0000-4000-8000-000000000221",
        p_oauth_state_hash: "b".repeat(64),
        p_parent_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_policy_snapshot: parentArgs.p_policy_snapshot,
      };
      expect((await startAttempt(client, childArgs)).rows[0].result.kind).toBe("created");
      await client.query("UPDATE public.onboarding_sessions SET draft_payload_encrypted=NULL WHERE id='00000000-0000-4000-8000-000000000101'");
      expect((await startAttempt(client, childArgs)).rows[0].result.kind).toBe("replayed");
      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000123",
          p_request_key: "00000000-0000-4000-8000-000000000223",
          p_oauth_state_hash: "7".repeat(64),
          p_parent_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_policy_snapshot: parentArgs.p_policy_snapshot,
        })).rows[0].result.kind,
      ).toBe("idempotency_conflict");
      expect(
        (await startAttempt(client, {
          ...childArgs,
          p_attempt_id: "00000000-0000-4000-8000-000000000122",
          p_parent_attempt_id: "00000000-0000-4000-8000-000000000999",
        })).rows[0].result.kind,
      ).toBe("idempotency_conflict");
    });
  });

  it("LIFE01 clears draft envelopes for non-cancel terminal failures", async () => {
    await withDb(async (client) => {
      await startAttempt(client);
      const failed = await callNamed(client, "fail_instagram_onboarding_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_code: "PROVIDER_UNAVAILABLE",
        p_status: "failed",
        p_now: new Date().toISOString(),
      });
      expect(failed.rows[0].result.draftPayloadEncrypted).toBeNull();
    });
  });

  it("AUDIT03 FINAL02 rejects parent mismatch and caller-supplied future startedAt", async () => {
    await withDb(async (client) => {
      await startAttempt(client);
      expect(
        (await startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000111",
          p_request_key: "00000000-0000-4000-8000-000000000201",
          p_parent_attempt_id: "00000000-0000-4000-8000-000000000999",
        })).rows[0].result.kind,
      ).toBe("idempotency_conflict");

      await expect(
        startAttempt(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000112",
          p_request_key: "00000000-0000-4000-8000-000000000212",
          p_oauth_state_hash: "c".repeat(64),
          p_started_at: new Date(Date.now() + 60_000).toISOString(),
          p_state_expires_at: new Date(Date.now() + 70_000).toISOString(),
          p_draft_expires_at: new Date(Date.now() + 120_000).toISOString(),
        }),
      ).rejects.toThrow(/INVALID_START_INPUT/);
    });
  });

  it("AU07 FINAL14 records callback code once and invalidates state before replay", async () => {
    await withDb(async (client) => {
      await startAttempt(client);
      const first = await callNamed(client, "record_instagram_callback_code_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_encrypted_code: { sealed: "code" },
        p_code_hash: "7".repeat(64),
        p_now: "2026-09-11T00:01:00Z",
      });
      expect(first.rows[0].result.status).toBe("callback_received");
      expect(first.rows[0].result.stateInvalidatedAt).toBeTruthy();
      expect(first.rows[0].result.encryptedOAuthState).toBeNull();
      const replay = await callNamed(client, "record_instagram_callback_code_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_encrypted_code: { sealed: "code" },
        p_code_hash: "7".repeat(64),
        p_now: "2026-09-11T00:02:00Z",
      });
      expect(replay.rows[0].result.codeHash).toBe("7".repeat(64));
    });
  });

  it("AU08 AU12 FINAL04 fences processing lease and checkpoint writes", async () => {
    await withDb(async (client) => {
      await startAttempt(client);
      await callNamed(client, "record_instagram_callback_code_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_encrypted_code: { sealed: "code" },
        p_code_hash: "7".repeat(64),
        p_now: "2026-09-11T00:01:00Z",
      });
      const lease = await callNamed(client, "claim_instagram_completion_lease_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_owner: ownerA,
        p_lease_expires_at: "2026-09-11T00:03:00Z",
        p_now: "2026-09-11T00:01:01Z",
      });
      expect(lease.rows[0].result.fencingToken).toBe(1);
      expect(
        (await callNamed(client, "mark_instagram_code_exchange_begun_v2", {
          p_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_owner: ownerA,
          p_fencing_token: "1",
          p_now: "2026-09-11T00:01:02Z",
        })).rows[0].result.status,
      ).toBe("exchanging_short");
      await expect(
        callNamed(client, "checkpoint_instagram_short_token_v2", {
          p_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_owner: "00000000-0000-4000-8000-000000000002",
          p_fencing_token: "1",
          p_encrypted_short_token: { sealed: "short" },
          p_now: "2026-09-11T00:01:03Z",
        }),
      ).rejects.toThrow(/STALE_ATTEMPT/);
    });
  });

  it("FINAL04 rejects unfenced or stale processing failure writes", async () => {
    await withDb(async (client) => {
      await startAttempt(client);
      await callNamed(client, "record_instagram_callback_code_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_encrypted_code: { sealed: "code" },
        p_code_hash: "7".repeat(64),
        p_now: "2026-09-11T00:01:00Z",
      });
      const firstLease = await callNamed(client, "claim_instagram_completion_lease_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_owner: ownerA,
        p_lease_expires_at: "2026-09-11T00:01:30Z",
        p_now: "2026-09-11T00:01:01Z",
      });
      await callNamed(client, "mark_instagram_code_exchange_begun_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_owner: ownerA,
        p_fencing_token: firstLease.rows[0].result.fencingToken,
        p_now: "2026-09-11T00:01:02Z",
      });

      await expect(
        callNamed(client, "fail_instagram_onboarding_v2", {
          p_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_browser_binding_hash: browserA,
          p_code: "PROVIDER_UNAVAILABLE",
          p_status: "failed",
          p_now: "2026-09-11T00:01:03Z",
        }),
      ).rejects.toThrow(/STALE_ATTEMPT/);

      const secondOwner = "00000000-0000-4000-8000-000000000002";
      const secondLease = await callNamed(client, "claim_instagram_completion_lease_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_owner: secondOwner,
        p_lease_expires_at: "2026-09-11T00:03:10Z",
        p_now: "2026-09-11T00:01:31Z",
      });
      await expect(
        callNamed(client, "fail_instagram_onboarding_v2", {
          p_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_browser_binding_hash: browserA,
          p_code: "PROVIDER_UNAVAILABLE",
          p_status: "failed",
          p_now: "2026-09-11T00:01:32Z",
          p_owner: ownerA,
          p_fencing_token: firstLease.rows[0].result.fencingToken,
        }),
      ).rejects.toThrow(/STALE_ATTEMPT/);
      expect(
        (await client.query("SELECT status, lease_owner::text, fencing_token::int FROM public.onboarding_sessions WHERE id='00000000-0000-4000-8000-000000000101'")).rows[0],
      ).toEqual({
        status: "exchanging_short",
        lease_owner: secondOwner,
        fencing_token: secondLease.rows[0].result.fencingToken,
      });
    });
  });

  it("NEW01 DB02 FINAL08 finalizes once, replays after auth, and rejects older attempts", async () => {
    await withDb(async (client) => {
      await putSavingAttempt(client);
      const first = await finalize(client);
      expect(first.rows[0].result.result.connectionKind).toBe("new");
      expect(first.rows[0].result.result.requestId).toMatch(/^[0-9a-f-]{36}$/);
      expect((await finalize(client, { p_expected_revision: 1 })).rows[0].result.result.requestId).toBe(first.rows[0].result.result.requestId);
      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000302", browser: "c".repeat(64), startedAt: "2026-09-11T00:00:00.000002Z" });
      expect(
        (await finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000302",
          p_browser_binding_hash: "c".repeat(64),
          p_now: "2026-09-11T00:02:00Z",
        })).rows[0].result.result.connectionKind,
      ).toBe("reconnection");
      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000303", browser: "d".repeat(64), startedAt: "2026-09-10T23:59:59Z" });
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000303",
          p_browser_binding_hash: "d".repeat(64),
          p_now: "2026-09-11T00:03:00Z",
        }),
      ).rejects.toThrow(/STALE_ATTEMPT/);
    });
  });

  it("FINAL09 binds final writes to the exact stored server candidate and token checkpoint", async () => {
    await withDb(async (client) => {
      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000411", candidate: null });
      await expect(
        finalize(client, { p_attempt_id: "00000000-0000-4000-8000-000000000411" }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000416", browser: "9".repeat(64), encryptedLongToken: null });
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000416",
          p_browser_binding_hash: "9".repeat(64),
        }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000412", browser: "e".repeat(64) });
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000412",
          p_browser_binding_hash: "e".repeat(64),
          p_account: { providerAccountId: "ig-other", username: "actual.creator", accountType: "creator" },
          p_token_metadata: { providerUserId: "ig-other", expiresAt: "2026-12-01T00:00:00Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
        }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000417", browser: "b".repeat(64) });
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000417",
          p_browser_binding_hash: "b".repeat(64),
          p_token_metadata: { providerUserId: "ig-1", expiresAt: "2026-12-02T00:00:00Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
        }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000418", browser: "1".repeat(64) });
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000418",
          p_browser_binding_hash: "1".repeat(64),
          p_token_metadata: { providerUserId: "ig-1", expiresAt: "2026-12-01T00:00:00Z", grantedScopes: ["instagram_business_manage_insights", "instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
        }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000413", browser: "f".repeat(64) });
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000413",
          p_browser_binding_hash: "f".repeat(64),
          p_access_token: "wrong-token",
        }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000414", browser: "7".repeat(64) });
      await client.query("UPDATE public.onboarding_sessions SET status='long_token_checkpointed', stage='storage' WHERE id='00000000-0000-4000-8000-000000000414'");
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000414",
          p_browser_binding_hash: "7".repeat(64),
        }),
      ).rejects.toThrow(/STALE_ATTEMPT/);

      await putSavingAttempt(client, { id: "00000000-0000-4000-8000-000000000415", browser: "8".repeat(64) });
      expect(
        (await finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000415",
          p_browser_binding_hash: "8".repeat(64),
        })).rows[0].result.status,
      ).toBe("completed");
    });
  });

  it("FINAL10 releases the candidate-confirmation lease and lets a new fenced owner finalize immediately", async () => {
    await withDb(async (client) => {
      await startAttempt(client, { p_policy_snapshot: { ...startArgs().p_policy_snapshot, acceptedAt: "2026-09-11T00:00:00Z" } });
      await callNamed(client, "record_instagram_callback_code_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_encrypted_code: { sealed: "code" },
        p_code_hash: "7".repeat(64),
        p_now: "2026-09-11T00:01:00Z",
      });
      const firstLease = await callNamed(client, "claim_instagram_completion_lease_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_owner: ownerA,
        p_lease_expires_at: "2026-09-11T00:05:00Z",
        p_now: "2026-09-11T00:01:01Z",
      });
      await callNamed(client, "mark_instagram_code_exchange_begun_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_owner: ownerA,
        p_fencing_token: firstLease.rows[0].result.fencingToken,
        p_now: "2026-09-11T00:01:02Z",
      });
      await callNamed(client, "checkpoint_instagram_short_token_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_owner: ownerA,
        p_fencing_token: firstLease.rows[0].result.fencingToken,
        p_encrypted_short_token: { sealed: "short" },
        p_now: "2026-09-11T00:01:03Z",
      });
      await callNamed(client, "mark_instagram_long_exchange_begun_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_owner: ownerA,
        p_fencing_token: firstLease.rows[0].result.fencingToken,
        p_now: "2026-09-11T00:01:04Z",
      });
      await callNamed(client, "checkpoint_instagram_long_token_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_owner: ownerA,
        p_fencing_token: firstLease.rows[0].result.fencingToken,
        p_encrypted_long_token: { sealed: "long" },
        p_token_metadata: { providerUserId: "ig-1", expiresAt: "2026-12-01T00:00:00Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
        p_now: "2026-09-11T00:01:05Z",
      });
      const candidate = await callNamed(client, "checkpoint_instagram_account_candidate_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_owner: ownerA,
        p_fencing_token: firstLease.rows[0].result.fencingToken,
        p_account: { providerAccountId: "ig-1", username: "actual.creator", accountType: "creator" },
        p_token_metadata: { providerUserId: "ig-1", expiresAt: "2026-12-01T00:00:00Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: tokenHash("token-1") },
        p_payload: finalizePayload({ instagramUsername: "entered.creator" }),
        p_require_confirmation: true,
        p_now: "2026-09-11T00:01:06Z",
      });
      expect(candidate.rows[0].result.status).toBe("awaiting_account_confirmation");
      expect(candidate.rows[0].result.leaseOwner).toBeNull();

      const secondOwner = "00000000-0000-4000-8000-000000000002";
      const secondLease = await callNamed(client, "claim_instagram_completion_lease_v2", {
        p_attempt_id: "00000000-0000-4000-8000-000000000101",
        p_browser_binding_hash: browserA,
        p_owner: secondOwner,
        p_lease_expires_at: "2026-09-11T00:05:00Z",
        p_now: "2026-09-11T00:01:07Z",
      });
      expect(secondLease.rows[0].result.fencingToken).toBe(firstLease.rows[0].result.fencingToken + 1);
      expect(
        (await finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000101",
          p_owner: secondOwner,
          p_fencing_token: secondLease.rows[0].result.fencingToken,
          p_expected_revision: secondLease.rows[0].result.attempt.revision,
          p_payload: finalizePayload({ instagramUsername: "entered.creator" }),
        })).rows[0].result.status,
      ).toBe("completed");
    });
  });

  it("DB04 DB05 stores the exact server consent snapshot without policy fallbacks", async () => {
    await withDb(async (client) => {
      await putSavingAttempt(client);
      await finalize(client);
      const consent = await client.query(
        "SELECT consent_schema_version, terms_version, privacy_version, instagram_permissions_version, bundle_hash FROM public.user_consents",
      );
      expect(consent.rows[0]).toEqual({
        consent_schema_version: 1,
        terms_version: "terms-v2",
        privacy_version: "privacy-v2",
        instagram_permissions_version: "instagram-v2",
        bundle_hash: "b".repeat(64),
      });

      await putSavingAttempt(client, {
        id: "00000000-0000-4000-8000-000000000401",
        browser: "e".repeat(64),
      });
      await client.query(
        "UPDATE public.onboarding_sessions SET consent_snapshot = jsonb_set(consent_snapshot, '{bundleHash}', to_jsonb($1::text)) WHERE id=$2",
        ["z".repeat(64), "00000000-0000-4000-8000-000000000401"],
      );
      await expect(
        finalize(client, {
          p_attempt_id: "00000000-0000-4000-8000-000000000401",
          p_browser_binding_hash: "e".repeat(64),
        }),
      ).rejects.toThrow(/INVALID_ONBOARDING_INPUT/);
    });
  });

  it("MA03 MA04 MAIL11 requires live lease and accepted recipient before sent", async () => {
    await withDb(async (client) => {
      await putSavingAttempt(client);
      await finalize(client);
      const claimed = await client.query(
        "SELECT * FROM public.claim_notification_outbox_v2($1,$2,$3)",
        [ownerA, 5, 90],
      );
      expect(claimed.rows[0].received_at).toMatch(/Z$/);
      const outboxId = claimed.rows[0].outbox_id;
      await expect(
        callNamed(client, "mark_notification_outbox_sent_v2", {
          p_outbox_id: outboxId,
          p_owner: ownerA,
          p_delivery: { accepted: [], rejected: ["dkssud374@celeblife.co.kr"] },
        }),
      ).rejects.toThrow(/SMTP_ACCEPTED_RECIPIENT_REQUIRED/);
      expect(
        (await callNamed(client, "mark_notification_outbox_sent_v2", {
          p_outbox_id: outboxId,
          p_owner: ownerA,
          p_delivery: { accepted: ["dkssud374@celeblife.co.kr"], rejected: [] },
        })).rows[0].result,
      ).toBe(true);
    });
  });

  it("TO05 AUDIT06 AUDIT07 transitions invalid refresh to reauth via CAS and never recreates deleted rows", async () => {
    await withDb(async (client) => {
      const user = await client.query("INSERT INTO public.users(instagram_id, instagram_username) VALUES ('ig-refresh','refresh.creator') RETURNING id");
      const token = await client.query(
        `INSERT INTO public.tokens(user_id, token_type, access_token, expires_at, created_at, connection_status)
         VALUES ($1, 'user', 'old', '2026-09-13T00:00:00Z', '2026-09-01T00:00:00Z', 'connected')
         RETURNING id::text, row_version::text, created_at, expires_at, connection_status`,
        [user.rows[0].id],
      );
      expect(
        (await callNamed(client, "commit_token_refresh_failure_v2", {
          p_token_id: token.rows[0].id,
          p_expected_row_version: token.rows[0].row_version,
          p_expected_created_at: token.rows[0].created_at,
          p_expected_expires_at: token.rows[0].expires_at,
          p_expected_connection_status: token.rows[0].connection_status,
          p_error_code: "INVALID_TOKEN",
          p_failure_kind: "invalid_credentials",
        })).rows[0].result,
      ).toBe(true);
      expect((await client.query("SELECT connection_status FROM public.tokens WHERE id=$1", [token.rows[0].id])).rows[0].connection_status).toBe("reauth_required");
      await client.query("DELETE FROM public.tokens WHERE id=$1", [token.rows[0].id]);
      expect(
        (await callNamed(client, "commit_token_refresh_success_v2", {
          p_token_id: token.rows[0].id,
          p_expected_row_version: token.rows[0].row_version,
          p_expected_created_at: token.rows[0].created_at,
          p_expected_expires_at: token.rows[0].expires_at,
          p_expected_connection_status: token.rows[0].connection_status,
          p_access_token: "new-token",
          p_expires_at: "2026-12-01T00:00:00Z",
        })).rows[0].result,
      ).toBe(false);
    });
  });

  it("TO02 TO05 lists valid refresh candidates before null or too-new metadata", async () => {
    await withDb(async (client) => {
      const validUser = await client.query("INSERT INTO public.users(instagram_id, instagram_username) VALUES ('ig-valid-refresh','valid.refresh') RETURNING id");
      const nullUser = await client.query("INSERT INTO public.users(instagram_id, instagram_username) VALUES ('ig-null-refresh','null.refresh') RETURNING id");
      const freshUser = await client.query("INSERT INTO public.users(instagram_id, instagram_username) VALUES ('ig-fresh-refresh','fresh.refresh') RETURNING id");
      const farFutureUser = await client.query("INSERT INTO public.users(instagram_id, instagram_username) VALUES ('ig-far-refresh','far.refresh') RETURNING id");
      const valid = await client.query(
        `INSERT INTO public.tokens(user_id, token_type, access_token, expires_at, created_at, connection_status)
         VALUES ($1, 'user', 'valid', now()+interval '2 days', now()-interval '2 days', 'connected')
         RETURNING id::text`,
        [validUser.rows[0].id],
      );
      await client.query(
        `INSERT INTO public.tokens(user_id, token_type, access_token, expires_at, created_at, connection_status)
         VALUES ($1, 'user', 'missing-expiry', NULL, now()-interval '2 days', 'connected')`,
        [nullUser.rows[0].id],
      );
      await client.query(
        `INSERT INTO public.tokens(user_id, token_type, access_token, expires_at, created_at, connection_status)
         VALUES ($1, 'user', 'too-new', now()+interval '2 days', now(), 'connected')`,
        [freshUser.rows[0].id],
      );
      const farFuture = await client.query(
        `INSERT INTO public.tokens(user_id, token_type, access_token, expires_at, created_at, connection_status)
         VALUES ($1, 'user', 'fresh-far-future', now()+interval '60 days', now(), 'connected')
         RETURNING id::text`,
        [farFutureUser.rows[0].id],
      );

      const candidates = await client.query("SELECT * FROM public.list_token_refresh_candidates_v2(1, 7)");
      expect(candidates.rows[0].token_id).toBe(valid.rows[0].id);
      const allCandidates = await client.query("SELECT token_id FROM public.list_token_refresh_candidates_v2(10, 7)");
      expect(allCandidates.rows.map((row) => row.token_id)).not.toContain(farFuture.rows[0].id);
    });
  });

  it("OP03 AU05 AU06 DB03 FINAL06 legacy callback does not overwrite existing v2 ownership", async () => {
    await withDb(async (client) => {
      await putSavingAttempt(client);
      await finalize(client);
      const before = await client.query("SELECT access_token FROM public.tokens");
      const protectedResult = await callNamed(client, "complete_guarded_legacy_instagram_callback_v2", {
        p_browser_binding_hash: browserA,
        p_legacy_state_hash: "9".repeat(64),
        p_instagram_user_id: "ig-1",
        p_instagram_username: "legacy.creator",
        p_access_token: "legacy-token",
        p_expires_at: "2026-12-01T00:00:00Z",
        p_granted_scopes: ["instagram_business_basic"],
        p_legacy_consent_snapshot: legacyConsentSnapshot("legacy-v2-owned"),
        p_now: "2026-09-11T00:02:00Z",
      });
      expect(protectedResult.rows[0].result.redirectPath).toBe("/complete");
      expect((await client.query("SELECT access_token FROM public.tokens")).rows[0].access_token).toBe(before.rows[0].access_token);

      const legacyResult = await callNamed(client, "complete_guarded_legacy_instagram_callback_v2", {
        p_browser_binding_hash: browserA,
        p_legacy_state_hash: "8".repeat(64),
        p_instagram_user_id: "legacy-ig-2",
        p_instagram_username: "legacy.two",
        p_access_token: "legacy-token-2",
        p_expires_at: "2026-12-01T00:00:00Z",
        p_granted_scopes: ["instagram_business_basic"],
        p_legacy_consent_snapshot: legacyConsentSnapshot("legacy-new"),
        p_now: "2026-09-11T00:03:00Z",
      });
      expect(legacyResult.rows[0].result.redirectPath).toBe("/Dashboard");
      expect(
        (await client.query("SELECT count(*)::int AS count FROM public.user_consents WHERE state_nonce='legacy:legacy-new'")).rows[0].count,
      ).toBe(1);
      await expect(
        callNamed(client, "complete_guarded_legacy_instagram_callback_v2", {
          p_browser_binding_hash: browserA,
          p_legacy_state_hash: "7".repeat(64),
          p_instagram_user_id: "legacy-ig-3",
          p_instagram_username: "legacy.three",
          p_access_token: "legacy-token-3",
          p_expires_at: "2026-12-01T00:00:00Z",
          p_granted_scopes: ["instagram_business_basic"],
          p_legacy_consent_snapshot: { ...legacyConsentSnapshot("legacy-raw"), rawPayload: {} },
          p_now: "2026-09-11T00:04:00Z",
        }),
      ).rejects.toThrow(/INVALID_LEGACY_CALLBACK_INPUT/);
      await expect(
        callNamed(client, "complete_guarded_legacy_instagram_callback_v2", {
          p_browser_binding_hash: browserA,
          p_legacy_state_hash: "6".repeat(64),
          p_instagram_user_id: "different-account",
          p_instagram_username: "legacy.conflict",
          p_access_token: "legacy-token-conflict",
          p_expires_at: "2026-12-01T00:00:00Z",
          p_granted_scopes: ["instagram_business_basic"],
          p_legacy_consent_snapshot: legacyConsentSnapshot("legacy-new"),
          p_now: "2026-09-11T00:05:00Z",
        }),
      ).rejects.toThrow(/LEGACY_IDEMPOTENCY_CONFLICT/);
    });
  });

  it("AUDIT04 AUDIT05 keeps token row_version trigger-owned against injection, decrease, and ABA", async () => {
    await withDb(async (client) => {
      const user = await client.query("INSERT INTO public.users(instagram_id, instagram_username) VALUES ('ig-version','version.creator') RETURNING id");
      const token = await client.query(
        `INSERT INTO public.tokens(user_id, token_type, access_token, expires_at, row_version, connection_status)
         VALUES ($1, 'user', 'same-token', '2030-01-01T00:00:00Z', 999, 'connected')
         RETURNING id, row_version::int AS row_version`,
        [user.rows[0].id],
      );
      expect(token.rows[0].row_version).toBe(1);

      const revoked = await client.query(
        "UPDATE public.tokens SET row_version=0, connection_status='revoked' WHERE id=$1 RETURNING row_version::int AS row_version",
        [token.rows[0].id],
      );
      expect(revoked.rows[0].row_version).toBe(2);

      const reconnected = await client.query(
        "UPDATE public.tokens SET row_version=1, connection_status='connected' WHERE id=$1 RETURNING row_version::int AS row_version",
        [token.rows[0].id],
      );
      expect(reconnected.rows[0].row_version).toBe(3);
    });
  });

  it("LIFE01 LIFE02 OP06 scrubs PII and deletes expired receipts by cleanup policy", async () => {
    await withDb(async (client) => {
      await client.query(
        `
          INSERT INTO public.onboarding_sessions(
            id, browser_binding_hash, request_key, payload_hash, draft_payload_encrypted, consent_snapshot,
            oauth_state_hash, oauth_state_encrypted, state_expires_at, draft_expires_at,
            status, stage, started_at, updated_at, lease_owner, lease_expires_at
          ) VALUES (
            '00000000-0000-4000-8000-000000000501', repeat('f',64), gen_random_uuid(),
            repeat('f',64), $1::jsonb, $2::jsonb, repeat('f',64), $1::jsonb,
            now()-interval '10 minutes', now()-interval '1 second',
            'saving', 'submission', now()-interval '30 minutes', now(),
            $3, now()+interval '90 seconds'
          )
        `,
        [sealedEnvelope, startArgs().p_policy_snapshot, ownerA],
      );
      await client.query("SELECT public.cleanup_onboarding_v2()");
      expect(
        (await client.query("SELECT status FROM public.onboarding_sessions WHERE id='00000000-0000-4000-8000-000000000501'")).rows[0].status,
      ).toBe("saving");

      await putSavingAttempt(client);
      await finalize(client);
      await client.query("UPDATE public.onboarding_sessions SET receipt_expires_at=now()-interval '1 second', oauth_code_encrypted='{}'::jsonb WHERE id=$1", [
        "00000000-0000-4000-8000-000000000301",
      ]);
      const cleanup = await client.query("SELECT public.cleanup_onboarding_v2() AS result");
      expect(cleanup.rows[0].result.deleted_expired_receipts).toBe(1);
      expect((await client.query("SELECT count(*)::int AS count FROM public.onboarding_sessions WHERE id='00000000-0000-4000-8000-000000000301'")).rows[0].count).toBe(0);
      expect((await client.query("SELECT count(*)::int AS count FROM public.onboarding_sessions WHERE id='00000000-0000-4000-8000-000000000501'")).rows[0].count).toBe(1);
    });
  });
});
