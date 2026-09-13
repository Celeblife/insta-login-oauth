import { createHash, createHmac, randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as legacyCallbackGet } from "@/app/auth/callback/route";
import { GET as callbackGet } from "@/app/auth/instagram/callback/route";
import { POST as legacyTerminalPost } from "@/app/api/onboarding/legacy-terminal/route";
import { GET as bootstrapGet } from "@/app/api/onboarding/bootstrap/route";
import { POST as completePost } from "@/app/api/onboarding/complete/route";
import { POST as confirmPost } from "@/app/api/onboarding/confirm-account/route";
import { POST as restartPost } from "@/app/api/onboarding/restart/route";
import { POST as startPost } from "@/app/api/onboarding/start/route";
import { GET as statusGet } from "@/app/api/onboarding/status/route";
import type { BootstrapResponse, StartResponse, StatusResponse } from "@/lib/contracts/onboarding";

const ORIGIN = "http://localhost:3000";

describe("onboarding v2 route contract", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  it("SE01 bootstrap binds cookie+CSRF and rejects browser mutations without CSRF", async () => {
    const client = await bootstrapClient();
    expect(client.response.headers.get("cache-control")).toBe("no-store");
    expect(client.body.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(client.cookie).toContain("cl-onboarding=");

    const rejected = await startPost(jsonRequest("/api/onboarding/start", validStart(), { cookie: client.cookie }));

    expect(rejected.status).toBe(403);
    await expect(rejected.json()).resolves.toMatchObject({ error: { code: "CSRF_REJECTED" } });
  });

  it("FINAL01 FINAL02 start atomically replays same requestKey and rejects payload conflicts", async () => {
    const client = await bootstrapClient();
    const payload = validStart();
    const first = await start(client, payload);
    expect(first.status).toBe(201);
    expect(first.body.action).toBe("authorize");

    const replay = await start(client, payload);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    const conflict = await startPost(authedJsonRequest(client, "/api/onboarding/start", { ...payload, email: "changed@example.com" }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("AU07 callback checkpoints raw code, invalidates state, clean-303s to connecting, then complete finalizes", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    const client = await bootstrapClient();
    const started = await start(client, validStart({ instagramUsername: "matched_user" }));
    const state = stateFrom(started.body);

    const callback = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_matched_user&state=${state}`, { headers: { cookie: client.cookie } }));
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe(`/connecting?attemptId=${attemptIdFrom(started.body)}`);
    expect(callback.headers.get("location")).not.toContain("code=");
    expect(callback.headers.get("location")).not.toContain("state=");

    const secondCallback = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_matched_user&state=${state}`, { headers: { cookie: client.cookie } }));
    expect(secondCallback.status).toBe(303);
    expect(secondCallback.headers.get("location")).toBe(`/connecting?attemptId=${attemptIdFrom(started.body)}`);

    const differentCode = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_other&state=${state}`, { headers: { cookie: client.cookie } }));
    expect(differentCode.status).toBe(303);
    expect(differentCode.headers.get("location")).toBe("/connection-error");

    const completed = await complete(client, attemptIdFrom(started.body));
    expect(completed.statusCode).toBe(200);
    expect(completed.body).toMatchObject({ status: "completed", result: { instagramUsername: "matched_user", connectionKind: "new" } });
    expect(completed.setCookie).toContain(client.cookie);
    expect(completed.setCookie).toContain("Max-Age=86400");

    vi.setSystemTime(new Date("2026-09-11T00:11:00.000Z"));
    const completedReplay = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_matched_user&state=${state}`, { headers: { cookie: client.cookie } }));
    expect(completedReplay.status).toBe(303);
    expect(completedReplay.headers.get("location")).toBe(`/complete?attemptId=${attemptIdFrom(started.body)}`);
  });

  it("AU07 /auth/callback dispatches v2 success and cancellation before legacy code validation", async () => {
    const successClient = await bootstrapClient();
    const successStart = await start(successClient, validStart({ instagramUsername: "legacy_bridge" }));
    const success = await legacyCallbackGet(
      new Request(`${ORIGIN}/auth/callback?code=user_legacy_bridge&state=${stateFrom(successStart.body)}`, {
        headers: { cookie: successClient.cookie },
      }),
    );
    expect(success.status).toBe(303);
    expect(success.headers.get("location")).toBe(`/connecting?attemptId=${attemptIdFrom(successStart.body)}`);
    expect((await complete(successClient, attemptIdFrom(successStart.body))).body).toMatchObject({
      status: "completed",
      result: { instagramUsername: "legacy_bridge" },
    });

    const cancelClient = await bootstrapClient();
    const cancelStart = await start(cancelClient, validStart({ instagramUsername: "legacy_cancel" }));
    const cancel = await legacyCallbackGet(
      new Request(`${ORIGIN}/auth/callback?error=access_denied&state=${stateFrom(cancelStart.body)}`, {
        headers: { cookie: cancelClient.cookie },
      }),
    );
    expect(cancel.status).toBe(303);
    expect(cancel.headers.get("location")).toBe(`/connection-error?attemptId=${attemptIdFrom(cancelStart.body)}`);
    expect(await getStatus(cancelClient, attemptIdFrom(cancelStart.body))).toMatchObject({
      status: "failed",
      code: "OAUTH_CANCELLED",
      draftAvailable: true,
    });
  });

  it("AU07 terminal failure and repeated cancel callbacks reject without mutating or extending draft TTL", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    const failedClient = await bootstrapClient();
    const failedStart = await start(failedClient, validStart({ instagramUsername: "missing_scope" }));
    const failedState = stateFrom(failedStart.body);
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=missing_scope&state=${failedState}`, { headers: { cookie: failedClient.cookie } }));
    const failed = await complete(failedClient, attemptIdFrom(failedStart.body));
    expect(failed.body).toMatchObject({ status: "failed", code: "PERMISSIONS_REQUIRED", draftAvailable: false });
    const failedRevision = failed.body.revision;

    const terminalReplay = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=missing_scope&state=${failedState}`, { headers: { cookie: failedClient.cookie } }));
    expect(terminalReplay.status).toBe(303);
    expect(terminalReplay.headers.get("location")).toBe("/connection-error");
    expect(await getStatus(failedClient, attemptIdFrom(failedStart.body))).toMatchObject({ status: "failed", revision: failedRevision, draftAvailable: false });

    const cancelClient = await bootstrapClient();
    const cancelStart = await start(cancelClient, validStart({ instagramUsername: "cancel_me" }));
    const cancelState = stateFrom(cancelStart.body);
    const firstCancel = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?error=access_denied&state=${cancelState}`, { headers: { cookie: cancelClient.cookie } }));
    expect(firstCancel.headers.get("location")).toBe(`/connection-error?attemptId=${attemptIdFrom(cancelStart.body)}`);
    const cancelled = await getStatus(cancelClient, attemptIdFrom(cancelStart.body));
    expect(cancelled).toMatchObject({ status: "failed", code: "OAUTH_CANCELLED", draftAvailable: true, retryAction: "return_form" });

    vi.setSystemTime(new Date("2026-09-11T00:11:00.000Z"));
    const secondCancel = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?error=access_denied&state=${cancelState}`, { headers: { cookie: cancelClient.cookie } }));
    expect(secondCancel.headers.get("location")).toBe(`/connection-error?attemptId=${attemptIdFrom(cancelStart.body)}`);
    expect(await getStatus(cancelClient, attemptIdFrom(cancelStart.body))).toMatchObject({ status: "failed", revision: cancelled.revision, draftAvailable: true });

    vi.setSystemTime(new Date("2026-09-11T00:31:00.000Z"));
    const expiredDraft = await statusGet(new Request(`${ORIGIN}/api/onboarding/status?attemptId=${attemptIdFrom(cancelStart.body)}`, { headers: { cookie: cancelClient.cookie } }));
    expect(expiredDraft.status).toBe(200);
    await expect(expiredDraft.json()).resolves.toMatchObject({ status: "failed", draftAvailable: false });
  });

  it("FINAL04 AU09 mismatch candidate requires exact expectedRevision before finalization", async () => {
    const client = await bootstrapClient();
    const started = await start(client, validStart({ instagramUsername: "entered" }));
    const state = stateFrom(started.body);
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_connected&state=${state}`, { headers: { cookie: client.cookie } }));

    const candidate = (await complete(client, attemptIdFrom(started.body))).body;
    expect(candidate).toMatchObject({ status: "account_confirmation_required", enteredUsername: "entered", connectedUsername: "connected" });
    if (candidate.status !== "account_confirmation_required") throw new Error("missing candidate");

    const replay = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_connected&state=${state}`, { headers: { cookie: client.cookie } }));
    expect(replay.status).toBe(303);
    expect(replay.headers.get("location")).toBe(`/connecting?attemptId=${attemptIdFrom(started.body)}`);

    const stale = await confirmPost(authedJsonRequest(client, "/api/onboarding/confirm-account", { attemptId: candidate.attemptId, expectedRevision: candidate.revision - 1, accept: true }));
    expect(stale.status).toBe(409);
    await expect(stale.json()).resolves.toMatchObject({ error: { code: "STALE_CONFIRMATION" } });

    const confirmed = await confirmPost(authedJsonRequest(client, "/api/onboarding/confirm-account", { attemptId: candidate.attemptId, expectedRevision: candidate.revision, accept: true }));
    expect(confirmed.status).toBe(200);
    expect(confirmed.headers.get("set-cookie")).toContain(client.cookie);
    expect(confirmed.headers.get("set-cookie")).toContain("Max-Age=86400");
    await expect(confirmed.json()).resolves.toMatchObject({ status: "completed", result: { instagramUsername: "connected" } });
  });

  it("AU10 ambiguous short-token timeout is not blindly retried after exchange began", async () => {
    const client = await bootstrapClient();
    const started = await start(client, validStart({ instagramUsername: "timeout" }));
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=timeout&state=${stateFrom(started.body)}`, { headers: { cookie: client.cookie } }));

    const failed = await complete(client, attemptIdFrom(started.body));
    expect(failed.body).toMatchObject({ status: "failed", code: "PROVIDER_UNAVAILABLE" });
    expect(failed.setCookie).toBeNull();
    const retry = await complete(client, attemptIdFrom(started.body));
    expect(retry.body).toMatchObject({ status: "failed", code: "PROVIDER_UNAVAILABLE" });
  });

  it("FINAL11 TO04 scope and malformed expiry failures block completion", async () => {
    const missingScope = await callbackThenComplete("missing_scope");
    expect(missingScope.body).toMatchObject({ status: "failed", code: "PERMISSIONS_REQUIRED" });

    const malformedExpiry = await callbackThenComplete("malformed_expiry");
    expect(malformedExpiry.body).toMatchObject({ status: "failed", code: "PROVIDER_UNAVAILABLE" });
  });

  it("DB07 status lookup requires cookie binding, UUID alone is not authority", async () => {
    const owner = await bootstrapClient();
    const stranger = await bootstrapClient();
    const started = await start(owner, validStart());

    const response = await statusGet(new Request(`${ORIGIN}/api/onboarding/status?attemptId=${attemptIdFrom(started.body)}`, { headers: { cookie: stranger.cookie } }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SESSION_EXPIRED" } });
  });

  it("AUDIT01 AUDIT03 cancellation draft restart is idempotent for the same parent/key", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    const client = await bootstrapClient();
    const started = await start(client, validStart({ instagramUsername: "cancel_me" }));
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?error=access_denied&state=${stateFrom(started.body)}`, { headers: { cookie: client.cookie } }));

    const status = await getStatus(client, attemptIdFrom(started.body));
    expect(status).toMatchObject({ status: "failed", code: "OAUTH_CANCELLED", draftAvailable: true, retryAction: "return_form" });
    const bootstrap = await bootstrapGet(new Request(`${ORIGIN}/api/onboarding/bootstrap`, { headers: { cookie: client.cookie } }));
    await expect(bootstrap.json()).resolves.toMatchObject({
      activeAttempt: { attemptId: attemptIdFrom(started.body), nextPath: "/apply" },
      draft: { attemptId: attemptIdFrom(started.body), instagramUsername: "cancel_me" },
    });

    vi.setSystemTime(new Date("2026-09-11T00:25:00.000Z"));
    const requestKey = randomUUID();
    const firstRestart = await restart(client, attemptIdFrom(started.body), requestKey);
    vi.setSystemTime(new Date("2026-09-11T00:31:00.000Z"));
    const secondRestart = await restart(client, attemptIdFrom(started.body), requestKey);
    expect(firstRestart.status).toBe(201);
    expect(secondRestart.status).toBe(200);
    expect(secondRestart.body).toEqual(firstRestart.body);
  });

  it("LIFE02 pending state expiry scrubs and disappears from bootstrap so a fresh start succeeds", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    const client = await bootstrapClient();
    const started = await start(client, validStart({ instagramUsername: "state_expiry" }));

    vi.setSystemTime(new Date("2026-09-11T00:11:00.000Z"));
    const bootstrap = await bootstrapGet(new Request(`${ORIGIN}/api/onboarding/bootstrap`, { headers: { cookie: client.cookie } }));
    const body = (await bootstrap.json()) as BootstrapResponse;
    expect(body.activeAttempt).toBeUndefined();
    expect(body.draft).toBeUndefined();
    expect(await getStatus(client, attemptIdFrom(started.body))).toMatchObject({ status: "failed", code: "SESSION_EXPIRED", draftAvailable: false });

    const fresh = await start(client, validStart({ instagramUsername: "fresh_after_expiry" }));
    expect(fresh.status).toBe(201);
    expect(fresh.body.action).toBe("authorize");
  });

  it("restart same requestKey with a different parent is an idempotency conflict", async () => {
    const client = await bootstrapClient();
    const first = await start(client, validStart({ instagramUsername: "first_parent" }));
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?error=access_denied&state=${stateFrom(first.body)}`, { headers: { cookie: client.cookie } }));
    const requestKey = randomUUID();
    const firstChild = await restart(client, attemptIdFrom(first.body), requestKey);
    expect(firstChild.status).toBe(201);
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?error=access_denied&state=${stateFrom(firstChild.body)}`, { headers: { cookie: client.cookie } }));

    const second = await start(client, validStart({ instagramUsername: "second_parent", requestKey: randomUUID(), replaceAttemptId: attemptIdFrom(firstChild.body) }));
    expect(second.status).toBe(201);
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?error=access_denied&state=${stateFrom(second.body)}`, { headers: { cookie: client.cookie } }));
    const conflict = await restartPost(authedJsonRequest(client, "/api/onboarding/restart", { attemptId: attemptIdFrom(second.body), requestKey }));
    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
  });

  it("FINAL03 replacement invalidates old state and old callback cannot revive replaced attempt", async () => {
    const client = await bootstrapClient();
    const first = await start(client, validStart({ instagramUsername: "old" }));
    const oldState = stateFrom(first.body);
    const replacement = await start(client, validStart({ instagramUsername: "new", replaceAttemptId: attemptIdFrom(first.body) }));
    expect(replacement.status).toBe(201);

    const oldCallback = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_old&state=${oldState}`, { headers: { cookie: client.cookie } }));
    expect(oldCallback.status).toBe(303);
    expect(oldCallback.headers.get("location")).toBe("/connection-error");
  });

  it("LIFE01 completed receipt replays until 24h expiry and then returns 410", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    const client = await bootstrapClient();
    const started = await start(client, validStart({ instagramUsername: "receipt" }));
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_receipt&state=${stateFrom(started.body)}`, { headers: { cookie: client.cookie } }));
    expect((await complete(client, attemptIdFrom(started.body))).body).toMatchObject({ status: "completed" });

    vi.setSystemTime(new Date("2026-09-11T23:59:00.000Z"));
    const replay = await statusGet(new Request(`${ORIGIN}/api/onboarding/status?attemptId=${attemptIdFrom(started.body)}`, { headers: { cookie: client.cookie } }));
    expect(replay.status).toBe(200);
    expect(replay.headers.get("set-cookie")).toContain(client.cookie);
    expect(replay.headers.get("set-cookie")).toContain("Max-Age=86400");
    await expect(replay.json()).resolves.toMatchObject({ status: "completed" });

    vi.setSystemTime(new Date("2026-09-12T00:01:00.000Z"));
    const expired = await statusGet(new Request(`${ORIGIN}/api/onboarding/status?attemptId=${attemptIdFrom(started.body)}`, { headers: { cookie: client.cookie } }));
    expect(expired.status).toBe(410);
    expect(expired.headers.get("set-cookie")).toBeNull();
    await expect(expired.json()).resolves.toMatchObject({ error: { code: "SESSION_EXPIRED" } });
  });

  it("AU05 legacy /auth/callback bridge and invalid callbacks sanitize code/state into redirect only", async () => {
    const client = await bootstrapClient();
    const invalid = await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=raw-secret&state=bad-state`, { headers: { cookie: client.cookie } }));
    expect(invalid.status).toBe(303);
    expect(invalid.headers.get("location")).toBe("/connection-error");

    const legacy = await legacyCallbackGet(new Request(`${ORIGIN}/auth/callback?code=legacy-code&state=legacy-state`, { headers: { cookie: client.cookie } }));
    expect(legacy.status).toBe(303);
    expect(legacy.headers.get("location")).toBe("/connection-error");
    expect(legacy.headers.get("location")).not.toContain("code=");
    expect(legacy.headers.get("location")).not.toContain("state=");
  });

  it("AU05 AU06 FINAL06 accepts exact legacy v1 callback, issues terminal receipt, and clears binding cookie", async () => {
    const secrets = legacySecrets();
    const bindingId = "legacy-binding-id-0123456789";
    const callback = await legacyCallbackGet(
      new Request(`${ORIGIN}/auth/callback?code=user_legacy_user&state=${legacyState(bindingId, secrets.instagramSecret)}`, {
        headers: { cookie: legacyBindingCookie(bindingId, secrets.sessionSecret) },
      }),
    );

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("/legacy-complete");
    expect(callback.headers.get("location")).not.toContain("code=");
    expect(callback.headers.get("location")).not.toContain("state=");
    expect(callback.headers.get("set-cookie")).toContain("cl_consent_binding=; Max-Age=0");
    const issuedCookies = setCookiePairs(callback);
    expect(issuedCookies.some((cookie) => cookie.startsWith("cl-onboarding="))).toBe(true);
    expect(issuedCookies.some((cookie) => cookie.startsWith("cl-legacy-terminal="))).toBe(true);

    const terminal = await legacyTerminalPost(new Request(`${ORIGIN}/api/onboarding/legacy-terminal`, {
      method: "POST",
      headers: { cookie: issuedCookies.filter((cookie) => !cookie.startsWith("cl_consent_binding=")).join("; ") },
    }));
    expect(terminal.status).toBe(200);
    await expect(terminal.json()).resolves.toEqual({ ok: true });
    expect(terminal.headers.get("set-cookie")).toContain("cl-legacy-terminal=; Max-Age=0");

    const wrongBrowser = await legacyTerminalPost(new Request(`${ORIGIN}/api/onboarding/legacy-terminal`, {
      method: "POST",
      headers: { cookie: issuedCookies.filter((cookie) => cookie.startsWith("cl-legacy-terminal=")).concat("cl-onboarding=different-browser-secret").join("; ") },
    }));
    expect(wrongBrowser.status).toBe(401);
    await expect(wrongBrowser.json()).resolves.toEqual({ ok: false });
  });

  it("FINAL06 normalizes legacy repository /complete results to the same terminal page", async () => {
    const existingClient = await bootstrapClient();
    const existing = await start(existingClient, validStart({ instagramUsername: "legacy_existing" }));
    await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=user_legacy_existing&state=${stateFrom(existing.body)}`, { headers: { cookie: existingClient.cookie } }));
    expect((await complete(existingClient, attemptIdFrom(existing.body))).body).toMatchObject({ status: "completed" });

    const secrets = legacySecrets();
    const bindingId = "legacy-binding-id-0123456789";
    const callback = await legacyCallbackGet(
      new Request(`${ORIGIN}/auth/callback?code=user_legacy_existing&state=${legacyState(bindingId, secrets.instagramSecret, { nonce: "legacy-existing-nonce" })}`, {
        headers: { cookie: legacyBindingCookie(bindingId, secrets.sessionSecret) },
      }),
    );

    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe("/legacy-complete");
    expect(callback.headers.get("location")).not.toContain("code=");
    expect(callback.headers.get("location")).not.toContain("state=");
    expect(setCookiePairs(callback).some((cookie) => cookie.startsWith("cl-legacy-terminal="))).toBe(true);
  });

  it("OP03 AU05 rejects legacy tamper, TTL, future iat, cookie mismatch, wrong docs, missing consent, and bundle hash mismatch", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-11T00:00:00.000Z") });
    const secrets = legacySecrets();
    const bindingId = "legacy-binding-id-0123456789";

    for (const state of [
      `${legacyState(bindingId, secrets.instagramSecret)}x`,
      legacyState(bindingId, secrets.instagramSecret, { iat: Math.floor(Date.now() / 1000) - 601 }),
      legacyState(bindingId, secrets.instagramSecret, { iat: Math.floor(Date.now() / 1000) + 61 }),
      legacyState("different-binding-id-012345", secrets.instagramSecret),
      legacyState(bindingId, secrets.instagramSecret, { terms_version: "wrong-terms-version" }),
      legacyState(bindingId, secrets.instagramSecret, { instagram_permissions_accepted: false }),
      legacyState(bindingId, secrets.instagramSecret, { bundle_hash: "0".repeat(64) }),
    ]) {
      const callback = await legacyCallbackGet(
        new Request(`${ORIGIN}/auth/callback?code=user_legacy_user&state=${encodeURIComponent(state)}`, {
          headers: { cookie: legacyBindingCookie(bindingId, secrets.sessionSecret) },
        }),
      );
      expect(callback.status).toBe(303);
      expect(callback.headers.get("location")).toBe("/connection-error");
      expect(callback.headers.get("set-cookie")).toContain("cl_consent_binding=; Max-Age=0");
      expect(callback.headers.get("location")).not.toContain("code=");
      expect(callback.headers.get("location")).not.toContain("state=");
    }
  });
});

async function callbackThenComplete(code: string): Promise<{ statusCode: number; body: StatusResponse }> {
  const client = await bootstrapClient();
  const started = await start(client, validStart({ instagramUsername: code }));
  await callbackGet(new Request(`${ORIGIN}/auth/instagram/callback?code=${code}&state=${stateFrom(started.body)}`, { headers: { cookie: client.cookie } }));
  return complete(client, attemptIdFrom(started.body));
}

async function bootstrapClient(): Promise<{ body: BootstrapResponse; cookie: string; csrfToken: string; response: Response }> {
  const response = await bootstrapGet(new Request(`${ORIGIN}/api/onboarding/bootstrap`));
  const body = (await response.json()) as BootstrapResponse;
  const cookie = response.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { body, cookie, csrfToken: body.csrfToken, response };
}

async function start(client: { cookie: string; csrfToken: string }, body: unknown): Promise<{ status: number; body: StartResponse }> {
  const response = await startPost(authedJsonRequest(client, "/api/onboarding/start", body));
  return { status: response.status, body: (await response.json()) as StartResponse };
}

async function complete(client: { cookie: string; csrfToken: string }, attemptId: string): Promise<{ statusCode: number; body: StatusResponse; setCookie: string | null }> {
  const response = await completePost(authedJsonRequest(client, "/api/onboarding/complete", { attemptId }));
  return { statusCode: response.status, body: (await response.json()) as StatusResponse, setCookie: response.headers.get("set-cookie") };
}

async function restart(client: { cookie: string; csrfToken: string }, attemptId: string, requestKey: string): Promise<{ status: number; body: StartResponse }> {
  const response = await restartPost(authedJsonRequest(client, "/api/onboarding/restart", { attemptId, requestKey }));
  return { status: response.status, body: (await response.json()) as StartResponse };
}

async function getStatus(client: { cookie: string }, attemptId: string): Promise<StatusResponse> {
  const response = await statusGet(new Request(`${ORIGIN}/api/onboarding/status?attemptId=${attemptId}`, { headers: { cookie: client.cookie } }));
  expect(response.status).toBe(200);
  return (await response.json()) as StatusResponse;
}

function authedJsonRequest(client: { cookie: string; csrfToken: string }, path: string, body: unknown): Request {
  return jsonRequest(path, body, { cookie: client.cookie, "x-csrf-token": client.csrfToken, origin: ORIGIN, "sec-fetch-site": "same-origin" });
}

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function validStart(overrides: Partial<{ requestKey: string; policyBundleId: string; fullName: string; email: string; phone: string; instagramUsername: string; replaceAttemptId: string; consents: { age: true; terms: true; privacy: true; instagramData: true } }> = {}) {
  return { requestKey: randomUUID(), policyBundleId: "approved-bundle", fullName: "김셀럽", email: "creator@example.com", phone: "010-0000-0000", instagramUsername: "celeblife_demo", consents: { age: true, terms: true, privacy: true, instagramData: true }, ...overrides };
}

function stateFrom(response: StartResponse): string {
  if (response.action !== "authorize") throw new Error("expected authorize response");
  return new URL(response.authorizeUrl).searchParams.get("state") ?? "";
}

function attemptIdFrom(response: StartResponse): string {
  return response.attemptId;
}

function legacySecrets(): { sessionSecret: string; instagramSecret: string } {
  const sessionSecret = "session-secret-for-legacy-callback-tests";
  const instagramSecret = "instagram-secret-for-legacy-state-tests";
  process.env.SESSION_COOKIE_SECRET = sessionSecret;
  process.env.INSTAGRAM_APP_SECRET = instagramSecret;
  process.env.ONBOARDING_PROVIDER = "mock";
  return { sessionSecret, instagramSecret };
}

function legacyBindingCookie(bindingId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = { bid: bindingId, exp: now + 600, iat: now, v: 1 };
  return `cl_consent_binding=${signedToken(payload, secret)}`;
}

function legacyState(bindingId: string, secret: string, overrides: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    accepted_at: new Date(now * 1000).toISOString(),
    age_confirmed: true,
    binding_id: bindingId,
    iat: now,
    instagram_permissions_accepted: true,
    instagram_permissions_version: "instagram-permissions-2026-08-26",
    nonce: "legacy-state-nonce",
    privacy_accepted: true,
    privacy_version: "privacy-2026-08-26-v3",
    terms_accepted: true,
    terms_version: "influencer-v1.2-2026-08-26",
    v: 1,
    ...overrides,
  };
  if (!("bundle_hash" in overrides)) payload.bundle_hash = legacyBundleHash(payload);
  return signedStateToken(payload, secret);
}

function legacyBundleHash(payload: Record<string, unknown>): string {
  const consentItems = { ...payload };
  delete consentItems.iat;
  delete consentItems.nonce;
  delete consentItems.binding_id;
  delete consentItems.bundle_hash;
  return createHash("sha256").update(stableJson(consentItems), "utf8").digest("hex");
}

function setCookiePairs(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = headers.getSetCookie?.() ?? splitSetCookieHeader(response.headers.get("set-cookie"));
  return values.map((value) => value.split(";")[0] ?? value);
}

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) return [];
  return value.split(/,\s*(?=[^;,]+=)/);
}

function signedToken(payload: Record<string, unknown>, secret: string): string {
  const payloadPart = Buffer.from(stableJson(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", Buffer.from(secret, "utf8")).update(payloadPart).digest("base64url");
  return `${payloadPart}.${signature}`;
}

function signedStateToken(payload: Record<string, unknown>, secret: string): string {
  const payloadBytes = Buffer.from(stableJson(payload), "utf8");
  const signature = createHmac("sha256", Buffer.from(secret, "utf8")).update(payloadBytes).digest("base64url");
  return `${payloadBytes.toString("base64url")}.${signature}`;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}
