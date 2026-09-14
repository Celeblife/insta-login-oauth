CREATE OR REPLACE FUNCTION public.fail_instagram_onboarding_v2(
  p_attempt_id uuid,
  p_browser_binding_hash text,
  p_code text,
  p_status text,
  p_now timestamptz,
  p_owner uuid DEFAULT NULL,
  p_fencing_token bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  IF p_status NOT IN ('failed','cancelled','expired') THEN
    RAISE EXCEPTION 'INVALID_FAILURE_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_attempt
    FROM public.onboarding_sessions
   WHERE id = p_attempt_id
     AND browser_binding_hash = p_browser_binding_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status = 'completed' THEN
    RETURN public.onboarding_attempt_to_json_v2(v_attempt);
  END IF;
  IF v_attempt.status = 'pending' THEN
    IF v_attempt.state_invalidated_at IS NOT NULL OR v_attempt.oauth_code_hash IS NOT NULL THEN
      RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
    END IF;
  ELSIF v_attempt.status IN (
      'callback_received','exchanging_short','short_token_checkpointed',
      'exchanging_long','long_token_checkpointed','fetching_account',
      'awaiting_account_confirmation','saving'
    ) THEN
    IF p_owner IS NULL
       OR p_fencing_token IS NULL
       OR v_attempt.lease_owner IS DISTINCT FROM p_owner
       OR v_attempt.fencing_token <> p_fencing_token
       OR v_attempt.lease_expires_at IS NULL
       OR v_attempt.lease_expires_at <= p_now THEN
      RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
    END IF;
  ELSE
    RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
  END IF;

  UPDATE public.onboarding_sessions
     SET status = p_status,
         revision = revision + 1,
         state_invalidated_at = COALESCE(state_invalidated_at, p_now),
         oauth_state_encrypted = NULL,
         oauth_code_encrypted = NULL,
         short_token_encrypted = NULL,
         long_token_encrypted = NULL,
         candidate_account = NULL,
         draft_payload_encrypted = CASE
           WHEN v_attempt.draft_expires_at > p_now
            AND (
              (p_status = 'cancelled' AND p_code = 'OAUTH_CANCELLED')
              OR (p_status = 'failed' AND p_code IN ('PROVIDER_UNAVAILABLE', 'PERMISSIONS_REQUIRED'))
            )
           THEN draft_payload_encrypted
           ELSE NULL
         END,
         lease_owner = NULL,
         lease_expires_at = NULL,
         failure_code = LEFT(COALESCE(NULLIF(p_code, ''), 'STORAGE_UNAVAILABLE'), 80),
         updated_at = p_now
   WHERE id = p_attempt_id
     AND browser_binding_hash = p_browser_binding_hash
   RETURNING * INTO v_attempt;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

REVOKE ALL ON FUNCTION public.fail_instagram_onboarding_v2(uuid,text,text,text,timestamptz,uuid,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_instagram_onboarding_v2(uuid,text,text,text,timestamptz,uuid,bigint) TO service_role;
