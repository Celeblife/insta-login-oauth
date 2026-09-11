import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PublicApiError } from "@/lib/domain/errors";
import { InMemoryOnboardingRepository } from "@/lib/persistence/memory";
import { publicErrorFromRpc, SupabaseOnboardingRepository, type RpcClient, attemptFromRecord } from "@/lib/persistence/supabase";

describe("Supabase RPC mapper", () => {
  it("DB07 FINAL08 rejects malformed RPC attempt records instead of casting blindly", () => {
    expect(() => attemptFromRecord(validAttemptRecord())).not.toThrow();
    expect(() => attemptFromRecord({ ...validAttemptRecord(), revision: "1" })).toThrow(PublicApiError);
    expect(() => attemptFromRecord({ ...validAttemptRecord(), status: "done" })).toThrow(PublicApiError);
    expect(() => attemptFromRecord({ ...validAttemptRecord(), candidate: { token: { accessToken: "leak" } } })).toThrow(PublicApiError);
    expect(() => attemptFromRecord({
      ...validAttemptRecord(),
      candidate: {
        enteredUsername: "creator_user",
        connectedUsername: "creator_user",
        account: { providerAccountId: "ig-v2", username: "creator_user", accountType: "creator" },
        token: { providerUserId: "ig-v2", expiresAt: "2026-12-01T00:00:00.000Z", grantedScopes: ["instagram_business_basic"] },
      },
    })).toThrow(PublicApiError);
    expect(() => attemptFromRecord({ ...validAttemptRecord(), policySnapshot: { bundleHash: "0" } })).toThrow(PublicApiError);
    expect(() => attemptFromRecord({ ...validAttemptRecord(), payload: validPayload() })).toThrow(PublicApiError);
  });

  it("maps only known SQL RPC failures to public API errors", async () => {
    expect(publicErrorFromRpc({ message: "STALE_ATTEMPT", code: "P0001" })).toMatchObject({ code: "STALE_ATTEMPT" });
    expect(publicErrorFromRpc({ message: "ACTIVE_PROCESSING", code: "55P03" })).toMatchObject({ code: "ACTIVE_PROCESSING" });
    expect(publicErrorFromRpc({ message: "RECEIPT_EXPIRED", code: "22023" })).toMatchObject({ code: "SESSION_EXPIRED" });
    expect(publicErrorFromRpc({ message: "RATE_LIMITED", code: "22023" })).toMatchObject({ code: "RATE_LIMITED", status: 429, retryAfterMs: 60_000 });
    expect(publicErrorFromRpc({ message: "raw database internals", code: "P0001" })).toMatchObject({ code: "STORAGE_UNAVAILABLE" });

    const client: RpcClient = {
      async rpc() {
        return { data: null, error: { message: "RATE_LIMITED", code: "22023" } };
      },
    };
    const repository = new SupabaseOnboardingRepository(
      { supabase: { url: "https://project.supabase.co", serviceRoleKey: "sb_secret_test" } } as ConstructorParameters<typeof SupabaseOnboardingRepository>[0],
      client,
    );
    await expect(repository.findAttemptById(randomUUID())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("passes exact guarded legacy callback adapter input without exposing raw callback credentials", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: RpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: { redirectPath: "/Dashboard" }, error: null };
      },
    };
    const repository = new SupabaseOnboardingRepository(
      { supabase: { url: "https://project.supabase.co", serviceRoleKey: "sb_secret_test" } } as ConstructorParameters<typeof SupabaseOnboardingRepository>[0],
      client,
    );

    await expect(
      repository.completeGuardedLegacyCallback({
        browserBindingHash: "a".repeat(64),
        stateHash: "b".repeat(64),
        account: { providerAccountId: "17841400000000000", username: "legacy_user", accountType: "creator" },
        token: { accessToken: "long-live-token-secret", providerUserId: "17841400000000000", expiresAt: "2026-11-10T00:00:00.000Z", grantedScopes: ["instagram_business_basic", "instagram_business_manage_insights"] },
        consentSnapshot: {
          nonce: "legacy-nonce",
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
          rawPayload: {},
        },
        now: "2026-09-11T00:00:00.000Z",
      }),
    ).resolves.toEqual({ redirectPath: "/Dashboard" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe("complete_guarded_legacy_instagram_callback_v2");
    expect(calls[0]?.args).toEqual({
      p_browser_binding_hash: "a".repeat(64),
      p_legacy_state_hash: "b".repeat(64),
      p_instagram_user_id: "17841400000000000",
      p_instagram_username: "legacy_user",
      p_access_token: "long-live-token-secret",
      p_expires_at: "2026-11-10T00:00:00.000Z",
      p_granted_scopes: ["instagram_business_basic", "instagram_business_manage_insights"],
      p_legacy_consent_snapshot: {
        nonce: "legacy-nonce",
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
      },
      p_now: "2026-09-11T00:00:00.000Z",
    });
    expect(JSON.stringify(calls[0])).not.toContain("legacy-code");
    expect(JSON.stringify(calls[0])).not.toContain("raw-state-token");
  });

  it("OP03 AU05 memory legacy callback preserves v2 roots and rejects nonce conflicts", async () => {
    const repository = new InMemoryOnboardingRepository();
    const payload = validPayload();
    const startedAt = "2026-09-11T00:00:00.000Z";
    const started = await repository.startAttemptAtomic({
      id: "00000000-0000-4000-8000-000000000101",
      browserBindingHash: "a".repeat(64),
      requestKey: payload.requestKey,
      payloadHash: "b".repeat(64),
      draftPayloadEncrypted: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "ciphertext" },
      policySnapshot: validPolicySnapshot(),
      oauthStateHash: "c".repeat(64),
      encryptedOAuthState: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "state" },
      stateExpiresAt: "2026-09-11T00:10:00.000Z",
      draftExpiresAt: "2026-09-11T00:30:00.000Z",
      startedAt,
    });
    if (started.kind !== "created") throw new Error("expected created");
    await repository.recordCallbackCode({
      attemptId: started.attempt.id,
      browserBindingHash: "a".repeat(64),
      encryptedCode: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "code" },
      codeHash: "d".repeat(64),
      now: "2026-09-11T00:01:00.000Z",
    });
    const lease = await repository.claimCompletionLease({
      attemptId: started.attempt.id,
      browserBindingHash: "a".repeat(64),
      owner: "00000000-0000-4000-8000-000000000001",
      leaseExpiresAt: "2026-09-11T00:05:00.000Z",
      now: "2026-09-11T00:01:01.000Z",
    });
    await repository.markExchangeBegun({ attemptId: started.attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, now: "2026-09-11T00:01:02.000Z" });
    await repository.checkpointShortToken({ attemptId: started.attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, encryptedShortToken: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "short" }, now: "2026-09-11T00:01:03.000Z" });
    await repository.markLongExchangeBegun({ attemptId: started.attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, now: "2026-09-11T00:01:04.000Z" });
    await repository.checkpointLongToken({ attemptId: started.attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, encryptedLongToken: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "long" }, token: { accessToken: "v2-token", providerUserId: "ig-v2", expiresAt: "2026-12-01T00:00:00.000Z", grantedScopes: ["instagram_business_basic"] }, now: "2026-09-11T00:01:05.000Z" });
    const candidate = await repository.checkpointAccountCandidate({ attemptId: started.attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, account: { providerAccountId: "ig-v2", username: "celeblife_demo", accountType: "creator" }, token: { accessToken: "v2-token", providerUserId: "ig-v2", expiresAt: "2026-12-01T00:00:00.000Z", grantedScopes: ["instagram_business_basic"] }, payload, requireConfirmation: false, now: "2026-09-11T00:01:06.000Z" });
    await repository.finalizeAttempt({ attemptId: started.attempt.id, browserBindingHash: "a".repeat(64), owner: lease.owner, fencingToken: lease.fencingToken, expectedRevision: candidate.revision, account: { providerAccountId: "ig-v2", username: "celeblife_demo", accountType: "creator" }, token: { accessToken: "v2-token", providerUserId: "ig-v2", expiresAt: "2026-12-01T00:00:00.000Z", grantedScopes: ["instagram_business_basic"] }, payload, now: "2026-09-11T00:01:07.000Z" });
    expect(await repository.findAttemptById(started.attempt.id)).toMatchObject({
      status: "completed",
      draftPayloadEncrypted: null,
      encryptedCode: null,
      encryptedShortToken: null,
      encryptedLongToken: null,
      candidate: null,
    });

    await expect(repository.completeGuardedLegacyCallback(legacyInput({ providerAccountId: "ig-v2", nonce: "legacy-v2" }))).resolves.toEqual({ redirectPath: "/complete" });
    await expect(repository.completeGuardedLegacyCallback(legacyInput({ providerAccountId: "legacy-ig", nonce: "legacy-new" }))).resolves.toEqual({ redirectPath: "/Dashboard" });
    await expect(repository.completeGuardedLegacyCallback(legacyInput({ providerAccountId: "different-legacy-ig", nonce: "legacy-new" }))).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("DB08 sends full token binding metadata to checkpoint RPCs without raw token leakage", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: RpcClient = {
      async rpc(name, args) {
        calls.push({ name, args });
        return { data: validAttemptRecord(), error: null };
      },
    };
    const repository = new SupabaseOnboardingRepository(
      { supabase: { url: "https://project.supabase.co", serviceRoleKey: "sb_secret_test" } } as ConstructorParameters<typeof SupabaseOnboardingRepository>[0],
      client,
    );
    const token = { accessToken: "long-live-token-secret", providerUserId: "17841400000000000", expiresAt: "2026-11-10T00:00:00.000Z", grantedScopes: ["instagram_business_basic"] };
    const expectedMetadata = {
      providerUserId: token.providerUserId,
      expiresAt: token.expiresAt,
      grantedScopes: token.grantedScopes,
      accessTokenHash: tokenHash(token.accessToken),
    };

    await repository.checkpointLongToken({
      attemptId: "00000000-0000-4000-8000-000000000101",
      owner: "00000000-0000-4000-8000-000000000001",
      fencingToken: 1,
      encryptedLongToken: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "long" },
      token,
      now: "2026-09-11T00:01:00.000Z",
    });
    await repository.checkpointAccountCandidate({
      attemptId: "00000000-0000-4000-8000-000000000101",
      owner: "00000000-0000-4000-8000-000000000001",
      fencingToken: 1,
      account: { providerAccountId: token.providerUserId, username: "creator_user", accountType: "creator" },
      token,
      payload: validPayload(),
      requireConfirmation: false,
      now: "2026-09-11T00:01:01.000Z",
    });

    expect(calls.map((call) => call.name)).toEqual(["checkpoint_instagram_long_token_v2", "checkpoint_instagram_account_candidate_v2"]);
    expect(calls[0]?.args.p_token_metadata).toEqual(expectedMetadata);
    expect(calls[1]?.args.p_token_metadata).toEqual(expectedMetadata);
    expect(JSON.stringify(calls.map((call) => call.args.p_token_metadata))).not.toContain(token.accessToken);
  });

  it("scrubs memory draft and temporary secrets except recoverable same-browser OAuth cancellation", async () => {
    const repository = new InMemoryOnboardingRepository();
    const cancelled = await startMemoryAttempt(repository, "00000000-0000-4000-8000-000000000201");
    await repository.failAttempt({ attemptId: cancelled.attempt.id, browserBindingHash: "a".repeat(64), code: "OAUTH_CANCELLED", status: "cancelled", now: "2026-09-11T00:01:00.000Z" });
    expect(await repository.findAttemptById(cancelled.attempt.id)).toMatchObject({
      status: "cancelled",
      draftPayloadEncrypted: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "draft" },
      encryptedOAuthState: null,
      encryptedCode: null,
    });

    const failureRepository = new InMemoryOnboardingRepository();
    const failed = await startMemoryAttempt(failureRepository, "00000000-0000-4000-8000-000000000202");
    await failureRepository.failAttempt({ attemptId: failed.attempt.id, browserBindingHash: "a".repeat(64), code: "PROVIDER_UNAVAILABLE", status: "failed", now: "2026-09-11T00:01:00.000Z" });
    expect(await failureRepository.findAttemptById(failed.attempt.id)).toMatchObject({
      status: "failed",
      draftPayloadEncrypted: null,
      encryptedOAuthState: null,
      encryptedCode: null,
      encryptedShortToken: null,
      encryptedLongToken: null,
      candidate: null,
    });
  });
});

