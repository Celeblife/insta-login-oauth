import { getConfig } from "@/lib/config/env";
import type { BootstrapResponse, ConfirmAccountRequest, PublicErrorCode, RestartRequest, StartRequest, StartResponse, StatusResponse } from "@/lib/contracts/onboarding";
import { PublicApiError } from "@/lib/domain/errors";
import { canonicalPayloadHashPayload, isUuid, validateStart } from "@/lib/domain/validation";
import { clearLegacyBindingCookie, parseLegacyState, verifyLegacyBindingCookie } from "@/lib/legacy/instagram";
import { createLegacyTerminalReceiptCookie } from "@/lib/legacy/terminal-receipt";
import { createOnboardingRepository } from "@/lib/persistence";
import type { AttemptRecord, CompletionLease, OnboardingRepository, PolicySnapshot } from "@/lib/persistence/types";
import { AmbiguousProviderExchangeError, createInstagramProvider, type InstagramProvider, type InstagramShortToken, type InstagramToken } from "@/lib/providers/instagram";
import { logOnboardingEvent } from "@/lib/services/events";
import type { SetCookie } from "@/lib/services/http";
import { keyedPayloadHash, openJson, randomUrlToken, sealJson, sha256Hmac, uuid } from "@/lib/security/crypto";

const STATE_TTL_MS = 10 * 60 * 1000;
const DRAFT_TTL_MS = 30 * 60 * 1000;
const COMPLETION_LEASE_MS = 90 * 1000;

export class OnboardingService {
  private readonly config;
  private readonly repository;
  private readonly provider;

  constructor(deps: { config?: ReturnType<typeof getConfig>; repository?: OnboardingRepository; provider?: InstagramProvider } = {}) {
    this.config = deps.config ?? getConfig();
    this.repository = deps.repository ?? createOnboardingRepository(this.config);
    this.provider = deps.provider ?? createInstagramProvider(this.config);
  }

  async bootstrap(browserBindingHash: string, csrfToken: string): Promise<BootstrapResponse> {
    const now = nowIso();
    let active = await this.repository.getActiveAttemptForBrowser(browserBindingHash, now);
    const response: BootstrapResponse = { csrfToken, policyBundleId: this.config.policyBundleId };
    if (active?.status === "pending" && !isFutureIso(active.stateExpiresAt, Date.parse(now))) {
      active = await this.repository.failAttempt({ attemptId: active.id, browserBindingHash, code: "SESSION_EXPIRED", status: "expired", now });
    }
    if (active && !isExpiredReceipt(active)) {
      response.activeAttempt = toActiveAttempt(active);
      const draft = this.toDraft(active, now);
      if (draft) response.draft = draft;
    }
    logOnboardingEvent(active ? { name: "bootstrap", attemptId: active.id, revision: active.revision, status: active.status } : { name: "bootstrap" });
    return response;
  }

  async start(browserBindingHash: string, body: unknown): Promise<{ response: StartResponse; created: boolean }> {
    const request = this.parseStart(body);
    const now = Date.now();
    const acceptedAt = new Date(now).toISOString();
    const policySnapshot = this.policySnapshot(request, acceptedAt);
    const state = randomUrlToken();
    const attemptId = uuid();
    const startInput = {
      id: attemptId,
      browserBindingHash,
      requestKey: request.requestKey,
      payloadHash: keyedPayloadHash(this.config.payloadHashKey, { payload: canonicalPayloadHashPayload(request), policySnapshot: policyFingerprint(policySnapshot) }),
      draftPayloadEncrypted: sealJson(this.config.encryptionKeys, request, checkpointAad(attemptId, "draft_payload")),
      policySnapshot,
      parentAttemptId: null,
      oauthStateHash: sha256Hmac(this.config.browserSecretKey, state),
      encryptedOAuthState: sealJson(this.config.encryptionKeys, { state }, checkpointAad(attemptId, "oauth_state")),
      stateExpiresAt: new Date(now + STATE_TTL_MS).toISOString(),
      draftExpiresAt: new Date(now + DRAFT_TTL_MS).toISOString(),
      startedAt: new Date(now).toISOString(),
    };
    const result = await this.repository.startAttemptAtomic(request.replaceAttemptId ? { ...startInput, replaceAttemptId: request.replaceAttemptId } : startInput);
    if (result.kind === "idempotency_conflict") throw new PublicApiError("IDEMPOTENCY_CONFLICT");
    if (result.kind === "active_attempt_exists") throw new PublicApiError("ACTIVE_ATTEMPT_EXISTS");
    if (result.kind === "active_processing") throw new PublicApiError("ACTIVE_PROCESSING");
    logOnboardingEvent({ name: "start", attemptId: result.attempt.id, revision: result.attempt.revision, status: result.attempt.status });
    return { response: await this.responseForStoredAttempt(result.attempt), created: result.kind === "created" };
  }

