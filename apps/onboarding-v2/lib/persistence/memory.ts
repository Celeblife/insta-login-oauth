import { createHash } from "node:crypto";

import { PublicApiError } from "@/lib/domain/errors";
import type {
  AttemptRecord,
  CompletionLease,
  FinalizeInput,
  OnboardingRepository,
  StartAttemptAtomicInput,
  StartAttemptAtomicResult,
} from "@/lib/persistence/types";
import { uuid } from "@/lib/security/crypto";

const ACTIVE_STATUSES = new Set<AttemptRecord["status"]>([
  "pending",
  "callback_received",
  "exchanging_short",
  "short_token_checkpointed",
  "exchanging_long",
  "long_token_checkpointed",
  "fetching_account",
  "awaiting_account_confirmation",
  "saving",
  "cancelled",
]);
const PROCESSING_STATUSES = new Set<AttemptRecord["status"]>([
  "exchanging_short",
  "exchanging_long",
  "fetching_account",
  "saving",
]);

type AccountRoot = {
  providerAccountId: string;
  initialRequestId: string;
  latestStartedAt: string;
  latestAttemptId: string;
};

export class InMemoryOnboardingRepository implements OnboardingRepository {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly accounts = new Map<string, AccountRoot>();
  private readonly legacyCallbacks = new Map<string, { providerAccountId: string; snapshot: string }>();