async function startMemoryAttempt(repository: InMemoryOnboardingRepository, id: string) {
  const result = await repository.startAttemptAtomic({
    id,
    browserBindingHash: "a".repeat(64),
    requestKey: randomUUID(),
    payloadHash: "b".repeat(64),
    draftPayloadEncrypted: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "draft" },
    policySnapshot: validPolicySnapshot(),
    oauthStateHash: "c".repeat(64),
    encryptedOAuthState: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "state" },
    stateExpiresAt: "2026-09-11T00:10:00.000Z",
    draftExpiresAt: "2026-09-11T00:30:00.000Z",
    startedAt: "2026-09-11T00:00:00.000Z",
  });
  if (result.kind !== "created") throw new Error("expected created");
  return result;
}

function tokenHash(accessToken: string) {
  return createHash("sha256").update(accessToken, "utf8").digest("hex");
}

function legacyInput({ providerAccountId, nonce }: { providerAccountId: string; nonce: string }) {
  return {
    browserBindingHash: "a".repeat(64),
    stateHash: "e".repeat(64),
    account: { providerAccountId, username: "legacy_user", accountType: "creator" as const },
    token: { accessToken: "legacy-token", providerUserId: providerAccountId, expiresAt: "2026-12-01T00:00:00.000Z", grantedScopes: ["instagram_business_basic"] },
    consentSnapshot: {
      nonce,
      consentSchemaVersion: 1 as const,
      termsVersion: "influencer-v1.2-2026-08-26",
      privacyVersion: "privacy-2026-08-26-v3",
      instagramPermissionsVersion: "instagram-permissions-2026-08-26",
      consentAge: true as const,
      consentTerms: true as const,
      consentPrivacy: true as const,
      consentInstagram: true as const,
      acceptedAt: "2026-09-11T00:00:00.000Z",
      bundleHash: "c".repeat(64),
      rawPayload: {},
    },
    now: "2026-09-11T00:02:00.000Z",
  };
}