  async callback(browserBindingHash: string, url: URL): Promise<{ redirectPath: string }> {
    const state = url.searchParams.get("state");
    if (!state) return this.safeCallbackReject(null, browserBindingHash, "INVALID_STATE");
    const stateHash = sha256Hmac(this.config.browserSecretKey, state);
    const attempt = await this.repository.findAttemptByStateHash(stateHash);
    if (!attempt || attempt.browserBindingHash !== browserBindingHash) return this.safeCallbackReject(null, browserBindingHash, "INVALID_STATE");
    const code = url.searchParams.get("code");
    if (attempt.status !== "pending" || attempt.stateInvalidatedAt !== null) {
      return this.consumedCallbackRedirect(attempt, code);
    }
    if (!isFutureIso(attempt.stateExpiresAt)) return this.safeCallbackReject(attempt, browserBindingHash, "SESSION_EXPIRED", "expired");
    if (url.searchParams.get("error")) return this.safeCallbackReject(attempt, browserBindingHash, "OAUTH_CANCELLED", "cancelled");
    if (!code || code.length > 2048) return this.safeCallbackReject(attempt, browserBindingHash, "INVALID_STATE");
    const updated = await this.repository.recordCallbackCode({
      attemptId: attempt.id,
      browserBindingHash,
      encryptedCode: sealJson(this.config.encryptionKeys, { code }, checkpointAad(attempt.id, "oauth_code")),
      codeHash: sha256Hmac(this.config.browserSecretKey, code),
      now: nowIso(),
    });
    logOnboardingEvent({ name: "callback_code_checkpointed", attemptId: updated.id, revision: updated.revision, status: updated.status });
    return { redirectPath: `/connecting?attemptId=${encodeURIComponent(updated.id)}` };
  }

