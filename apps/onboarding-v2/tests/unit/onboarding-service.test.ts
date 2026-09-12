import { randomBytes, randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getConfig } from "@/lib/config/env";
import { PublicApiError } from "@/lib/domain/errors";
import { OnboardingService } from "@/lib/services/onboarding";
import type { AttemptRecord, CompletionLease, OnboardingRepository } from "@/lib/persistence/types";
import type { InstagramProvider } from "@/lib/providers/instagram";

describe("OnboardingService completion races", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
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
    process.env = { ...originalEnv };
  });

  it("returns current safe processing status when completion lease claim loses to another worker", async () => {
    const current = attemptRecord({ status: "exchanging_long", stage: "account", revision: 3 });
    const repository = fakeRepository({
      async findAttemptById() {
        return current;
      },
      async claimCompletionLease() {
        throw new PublicApiError("ACTIVE_PROCESSING");
      },
    });
    const service = new OnboardingService({ config: getConfig(), repository, provider: fakeProvider });

    await expect(service.complete(current.browserBindingHash, { attemptId: current.id })).resolves.toEqual({
      status: 202,
      body: { status: "processing", attemptId: current.id, revision: 3, stage: "account", retryAfterMs: 2000, submissionIntent: "unknown" },
    });
  });

  it("returns a completed lease receipt without decrypting scrubbed draft and keeps expired receipt as 410", async () => {
    const nowMs = Date.now();
    const beforeClaim = attemptRecord({ status: "saving", stage: "submission", revision: 4, candidate: candidate() });
    const completed = attemptRecord({ status: "completed", stage: "submission", revision: 5, draftPayloadEncrypted: null, result: result(), receiptExpiresAt: new Date(nowMs + 86_400_000).toISOString() });
    const repository = fakeRepository({
      async findAttemptById() {
        return beforeClaim;
      },
      async claimCompletionLease() {
        return { attempt: completed, owner: randomUUID(), fencingToken: 2 };
      },
    });
    const service = new OnboardingService({ config: getConfig(), repository, provider: fakeProvider });

    await expect(service.complete(beforeClaim.browserBindingHash, { attemptId: beforeClaim.id })).resolves.toMatchObject({
      status: 200,
      body: { status: "completed", attemptId: beforeClaim.id, result: { kind: "v2", email: "creator@example.com" } },
    });

    const expired = { ...completed, receiptExpiresAt: new Date(nowMs - 86_400_000).toISOString() };
    const expiredService = new OnboardingService({
      config: getConfig(),
      provider: fakeProvider,
      repository: fakeRepository({
        async findAttemptById() {
          return beforeClaim;
        },
        async claimCompletionLease() {
          return { attempt: expired, owner: randomUUID(), fencingToken: 3 };
        },
      }),
    });
    await expect(expiredService.complete(beforeClaim.browserBindingHash, { attemptId: beforeClaim.id })).rejects.toMatchObject({ code: "SESSION_EXPIRED", status: 410 });
  });
});

function fakeRepository(overrides: Partial<OnboardingRepository>): OnboardingRepository {
  return {
    async getActiveAttemptForBrowser() { return null; },
    async findAttemptById() { return null; },
    async findAttemptByRequestKey() { return null; },
    async findAttemptByStateHash() { return null; },
    async startAttemptAtomic() { throw new Error("not implemented"); },
    async recordCallbackCode() { throw new Error("not implemented"); },
    async claimCompletionLease(): Promise<CompletionLease> { throw new Error("not implemented"); },
    async markExchangeBegun() { throw new Error("not implemented"); },
    async checkpointShortToken() { throw new Error("not implemented"); },
    async markLongExchangeBegun() { throw new Error("not implemented"); },
    async checkpointLongToken() { throw new Error("not implemented"); },
    async checkpointAccountCandidate() { throw new Error("not implemented"); },
    async failAttempt() { throw new Error("not implemented"); },
    async finalizeAttempt() { throw new Error("not implemented"); },
    async completeGuardedLegacyCallback() { throw new Error("not implemented"); },
    ...overrides,
  };
}

const fakeProvider: InstagramProvider = {
  buildAuthorizeUrl() { return "https://www.instagram.com/oauth/authorize"; },
  async exchangeCodeForShortToken() { throw new Error("not implemented"); },
  async exchangeShortTokenForLongToken() { throw new Error("not implemented"); },
  async fetchAccount() { throw new Error("not implemented"); },
};

function attemptRecord(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  const id = "00000000-0000-4000-8000-000000000301";
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
    stateInvalidatedAt: "2026-09-11T00:00:10.000Z",
    encryptedCode: null,
    codeHash: "d".repeat(64),
    encryptedShortToken: null,
    encryptedLongToken: null,
    stateExpiresAt: "2026-09-11T00:10:00.000Z",
    draftExpiresAt: "2026-09-11T00:30:00.000Z",
    receiptExpiresAt: null,
    revision: 1,
    status: "callback_received",
    stage: "account",
    leaseOwner: null,
    leaseExpiresAt: null,
    fencingToken: 0,
    candidate: null,
    result: null,
    failureCode: null,
    requestId: null,
    startedAt: "2026-09-11T00:00:00.000Z",
    updatedAt: "2026-09-11T00:00:10.000Z",
    ...overrides,
  };
}

function candidate(): NonNullable<AttemptRecord["candidate"]> {
  return {
    enteredUsername: "creator",
    connectedUsername: "creator",
    account: { providerAccountId: "1789", username: "creator", accountType: "creator" },
    token: { providerUserId: "1789", expiresAt: "2026-11-10T00:00:00.000Z", grantedScopes: ["instagram_business_basic"], accessTokenHash: "a".repeat(64) },
  };
}

function result(): NonNullable<AttemptRecord["result"]> {
  return {
    kind: "v2",
    requestId: "10000000-0000-4000-8000-000000000001",
    receivedAt: "2026-09-11T00:01:00.000Z",
    fullName: "김셀럽",
    email: "creator@example.com",
    phone: "+821000000000",
    instagramUsername: "creator",
    connectionKind: "new",
    analysisRequested: true,
    reviewStatus: "pending_review",
  };
}