function validPolicySnapshot() {
  return {
    bundleId: "approved-bundle",
    bundleVersion: "local-v1",
    bundleHash: "0".repeat(64),
    documents: { termsVersion: "t", privacyVersion: "p", instagramTermsVersion: "i", collectionConsentVersion: "c" },
    consents: { age: true as const, terms: true as const, privacy: true as const, instagramData: true as const },
    acceptedAt: "2026-09-11T00:00:00.000Z",
  };
}

function validAttemptRecord() {
  const id = randomUUID();
  return {
    id,
    browserBindingHash: "a".repeat(64),
    requestKey: randomUUID(),
    payloadHash: "b".repeat(64),
    draftPayloadEncrypted: { keyVersion: "test-v1", iv: "iv", tag: "tag", ciphertext: "ciphertext" },
    policySnapshot: {
      bundleId: "approved-bundle",
      bundleVersion: "local-v1",
      bundleHash: "0".repeat(64),
      documents: { termsVersion: "t", privacyVersion: "p", instagramTermsVersion: "i", collectionConsentVersion: "c" },
      consents: { age: true, terms: true, privacy: true, instagramData: true },
      acceptedAt: "2026-09-11T00:00:00.000Z",
    },
    parentAttemptId: null,
    oauthStateHash: "c".repeat(64),
    encryptedOAuthState: null,
    stateInvalidatedAt: null,
    encryptedCode: null,
    codeHash: null,
    encryptedShortToken: null,
    encryptedLongToken: null,
    stateExpiresAt: "2026-09-11T00:10:00.000Z",
    draftExpiresAt: "2026-09-11T00:30:00.000Z",
    receiptExpiresAt: null,
    revision: 0,
    status: "pending",
    stage: "account",
    leaseOwner: null,
    leaseExpiresAt: null,
    fencingToken: 0,
    candidate: null,
    result: null,
    failureCode: null,
    requestId: null,
    startedAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:00.000Z",
  };
}

function validPayload() {
  return {
    requestKey: randomUUID(),
    policyBundleId: "approved-bundle",
    fullName: "김셀럽",
    email: "creator@example.com",
    phone: "010-0000-0000",
    instagramUsername: "celeblife_demo",
    consents: { age: true as const, terms: true as const, privacy: true as const, instagramData: true as const },
  };
}