  async legacyCallback(browserBindingHash: string, url: URL, cookieHeader: string | null): Promise<{ redirectPath: string; setCookie?: SetCookie }> {
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state) {
      logOnboardingEvent({ name: "legacy_callback_failed", code: "INVALID_STATE" });
      return { redirectPath: "/connection-error", setCookie: clearLegacyBindingCookie() };
    }
    const stateHash = sha256Hmac(this.config.browserSecretKey, state);
    const v2Attempt = await this.repository.findAttemptByStateHash(stateHash);
    if (v2Attempt) return this.callback(browserBindingHash, url);
    if (!code || code.length > 2048) {
      logOnboardingEvent({ name: "legacy_callback_failed", code: "INVALID_STATE" });
      return { redirectPath: "/connection-error", setCookie: clearLegacyBindingCookie() };
    }
    try {
      const bindingId = verifyLegacyBindingCookie(cookieHeader, process.env.SESSION_COOKIE_SECRET);
      const consentSnapshot = parseLegacyState(state, bindingId, this.config.instagram.clientSecret);
      const shortToken = await this.provider.exchangeCodeForShortToken({ code });
      const longToken = await this.provider.exchangeShortTokenForLongToken({ shortToken });
      const account = await this.provider.fetchAccount({ token: longToken });
      const result = await this.repository.completeGuardedLegacyCallback({
        browserBindingHash,
        stateHash,
        account,
        token: longToken,
        consentSnapshot,
        now: nowIso(),
      });
      if (isLegacyTerminalRedirect(result.redirectPath)) {
        return {
          redirectPath: "/legacy-complete",
          setCookie: [
            createLegacyTerminalReceiptCookie(this.config, browserBindingHash, { instagramUsername: account.username }),
            clearLegacyBindingCookie(),
          ],
        };
      }
      throw new PublicApiError("CONFIGURATION_ERROR");
    } catch (error) {
      logOnboardingEvent({ name: "legacy_callback_failed", code: legacyCallbackFailureCode(error) });
      return { redirectPath: "/connection-error", setCookie: clearLegacyBindingCookie() };
    }
  }

  async complete(browserBindingHash: string, body: unknown): Promise<{ status: number; body: StatusResponse }> {
    const attemptId = readAttemptId(body);
    const initial = await this.requireOwnedAttempt(attemptId, browserBindingHash);
    const replay = authorizedCompletedStatus(initial);
    if (replay) return { status: 200, body: replay };
    if (initial.status === "awaiting_account_confirmation") return { status: 200, body: toStatus(initial) };
    if (initial.status === "pending") return { status: 200, body: toStatus(initial) };
    if (initial.status === "failed" || initial.status === "cancelled" || initial.status === "expired") return { status: 200, body: toStatus(initial) };

    const owner = uuid();
    let lease: CompletionLease;
    try {
      lease = await this.repository.claimCompletionLease({
        attemptId,
        browserBindingHash,
        owner,
        leaseExpiresAt: new Date(Date.now() + COMPLETION_LEASE_MS).toISOString(),
        now: nowIso(),
      });
    } catch (error) {
      if (!(error instanceof PublicApiError) || error.code !== "ACTIVE_PROCESSING") throw error;
      const current = await this.requireOwnedAttempt(attemptId, browserBindingHash);
      const completed = authorizedCompletedStatus(current);
      if (current.status === "completed" && !completed) throw new PublicApiError("SESSION_EXPIRED", 410);
      const body = completed ?? toStatus(current);
      return { status: body.status === "processing" ? 202 : 200, body };
    }
    const leaseCompleted = authorizedCompletedStatus(lease.attempt);
    if (leaseCompleted) return { status: 200, body: leaseCompleted };
    if (lease.attempt.status === "completed" && !leaseCompleted) throw new PublicApiError("SESSION_EXPIRED", 410);
    logOnboardingEvent({ name: "complete_claimed", attemptId, revision: lease.attempt.revision, status: lease.attempt.status });
    const completed = await this.driveCompletion(browserBindingHash, lease);
    return { status: completed.status === "processing" ? 202 : 200, body: completed };
  }

  async status(browserBindingHash: string, attemptId: string | null): Promise<StatusResponse> {
    if (!attemptId) {
      const active = await this.repository.getActiveAttemptForBrowser(browserBindingHash, nowIso());
      return active && !isExpiredReceipt(active) ? toStatus(active) : { status: "idle", attemptId: null, revision: 0 };
    }
    if (!isUuid(attemptId)) throw new PublicApiError("VALIDATION_FAILED");
    const attempt = await this.requireOwnedAttempt(attemptId, browserBindingHash);
    const completed = authorizedCompletedStatus(attempt);
    if (attempt.status === "completed" && !completed) throw new PublicApiError("SESSION_EXPIRED", 410);
    return completed ?? toStatus(attempt);
  }

  async confirmAccount(browserBindingHash: string, body: unknown): Promise<StatusResponse> {
    const request = readConfirm(body);
    const attempt = await this.requireOwnedAttempt(request.attemptId, browserBindingHash);
    if (attempt.status !== "awaiting_account_confirmation" || attempt.revision !== request.expectedRevision || !attempt.candidate) {
      throw new PublicApiError("STALE_CONFIRMATION");
    }
    const owner = uuid();
    const lease = await this.repository.claimCompletionLease({
      attemptId: request.attemptId,
      browserBindingHash,
      owner,
      leaseExpiresAt: new Date(Date.now() + COMPLETION_LEASE_MS).toISOString(),
      now: nowIso(),
    });
    const finalized = await this.repository.finalizeAttempt({
      attemptId: request.attemptId,
      browserBindingHash,
      owner: lease.owner,
      fencingToken: lease.fencingToken,
      expectedRevision: request.expectedRevision,
      account: attempt.candidate.account,
      token: openJson<InstagramToken>(this.config.encryptionKeys, requireSealed(attempt.encryptedLongToken), checkpointAad(attempt.id, "long_token")),
      payload: this.draftPayload(attempt),
      now: nowIso(),
    });
    logOnboardingEvent({ name: "completed", attemptId: finalized.id, revision: finalized.revision });
    return toStatus(finalized);
  }

  async restart(browserBindingHash: string, body: unknown): Promise<{ response: StartResponse; created: boolean }> {
    const request = readRestart(body);
    const parent = await this.requireOwnedAttempt(request.attemptId, browserBindingHash);
    const existing = await this.repository.findAttemptByRequestKey(browserBindingHash, request.requestKey);
    if (existing?.parentAttemptId === parent.id) return { response: await this.responseForStoredAttempt(existing), created: false };
    if (existing) throw new PublicApiError("IDEMPOTENCY_CONFLICT");
    if (parent.status === "completed") throw new PublicApiError("ACTIVE_ATTEMPT_EXISTS");
    if (["exchanging_short", "exchanging_long", "fetching_account", "saving"].includes(parent.status)) throw new PublicApiError("ACTIVE_PROCESSING");
    if (!isFutureIso(parent.draftExpiresAt)) throw new PublicApiError("SESSION_EXPIRED", 410);
    const childRequest: StartRequest = { ...this.draftPayload(parent), requestKey: request.requestKey };
    const state = randomUrlToken();
    const now = Date.now();
    const attemptId = uuid();
    const result = await this.repository.startAttemptAtomic({
      id: attemptId,
      browserBindingHash,
      requestKey: request.requestKey,
      payloadHash: keyedPayloadHash(this.config.payloadHashKey, { payload: canonicalPayloadHashPayload(childRequest), policySnapshot: policyFingerprint(parent.policySnapshot) }),
      draftPayloadEncrypted: sealJson(this.config.encryptionKeys, childRequest, checkpointAad(attemptId, "draft_payload")),
      policySnapshot: parent.policySnapshot,
      parentAttemptId: parent.id,
      replaceAttemptId: parent.id,
      oauthStateHash: sha256Hmac(this.config.browserSecretKey, state),
      encryptedOAuthState: sealJson(this.config.encryptionKeys, { state }, checkpointAad(attemptId, "oauth_state")),
      stateExpiresAt: new Date(now + STATE_TTL_MS).toISOString(),
      draftExpiresAt: parent.draftExpiresAt,
      startedAt: new Date(now).toISOString(),
    });
    if (result.kind === "idempotency_conflict") throw new PublicApiError("IDEMPOTENCY_CONFLICT");
    if (result.kind === "active_attempt_exists") throw new PublicApiError("ACTIVE_ATTEMPT_EXISTS");
    if (result.kind === "active_processing") throw new PublicApiError("ACTIVE_PROCESSING");
    return { response: await this.responseForStoredAttempt(result.attempt), created: result.kind === "created" };
  }

  private async driveCompletion(browserBindingHash: string, lease: CompletionLease): Promise<StatusResponse> {
    let attempt = lease.attempt;
    if (attempt.status === "exchanging_short" || attempt.status === "exchanging_long") {
      attempt = await this.repository.failAttempt({ attemptId: attempt.id, browserBindingHash, code: "PROVIDER_UNAVAILABLE", status: "failed", now: nowIso(), owner: lease.owner, fencingToken: lease.fencingToken });
      return toStatus(attempt);
    }
    try {
      const payload = this.draftPayload(attempt);
      if (attempt.status === "callback_received") {
        attempt = await this.repository.markExchangeBegun({ attemptId: attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, now: nowIso() });
        logOnboardingEvent({ name: "short_exchange_started", attemptId: attempt.id, revision: attempt.revision });
        const code = openJson<{ code: string }>(this.config.encryptionKeys, requireSealed(attempt.encryptedCode), checkpointAad(attempt.id, "oauth_code")).code;
        const shortToken = await this.provider.exchangeCodeForShortToken({ code });
        attempt = await this.repository.checkpointShortToken({ attemptId: attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, encryptedShortToken: sealJson(this.config.encryptionKeys, shortToken, checkpointAad(attempt.id, "short_token")), now: nowIso() });
        logOnboardingEvent({ name: "short_token_checkpointed", attemptId: attempt.id, revision: attempt.revision });
      }
      if (attempt.status === "short_token_checkpointed") {
        attempt = await this.repository.markLongExchangeBegun({ attemptId: attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, now: nowIso() });
        logOnboardingEvent({ name: "long_exchange_started", attemptId: attempt.id, revision: attempt.revision });
        const shortToken = openJson<InstagramShortToken>(this.config.encryptionKeys, requireSealed(attempt.encryptedShortToken), checkpointAad(attempt.id, "short_token"));
        const longToken = await this.provider.exchangeShortTokenForLongToken({ shortToken });
        attempt = await this.repository.checkpointLongToken({ attemptId: attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, encryptedLongToken: sealJson(this.config.encryptionKeys, longToken, checkpointAad(attempt.id, "long_token")), token: longToken, now: nowIso() });
        logOnboardingEvent({ name: "long_token_checkpointed", attemptId: attempt.id, revision: attempt.revision });
      }
      if (attempt.status === "long_token_checkpointed") {
        const longToken = openJson<InstagramToken>(this.config.encryptionKeys, requireSealed(attempt.encryptedLongToken), checkpointAad(attempt.id, "long_token"));
        const account = await this.provider.fetchAccount({ token: longToken });
        attempt = await this.repository.checkpointAccountCandidate({ attemptId: attempt.id, owner: lease.owner, fencingToken: lease.fencingToken, account, token: longToken, payload, requireConfirmation: account.username !== payload.instagramUsername, now: nowIso() });
        logOnboardingEvent({ name: "account_checkpointed", attemptId: attempt.id, revision: attempt.revision, status: attempt.status });
      }
      if (attempt.status === "awaiting_account_confirmation") return toStatus(attempt);
      if (attempt.status === "saving" && attempt.candidate) {
        const longToken = openJson<InstagramToken>(this.config.encryptionKeys, requireSealed(attempt.encryptedLongToken), checkpointAad(attempt.id, "long_token"));
        const finalized = await this.repository.finalizeAttempt({ attemptId: attempt.id, browserBindingHash, owner: lease.owner, fencingToken: lease.fencingToken, expectedRevision: attempt.revision, account: attempt.candidate.account, token: longToken, payload, now: nowIso() });
        logOnboardingEvent({ name: "completed", attemptId: finalized.id, revision: finalized.revision });
        return toStatus(finalized);
      }
      return toStatus(attempt);
    } catch (error) {
      const code: PublicErrorCode = error instanceof PublicApiError ? error.code : "PROVIDER_UNAVAILABLE";
      const failed = await this.repository.failAttempt({ attemptId: attempt.id, browserBindingHash, code, status: "failed", now: nowIso(), owner: lease.owner, fencingToken: lease.fencingToken });
      logOnboardingEvent({ name: "failed", attemptId: failed.id, revision: failed.revision, code });
      if (error instanceof AmbiguousProviderExchangeError) return toStatus(failed);
      return toStatus(failed);
    }
  }

  private async responseForStoredAttempt(attempt: AttemptRecord): Promise<StartResponse> {
    if (attempt.status === "pending" && attempt.encryptedOAuthState && isFutureIso(attempt.stateExpiresAt)) {
      const { state } = openJson<{ state: string }>(this.config.encryptionKeys, attempt.encryptedOAuthState, checkpointAad(attempt.id, "oauth_state"));
      return { action: "authorize", attemptId: attempt.id, revision: attempt.revision, authorizeUrl: this.provider.buildAuthorizeUrl({ state }), expiresAt: attempt.stateExpiresAt };
    }
    return { action: "resume", attemptId: attempt.id, revision: attempt.revision, nextPath: attempt.status === "completed" ? "/complete" : attempt.status === "failed" || attempt.status === "cancelled" || attempt.status === "expired" ? "/connection-error" : "/connecting" };
  }

  private parseStart(body: unknown): StartRequest {
    const parsed = validateStart(body, this.config.policyBundleId);
    if (!parsed.ok) throw new PublicApiError(parsed.policyChanged ? "POLICY_CHANGED" : "VALIDATION_FAILED", undefined, { fields: parsed.fields });
    return parsed.value;
  }

  private draftPayload(attempt: AttemptRecord): StartRequest {
    try {
      return openJson<StartRequest>(this.config.encryptionKeys, requireSealed(attempt.draftPayloadEncrypted), checkpointAad(attempt.id, "draft_payload"));
    } catch {
      throw new PublicApiError("REAUTH_REQUIRED", 410);
    }
  }

  private toDraft(attempt: AttemptRecord, now: string): NonNullable<BootstrapResponse["draft"]> | undefined {
    if (!canExposeDraft(attempt, Date.parse(now))) return undefined;
    const payload = this.draftPayload(attempt);
    return { attemptId: attempt.id, fullName: payload.fullName, email: payload.email, phone: payload.phone, instagramUsername: payload.instagramUsername };
  }

  private consumedCallbackRedirect(attempt: AttemptRecord, code: string | null): { redirectPath: string } {
    if (attempt.status === "completed") {
      if (code && attempt.codeHash === sha256Hmac(this.config.browserSecretKey, code) && authorizedCompletedStatus(attempt)) {
        return { redirectPath: `/complete?attemptId=${encodeURIComponent(attempt.id)}` };
      }
      return { redirectPath: "/connection-error" };
    }
    if (attempt.status === "cancelled" && attempt.failureCode === "OAUTH_CANCELLED") {
      return { redirectPath: `/connection-error?attemptId=${encodeURIComponent(attempt.id)}` };
    }
    if (isReplayableCallbackStatus(attempt.status) && code && attempt.codeHash === sha256Hmac(this.config.browserSecretKey, code)) {
      return { redirectPath: `/connecting?attemptId=${encodeURIComponent(attempt.id)}` };
    }
    return { redirectPath: "/connection-error" };
  }

  private policySnapshot(request: StartRequest, acceptedAt: string): PolicySnapshot {
    return {
      bundleId: this.config.policyBundleId,
      bundleVersion: this.config.policyBundleVersion,
      bundleHash: this.config.policyBundleHash,
      documents: this.config.policyDocuments,
      consents: request.consents,
      acceptedAt,
    };
  }

  private async safeCallbackReject(attempt: AttemptRecord | null, browserBindingHash: string, code: PublicErrorCode, status: "failed" | "cancelled" | "expired" = "failed"): Promise<{ redirectPath: string }> {
    logOnboardingEvent(attempt ? { name: "callback_rejected", attemptId: attempt.id, code } : { name: "callback_rejected", code });
    if (attempt) {
      await this.repository.failAttempt({ attemptId: attempt.id, browserBindingHash, code, status, now: nowIso() });
      return { redirectPath: `/connection-error?attemptId=${encodeURIComponent(attempt.id)}` };
    }
    return { redirectPath: "/connection-error" };
  }

  private async requireOwnedAttempt(attemptId: string, browserBindingHash: string): Promise<AttemptRecord> {
    const attempt = await this.repository.findAttemptById(attemptId);
    if (!attempt || attempt.browserBindingHash !== browserBindingHash) throw new PublicApiError("SESSION_EXPIRED", 401);
    return attempt;
  }
}

