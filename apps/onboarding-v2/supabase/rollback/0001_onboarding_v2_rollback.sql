-- CelebLife onboarding v2 non-destructive rollback companion.
-- This disables v2 server entry points and outbox/job access without deleting preserved data.
-- Run only against the intended Supabase project. Do not use as a data reset script.

BEGIN;

REVOKE ALL ON FUNCTION public.complete_instagram_onboarding_v2(uuid,text,uuid,bigint,integer,jsonb,jsonb,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboarding_v2_sha256(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboarding_attempt_to_json_v2(public.onboarding_sessions) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_onboarding_attempts_v2(text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_active_onboarding_attempt_v2(text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_onboarding_attempt_v2(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_onboarding_attempt_by_request_key_v2(text,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_onboarding_attempt_by_state_v2(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.start_instagram_onboarding_v2(uuid,text,uuid,text,jsonb,jsonb,uuid,uuid,text,jsonb,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_instagram_callback_code_v2(uuid,text,jsonb,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_instagram_completion_lease_v2(uuid,text,uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.require_onboarding_lease_v2(uuid,uuid,bigint,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_instagram_code_exchange_begun_v2(uuid,uuid,bigint,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checkpoint_instagram_short_token_v2(uuid,uuid,bigint,jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_instagram_long_exchange_begun_v2(uuid,uuid,bigint,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checkpoint_instagram_long_token_v2(uuid,uuid,bigint,jsonb,jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.checkpoint_instagram_account_candidate_v2(uuid,uuid,bigint,jsonb,jsonb,jsonb,boolean,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fail_instagram_onboarding_v2(uuid,text,text,text,timestamptz,uuid,bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_guarded_legacy_instagram_callback_v2(text,text,text,text,text,timestamptz,text[],jsonb,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_notification_outbox_v2(uuid,integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_notification_outbox_sent_v2(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_notification_outbox_failed_v2(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.list_token_refresh_candidates_v2(integer,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_token_refresh_success_v2(text,text,timestamptz,timestamptz,text,text,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.commit_token_refresh_failure_v2(text,text,timestamptz,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.try_acquire_job_lease_v2(text,uuid,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_job_lease_v2(text,uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cleanup_onboarding_v2() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.creator_profiles, public.onboarding_sessions,
  public.onboarding_requests, public.notification_outbox, public.job_leases
  FROM PUBLIC, anon, authenticated, service_role;

UPDATE public.notification_outbox
   SET status = CASE WHEN status = 'sent' THEN 'sent' ELSE 'dead' END,
       lease_owner = NULL,
       lease_expires_at = NULL,
       last_error_code = CASE WHEN status = 'sent' THEN last_error_code ELSE 'V2_ROLLBACK_DISABLED' END,
       updated_at = clock_timestamp()
 WHERE status IN ('pending', 'processing');

UPDATE public.job_leases
   SET lease_expires_at = clock_timestamp(),
       updated_at = clock_timestamp()
 WHERE name IN ('token-refresh', 'notification-retry', 'onboarding-cleanup');

COMMIT;
