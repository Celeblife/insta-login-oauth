import type { StartRequest } from "@/lib/contracts/onboarding";
import type { AttemptRecord, StartAttemptAtomicInput } from "@/lib/persistence/types";

export const RPC = {
  getActive: "get_active_onboarding_attempt_v2",
  getById: "get_onboarding_attempt_v2",
  getByRequestKey: "get_onboarding_attempt_by_request_key_v2",
  getByStateHash: "get_onboarding_attempt_by_state_v2",
  startAtomic: "start_instagram_onboarding_v2",
  recordCallbackCode: "record_instagram_callback_code_v2",
  claimCompletionLease: "claim_instagram_completion_lease_v2",
  markExchangeBegun: "mark_instagram_code_exchange_begun_v2",
  checkpointShortToken: "checkpoint_instagram_short_token_v2",
  markLongExchangeBegun: "mark_instagram_long_exchange_begun_v2",
  checkpointLongToken: "checkpoint_instagram_long_token_v2",
  checkpointAccountCandidate: "checkpoint_instagram_account_candidate_v2",
  failAttempt: "fail_instagram_onboarding_v2",
  finalize: "complete_instagram_onboarding_v2",
  guardedLegacyCallback: "complete_guarded_legacy_instagram_callback_v2",
} as const;

export type RpcAttemptRecord = AttemptRecord;

export type StartAtomicRpcArgs = {
  p_attempt_id: string;
  p_browser_binding_hash: string;
  p_request_key: string;
  p_payload_hash: string;
  p_draft_payload_encrypted: StartAttemptAtomicInput["draftPayloadEncrypted"];
  p_policy_snapshot: StartAttemptAtomicInput["policySnapshot"];
  p_replace_attempt_id: string | null;
  p_parent_attempt_id: string | null;
  p_oauth_state_hash: string;
  p_encrypted_oauth_state: StartAttemptAtomicInput["encryptedOAuthState"];
  p_state_expires_at: string;
  p_draft_expires_at: string;
  p_started_at: string;
};

export type FinalizeRpcArgs = {
  p_attempt_id: string;
  p_browser_binding_hash: string;
  p_owner: string;
  p_fencing_token: number;
  p_expected_revision: number;
  p_account: {
    providerAccountId: string;
    username: string;
    accountType: "business" | "creator" | "personal" | "unknown";
  };
  /** Server-to-DB only. Never returned, logged, or nested into public metadata. */
  p_access_token: string;
  p_token_metadata: {
    providerUserId: string;
    expiresAt: string;
    grantedScopes: readonly string[];
    accessTokenHash: string;
  };
  p_payload: StartRequest;
  p_now: string;
};