export function getOnboardingService(): OnboardingService {
  return new OnboardingService();
}

function authorizedCompletedStatus(attempt: AttemptRecord): StatusResponse | null {
  if (attempt.status !== "completed" || !attempt.result) return null;
  if (isExpiredReceipt(attempt)) return null;
  return { status: "completed", attemptId: attempt.id, revision: attempt.revision, result: attempt.result };
}

function isExpiredReceipt(attempt: AttemptRecord): boolean {
  return attempt.status === "completed" && !isFutureIso(attempt.receiptExpiresAt);
}

function toActiveAttempt(attempt: AttemptRecord): NonNullable<BootstrapResponse["activeAttempt"]> {
  return { attemptId: attempt.id, revision: attempt.revision, nextPath: canExposeDraft(attempt) ? "/apply" : attempt.status === "completed" ? "/complete" : attempt.status === "failed" || attempt.status === "cancelled" || attempt.status === "expired" ? "/connection-error" : "/connecting" };
}

function toStatus(attempt: AttemptRecord): StatusResponse {
  const completed = authorizedCompletedStatus(attempt);
  if (completed) return completed;
  if (attempt.status === "awaiting_account_confirmation" && attempt.candidate) {
    return { status: "account_confirmation_required", attemptId: attempt.id, revision: attempt.revision, enteredUsername: attempt.candidate.enteredUsername, connectedUsername: attempt.candidate.connectedUsername };
  }
  if (attempt.status === "pending") return { status: "awaiting_oauth", attemptId: attempt.id, revision: attempt.revision, expiresAt: attempt.stateExpiresAt };
  if (attempt.status === "failed" || attempt.status === "cancelled" || attempt.status === "expired") {
    const draftAvailable = canExposeDraft(attempt);
    return { status: "failed", attemptId: attempt.id, revision: attempt.revision, code: attempt.failureCode ?? "REAUTH_REQUIRED", retryAction: draftAvailable ? "return_form" : "restart_oauth", draftAvailable };
  }
  return { status: "processing", attemptId: attempt.id, revision: attempt.revision, stage: attempt.stage, retryAfterMs: 2000, submissionIntent: "unknown" };
}

