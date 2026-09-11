import type { SupabaseClient } from "@supabase/supabase-js";
import { readPositiveInt, rpc } from "./env";

export type TokenRefreshCandidate = {
  token_id: string;
  user_id: string;
  access_token: string;
  row_version: string;
  created_at: string | null;
  expires_at: string | null;
  connection_status: "connected" | "unknown";
};

export type TokenRefreshSummary = {
  status: "PASS" | "DRY_RUN" | "NOT_RUN";
  refreshed: number;
  failed: number;
  tooNew: number;
  reauthRequired: number;
  metadataMissing: number;
  skippedConcurrentChange: number;
  checked: number;
  externalFetches: number;
  tokenUpdates: number;
};

type RefreshFailureKind = "transient" | "expired" | "revoked" | "invalid_credentials";

type GraphTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

const MAX_REFRESH_RESPONSE_BYTES = 16_384;

export function instagramRefreshEndpoint(env: Record<string, string | undefined> = process.env): URL {
  const configured = env.INSTAGRAM_REFRESH_TOKEN_ENDPOINT || "https://graph.instagram.com/refresh_access_token";
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.hostname !== "graph.instagram.com" || url.pathname !== "/refresh_access_token") {
    throw new Error("INVALID_INSTAGRAM_REFRESH_ENDPOINT");
  }
  url.search = "";
  url.hash = "";
  return url;
}

export function expiryFromResponse(response: GraphTokenResponse, now = new Date()): {
  accessToken: string;
  expiresAt: string;
} {
  const expiresIn = response.expires_in;
  if (
    typeof response.access_token !== "string" ||
    !response.access_token.trim() ||
    typeof expiresIn !== "number" ||
    !Number.isSafeInteger(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error("INVALID_TOKEN_RESPONSE");
  }
  const expiryMs = now.getTime() + expiresIn * 1000;
  if (!Number.isSafeInteger(expiryMs)) throw new Error("INVALID_TOKEN_EXPIRY");
  return { accessToken: response.access_token, expiresAt: new Date(expiryMs).toISOString() };
}

async function refreshInstagramLongLivedToken(accessToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
}> {
  const url = instagramRefreshEndpoint();
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(readPositiveInt("PROVIDER_TIMEOUT_MS", 10000)),
    redirect: "manual",
  });
  if (!response.ok) throw new Error(`INSTAGRAM_REFRESH_HTTP_${response.status}`);
  const body = await response.text();
  if (body.length > MAX_REFRESH_RESPONSE_BYTES) throw new Error("INSTAGRAM_REFRESH_RESPONSE_TOO_LARGE");
  return expiryFromResponse(JSON.parse(body) as GraphTokenResponse);
}

export function classifyRefreshFailure(error: unknown, candidate?: Pick<TokenRefreshCandidate, "expires_at">): RefreshFailureKind {
  if (candidate?.expires_at && Date.parse(candidate.expires_at) <= Date.now()) return "expired";
  const message = error instanceof Error ? error.message : "";
  if (/INSTAGRAM_REFRESH_HTTP_(400|401|403)\b/.test(message)) return "invalid_credentials";
  if (/revoked|invalid_token|reauth/i.test(message)) return "revoked";
  return "transient";
}

export async function runTokenRefreshJob(options: {
  supabase: SupabaseClient;
  owner: string;
  dryRun?: boolean;
}): Promise<TokenRefreshSummary> {
  const dryRun = options.dryRun === true;
  const batchSize = readPositiveInt("JOB_BATCH_SIZE", 25);
  const lease = await rpc<boolean>(options.supabase, "try_acquire_job_lease_v2", {
    p_name: "token-refresh",
    p_owner: options.owner,
    p_lease_seconds: 90,
  });
  if (!lease) {
    return {
      status: "NOT_RUN",
      refreshed: 0,
      failed: 0,
      tooNew: 0,
      reauthRequired: 0,
      metadataMissing: 0,
      skippedConcurrentChange: 0,
      checked: 0,
      externalFetches: 0,
      tokenUpdates: 0,
    };
  }

  const summary: TokenRefreshSummary = {
    status: dryRun ? "DRY_RUN" : "PASS",
    refreshed: 0,
    failed: 0,
    tooNew: 0,
    reauthRequired: 0,
    metadataMissing: 0,
    skippedConcurrentChange: 0,
    checked: 0,
    externalFetches: 0,
    tokenUpdates: 0,
  };

  try {
    const candidates = await rpc<TokenRefreshCandidate[]>(
      options.supabase,
      "list_token_refresh_candidates_v2",
      { p_limit: batchSize, p_days_before_expiry: 7 },
    );
    summary.checked = candidates.length;

    for (const candidate of candidates) {
      if (!candidate.created_at || !candidate.expires_at) {
        summary.metadataMissing += 1;
        continue;
      }
      if (Date.parse(candidate.expires_at) <= Date.now()) {
        if (!dryRun) {
          const changed = await rpc<boolean>(options.supabase, "commit_token_refresh_failure_v2", {
            p_token_id: candidate.token_id,
            p_expected_row_version: candidate.row_version,
            p_expected_created_at: candidate.created_at,
            p_expected_expires_at: candidate.expires_at,
            p_expected_connection_status: candidate.connection_status,
            p_error_code: "TOKEN_EXPIRED",
            p_failure_kind: "expired",
          });
          if (changed) summary.tokenUpdates += 1;
          else summary.skippedConcurrentChange += 1;
        }
        summary.reauthRequired += 1;
        continue;
      }
      if (Date.parse(candidate.created_at) > Date.now() - 86_400_000) {
        summary.tooNew += 1;
        continue;
      }
      if (dryRun) continue;
      try {
        summary.externalFetches += 1;
        const refreshed = await refreshInstagramLongLivedToken(candidate.access_token);
        const committed = await rpc<boolean>(options.supabase, "commit_token_refresh_success_v2", {
          p_token_id: candidate.token_id,
          p_expected_row_version: candidate.row_version,
          p_expected_created_at: candidate.created_at,
          p_expected_expires_at: candidate.expires_at,
          p_expected_connection_status: candidate.connection_status,
          p_access_token: refreshed.accessToken,
          p_expires_at: refreshed.expiresAt,
        });
        if (committed) {
          summary.refreshed += 1;
          summary.tokenUpdates += 1;
        } else {
          summary.skippedConcurrentChange += 1;
        }
      } catch (error) {
        const failureKind = classifyRefreshFailure(error, candidate);
        const changed = await rpc<boolean>(options.supabase, "commit_token_refresh_failure_v2", {
          p_token_id: candidate.token_id,
          p_expected_row_version: candidate.row_version,
          p_expected_created_at: candidate.created_at,
          p_expected_expires_at: candidate.expires_at,
          p_expected_connection_status: candidate.connection_status,
          p_error_code: "TOKEN_REFRESH_FAILED",
          p_failure_kind: failureKind,
        }).catch(() => false);
        if (failureKind !== "transient") summary.reauthRequired += 1;
        if (changed) summary.tokenUpdates += 1;
        else summary.skippedConcurrentChange += 1;
        summary.failed += 1;
      }
    }
    return summary;
  } finally {
    await rpc<boolean>(options.supabase, "release_job_lease_v2", {
      p_name: "token-refresh",
      p_owner: options.owner,
      p_success: summary.failed === 0,
    }).catch(() => undefined);
  }
}