  async getActiveAttemptForBrowser(browserBindingHash: string, now: string): Promise<AttemptRecord | null> {
    const nowMs = Date.parse(now);
    for (const attempt of Array.from(this.attempts.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt))) {
      if (attempt.browserBindingHash !== browserBindingHash) continue;
      if (attempt.status === "completed") return attempt;
      if (!ACTIVE_STATUSES.has(attempt.status)) continue;
      if (attempt.status === "cancelled" && (attempt.failureCode !== "OAUTH_CANCELLED" || attempt.draftPayloadEncrypted === null)) continue;
      if (Date.parse(attempt.draftExpiresAt) <= nowMs) {
        attempt.status = "expired";
        attempt.failureCode = "SESSION_EXPIRED";
        scrubAttemptSecrets(attempt, { preserveDraft: false });
        attempt.revision += 1;
        attempt.updatedAt = now;
        continue;
      }
      if (attempt.status === "pending" && Date.parse(attempt.stateExpiresAt) <= nowMs) {
        attempt.status = "expired";
        attempt.failureCode = "SESSION_EXPIRED";
        scrubAttemptSecrets(attempt, { preserveDraft: false });
        attempt.revision += 1;
        attempt.updatedAt = now;
        continue;
      }
      return attempt;
    }
    return null;
  }

  async findAttemptById(attemptId: string): Promise<AttemptRecord | null> {
    return this.attempts.get(attemptId) ?? null;
  }

  async findAttemptByRequestKey(browserBindingHash: string, requestKey: string): Promise<AttemptRecord | null> {
    return Array.from(this.attempts.values()).find((attempt) => attempt.browserBindingHash === browserBindingHash && attempt.requestKey === requestKey) ?? null;
  }

  async findAttemptByStateHash(stateHash: string): Promise<AttemptRecord | null> {
    return Array.from(this.attempts.values()).find((attempt) => attempt.oauthStateHash === stateHash) ?? null;
  }

  async startAttemptAtomic(input: StartAttemptAtomicInput): Promise<StartAttemptAtomicResult> {
    const existing = await this.findAttemptByRequestKey(input.browserBindingHash, input.requestKey);
    if (existing) {
      if (existing.payloadHash !== input.payloadHash || existing.parentAttemptId !== (input.parentAttemptId ?? null)) return { kind: "idempotency_conflict" };
      return { kind: "replayed", attempt: existing };
    }

    const active = await this.getActiveAttemptForBrowser(input.browserBindingHash, input.startedAt);
    const replacesActive = active && (active.id === input.replaceAttemptId || active.id === input.parentAttemptId);
    if (active && !replacesActive) return { kind: PROCESSING_STATUSES.has(active.status) ? "active_processing" : "active_attempt_exists" };
    if (active && replacesActive) {
      if (PROCESSING_STATUSES.has(active.status)) return { kind: "active_processing" };
      active.status = "expired";
      active.failureCode = "STALE_ATTEMPT";
      scrubAttemptSecrets(active, { preserveDraft: false });
      active.revision += 1;
      active.updatedAt = input.startedAt;
    }

    const attempt: AttemptRecord = {
      id: input.id,
      browserBindingHash: input.browserBindingHash,
      requestKey: input.requestKey,
      payloadHash: input.payloadHash,
      draftPayloadEncrypted: input.draftPayloadEncrypted,
      policySnapshot: input.policySnapshot,
      parentAttemptId: input.parentAttemptId ?? null,
      oauthStateHash: input.oauthStateHash,
      encryptedOAuthState: input.encryptedOAuthState,
      stateInvalidatedAt: null,
      encryptedCode: null,
      codeHash: null,
      encryptedShortToken: null,
      encryptedLongToken: null,
      stateExpiresAt: input.stateExpiresAt,
      draftExpiresAt: input.draftExpiresAt,
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
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
    };
    this.attempts.set(attempt.id, attempt);
    return { kind: "created", attempt };
  }

  async recordCallbackCode(input: {
    attemptId: string;
    browserBindingHash: string;
    encryptedCode: AttemptRecord["encryptedCode"];
    codeHash: string;
    now: string;
  }): Promise<AttemptRecord> {
    const attempt = this.requireOwnedAttempt(input.attemptId, input.browserBindingHash);
    if (attempt.status === "completed") return attempt;
    if (attempt.status !== "pending") throw new PublicApiError("STALE_ATTEMPT");
    attempt.encryptedCode = input.encryptedCode;
    attempt.codeHash = input.codeHash;
    attempt.encryptedOAuthState = null;
    attempt.stateInvalidatedAt = input.now;
    attempt.status = "callback_received";
    attempt.stage = "account";
    attempt.revision += 1;
    attempt.updatedAt = input.now;
    return attempt;
  }

  async claimCompletionLease(input: {
    attemptId: string;
    browserBindingHash: string;
    owner: string;
    leaseExpiresAt: string;
    now: string;
  }): Promise<CompletionLease> {
    const attempt = this.requireOwnedAttempt(input.attemptId, input.browserBindingHash);
    if (attempt.status === "completed") return { attempt, owner: input.owner, fencingToken: attempt.fencingToken };
    if (!ACTIVE_STATUSES.has(attempt.status)) throw new PublicApiError("REAUTH_REQUIRED", 410);
    if (attempt.leaseOwner && attempt.leaseExpiresAt && Date.parse(attempt.leaseExpiresAt) > Date.parse(input.now)) throw new PublicApiError("ACTIVE_PROCESSING");
    attempt.leaseOwner = input.owner;
    attempt.leaseExpiresAt = input.leaseExpiresAt;
    attempt.fencingToken += 1;
    attempt.updatedAt = input.now;
    return { attempt, owner: input.owner, fencingToken: attempt.fencingToken };
  }

  async markExchangeBegun(input: { attemptId: string; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord> {
    const attempt = this.requireLease(input);
    if (attempt.status === "callback_received") {
      attempt.status = "exchanging_short";
      attempt.stage = "account";
      attempt.revision += 1;
      attempt.updatedAt = input.now;
    }
    return attempt;
  }

  async checkpointShortToken(input: {
    attemptId: string;
    owner: string;
    fencingToken: number;
    encryptedShortToken: AttemptRecord["encryptedShortToken"];
    now: string;
  }): Promise<AttemptRecord> {
    const attempt = this.requireLease(input);
    attempt.encryptedShortToken = input.encryptedShortToken;
    attempt.encryptedCode = null;
    attempt.status = "short_token_checkpointed";
    attempt.revision += 1;
    attempt.updatedAt = input.now;
    return attempt;
  }

  async markLongExchangeBegun(input: { attemptId: string; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord> {
    const attempt = this.requireLease(input);
    if (attempt.status === "short_token_checkpointed") {
      attempt.status = "exchanging_long";
      attempt.revision += 1;
      attempt.updatedAt = input.now;
    }
    return attempt;
  }

  async checkpointLongToken(input: {
    attemptId: string;
    owner: string;
    fencingToken: number;
    encryptedLongToken: AttemptRecord["encryptedLongToken"];
    token: Parameters<OnboardingRepository["checkpointLongToken"]>[0]["token"];
    now: string;
  }): Promise<AttemptRecord> {
    const attempt = this.requireLease(input);
    attempt.encryptedLongToken = input.encryptedLongToken;
    attempt.status = "long_token_checkpointed";
    attempt.stage = "storage";
    attempt.revision += 1;
    attempt.updatedAt = input.now;
    return attempt;
  }

  async checkpointAccountCandidate(input: {
    attemptId: string;
    owner: string;
    fencingToken: number;
    account: NonNullable<AttemptRecord["candidate"]>["account"];
    token: Parameters<OnboardingRepository["checkpointAccountCandidate"]>[0]["token"];
    payload: Parameters<OnboardingRepository["checkpointAccountCandidate"]>[0]["payload"];
    requireConfirmation: boolean;
    now: string;
  }): Promise<AttemptRecord> {
    const attempt = this.requireLease(input);
    attempt.candidate = {
      enteredUsername: input.payload.instagramUsername ?? "",
      connectedUsername: input.account.username,
      account: input.account,
      token: { providerUserId: input.token.providerUserId, expiresAt: input.token.expiresAt, grantedScopes: input.token.grantedScopes, accessTokenHash: tokenHash(input.token.accessToken) },
    };
    attempt.status = input.requireConfirmation ? "awaiting_account_confirmation" : "saving";
    attempt.stage = input.requireConfirmation ? "account" : "submission";
    if (input.requireConfirmation) {
      attempt.leaseOwner = null;
      attempt.leaseExpiresAt = null;
    }
    attempt.revision += 1;
    attempt.updatedAt = input.now;
    return attempt;
  }

  async failAttempt(input: {
    attemptId: string;
    browserBindingHash: string;
    code: AttemptRecord["failureCode"];
    status: "failed" | "cancelled" | "expired";
    now: string;
    owner?: string;
    fencingToken?: number;
  }): Promise<AttemptRecord> {
    const attempt = this.requireOwnedAttempt(input.attemptId, input.browserBindingHash);
    if (attempt.status !== "pending") this.requireLease({ attemptId: input.attemptId, owner: input.owner ?? "", fencingToken: input.fencingToken ?? -1, now: input.now });
    attempt.status = input.status;
    attempt.failureCode = input.code;
    attempt.stateInvalidatedAt = input.now;
    scrubAttemptSecrets(attempt, {
      preserveDraft: shouldPreserveDraftForFailure(input.status, input.code, attempt.draftExpiresAt, input.now),
    });
    attempt.leaseOwner = null;
    attempt.leaseExpiresAt = null;
    attempt.revision += 1;
    attempt.updatedAt = input.now;
    return attempt;
  }

  async finalizeAttempt(input: FinalizeInput): Promise<AttemptRecord> {
    const attempt = this.requireOwnedAttempt(input.attemptId, input.browserBindingHash);
    if (attempt.status === "completed") return attempt;
    this.requireLease(input);
    if (
      attempt.revision !== input.expectedRevision ||
      !attempt.candidate ||
      !attempt.encryptedLongToken ||
      attempt.candidate.account.providerAccountId !== input.account.providerAccountId ||
      attempt.candidate.account.username !== input.account.username ||
      attempt.candidate.account.accountType !== input.account.accountType ||
      attempt.candidate.token.providerUserId !== input.token.providerUserId ||
      attempt.candidate.token.expiresAt !== input.token.expiresAt ||
      attempt.candidate.token.accessTokenHash !== tokenHash(input.token.accessToken) ||
      JSON.stringify(attempt.candidate.token.grantedScopes) !== JSON.stringify(input.token.grantedScopes)
    ) {
      throw new PublicApiError("STALE_ATTEMPT");
    }

    const root = this.accounts.get(input.account.providerAccountId);
    if (root && isOlderAttempt(attempt, root)) {
      attempt.status = "failed";
      attempt.failureCode = "STALE_ATTEMPT";
      scrubAttemptSecrets(attempt, { preserveDraft: false });
      attempt.revision += 1;
      attempt.updatedAt = input.now;
      throw new PublicApiError("STALE_ATTEMPT");
    }

    const requestId = attempt.requestId ?? uuid();
    const common = {
      kind: "v2" as const,
      requestId,
      receivedAt: input.now,
      fullName: input.payload.fullName,
      email: input.payload.email,
      phone: input.payload.phone,
      instagramUsername: input.account.username,
    };
    attempt.result = root
      ? { ...common, connectionKind: "reconnection", analysisRequested: false, reviewStatus: "not_requested", initialRequestId: root.initialRequestId }
      : { ...common, connectionKind: "new", analysisRequested: true, reviewStatus: "pending_review" };
    this.accounts.set(input.account.providerAccountId, {
      providerAccountId: input.account.providerAccountId,
      initialRequestId: root?.initialRequestId ?? requestId,
      latestStartedAt: attempt.startedAt,
      latestAttemptId: attempt.id,
    });
    attempt.status = "completed";
    attempt.stage = "submission";
    attempt.requestId = requestId;
    attempt.receiptExpiresAt = new Date(Date.parse(input.now) + 24 * 60 * 60 * 1000).toISOString();
    scrubAttemptSecrets(attempt, { preserveDraft: false });
    attempt.leaseOwner = null;
    attempt.leaseExpiresAt = null;
    attempt.revision += 1;
    attempt.updatedAt = input.now;
    return attempt;
  }

  async completeGuardedLegacyCallback(input: Parameters<OnboardingRepository["completeGuardedLegacyCallback"]>[0]): Promise<{ redirectPath: string }> {
    if (this.accounts.has(input.account.providerAccountId)) return { redirectPath: "/complete" };
    const snapshot = JSON.stringify({
      nonce: input.consentSnapshot.nonce,
      consentSchemaVersion: input.consentSnapshot.consentSchemaVersion,
      termsVersion: input.consentSnapshot.termsVersion,
      privacyVersion: input.consentSnapshot.privacyVersion,
      instagramPermissionsVersion: input.consentSnapshot.instagramPermissionsVersion,
      consentAge: input.consentSnapshot.consentAge,
      consentTerms: input.consentSnapshot.consentTerms,
      consentPrivacy: input.consentSnapshot.consentPrivacy,
      consentInstagram: input.consentSnapshot.consentInstagram,
      acceptedAt: input.consentSnapshot.acceptedAt,
      bundleHash: input.consentSnapshot.bundleHash,
    });
    const previous = this.legacyCallbacks.get(input.consentSnapshot.nonce);
    if (previous && (previous.providerAccountId !== input.account.providerAccountId || previous.snapshot !== snapshot)) {
      throw new PublicApiError("IDEMPOTENCY_CONFLICT");
    }
    this.legacyCallbacks.set(input.consentSnapshot.nonce, {
      providerAccountId: input.account.providerAccountId,
      snapshot,
    });
    return { redirectPath: "/Dashboard" };
  }

  private requireOwnedAttempt(attemptId: string, browserBindingHash: string): AttemptRecord {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.browserBindingHash !== browserBindingHash) throw new PublicApiError("SESSION_EXPIRED", 401);
    return attempt;
  }

  private requireLease(input: { attemptId: string; owner: string; fencingToken: number; now: string }): AttemptRecord {
    const attempt = this.attempts.get(input.attemptId);
    if (!attempt || attempt.leaseOwner !== input.owner || attempt.fencingToken !== input.fencingToken || !attempt.leaseExpiresAt || Date.parse(attempt.leaseExpiresAt) <= Date.parse(input.now)) throw new PublicApiError("ACTIVE_PROCESSING");
    return attempt;
  }
}

function isOlderAttempt(attempt: AttemptRecord, root: AccountRoot): boolean {
  const cmp = attempt.startedAt.localeCompare(root.latestStartedAt);
  return cmp < 0 || (cmp === 0 && attempt.id < root.latestAttemptId);
}

function scrubAttemptSecrets(attempt: AttemptRecord, input: { preserveDraft: boolean }): void {
  if (!input.preserveDraft) attempt.draftPayloadEncrypted = null;
  attempt.encryptedOAuthState = null;
  attempt.encryptedCode = null;
  attempt.encryptedShortToken = null;
  attempt.encryptedLongToken = null;
  attempt.candidate = null;
}

function shouldPreserveDraftForFailure(
  status: "failed" | "cancelled" | "expired",
  code: AttemptRecord["failureCode"],
  draftExpiresAt: string,
  now: string,
): boolean {
  if (Date.parse(draftExpiresAt) <= Date.parse(now)) return false;
  if (status === "cancelled" && code === "OAUTH_CANCELLED") return true;
  return status === "failed" && (code === "PROVIDER_UNAVAILABLE" || code === "PERMISSIONS_REQUIRED");
}

function tokenHash(accessToken: string) {
  return createHash("sha256").update(accessToken, "utf8").digest("hex");
}