function canExposeDraft(attempt: AttemptRecord, nowMs = Date.now()): boolean {
  return attempt.status === "cancelled" && attempt.failureCode === "OAUTH_CANCELLED" && attempt.draftPayloadEncrypted !== null && isFutureIso(attempt.draftExpiresAt, nowMs);
}

function isReplayableCallbackStatus(status: AttemptRecord["status"]): boolean {
  return status === "callback_received" || status === "exchanging_short" || status === "short_token_checkpointed" || status === "exchanging_long" || status === "long_token_checkpointed" || status === "fetching_account" || status === "awaiting_account_confirmation" || status === "saving";
}

function isLegacyTerminalRedirect(path: string): boolean {
  return path === "/Dashboard" || path === "/complete";
}

function legacyCallbackFailureCode(error: unknown): PublicErrorCode {
  return error instanceof PublicApiError ? error.code : "PROVIDER_UNAVAILABLE";
}

function requireSealed<T>(value: T | null): T {
  if (!value) throw new PublicApiError("REAUTH_REQUIRED", 410);
  return value;
}

function readAttemptId(body: unknown): string {
  if (!isObject(body) || !isUuid(body.attemptId)) throw new PublicApiError("VALIDATION_FAILED");
  return body.attemptId.toLowerCase();
}

