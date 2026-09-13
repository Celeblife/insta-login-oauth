-- CelebLife onboarding v2 additive schema.
-- Apply only to the intended Supabase project after checking SUPABASE_EXPECTED_PROJECT_REF.
-- This migration preserves public.users, public.tokens, public.user_consents and v1 RPCs.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
DECLARE
  v_pgcrypto_schema text;
BEGIN
  SELECT namespace.nspname INTO v_pgcrypto_schema
    FROM pg_catalog.pg_extension extension
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = extension.extnamespace
   WHERE extension.extname = 'pgcrypto';

  IF v_pgcrypto_schema IS NULL THEN
    RAISE EXCEPTION 'PGCRYPTO_EXTENSION_MISSING';
  END IF;

  EXECUTE pg_catalog.format($create$
CREATE OR REPLACE FUNCTION public.onboarding_v2_sha256(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT pg_catalog.encode(%I.digest(p_value, 'sha256'), 'hex')
$function$
$create$, v_pgcrypto_schema);
END
$$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN row_version bigint NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN connection_status text NOT NULL DEFAULT 'unknown';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens
    ADD CONSTRAINT tokens_connection_status_check
    CHECK (connection_status IN ('unknown','connected','reauth_required','revoked'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN source_attempt_id uuid;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN source_attempt_started_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN last_refresh_attempt_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN last_refreshed_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN refresh_failure_count integer NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens
    ADD CONSTRAINT tokens_refresh_failure_count_check CHECK (refresh_failure_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN last_refresh_error_code text;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN granted_scopes text[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.tokens ADD COLUMN scopes_checked_at timestamptz;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.bump_token_row_version_v2()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.row_version := 1;
    RETURN NEW;
  END IF;

  IF NEW.access_token IS DISTINCT FROM OLD.access_token
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.source_attempt_id IS DISTINCT FROM OLD.source_attempt_id
     OR NEW.source_attempt_started_at IS DISTINCT FROM OLD.source_attempt_started_at
     OR NEW.connection_status IS DISTINCT FROM OLD.connection_status
     OR NEW.granted_scopes IS DISTINCT FROM OLD.granted_scopes
     OR NEW.scopes_checked_at IS DISTINCT FROM OLD.scopes_checked_at THEN
    NEW.row_version := OLD.row_version + 1;
  ELSE
    NEW.row_version := OLD.row_version;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tokens_bump_row_version_v2 ON public.tokens;
CREATE TRIGGER tokens_bump_row_version_v2
BEFORE INSERT OR UPDATE ON public.tokens
FOR EACH ROW EXECUTE FUNCTION public.bump_token_row_version_v2();

CREATE TABLE IF NOT EXISTS public.creator_profiles (
  user_id bigint PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 50),
  email text NOT NULL CHECK (char_length(email) <= 254),
  phone_e164 text NOT NULL CHECK (phone_e164 ~ '^\+82[1-9][0-9]{7,9}$'),
  email_verified boolean NOT NULL DEFAULT false CHECK (email_verified IS FALSE),
  phone_verified boolean NOT NULL DEFAULT false CHECK (phone_verified IS FALSE),
  source_accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^[0-9a-f]{64}$'),
  request_key uuid NOT NULL,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  draft_payload_encrypted jsonb,
  consent_snapshot jsonb NOT NULL,
  parent_attempt_id uuid,
  oauth_state_encrypted jsonb,
  oauth_state_hash text UNIQUE CHECK (oauth_state_hash ~ '^[0-9a-f]{64}$'),
  state_invalidated_at timestamptz,
  oauth_code_hash text,
  oauth_code_encrypted jsonb,
  short_token_encrypted jsonb,
  long_token_encrypted jsonb,
  candidate_account jsonb,
  result jsonb,
  state_expires_at timestamptz NOT NULL,
  draft_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','callback_received','exchanging_short','short_token_checkpointed',
    'exchanging_long','long_token_checkpointed','fetching_account',
    'awaiting_account_confirmation','saving','completed','failed','cancelled','expired'
  )),
  stage text NOT NULL DEFAULT 'account' CHECK (stage IN ('account','storage','submission')),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  lease_owner uuid,
  lease_expires_at timestamptz,
  fencing_token bigint NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
  request_id uuid,
  receipt_expires_at timestamptz,
  failure_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(browser_binding_hash, request_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_one_active_browser_idx
  ON public.onboarding_sessions(browser_binding_hash)
  WHERE status IN (
    'pending','callback_received','exchanging_short','short_token_checkpointed',
    'exchanging_long','long_token_checkpointed','fetching_account',
    'awaiting_account_confirmation','saving'
  );
CREATE INDEX IF NOT EXISTS onboarding_sessions_expiry_idx
  ON public.onboarding_sessions(draft_expires_at, state_expires_at);
CREATE INDEX IF NOT EXISTS onboarding_sessions_receipt_idx
  ON public.onboarding_sessions(request_id, receipt_expires_at)
  WHERE status = 'completed';

CREATE TABLE IF NOT EXISTS public.onboarding_requests (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL UNIQUE,
  instagram_id_snapshot text NOT NULL,
  instagram_username_snapshot text NOT NULL,
  contact_snapshot jsonb NOT NULL,
  connection_kind text NOT NULL CHECK (connection_kind IN ('new','reconnection')),
  initial_request_id uuid REFERENCES public.onboarding_requests(id),
  review_status text NOT NULL
    CHECK (review_status IN ('pending_review','in_review','contacted','cancelled','not_requested')),
  received_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (connection_kind = 'new' AND initial_request_id IS NULL AND review_status <> 'not_requested')
    OR
    (connection_kind = 'reconnection' AND initial_request_id IS NOT NULL
      AND initial_request_id <> id AND review_status = 'not_requested')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_one_initial_per_user_idx
  ON public.onboarding_requests(user_id)
  WHERE connection_kind = 'new';
CREATE INDEX IF NOT EXISTS onboarding_requests_review_idx
  ON public.onboarding_requests(review_status, received_at)
  WHERE connection_kind = 'new';
CREATE INDEX IF NOT EXISTS onboarding_reconnection_root_idx
  ON public.onboarding_requests(initial_request_id);

DO $$
BEGIN
  ALTER TABLE public.onboarding_sessions
    ADD CONSTRAINT onboarding_session_request_fk
    FOREIGN KEY(request_id) REFERENCES public.onboarding_requests(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.onboarding_requests(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox(status, next_attempt_at, lease_expires_at);

CREATE TABLE IF NOT EXISTS public.job_leases (
  name text PRIMARY KEY,
  owner uuid NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.creator_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_leases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.creator_profiles, public.onboarding_sessions,
  public.onboarding_requests, public.notification_outbox, public.job_leases
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.creator_profiles,
  public.onboarding_sessions, public.onboarding_requests, public.notification_outbox,
  public.job_leases TO service_role;

DROP POLICY IF EXISTS "Service role full access" ON public.creator_profiles;
CREATE POLICY "Service role full access" ON public.creator_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON public.onboarding_sessions;
CREATE POLICY "Service role full access" ON public.onboarding_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON public.onboarding_requests;
CREATE POLICY "Service role full access" ON public.onboarding_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON public.notification_outbox;
CREATE POLICY "Service role full access" ON public.notification_outbox
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access" ON public.job_leases;
CREATE POLICY "Service role full access" ON public.job_leases
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.onboarding_v2_attempt_is_older(
  p_candidate_started_at timestamptz,
  p_candidate_id uuid,
  p_current_started_at timestamptz,
  p_current_id uuid
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_current_started_at IS NOT NULL
     AND (
       p_candidate_started_at < p_current_started_at
       OR (p_candidate_started_at = p_current_started_at AND p_candidate_id::text < p_current_id::text)
     );
$$;

CREATE OR REPLACE FUNCTION public.onboarding_v2_rfc3339(
  p_value timestamptz
) RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL
    ELSE to_char(p_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  END;
$$;

CREATE OR REPLACE FUNCTION public.try_acquire_job_lease_v2(
  p_name text,
  p_owner uuid,
  p_lease_seconds integer DEFAULT 90
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NULLIF(btrim(p_name), '') IS NULL OR p_owner IS NULL OR p_lease_seconds < 1 THEN
    RAISE EXCEPTION 'INVALID_JOB_LEASE' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.job_leases(name, owner, lease_expires_at, updated_at)
  VALUES (p_name, p_owner, v_now + make_interval(secs => p_lease_seconds), v_now)
  ON CONFLICT (name) DO UPDATE
    SET owner = EXCLUDED.owner,
        lease_expires_at = EXCLUDED.lease_expires_at,
        updated_at = EXCLUDED.updated_at
    WHERE public.job_leases.lease_expires_at <= v_now
       OR public.job_leases.owner = p_owner;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lease_v2(
  p_name text,
  p_owner uuid,
  p_success boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.job_leases
     SET lease_expires_at = clock_timestamp(),
         last_success_at = CASE WHEN p_success THEN clock_timestamp() ELSE last_success_at END,
         updated_at = clock_timestamp()
   WHERE name = p_name
     AND owner = p_owner;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.onboarding_attempt_to_json_v2(
  p_attempt public.onboarding_sessions
) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p_attempt.id::text,
    'browserBindingHash', p_attempt.browser_binding_hash,
    'requestKey', p_attempt.request_key::text,
    'payloadHash', p_attempt.payload_hash,
    'draftPayloadEncrypted', p_attempt.draft_payload_encrypted,
    'policySnapshot', p_attempt.consent_snapshot,
    'parentAttemptId', p_attempt.parent_attempt_id::text,
    'oauthStateHash', p_attempt.oauth_state_hash,
    'encryptedOAuthState', p_attempt.oauth_state_encrypted,
    'stateInvalidatedAt', public.onboarding_v2_rfc3339(p_attempt.state_invalidated_at),
    'encryptedCode', p_attempt.oauth_code_encrypted,
    'codeHash', p_attempt.oauth_code_hash,
    'encryptedShortToken', p_attempt.short_token_encrypted,
    'encryptedLongToken', p_attempt.long_token_encrypted,
    'stateExpiresAt', public.onboarding_v2_rfc3339(p_attempt.state_expires_at),
    'draftExpiresAt', public.onboarding_v2_rfc3339(p_attempt.draft_expires_at),
    'receiptExpiresAt', public.onboarding_v2_rfc3339(p_attempt.receipt_expires_at),
    'revision', p_attempt.revision,
    'status', p_attempt.status,
    'stage', p_attempt.stage,
    'leaseOwner', p_attempt.lease_owner::text,
    'leaseExpiresAt', public.onboarding_v2_rfc3339(p_attempt.lease_expires_at),
    'fencingToken', p_attempt.fencing_token,
    'candidate', p_attempt.candidate_account,
    'result', p_attempt.result,
    'failureCode', p_attempt.failure_code,
    'requestId', p_attempt.request_id::text,
    'startedAt', public.onboarding_v2_rfc3339(p_attempt.started_at),
    'updatedAt', public.onboarding_v2_rfc3339(p_attempt.updated_at)
  );
$$;

CREATE OR REPLACE FUNCTION public.expire_onboarding_attempts_v2(
  p_browser_binding_hash text,
  p_now timestamptz
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.onboarding_sessions
     SET status = 'expired',
         revision = revision + 1,
         state_invalidated_at = COALESCE(state_invalidated_at, p_now),
         oauth_state_encrypted = NULL,
         oauth_code_encrypted = NULL,
         short_token_encrypted = NULL,
         long_token_encrypted = NULL,
         candidate_account = NULL,
         draft_payload_encrypted = NULL,
         lease_owner = NULL,
         lease_expires_at = NULL,
         failure_code = 'SESSION_EXPIRED',
         updated_at = p_now
     WHERE browser_binding_hash = p_browser_binding_hash
     AND status IN (
       'pending','callback_received','exchanging_short','short_token_checkpointed',
       'exchanging_long','long_token_checkpointed','fetching_account',
       'awaiting_account_confirmation','saving'
     )
     AND (
       draft_expires_at <= p_now
       OR (status = 'pending' AND state_expires_at <= p_now)
     )
     AND (lease_expires_at IS NULL OR lease_expires_at <= p_now);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_active_onboarding_attempt_v2(
  p_browser_binding_hash text,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  PERFORM public.expire_onboarding_attempts_v2(p_browser_binding_hash, p_now);
  SELECT * INTO v_attempt
    FROM public.onboarding_sessions
   WHERE browser_binding_hash = p_browser_binding_hash
     AND (
       status IN (
         'pending','callback_received','exchanging_short','short_token_checkpointed',
         'exchanging_long','long_token_checkpointed','fetching_account',
         'awaiting_account_confirmation','saving'
       )
       OR (
         status = 'cancelled'
         AND failure_code = 'OAUTH_CANCELLED'
         AND draft_expires_at > p_now
         AND draft_payload_encrypted IS NOT NULL
         AND oauth_state_encrypted IS NULL
         AND oauth_code_encrypted IS NULL
         AND short_token_encrypted IS NULL
         AND long_token_encrypted IS NULL
         AND candidate_account IS NULL
         AND lease_owner IS NULL
       )
     )
   ORDER BY started_at DESC, id DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_onboarding_attempt_v2(
  p_attempt_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt FROM public.onboarding_sessions WHERE id = p_attempt_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_onboarding_attempt_by_request_key_v2(
  p_browser_binding_hash text,
  p_request_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
    FROM public.onboarding_sessions
   WHERE browser_binding_hash = p_browser_binding_hash
     AND request_key = p_request_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_onboarding_attempt_by_state_v2(
  p_oauth_state_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
   FROM public.onboarding_sessions
   WHERE oauth_state_hash = p_oauth_state_hash;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_instagram_onboarding_v2(
  p_attempt_id uuid,
  p_browser_binding_hash text,
  p_request_key uuid,
  p_payload_hash text,
  p_draft_payload_encrypted jsonb,
  p_policy_snapshot jsonb,
  p_replace_attempt_id uuid,
  p_parent_attempt_id uuid,
  p_oauth_state_hash text,
  p_encrypted_oauth_state jsonb,
  p_state_expires_at timestamptz,
  p_draft_expires_at timestamptz,
  p_started_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.onboarding_sessions%ROWTYPE;
  v_active public.onboarding_sessions%ROWTYPE;
  v_parent public.onboarding_sessions%ROWTYPE;
  v_created public.onboarding_sessions%ROWTYPE;
  v_recent_count integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_attempt_id IS NULL
     OR p_browser_binding_hash IS NULL
     OR p_request_key IS NULL
     OR p_payload_hash IS NULL
     OR p_draft_payload_encrypted IS NULL
     OR p_policy_snapshot IS NULL
     OR p_oauth_state_hash IS NULL
     OR p_encrypted_oauth_state IS NULL
     OR p_state_expires_at IS NULL
     OR p_draft_expires_at IS NULL
     OR p_started_at IS NULL
     OR p_started_at > v_now + interval '5 seconds'
     OR p_started_at < v_now - interval '5 minutes'
     OR p_payload_hash !~ '^[0-9a-f]{64}$'
     OR p_browser_binding_hash !~ '^[0-9a-f]{64}$'
     OR p_oauth_state_hash !~ '^[0-9a-f]{64}$'
     OR p_policy_snapshot IS NULL
     OR p_policy_snapshot->>'bundleId' IS NULL
     OR p_policy_snapshot->>'bundleVersion' IS NULL
     OR p_policy_snapshot->>'bundleHash' !~ '^[0-9a-f]{64}$'
     OR p_policy_snapshot->'documents'->>'termsVersion' IS NULL
     OR p_policy_snapshot->'documents'->>'privacyVersion' IS NULL
     OR p_policy_snapshot->'documents'->>'instagramTermsVersion' IS NULL
     OR p_policy_snapshot->'documents'->>'collectionConsentVersion' IS NULL
     OR (p_policy_snapshot->'consents'->>'age')::boolean IS NOT TRUE
     OR (p_policy_snapshot->'consents'->>'terms')::boolean IS NOT TRUE
     OR (p_policy_snapshot->'consents'->>'privacy')::boolean IS NOT TRUE
     OR (p_policy_snapshot->'consents'->>'instagramData')::boolean IS NOT TRUE
     OR p_policy_snapshot->>'acceptedAt' IS NULL
     OR p_encrypted_oauth_state IS NULL
     OR p_state_expires_at <= p_started_at
     OR p_draft_expires_at <= p_started_at THEN
    RAISE EXCEPTION 'INVALID_START_INPUT' USING ERRCODE = '22023';
  END IF;

  PERFORM public.expire_onboarding_attempts_v2(p_browser_binding_hash, v_now);

  SELECT * INTO v_existing
    FROM public.onboarding_sessions
   WHERE browser_binding_hash = p_browser_binding_hash
     AND request_key = p_request_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_hash <> p_payload_hash
       OR v_existing.parent_attempt_id IS DISTINCT FROM p_parent_attempt_id THEN
      RETURN jsonb_build_object('kind', 'idempotency_conflict');
    END IF;
    IF v_existing.status = 'pending' AND v_existing.state_expires_at <= v_now THEN
      UPDATE public.onboarding_sessions
         SET status = 'expired',
             revision = revision + 1,
             state_invalidated_at = COALESCE(state_invalidated_at, v_now),
             oauth_state_encrypted = NULL,
             draft_payload_encrypted = NULL,
             failure_code = 'SESSION_EXPIRED',
             updated_at = v_now
       WHERE id = v_existing.id
       RETURNING * INTO v_existing;
    END IF;
    RETURN jsonb_build_object('kind', 'replayed', 'attempt', public.onboarding_attempt_to_json_v2(v_existing));
  END IF;

  SELECT count(*)::integer INTO v_recent_count
    FROM public.onboarding_sessions
   WHERE browser_binding_hash = p_browser_binding_hash
     AND started_at > v_now - interval '1 minute';
  IF v_recent_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = '22023';
  END IF;

  IF p_parent_attempt_id IS NOT NULL THEN
    SELECT * INTO v_parent
      FROM public.onboarding_sessions
     WHERE id = p_parent_attempt_id
       AND browser_binding_hash = p_browser_binding_hash
     FOR UPDATE;
    IF NOT FOUND
       OR v_parent.status <> 'cancelled'
       OR v_parent.failure_code <> 'OAUTH_CANCELLED'
       OR v_parent.draft_expires_at <= v_now
       OR v_parent.draft_payload_encrypted IS NULL
       OR v_parent.oauth_state_encrypted IS NOT NULL
       OR v_parent.oauth_code_encrypted IS NOT NULL
       OR v_parent.short_token_encrypted IS NOT NULL
       OR v_parent.long_token_encrypted IS NOT NULL
       OR v_parent.candidate_account IS NOT NULL
       OR v_parent.lease_owner IS NOT NULL
       OR v_parent.payload_hash IS DISTINCT FROM p_payload_hash
       OR v_parent.consent_snapshot IS DISTINCT FROM p_policy_snapshot THEN
      RETURN jsonb_build_object('kind', 'idempotency_conflict');
    END IF;
  END IF;

  SELECT * INTO v_active
    FROM public.onboarding_sessions
   WHERE browser_binding_hash = p_browser_binding_hash
     AND status IN (
       'pending','callback_received','exchanging_short','short_token_checkpointed',
       'exchanging_long','long_token_checkpointed','fetching_account',
       'awaiting_account_confirmation','saving'
     )
   ORDER BY started_at DESC, id DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    IF p_replace_attempt_id IS DISTINCT FROM v_active.id THEN
      IF v_active.status IN ('exchanging_short','short_token_checkpointed','exchanging_long',
        'long_token_checkpointed','fetching_account','saving') THEN
        RETURN jsonb_build_object('kind', 'active_processing');
      END IF;
      RETURN jsonb_build_object('kind', 'active_attempt_exists');
    END IF;
    IF v_active.status IN ('exchanging_short','short_token_checkpointed','exchanging_long',
      'long_token_checkpointed','fetching_account','saving')
      AND (v_active.lease_expires_at IS NULL OR v_active.lease_expires_at > p_started_at) THEN
      RETURN jsonb_build_object('kind', 'active_processing');
    END IF;
    UPDATE public.onboarding_sessions
       SET status = 'cancelled',
           revision = revision + 1,
           state_invalidated_at = COALESCE(state_invalidated_at, p_started_at),
           oauth_state_encrypted = NULL,
           oauth_code_encrypted = NULL,
           short_token_encrypted = NULL,
           long_token_encrypted = NULL,
           candidate_account = NULL,
           draft_payload_encrypted = NULL,
           lease_owner = NULL,
           lease_expires_at = NULL,
           failure_code = 'STALE_ATTEMPT',
           updated_at = p_started_at
     WHERE id = v_active.id;
  END IF;

  IF p_replace_attempt_id IS NOT NULL THEN
    UPDATE public.onboarding_sessions
       SET draft_payload_encrypted = NULL,
           updated_at = v_now
     WHERE id = p_replace_attempt_id
       AND browser_binding_hash = p_browser_binding_hash
       AND status = 'cancelled';
  END IF;

  INSERT INTO public.onboarding_sessions(
    id, browser_binding_hash, request_key, payload_hash, draft_payload_encrypted, consent_snapshot, parent_attempt_id,
    oauth_state_hash, oauth_state_encrypted, state_expires_at, draft_expires_at,
    status, stage, revision, started_at, updated_at
  )
  VALUES (
    p_attempt_id, p_browser_binding_hash, p_request_key, p_payload_hash, p_draft_payload_encrypted, p_policy_snapshot, p_parent_attempt_id,
    p_oauth_state_hash, p_encrypted_oauth_state, p_state_expires_at, p_draft_expires_at,
    'pending', 'account', 0, p_started_at, p_started_at
  )
  RETURNING * INTO v_created;

  RETURN jsonb_build_object('kind', 'created', 'attempt', public.onboarding_attempt_to_json_v2(v_created));
END;
$$;

CREATE OR REPLACE FUNCTION public.record_instagram_callback_code_v2(
  p_attempt_id uuid,
  p_browser_binding_hash text,
  p_encrypted_code jsonb,
  p_code_hash text,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
    FROM public.onboarding_sessions
   WHERE id = p_attempt_id
     AND browser_binding_hash = p_browser_binding_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.oauth_code_hash IS NOT NULL THEN
    IF v_attempt.oauth_code_hash = p_code_hash THEN
      RETURN public.onboarding_attempt_to_json_v2(v_attempt);
    END IF;
    RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status = 'completed' THEN
    RETURN public.onboarding_attempt_to_json_v2(v_attempt);
  END IF;
  IF v_attempt.status <> 'pending'
     OR v_attempt.state_expires_at <= p_now
     OR v_attempt.state_invalidated_at IS NOT NULL THEN
    RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
  END IF;
  UPDATE public.onboarding_sessions
     SET status = 'callback_received',
         oauth_code_encrypted = p_encrypted_code,
         oauth_code_hash = p_code_hash,
         oauth_state_encrypted = NULL,
         state_invalidated_at = p_now,
         revision = revision + 1,
         updated_at = p_now
   WHERE id = p_attempt_id
   RETURNING * INTO v_attempt;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_instagram_completion_lease_v2(
  p_attempt_id uuid,
  p_browser_binding_hash text,
  p_owner uuid,
  p_lease_expires_at timestamptz,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
    FROM public.onboarding_sessions
   WHERE id = p_attempt_id
     AND browser_binding_hash = p_browser_binding_hash
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_attempt.status = 'completed' THEN
    RETURN jsonb_build_object(
      'attempt', public.onboarding_attempt_to_json_v2(v_attempt),
      'owner', COALESCE(v_attempt.lease_owner, p_owner)::text,
      'fencingToken', v_attempt.fencing_token
    );
  END IF;
  IF v_attempt.draft_expires_at <= p_now OR v_attempt.status IN ('pending','failed','cancelled','expired') THEN
    RAISE EXCEPTION 'SESSION_EXPIRED' USING ERRCODE = '22023';
  END IF;
  IF v_attempt.lease_owner IS NOT NULL
     AND v_attempt.lease_owner IS DISTINCT FROM p_owner
     AND v_attempt.lease_expires_at > p_now THEN
    RAISE EXCEPTION 'ACTIVE_PROCESSING' USING ERRCODE = '55P03';
  END IF;
  UPDATE public.onboarding_sessions
     SET lease_owner = p_owner,
         lease_expires_at = p_lease_expires_at,
         fencing_token = fencing_token + 1,
         updated_at = p_now
   WHERE id = p_attempt_id
   RETURNING * INTO v_attempt;
  RETURN jsonb_build_object(
    'attempt', public.onboarding_attempt_to_json_v2(v_attempt),
    'owner', p_owner::text,
    'fencingToken', v_attempt.fencing_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.require_onboarding_lease_v2(
  p_attempt_id uuid,
  p_owner uuid,
  p_fencing_token bigint,
  p_now timestamptz
) RETURNS public.onboarding_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_attempt
    FROM public.onboarding_sessions
   WHERE id = p_attempt_id
     AND lease_owner = p_owner
     AND fencing_token = p_fencing_token
     AND lease_expires_at > p_now
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
  END IF;
  RETURN v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_instagram_code_exchange_begun_v2(
  p_attempt_id uuid,
  p_owner uuid,
  p_fencing_token bigint,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  PERFORM public.require_onboarding_lease_v2(p_attempt_id, p_owner, p_fencing_token, p_now);
  UPDATE public.onboarding_sessions
     SET status = 'exchanging_short', stage = 'account', revision = revision + 1, updated_at = p_now
   WHERE id = p_attempt_id
     AND status IN ('callback_received','short_token_checkpointed','long_token_checkpointed')
   RETURNING * INTO v_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001'; END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_instagram_short_token_v2(
  p_attempt_id uuid,
  p_owner uuid,
  p_fencing_token bigint,
  p_encrypted_short_token jsonb,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  PERFORM public.require_onboarding_lease_v2(p_attempt_id, p_owner, p_fencing_token, p_now);
  UPDATE public.onboarding_sessions
     SET status = 'short_token_checkpointed',
         short_token_encrypted = p_encrypted_short_token,
         stage = 'storage',
         revision = revision + 1,
         updated_at = p_now
   WHERE id = p_attempt_id
     AND status = 'exchanging_short'
   RETURNING * INTO v_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001'; END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_instagram_long_exchange_begun_v2(
  p_attempt_id uuid,
  p_owner uuid,
  p_fencing_token bigint,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  PERFORM public.require_onboarding_lease_v2(p_attempt_id, p_owner, p_fencing_token, p_now);
  UPDATE public.onboarding_sessions
     SET status = 'exchanging_long', stage = 'storage', revision = revision + 1, updated_at = p_now
   WHERE id = p_attempt_id
     AND status = 'short_token_checkpointed'
   RETURNING * INTO v_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001'; END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_instagram_long_token_v2(
  p_attempt_id uuid,
  p_owner uuid,
  p_fencing_token bigint,
  p_encrypted_long_token jsonb,
  p_token_metadata jsonb,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
BEGIN
  PERFORM public.require_onboarding_lease_v2(p_attempt_id, p_owner, p_fencing_token, p_now);
  UPDATE public.onboarding_sessions
     SET status = 'long_token_checkpointed',
         long_token_encrypted = p_encrypted_long_token,
         stage = 'storage',
         revision = revision + 1,
         updated_at = p_now
   WHERE id = p_attempt_id
     AND status = 'exchanging_long'
     AND p_token_metadata ? 'expiresAt'
     AND NULLIF(btrim(p_token_metadata->>'providerUserId'), '') IS NOT NULL
     AND p_token_metadata->>'accessTokenHash' ~ '^[0-9a-f]{64}$'
   RETURNING * INTO v_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001'; END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

CREATE OR REPLACE FUNCTION public.checkpoint_instagram_account_candidate_v2(
  p_attempt_id uuid,
  p_owner uuid,
  p_fencing_token bigint,
  p_account jsonb,
  p_token_metadata jsonb,
  p_payload jsonb,
  p_require_confirmation boolean,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt public.onboarding_sessions%ROWTYPE;
  v_candidate jsonb;
BEGIN
  SELECT * INTO v_attempt FROM public.require_onboarding_lease_v2(p_attempt_id, p_owner, p_fencing_token, p_now);
  v_candidate := jsonb_build_object(
    'enteredUsername', p_payload->>'instagramUsername',
    'connectedUsername', p_account->>'username',
    'account', p_account,
    'token', jsonb_build_object(
      'providerUserId', p_token_metadata->>'providerUserId',
      'expiresAt', p_token_metadata->>'expiresAt',
      'grantedScopes', COALESCE(p_token_metadata->'grantedScopes', '[]'::jsonb),
      'accessTokenHash', p_token_metadata->>'accessTokenHash'
    )
  );
  UPDATE public.onboarding_sessions
     SET status = CASE WHEN p_require_confirmation THEN 'awaiting_account_confirmation' ELSE 'saving' END,
         stage = CASE WHEN p_require_confirmation THEN 'account' ELSE 'submission' END,
         candidate_account = v_candidate,
         lease_owner = CASE WHEN p_require_confirmation THEN NULL ELSE lease_owner END,
         lease_expires_at = CASE WHEN p_require_confirmation THEN NULL ELSE lease_expires_at END,
         revision = revision + 1,
         updated_at = p_now
   WHERE id = p_attempt_id
     AND status IN ('long_token_checkpointed','fetching_account')
     AND p_account->>'providerAccountId' = p_token_metadata->>'providerUserId'
     AND p_token_metadata->>'accessTokenHash' ~ '^[0-9a-f]{64}$'
     AND p_token_metadata ? 'expiresAt'
   RETURNING * INTO v_attempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001'; END IF;
  RETURN public.onboarding_attempt_to_json_v2(v_attempt);
END;
$$;

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
           WHEN p_status = 'cancelled'
            AND p_code = 'OAUTH_CANCELLED'
            AND v_attempt.draft_expires_at > p_now
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

CREATE OR REPLACE FUNCTION public.complete_instagram_onboarding_v2(
  p_attempt_id uuid,
  p_browser_binding_hash text,
  p_owner uuid,
  p_fencing_token bigint,
  p_expected_revision integer,
  p_payload jsonb,
  p_account jsonb,
  p_access_token text,
  p_token_metadata jsonb,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.onboarding_sessions%ROWTYPE;
  v_user_id bigint;
  v_root_request_id uuid;
  v_request_id uuid;
  v_connection_kind text;
  v_review_status text;
  v_result jsonb;
  v_existing_token public.tokens%ROWTYPE;
  v_full_name text := p_payload->>'fullName';
  v_email text := p_payload->>'email';
  v_phone text := p_payload->>'phone';
  v_instagram_id text := p_account->>'providerAccountId';
  v_instagram_username text := p_account->>'username';
  v_access_token text := p_access_token;
  v_access_token_hash text;
  v_expires_at timestamptz;
  v_scopes text[];
  v_token_metadata jsonb;
  v_accepted_at timestamptz;
BEGIN
  SELECT * INTO v_session
    FROM public.onboarding_sessions
   WHERE id = p_attempt_id
     AND browser_binding_hash = p_browser_binding_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  IF v_session.status = 'completed' THEN
    IF v_session.receipt_expires_at IS NULL OR v_session.receipt_expires_at <= p_now THEN
      RAISE EXCEPTION 'RECEIPT_EXPIRED' USING ERRCODE = '22023';
    END IF;
    RETURN public.onboarding_attempt_to_json_v2(v_session);
  END IF;

  v_expires_at := (p_token_metadata->>'expiresAt')::timestamptz;
  v_scopes := ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_token_metadata->'grantedScopes', '[]'::jsonb)));
  v_accepted_at := (v_session.consent_snapshot->>'acceptedAt')::timestamptz;
  v_access_token_hash := public.onboarding_v2_sha256(p_access_token);
  v_token_metadata := jsonb_build_object(
    'providerUserId', p_token_metadata->>'providerUserId',
    'expiresAt', p_token_metadata->>'expiresAt',
    'grantedScopes', COALESCE(p_token_metadata->'grantedScopes', '[]'::jsonb),
    'accessTokenHash', v_access_token_hash
  );

  IF v_session.revision <> p_expected_revision
     OR v_session.status NOT IN ('saving','awaiting_account_confirmation')
     OR v_session.draft_expires_at <= p_now
     OR v_session.lease_owner IS DISTINCT FROM p_owner
     OR v_session.fencing_token <> p_fencing_token
     OR v_session.lease_expires_at IS NULL
     OR v_session.lease_expires_at <= p_now THEN
    RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
  END IF;

  IF NULLIF(btrim(v_instagram_id), '') IS NULL
     OR NULLIF(btrim(v_instagram_username), '') IS NULL
     OR NULLIF(btrim(v_access_token), '') IS NULL
     OR v_session.candidate_account IS NULL
     OR v_session.long_token_encrypted IS NULL
     OR v_session.candidate_account->'account' IS DISTINCT FROM jsonb_build_object(
          'providerAccountId', p_account->>'providerAccountId',
          'username', p_account->>'username',
          'accountType', p_account->>'accountType'
        )
     OR v_session.candidate_account->'token' IS DISTINCT FROM v_token_metadata
     OR p_account->>'providerAccountId' IS DISTINCT FROM p_token_metadata->>'providerUserId'
     OR NULLIF(btrim(v_full_name), '') IS NULL
     OR char_length(v_full_name) > 50
     OR NULLIF(btrim(v_email), '') IS NULL
     OR NULLIF(btrim(v_phone), '') IS NULL
     OR v_phone !~ '^\+82[1-9][0-9]{7,9}$'
     OR p_payload->>'requestKey' IS DISTINCT FROM v_session.request_key::text
     OR p_payload->>'policyBundleId' IS DISTINCT FROM v_session.consent_snapshot->>'bundleId'
     OR p_payload->>'instagramUsername' IS NULL
     OR (p_payload->'consents'->>'age')::boolean IS NOT TRUE
     OR (p_payload->'consents'->>'terms')::boolean IS NOT TRUE
     OR (p_payload->'consents'->>'privacy')::boolean IS NOT TRUE
     OR (p_payload->'consents'->>'instagramData')::boolean IS NOT TRUE
     OR v_expires_at <= p_now
     OR v_session.consent_snapshot->>'bundleId' IS NULL
     OR v_session.consent_snapshot->>'bundleVersion' IS NULL
     OR v_session.consent_snapshot->>'bundleHash' !~ '^[0-9a-f]{64}$'
     OR v_session.consent_snapshot->'documents'->>'termsVersion' IS NULL
     OR v_session.consent_snapshot->'documents'->>'privacyVersion' IS NULL
     OR v_session.consent_snapshot->'documents'->>'instagramTermsVersion' IS NULL
     OR v_session.consent_snapshot->'documents'->>'collectionConsentVersion' IS NULL
     OR (v_session.consent_snapshot->'consents'->>'age')::boolean IS NOT TRUE
     OR (v_session.consent_snapshot->'consents'->>'terms')::boolean IS NOT TRUE
     OR (v_session.consent_snapshot->'consents'->>'privacy')::boolean IS NOT TRUE
     OR (v_session.consent_snapshot->'consents'->>'instagramData')::boolean IS NOT TRUE
     OR v_accepted_at IS NULL THEN
    RAISE EXCEPTION 'INVALID_ONBOARDING_INPUT' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.users(instagram_id, instagram_username, updated_at)
  VALUES (v_instagram_id, v_instagram_username, p_now)
  ON CONFLICT (instagram_id) DO UPDATE
    SET instagram_username = EXCLUDED.instagram_username,
        updated_at = EXCLUDED.updated_at
  RETURNING id INTO v_user_id;

  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;

  SELECT * INTO v_existing_token
    FROM public.tokens
   WHERE user_id = v_user_id
     AND token_type = 'user'
   FOR UPDATE;

  IF FOUND AND public.onboarding_v2_attempt_is_older(
    v_session.started_at, v_session.id, v_existing_token.source_attempt_started_at, v_existing_token.source_attempt_id
  ) THEN
    RAISE EXCEPTION 'STALE_ATTEMPT' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.creator_profiles(
    user_id, full_name, email, phone_e164, email_verified, phone_verified,
    source_accepted_at, updated_at
  )
  VALUES (
    v_user_id,
    v_full_name,
    v_email,
    v_phone,
    false,
    false,
    v_accepted_at,
    p_now
  )
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        phone_e164 = EXCLUDED.phone_e164,
        email_verified = false,
        phone_verified = false,
        source_accepted_at = EXCLUDED.source_accepted_at,
        updated_at = EXCLUDED.updated_at
    WHERE public.creator_profiles.source_accepted_at <= EXCLUDED.source_accepted_at;

  INSERT INTO public.user_consents(
    user_id, state_nonce, consent_schema_version, terms_version, privacy_version,
    instagram_permissions_version, consent_age, consent_terms, consent_privacy,
    consent_instagram, accepted_at, bundle_hash
  )
  VALUES (
    v_user_id,
    'v2:' || p_attempt_id::text,
    1,
    v_session.consent_snapshot->'documents'->>'termsVersion',
    v_session.consent_snapshot->'documents'->>'privacyVersion',
    v_session.consent_snapshot->'documents'->>'instagramTermsVersion',
    true,
    true,
    true,
    true,
    v_accepted_at,
    v_session.consent_snapshot->>'bundleHash'
  )
  ON CONFLICT (state_nonce) DO NOTHING;

  INSERT INTO public.tokens(
    user_id, token_type, access_token, expires_at, created_at, connection_status,
    source_attempt_id, source_attempt_started_at, granted_scopes, scopes_checked_at,
    refresh_failure_count, last_refresh_error_code
  )
  VALUES (
    v_user_id, 'user', v_access_token, v_expires_at, p_now, 'connected',
    v_session.id, v_session.started_at, v_scopes, p_now, 0, NULL
  )
  ON CONFLICT (user_id, token_type) DO UPDATE
    SET access_token = EXCLUDED.access_token,
        expires_at = EXCLUDED.expires_at,
        created_at = EXCLUDED.created_at,
        connection_status = 'connected',
        source_attempt_id = EXCLUDED.source_attempt_id,
        source_attempt_started_at = EXCLUDED.source_attempt_started_at,
        granted_scopes = EXCLUDED.granted_scopes,
        scopes_checked_at = EXCLUDED.scopes_checked_at,
        refresh_failure_count = 0,
        last_refresh_error_code = NULL;

  SELECT id INTO v_root_request_id
    FROM public.onboarding_requests
   WHERE user_id = v_user_id
     AND connection_kind = 'new'
   ORDER BY received_at, id
   LIMIT 1
   FOR UPDATE;

  IF v_root_request_id IS NULL THEN
    v_connection_kind := 'new';
    v_review_status := 'pending_review';
  ELSE
    v_connection_kind := 'reconnection';
    v_review_status := 'not_requested';
  END IF;

  INSERT INTO public.onboarding_requests(
    user_id, session_id, instagram_id_snapshot, instagram_username_snapshot,
    contact_snapshot, connection_kind, initial_request_id, review_status, received_at
  )
  VALUES (
    v_user_id, v_session.id, v_instagram_id, v_instagram_username,
    jsonb_build_object(
      'fullName', v_full_name,
      'email', v_email,
      'phone', v_phone
    ),
    v_connection_kind, v_root_request_id, v_review_status, p_now
  )
  ON CONFLICT (session_id) DO UPDATE
    SET session_id = EXCLUDED.session_id
  RETURNING id INTO v_request_id;

  INSERT INTO public.notification_outbox(request_id, event_key)
  VALUES (v_request_id, 'creator.connected:' || v_request_id::text)
  ON CONFLICT (event_key) DO NOTHING;

  v_result := jsonb_build_object(
    'kind', 'v2',
    'requestId', v_request_id::text,
    'receivedAt', to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'fullName', v_full_name,
    'email', v_email,
    'phone', v_phone,
    'instagramUsername', v_instagram_username,
    'connectionKind', v_connection_kind,
    'analysisRequested', v_connection_kind = 'new',
    'reviewStatus', v_review_status
  );
  IF v_connection_kind = 'reconnection' THEN
    v_result := v_result || jsonb_build_object('initialRequestId', v_root_request_id::text);
  END IF;

  UPDATE public.onboarding_sessions
     SET status = 'completed',
         stage = 'submission',
         revision = revision + 1,
         request_id = v_request_id,
         receipt_expires_at = p_now + interval '24 hours',
         result = v_result,
         oauth_state_encrypted = NULL,
         oauth_code_encrypted = NULL,
         short_token_encrypted = NULL,
         long_token_encrypted = NULL,
         candidate_account = NULL,
         draft_payload_encrypted = NULL,
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = p_now
   WHERE id = v_session.id
   RETURNING * INTO v_session;

  RETURN public.onboarding_attempt_to_json_v2(v_session);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_notification_outbox_v2(
  p_owner uuid,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 90
) RETURNS TABLE(
  outbox_id text,
  request_id text,
  event_key text,
  full_name text,
  email text,
  phone text,
  instagram_username text,
  received_at text,
  is_reconnection boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT o.id
      FROM public.notification_outbox o
     WHERE (o.status = 'pending' AND o.next_attempt_at <= clock_timestamp())
        OR (o.status = 'processing' AND o.lease_expires_at <= clock_timestamp())
     ORDER BY o.next_attempt_at, o.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.notification_outbox o
       SET status = 'processing',
           attempts = o.attempts + 1,
           lease_owner = p_owner,
           lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
           updated_at = clock_timestamp()
      FROM due
     WHERE o.id = due.id
     RETURNING o.*
  )
  SELECT c.id::text, r.id::text, c.event_key,
         r.contact_snapshot->>'fullName',
         r.contact_snapshot->>'email',
         r.contact_snapshot->>'phone',
         r.instagram_username_snapshot,
         to_char(r.received_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
         r.connection_kind = 'reconnection'
    FROM claimed c
    JOIN public.onboarding_requests r ON r.id = c.request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_outbox_sent_v2(
  p_outbox_id uuid,
  p_owner uuid,
  p_delivery jsonb
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF jsonb_typeof(COALESCE(p_delivery->'accepted', '[]'::jsonb)) <> 'array'
     OR NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements_text(COALESCE(p_delivery->'accepted', '[]'::jsonb)) AS accepted(address)
        WHERE lower(accepted.address) = lower('dkssud374@celeblife.co.kr')
     ) THEN
    RAISE EXCEPTION 'SMTP_ACCEPTED_RECIPIENT_REQUIRED' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_outbox
     SET status = 'sent',
         sent_at = clock_timestamp(),
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_error_code = NULL,
         updated_at = clock_timestamp()
   WHERE id = p_outbox_id
     AND status = 'processing'
     AND lease_owner = p_owner
     AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_outbox_failed_v2(
  p_outbox_id uuid,
  p_owner uuid,
  p_error_code text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.notification_outbox
     SET status = CASE WHEN attempts >= 5 THEN 'dead' ELSE 'pending' END,
         next_attempt_at = clock_timestamp() + (make_interval(secs => LEAST(3600, 60 * GREATEST(attempts, 1)))),
         lease_owner = NULL,
         lease_expires_at = NULL,
         last_error_code = LEFT(COALESCE(NULLIF(p_error_code, ''), 'SMTP_SEND_FAILED'), 80),
         updated_at = clock_timestamp()
   WHERE id = p_outbox_id
     AND status = 'processing'
     AND lease_owner = p_owner
     AND lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_guarded_legacy_instagram_callback_v2(
  p_browser_binding_hash text,
  p_legacy_state_hash text,
  p_instagram_user_id text,
  p_instagram_username text,
  p_access_token text,
  p_expires_at timestamptz,
  p_granted_scopes text[],
  p_legacy_consent_snapshot jsonb,
  p_now timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id bigint;
  v_existing_v2_request public.onboarding_requests%ROWTYPE;
  v_nonce text := p_legacy_consent_snapshot->>'nonce';
  v_existing_consent public.user_consents%ROWTYPE;
  v_existing_consent_instagram_id text;
BEGIN
  IF p_browser_binding_hash IS NULL
     OR p_browser_binding_hash !~ '^[0-9a-f]{64}$'
     OR p_legacy_state_hash IS NULL
     OR p_legacy_state_hash !~ '^[0-9a-f]{64}$'
     OR NULLIF(btrim(p_instagram_user_id), '') IS NULL
     OR NULLIF(btrim(p_instagram_username), '') IS NULL
     OR NULLIF(btrim(p_access_token), '') IS NULL
     OR p_expires_at IS NULL
     OR p_expires_at <= p_now
     OR p_granted_scopes IS NULL
     OR p_legacy_consent_snapshot IS NULL
     OR (SELECT count(*) FROM jsonb_object_keys(p_legacy_consent_snapshot)) <> 11
     OR NULLIF(btrim(v_nonce), '') IS NULL
     OR (p_legacy_consent_snapshot->>'consentSchemaVersion')::integer <> 1
     OR p_legacy_consent_snapshot->>'termsVersion' IS NULL
     OR p_legacy_consent_snapshot->>'privacyVersion' IS NULL
     OR p_legacy_consent_snapshot->>'instagramPermissionsVersion' IS NULL
     OR (p_legacy_consent_snapshot->>'consentAge')::boolean IS NOT TRUE
     OR (p_legacy_consent_snapshot->>'consentTerms')::boolean IS NOT TRUE
     OR (p_legacy_consent_snapshot->>'consentPrivacy')::boolean IS NOT TRUE
     OR (p_legacy_consent_snapshot->>'consentInstagram')::boolean IS NOT TRUE
     OR p_legacy_consent_snapshot->>'acceptedAt' IS NULL
     OR p_legacy_consent_snapshot->>'bundleHash' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_LEGACY_CALLBACK_INPUT' USING ERRCODE = '22023';
  END IF;

  SELECT uc.* INTO v_existing_consent
    FROM public.user_consents uc
   WHERE uc.state_nonce = 'legacy:' || v_nonce
   FOR UPDATE;
  IF FOUND THEN
    SELECT instagram_id INTO v_existing_consent_instagram_id
      FROM public.users
     WHERE id = v_existing_consent.user_id
     FOR UPDATE;
  END IF;
  IF FOUND AND (
       v_existing_consent_instagram_id IS DISTINCT FROM p_instagram_user_id
       OR v_existing_consent.consent_schema_version <> 1
       OR v_existing_consent.terms_version IS DISTINCT FROM p_legacy_consent_snapshot->>'termsVersion'
       OR v_existing_consent.privacy_version IS DISTINCT FROM p_legacy_consent_snapshot->>'privacyVersion'
       OR v_existing_consent.instagram_permissions_version IS DISTINCT FROM p_legacy_consent_snapshot->>'instagramPermissionsVersion'
       OR v_existing_consent.consent_age IS NOT TRUE
       OR v_existing_consent.consent_terms IS NOT TRUE
       OR v_existing_consent.consent_privacy IS NOT TRUE
       OR v_existing_consent.consent_instagram IS NOT TRUE
       OR v_existing_consent.accepted_at IS DISTINCT FROM (p_legacy_consent_snapshot->>'acceptedAt')::timestamptz
       OR v_existing_consent.bundle_hash IS DISTINCT FROM p_legacy_consent_snapshot->>'bundleHash'
     ) THEN
    RAISE EXCEPTION 'LEGACY_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.users(instagram_id, instagram_username, updated_at)
  VALUES (p_instagram_user_id, p_instagram_username, p_now)
  ON CONFLICT (instagram_id) DO NOTHING
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id
      FROM public.users
     WHERE instagram_id = p_instagram_user_id
     FOR UPDATE;

    SELECT r.* INTO v_existing_v2_request
      FROM public.onboarding_requests r
     WHERE r.user_id = v_user_id
       AND r.connection_kind = 'new'
     ORDER BY r.received_at, r.id
     LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'redirectPath', '/complete',
        'result', jsonb_build_object(
          'kind', 'v2',
          'requestId', v_existing_v2_request.id::text,
          'receivedAt', public.onboarding_v2_rfc3339(v_existing_v2_request.received_at),
          'instagramUsername', v_existing_v2_request.instagram_username_snapshot,
          'connectionKind', v_existing_v2_request.connection_kind,
          'analysisRequested', true,
          'reviewStatus', v_existing_v2_request.review_status
        )
      );
    END IF;

    UPDATE public.users
       SET instagram_username = p_instagram_username,
           updated_at = p_now
     WHERE id = v_user_id;
  ELSE
    PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  END IF;

  INSERT INTO public.tokens(
    user_id, token_type, access_token, expires_at, created_at, connection_status,
    granted_scopes, scopes_checked_at, refresh_failure_count, last_refresh_error_code
  )
  VALUES (
    v_user_id, 'user', p_access_token, p_expires_at, p_now, 'connected',
    p_granted_scopes, p_now, 0, NULL
  )
  ON CONFLICT (user_id, token_type) DO UPDATE
    SET access_token = EXCLUDED.access_token,
        expires_at = EXCLUDED.expires_at,
        created_at = EXCLUDED.created_at,
        connection_status = 'connected',
        granted_scopes = EXCLUDED.granted_scopes,
        scopes_checked_at = EXCLUDED.scopes_checked_at,
        refresh_failure_count = 0,
        last_refresh_error_code = NULL;

  INSERT INTO public.user_consents(
    user_id, state_nonce, consent_schema_version, terms_version, privacy_version,
    instagram_permissions_version, consent_age, consent_terms, consent_privacy,
    consent_instagram, accepted_at, bundle_hash
  )
  VALUES (
    v_user_id,
    'legacy:' || v_nonce,
    1,
    p_legacy_consent_snapshot->>'termsVersion',
    p_legacy_consent_snapshot->>'privacyVersion',
    p_legacy_consent_snapshot->>'instagramPermissionsVersion',
    true,
    true,
    true,
    true,
    (p_legacy_consent_snapshot->>'acceptedAt')::timestamptz,
    p_legacy_consent_snapshot->>'bundleHash'
  )
  ON CONFLICT (state_nonce) DO NOTHING;

  RETURN jsonb_build_object('redirectPath', '/Dashboard');
END;
$$;

CREATE OR REPLACE FUNCTION public.list_token_refresh_candidates_v2(
  p_limit integer DEFAULT 25,
  p_days_before_expiry integer DEFAULT 7
) RETURNS TABLE(
  token_id text,
  user_id text,
  access_token text,
  row_version text,
  created_at text,
  expires_at text,
  connection_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id::text,
         t.user_id::text,
         t.access_token,
         t.row_version::text,
         t.created_at::text,
         t.expires_at::text,
         t.connection_status
    FROM public.tokens t
   WHERE t.token_type = 'user'
     AND t.connection_status IN ('connected','unknown')
     AND (
       t.created_at IS NULL
       OR t.expires_at IS NULL
       OR t.expires_at <= clock_timestamp()
       OR (
         t.created_at < clock_timestamp() - interval '24 hours'
         AND t.expires_at < clock_timestamp() + make_interval(days => p_days_before_expiry)
       )
     )
   ORDER BY
     CASE
       WHEN t.created_at IS NOT NULL
        AND t.created_at < clock_timestamp() - interval '24 hours'
        AND t.expires_at IS NOT NULL
        AND t.expires_at > clock_timestamp()
       THEN 0
       ELSE 1
     END,
     t.expires_at ASC NULLS LAST,
     t.id ASC
   LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.commit_token_refresh_success_v2(
  p_token_id text,
  p_expected_row_version text,
  p_expected_created_at timestamptz,
  p_expected_expires_at timestamptz,
  p_expected_connection_status text,
  p_access_token text,
  p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.tokens
     SET access_token = p_access_token,
         expires_at = p_expires_at,
         created_at = clock_timestamp(),
         last_refreshed_at = clock_timestamp(),
         last_refresh_attempt_at = clock_timestamp(),
         refresh_failure_count = 0,
         last_refresh_error_code = NULL,
         connection_status = CASE
           WHEN connection_status = 'connected' THEN 'connected'
           ELSE connection_status
         END
   WHERE id = p_token_id::bigint
     AND row_version = p_expected_row_version::bigint
     AND created_at IS NOT DISTINCT FROM p_expected_created_at
     AND expires_at IS NOT DISTINCT FROM p_expected_expires_at
     AND connection_status = p_expected_connection_status
     AND connection_status IN ('connected','unknown')
     AND p_access_token IS NOT NULL
     AND p_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_token_refresh_failure_v2(
  p_token_id text,
  p_expected_row_version text,
  p_expected_created_at timestamptz,
  p_expected_expires_at timestamptz,
  p_expected_connection_status text,
  p_error_code text,
  p_failure_kind text DEFAULT 'transient'
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.tokens
     SET last_refresh_attempt_at = clock_timestamp(),
         refresh_failure_count = refresh_failure_count + 1,
         last_refresh_error_code = LEFT(COALESCE(NULLIF(p_error_code, ''), 'TOKEN_REFRESH_FAILED'), 80),
         connection_status = CASE
           WHEN p_failure_kind IN ('expired','revoked','invalid_credentials') THEN 'reauth_required'
           ELSE connection_status
         END
   WHERE id = p_token_id::bigint
     AND row_version = p_expected_row_version::bigint
     AND created_at IS NOT DISTINCT FROM p_expected_created_at
     AND expires_at IS NOT DISTINCT FROM p_expected_expires_at
     AND connection_status = p_expected_connection_status
     AND connection_status IN ('connected','unknown');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_onboarding_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired integer;
  v_scrubbed integer;
  v_dead integer;
  v_deleted_receipts integer;
  v_deleted_terminal integer;
BEGIN
  UPDATE public.onboarding_sessions
     SET status = 'expired',
         revision = revision + 1,
         oauth_state_encrypted = NULL,
         oauth_code_encrypted = NULL,
         short_token_encrypted = NULL,
         long_token_encrypted = NULL,
         candidate_account = NULL,
         draft_payload_encrypted = NULL,
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
   WHERE status IN (
       'pending','callback_received','exchanging_short','short_token_checkpointed',
       'exchanging_long','long_token_checkpointed','fetching_account',
       'awaiting_account_confirmation','saving'
     )
     AND draft_expires_at <= clock_timestamp()
     AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp());
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  UPDATE public.onboarding_sessions
     SET oauth_state_encrypted = NULL,
         oauth_code_encrypted = NULL,
         short_token_encrypted = NULL,
         long_token_encrypted = NULL,
         candidate_account = NULL,
         draft_payload_encrypted = NULL,
         updated_at = clock_timestamp()
   WHERE status = 'completed'
     AND (
       oauth_state_encrypted IS NOT NULL OR oauth_code_encrypted IS NOT NULL
       OR short_token_encrypted IS NOT NULL OR long_token_encrypted IS NOT NULL
       OR candidate_account IS NOT NULL OR draft_payload_encrypted IS NOT NULL
     );
  GET DIAGNOSTICS v_scrubbed = ROW_COUNT;

  UPDATE public.notification_outbox
     SET status = 'dead',
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = clock_timestamp()
   WHERE status IN ('pending','processing')
     AND attempts >= 5;
  GET DIAGNOSTICS v_dead = ROW_COUNT;

  DELETE FROM public.onboarding_sessions
   WHERE status = 'completed'
     AND receipt_expires_at IS NOT NULL
     AND receipt_expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_deleted_receipts = ROW_COUNT;

  DELETE FROM public.onboarding_sessions
   WHERE status IN ('failed','cancelled','expired')
     AND draft_expires_at <= clock_timestamp();
  GET DIAGNOSTICS v_deleted_terminal = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_sessions', v_expired,
    'scrubbed_completed_sessions', v_scrubbed,
    'dead_notifications', v_dead,
    'deleted_expired_receipts', v_deleted_receipts,
    'deleted_terminal_sessions', v_deleted_terminal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_instagram_onboarding_v2(uuid,text,uuid,bigint,integer,jsonb,jsonb,text,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_v2_sha256(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_attempt_to_json_v2(public.onboarding_sessions) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_onboarding_attempts_v2(text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_active_onboarding_attempt_v2(text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_onboarding_attempt_v2(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_onboarding_attempt_by_request_key_v2(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_onboarding_attempt_by_state_v2(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_instagram_onboarding_v2(uuid,text,uuid,text,jsonb,jsonb,uuid,uuid,text,jsonb,timestamptz,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_instagram_callback_code_v2(uuid,text,jsonb,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_instagram_completion_lease_v2(uuid,text,uuid,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_onboarding_lease_v2(uuid,uuid,bigint,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_instagram_code_exchange_begun_v2(uuid,uuid,bigint,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_instagram_short_token_v2(uuid,uuid,bigint,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_instagram_long_exchange_begun_v2(uuid,uuid,bigint,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_instagram_long_token_v2(uuid,uuid,bigint,jsonb,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_instagram_account_candidate_v2(uuid,uuid,bigint,jsonb,jsonb,jsonb,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_instagram_onboarding_v2(uuid,text,text,text,timestamptz,uuid,bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_notification_outbox_v2(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_notification_outbox_sent_v2(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_notification_outbox_failed_v2(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_token_refresh_candidates_v2(integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_token_refresh_success_v2(text,text,timestamptz,timestamptz,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_token_refresh_failure_v2(text,text,timestamptz,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_job_lease_v2(text,uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_job_lease_v2(text,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_onboarding_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_v2_attempt_is_older(timestamptz,uuid,timestamptz,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboarding_v2_rfc3339(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_token_row_version_v2() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_guarded_legacy_instagram_callback_v2(text,text,text,text,text,timestamptz,text[],jsonb,timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_instagram_onboarding_v2(uuid,text,uuid,bigint,integer,jsonb,jsonb,text,jsonb,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.onboarding_v2_sha256(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.onboarding_attempt_to_json_v2(public.onboarding_sessions) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_onboarding_attempts_v2(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_active_onboarding_attempt_v2(text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_onboarding_attempt_v2(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_onboarding_attempt_by_request_key_v2(text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_onboarding_attempt_by_state_v2(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_instagram_onboarding_v2(uuid,text,uuid,text,jsonb,jsonb,uuid,uuid,text,jsonb,timestamptz,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_instagram_callback_code_v2(uuid,text,jsonb,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_instagram_completion_lease_v2(uuid,text,uuid,timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.require_onboarding_lease_v2(uuid,uuid,bigint,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_instagram_code_exchange_begun_v2(uuid,uuid,bigint,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_instagram_short_token_v2(uuid,uuid,bigint,jsonb,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_instagram_long_exchange_begun_v2(uuid,uuid,bigint,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_instagram_long_token_v2(uuid,uuid,bigint,jsonb,jsonb,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_instagram_account_candidate_v2(uuid,uuid,bigint,jsonb,jsonb,jsonb,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_instagram_onboarding_v2(uuid,text,text,text,timestamptz,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_notification_outbox_v2(uuid,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_outbox_sent_v2(uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_outbox_failed_v2(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_token_refresh_candidates_v2(integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_token_refresh_success_v2(text,text,timestamptz,timestamptz,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_token_refresh_failure_v2(text,text,timestamptz,timestamptz,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.try_acquire_job_lease_v2(text,uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_job_lease_v2(text,uuid,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_onboarding_v2() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_guarded_legacy_instagram_callback_v2(text,text,text,text,text,timestamptz,text[],jsonb,timestamptz) TO service_role;

COMMIT;
