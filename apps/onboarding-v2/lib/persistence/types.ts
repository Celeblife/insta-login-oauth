import type { PublicErrorCode, StartRequest, StartResponse, SubmittedResult, UUID } from "@/lib/contracts/onboarding";
import type { InstagramAccount, InstagramToken } from "@/lib/providers/instagram";
import type { SealedValue } from "@/lib/security/crypto";
import type { LegacyConsentSnapshot } from "@/lib/legacy/instagram";

export type AttemptStatus =
  | "pending"
  | "callback_received"
  | "exchanging_short"
  | "short_token_checkpointed"
  | "exchanging_long"
  | "long_token_checkpointed"
  | "fetching_account"
  | "awaiting_account_confirmation"
  | "saving"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export type DraftSnapshot = Pick<StartRequest, "fullName" | "email" | "phone" | "instagramUsername">;

export type PolicySnapshot = {
  bundleId: string;
  bundleVersion: string;
  bundleHash: string;
  documents: {
    termsVersion: string;
    privacyVersion: string;
    instagramTermsVersion: string;
    collectionConsentVersion: string;
  };
  consents: StartRequest["consents"];
  acceptedAt: string;
};

export type StoredTokenMetadata = Omit<InstagramToken, "accessToken"> & { accessTokenHash: string };

export type AttemptRecord = {
  id: UUID;
  browserBindingHash: string;
  requestKey: UUID;
  payloadHash: string;
  draftPayloadEncrypted: SealedValue | null;
  policySnapshot: PolicySnapshot;
  parentAttemptId: UUID | null;
  oauthStateHash: string;
  encryptedOAuthState: SealedValue | null;
  stateInvalidatedAt: string | null;
  encryptedCode: SealedValue | null;
  codeHash: string | null;
  encryptedShortToken: SealedValue | null;
  encryptedLongToken: SealedValue | null;
  stateExpiresAt: string;
  draftExpiresAt: string;
  receiptExpiresAt: string | null;
  revision: number;
  status: AttemptStatus;
  stage: "account" | "storage" | "submission";
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  fencingToken: number;
  candidate:
    | { enteredUsername: string; connectedUsername: string; account: InstagramAccount; token: StoredTokenMetadata }
    | null;
  result: SubmittedResult | null;
  failureCode: PublicErrorCode | null;
  requestId: UUID | null;
  startedAt: string;
  updatedAt: string;
};

export type StartAttemptAtomicInput = {
  id: UUID;
  browserBindingHash: string;
  requestKey: UUID;
  payloadHash: string;
  draftPayloadEncrypted: SealedValue;
  policySnapshot: PolicySnapshot;
  replaceAttemptId?: UUID;
  parentAttemptId?: UUID | null;
  oauthStateHash: string;
  encryptedOAuthState: SealedValue;
  stateExpiresAt: string;
  draftExpiresAt: string;
  startedAt: string;
};

export type StartAttemptAtomicResult =
  | { kind: "created"; attempt: AttemptRecord }
  | { kind: "replayed"; attempt: AttemptRecord }
  | { kind: "idempotency_conflict" }
  | { kind: "active_attempt_exists" }
  | { kind: "active_processing" };

export type CompletionLease = {
  attempt: AttemptRecord;
  owner: string;
  fencingToken: number;
};

export type FinalizeInput = {
  attemptId: UUID;
  browserBindingHash: string;
  owner: string;
  fencingToken: number;
  expectedRevision: number;
  account: InstagramAccount;
  token: InstagramToken;
  payload: StartRequest;
  now: string;
};

export interface OnboardingRepository {
  getActiveAttemptForBrowser(browserBindingHash: string, now: string): Promise<AttemptRecord | null>;
  findAttemptById(attemptId: UUID): Promise<AttemptRecord | null>;
  findAttemptByRequestKey(browserBindingHash: string, requestKey: UUID): Promise<AttemptRecord | null>;
  findAttemptByStateHash(stateHash: string): Promise<AttemptRecord | null>;
  startAttemptAtomic(input: StartAttemptAtomicInput): Promise<StartAttemptAtomicResult>;
  recordCallbackCode(input: {
    attemptId: UUID;
    browserBindingHash: string;
    encryptedCode: SealedValue;
    codeHash: string;
    now: string;
  }): Promise<AttemptRecord>;
  claimCompletionLease(input: {
    attemptId: UUID;
    browserBindingHash: string;
    owner: string;
    leaseExpiresAt: string;
    now: string;
  }): Promise<CompletionLease>;
  markExchangeBegun(input: { attemptId: UUID; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord>;
  checkpointShortToken(input: {
    attemptId: UUID;
    owner: string;
    fencingToken: number;
    encryptedShortToken: SealedValue;
    now: string;
  }): Promise<AttemptRecord>;
  markLongExchangeBegun(input: { attemptId: UUID; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord>;
  checkpointLongToken(input: {
    attemptId: UUID;
    owner: string;
    fencingToken: number;
    encryptedLongToken: SealedValue;
    token: InstagramToken;
    now: string;
  }): Promise<AttemptRecord>;
  checkpointAccountCandidate(input: {
    attemptId: UUID;
    owner: string;
    fencingToken: number;
    account: InstagramAccount;
    token: InstagramToken;
    payload: StartRequest;
    requireConfirmation: boolean;
    now: string;
  }): Promise<AttemptRecord>;
  failAttempt(input: {
    attemptId: UUID;
    browserBindingHash: string;
    code: PublicErrorCode;
    status: "failed" | "cancelled" | "expired";
    now: string;
    owner?: string;
    fencingToken?: number;
  }): Promise<AttemptRecord>;
  finalizeAttempt(input: FinalizeInput): Promise<AttemptRecord>;
  completeGuardedLegacyCallback(input: {
    browserBindingHash: string;
    stateHash: string;
    account: InstagramAccount;
    token: InstagramToken;
    consentSnapshot: LegacyConsentSnapshot;
    now: string;
  }): Promise<{ redirectPath: string }>;
}

export function startResponseForAttempt(attempt: AttemptRecord, authorizeUrl: string): StartResponse {
  if (attempt.status === "pending" && attempt.encryptedOAuthState) {
    return { action: "authorize", attemptId: attempt.id, revision: attempt.revision, authorizeUrl, expiresAt: attempt.stateExpiresAt };
  }
  return {
    action: "resume",
    attemptId: attempt.id,
    revision: attempt.revision,
    nextPath: attempt.status === "completed" ? "/complete" : attempt.status === "failed" || attempt.status === "cancelled" || attempt.status === "expired" ? "/connection-error" : "/connecting",
  };
}