function readConfirm(body: unknown): ConfirmAccountRequest {
  if (!isObject(body) || !isUuid(body.attemptId) || typeof body.expectedRevision !== "number" || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || body.accept !== true) throw new PublicApiError("VALIDATION_FAILED");
  return { attemptId: body.attemptId.toLowerCase(), expectedRevision: body.expectedRevision, accept: true };
}

function readRestart(body: unknown): RestartRequest {
  if (!isObject(body) || !isUuid(body.attemptId) || !isUuid(body.requestKey)) throw new PublicApiError("VALIDATION_FAILED");
  return { attemptId: body.attemptId.toLowerCase(), requestKey: body.requestKey.toLowerCase() };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function checkpointAad(attemptId: string, purpose: "oauth_state" | "oauth_code" | "short_token" | "long_token" | "draft_payload"): string {
  return `onboarding-v2:${attemptId}:${purpose}`;
}

function isFutureIso(value: string | null, nowMs = Date.now()): value is string {
  if (!value || !/(Z|[+-]\d\d:\d\d)$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > nowMs;
}

function policyFingerprint(snapshot: PolicySnapshot): Omit<PolicySnapshot, "acceptedAt"> {
  return {
    bundleId: snapshot.bundleId,
    bundleVersion: snapshot.bundleVersion,
    bundleHash: snapshot.bundleHash,
    documents: snapshot.documents,
    consents: snapshot.consents,
  };
}
