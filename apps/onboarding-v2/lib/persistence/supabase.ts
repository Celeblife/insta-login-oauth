import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { AppConfig } from "@/lib/config/env";
import type { PublicErrorCode } from "@/lib/contracts/onboarding";
import { PublicApiError } from "@/lib/domain/errors";
import { RPC, type StartAtomicRpcArgs } from "@/lib/persistence/rpc-contract";
import type {
  AttemptRecord,
  CompletionLease,
  FinalizeInput,
  OnboardingRepository,
  StartAttemptAtomicInput,
  StartAttemptAtomicResult,
} from "@/lib/persistence/types";

export type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export class SupabaseOnboardingRepository implements OnboardingRepository {
  private readonly client: RpcClient;

  constructor(config: AppConfig, client?: RpcClient) {
    if (!config.supabase) throw new PublicApiError("CONFIGURATION_ERROR");
    this.client = client ?? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as RpcClient;
  }

  async getActiveAttemptForBrowser(browserBindingHash: string, now: string): Promise<AttemptRecord | null> {
    return this.rpcAttemptMaybe(RPC.getActive, { p_browser_binding_hash: browserBindingHash, p_now: now });
  }

  async findAttemptById(attemptId: string): Promise<AttemptRecord | null> {
    return this.rpcAttemptMaybe(RPC.getById, { p_attempt_id: attemptId });
  }

  async findAttemptByRequestKey(browserBindingHash: string, requestKey: string): Promise<AttemptRecord | null> {
    return this.rpcAttemptMaybe(RPC.getByRequestKey, { p_browser_binding_hash: browserBindingHash, p_request_key: requestKey });
  }

  async findAttemptByStateHash(stateHash: string): Promise<AttemptRecord | null> {
    return this.rpcAttemptMaybe(RPC.getByStateHash, { p_oauth_state_hash: stateHash });
  }

  async startAttemptAtomic(input: StartAttemptAtomicInput): Promise<StartAttemptAtomicResult> {
    const args: StartAtomicRpcArgs = {
      p_attempt_id: input.id,
      p_browser_binding_hash: input.browserBindingHash,
      p_request_key: input.requestKey,
      p_payload_hash: input.payloadHash,
      p_draft_payload_encrypted: input.draftPayloadEncrypted,
      p_policy_snapshot: input.policySnapshot,
      p_replace_attempt_id: input.replaceAttemptId ?? null,
      p_parent_attempt_id: input.parentAttemptId ?? null,
      p_oauth_state_hash: input.oauthStateHash,
      p_encrypted_oauth_state: input.encryptedOAuthState,
      p_state_expires_at: input.stateExpiresAt,
      p_draft_expires_at: input.draftExpiresAt,
      p_started_at: input.startedAt,
    };
    const row = await this.rpcRecord(RPC.startAtomic, args);
    const kind = stringField(row, "kind");
    if (kind === "idempotency_conflict" || kind === "active_attempt_exists" || kind === "active_processing") return { kind };
    if (kind === "created" || kind === "replayed") return { kind, attempt: attemptFromRecord(recordField(row, "attempt")) };
    throw new PublicApiError("STORAGE_UNAVAILABLE");
  }

  async recordCallbackCode(input: {
    attemptId: string;
    browserBindingHash: string;
    encryptedCode: AttemptRecord["encryptedCode"];
    codeHash: string;
    now: string;
  }): Promise<AttemptRecord> {
    return this.rpcAttempt(RPC.recordCallbackCode, {
      p_attempt_id: input.attemptId,
      p_browser_binding_hash: input.browserBindingHash,
      p_encrypted_code: input.encryptedCode,
      p_code_hash: input.codeHash,
      p_now: input.now,
    });
  }

  async claimCompletionLease(input: {
    attemptId: string;
    browserBindingHash: string;
    owner: string;
    leaseExpiresAt: string;
    now: string;
  }): Promise<CompletionLease> {
    const row = await this.rpcRecord(RPC.claimCompletionLease, {
      p_attempt_id: input.attemptId,
      p_browser_binding_hash: input.browserBindingHash,
      p_owner: input.owner,
      p_lease_expires_at: input.leaseExpiresAt,
      p_now: input.now,
    });
    return { attempt: attemptFromRecord(recordField(row, "attempt")), owner: stringField(row, "owner"), fencingToken: numberField(row, "fencingToken") };
  }

  async markExchangeBegun(input: { attemptId: string; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord> {
    return this.fencedAttempt(RPC.markExchangeBegun, input);
  }

  async checkpointShortToken(input: {
    attemptId: string;
    owner: string;
    fencingToken: number;
    encryptedShortToken: AttemptRecord["encryptedShortToken"];
    now: string;
  }): Promise<AttemptRecord> {
    return this.rpcAttempt(RPC.checkpointShortToken, {
      p_attempt_id: input.attemptId,
      p_owner: input.owner,
      p_fencing_token: input.fencingToken,
      p_encrypted_short_token: input.encryptedShortToken,
      p_now: input.now,
    });
  }

  async markLongExchangeBegun(input: { attemptId: string; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord> {
    return this.fencedAttempt(RPC.markLongExchangeBegun, input);
  }

  async checkpointLongToken(input: {
    attemptId: string;
    owner: string;
    fencingToken: number;
    encryptedLongToken: AttemptRecord["encryptedLongToken"];
    token: Parameters<OnboardingRepository["checkpointLongToken"]>[0]["token"];
    now: string;
  }): Promise<AttemptRecord> {
    return this.rpcAttempt(RPC.checkpointLongToken, {
      p_attempt_id: input.attemptId,
      p_owner: input.owner,
      p_fencing_token: input.fencingToken,
      p_encrypted_long_token: input.encryptedLongToken,
      p_token_metadata: tokenMetadata(input.token),
      p_now: input.now,
    });
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
    return this.rpcAttempt(RPC.checkpointAccountCandidate, {
      p_attempt_id: input.attemptId,
      p_owner: input.owner,
      p_fencing_token: input.fencingToken,
      p_account: input.account,
      p_token_metadata: tokenMetadata(input.token),
      p_payload: input.payload,
      p_require_confirmation: input.requireConfirmation,
      p_now: input.now,
    });
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
    return this.rpcAttempt(RPC.failAttempt, {
      p_attempt_id: input.attemptId,
      p_browser_binding_hash: input.browserBindingHash,
      p_code: input.code,
      p_status: input.status,
      p_now: input.now,
      p_owner: input.owner ?? null,
      p_fencing_token: input.fencingToken ?? null,
    });
  }

  async finalizeAttempt(input: FinalizeInput): Promise<AttemptRecord> {
    return this.rpcAttempt(RPC.finalize, {
      p_attempt_id: input.attemptId,
      p_browser_binding_hash: input.browserBindingHash,
      p_owner: input.owner,
      p_fencing_token: input.fencingToken,
      p_expected_revision: input.expectedRevision,
      p_account: input.account,
      p_access_token: input.token.accessToken,
      p_token_metadata: tokenMetadata(input.token),
      p_payload: input.payload,
      p_now: input.now,
    });
  }

  async completeGuardedLegacyCallback(input: {
    browserBindingHash: string;
    stateHash: string;
    account: NonNullable<AttemptRecord["candidate"]>["account"];
    token: Parameters<OnboardingRepository["completeGuardedLegacyCallback"]>[0]["token"];
    consentSnapshot: Parameters<OnboardingRepository["completeGuardedLegacyCallback"]>[0]["consentSnapshot"];
    now: string;
  }): Promise<{ redirectPath: string }> {
    const row = await this.rpcRecord(RPC.guardedLegacyCallback, {
      p_browser_binding_hash: input.browserBindingHash,
      p_legacy_state_hash: input.stateHash,
      p_instagram_user_id: input.account.providerAccountId,
      p_instagram_username: input.account.username,
      p_access_token: input.token.accessToken,
      p_expires_at: input.token.expiresAt,
      p_granted_scopes: input.token.grantedScopes,
      p_legacy_consent_snapshot: {
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
      },
      p_now: input.now,
    });
    return { redirectPath: stringField(row, "redirectPath") };
  }

  private async fencedAttempt(name: string, input: { attemptId: string; owner: string; fencingToken: number; now: string }): Promise<AttemptRecord> {
    return this.rpcAttempt(name, { p_attempt_id: input.attemptId, p_owner: input.owner, p_fencing_token: input.fencingToken, p_now: input.now });
  }

  private async rpcAttemptMaybe(name: string, args: Record<string, unknown>): Promise<AttemptRecord | null> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw publicErrorFromRpc(error);
    return data === null ? null : attemptFromRecord(data);
  }

  private async rpcAttempt(name: string, args: Record<string, unknown>): Promise<AttemptRecord> {
    return attemptFromRecord(await this.rpcRecord(name, args));
  }

  private async rpcRecord(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw publicErrorFromRpc(error);
    if (!isRecord(data)) throw new PublicApiError("STORAGE_UNAVAILABLE");
    return data;
  }
}

const SAFE_RPC_ERROR_CODES: Record<string, PublicErrorCode> = {
  ACTIVE_PROCESSING: "ACTIVE_PROCESSING",
  ATTEMPT_NOT_FOUND: "SESSION_EXPIRED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
  INVALID_ONBOARDING_INPUT: "VALIDATION_FAILED",
  INVALID_START_INPUT: "VALIDATION_FAILED",
  INVALID_STATE: "INVALID_STATE",
  RATE_LIMITED: "RATE_LIMITED",
  RECEIPT_EXPIRED: "SESSION_EXPIRED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  STALE_ATTEMPT: "STALE_ATTEMPT",
};

export function publicErrorFromRpc(error: unknown): PublicApiError {
  const record = isRecord(error) ? error : {};
  const message = typeof record.message === "string" ? record.message : "";
  const code = typeof record.code === "string" ? record.code : "";
  for (const [safeMessage, publicCode] of Object.entries(SAFE_RPC_ERROR_CODES)) {
    if (message.includes(safeMessage) || code === safeMessage) return publicErrorForCode(publicCode);
  }
  if (code === "55P03") return new PublicApiError("ACTIVE_PROCESSING");
  if (code === "40001") return new PublicApiError("STALE_ATTEMPT");
  if (code === "42501") return new PublicApiError("SESSION_EXPIRED");
  if (code === "22023") return new PublicApiError("VALIDATION_FAILED");
  return new PublicApiError("STORAGE_UNAVAILABLE");
}

function publicErrorForCode(code: PublicErrorCode): PublicApiError {
  if (code === "RATE_LIMITED") return new PublicApiError("RATE_LIMITED", 429, { retryAfterMs: 60_000 });
  return new PublicApiError(code);
}

export function attemptFromRecord(value: unknown): AttemptRecord {
  const parsed = attemptSchema.safeParse(value);
  if (!parsed.success) throw new PublicApiError("STORAGE_UNAVAILABLE");
  return parsed.data;
}

function recordField(row: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = row[key];
  if (!isRecord(value)) throw new PublicApiError("STORAGE_UNAVAILABLE");
  return value;
}

function stringField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new PublicApiError("STORAGE_UNAVAILABLE");
  return value;
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new PublicApiError("STORAGE_UNAVAILABLE");
  return value;
}

function tokenMetadata(token: { accessToken: string; providerUserId: string; expiresAt: string; grantedScopes: readonly string[] }) {
  return {
    providerUserId: token.providerUserId,
    expiresAt: token.expiresAt,
    grantedScopes: token.grantedScopes,
    accessTokenHash: createHash("sha256").update(token.accessToken, "utf8").digest("hex"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const uuidish = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const iso = z.string().refine((value) => Number.isFinite(Date.parse(value)) && /(Z|[+-]\d\d:\d\d)$/.test(value));
const hex64 = z.string().regex(/^[0-9a-f]{64}$/i);
const sealedSchema = z.object({ keyVersion: z.string().min(1), iv: z.string().min(1), tag: z.string().min(1), ciphertext: z.string().min(1) }).strict();
const publicErrorCodeSchema = z.enum([
  "VALIDATION_FAILED", "CONSENT_REQUIRED", "POLICY_CHANGED", "CSRF_REJECTED", "RATE_LIMITED", "CONFIGURATION_ERROR", "OAUTH_CANCELLED", "INVALID_STATE", "SESSION_EXPIRED", "REAUTH_REQUIRED", "PROVIDER_UNAVAILABLE", "STORAGE_UNAVAILABLE", "IDEMPOTENCY_CONFLICT", "ACTIVE_ATTEMPT_EXISTS", "ACTIVE_PROCESSING", "STALE_ATTEMPT", "STALE_CONFIRMATION", "PERMISSIONS_REQUIRED", "UNSUPPORTED_ACCOUNT",
]);
const tokenMetadataSchema = z.object({ providerUserId: z.string().min(1), expiresAt: iso, grantedScopes: z.array(z.string().min(1)).readonly(), accessTokenHash: hex64 }).strict();
const accountSchema = z.object({ providerAccountId: z.string().min(1), username: z.string().regex(/^[a-z0-9_][a-z0-9_.]{0,29}$/i), accountType: z.enum(["business", "creator", "personal", "unknown"]) }).strict();
const policySnapshotSchema = z.object({
  bundleId: z.string().min(1),
  bundleVersion: z.string().min(1),
  bundleHash: hex64,
  documents: z.object({ termsVersion: z.string().min(1), privacyVersion: z.string().min(1), instagramTermsVersion: z.string().min(1), collectionConsentVersion: z.string().min(1) }).strict(),
  consents: z.object({ age: z.literal(true), terms: z.literal(true), privacy: z.literal(true), instagramData: z.literal(true) }).strict(),
  acceptedAt: iso,
}).strict();
const resultBase = z.object({ kind: z.literal("v2"), requestId: uuidish, receivedAt: iso, fullName: z.string(), email: z.string().email(), phone: z.string(), instagramUsername: z.string() });
const resultSchema = z.union([
  resultBase.extend({ connectionKind: z.literal("new"), analysisRequested: z.literal(true), reviewStatus: z.enum(["pending_review", "in_review", "contacted", "cancelled"]) }).strict(),
  resultBase.extend({ connectionKind: z.literal("reconnection"), analysisRequested: z.literal(false), reviewStatus: z.literal("not_requested"), initialRequestId: uuidish }).strict(),
]);
const candidateSchema = z.object({ enteredUsername: z.string(), connectedUsername: z.string(), account: accountSchema, token: tokenMetadataSchema }).strict();
const attemptSchema = z.object({
  id: uuidish,
  browserBindingHash: hex64,
  requestKey: uuidish,
  payloadHash: hex64,
  draftPayloadEncrypted: sealedSchema.nullable(),
  policySnapshot: policySnapshotSchema,
  parentAttemptId: uuidish.nullable(),
  oauthStateHash: hex64,
  encryptedOAuthState: sealedSchema.nullable(),
  stateInvalidatedAt: iso.nullable(),
  encryptedCode: sealedSchema.nullable(),
  codeHash: hex64.nullable(),
  encryptedShortToken: sealedSchema.nullable(),
  encryptedLongToken: sealedSchema.nullable(),
  stateExpiresAt: iso,
  draftExpiresAt: iso,
  receiptExpiresAt: iso.nullable(),
  revision: z.number().int().nonnegative(),
  status: z.enum(["pending", "callback_received", "exchanging_short", "short_token_checkpointed", "exchanging_long", "long_token_checkpointed", "fetching_account", "awaiting_account_confirmation", "saving", "completed", "failed", "cancelled", "expired"]),
  stage: z.enum(["account", "storage", "submission"]),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: iso.nullable(),
  fencingToken: z.number().int().nonnegative(),
  candidate: candidateSchema.nullable(),
  result: resultSchema.nullable(),
  failureCode: publicErrorCodeSchema.nullable(),
  requestId: uuidish.nullable(),
  startedAt: iso,
  updatedAt: iso,
}).strict();
