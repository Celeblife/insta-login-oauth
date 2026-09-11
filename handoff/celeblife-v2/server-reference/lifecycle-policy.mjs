/** v1.3.2 narrow reference predicates, NOT authentication, SQL, a worker, or a provider adapter.
 * Caller supplies server-derived facts. DB atomic predicates and triggers remain mandatory.
 */
const ACTIVE = new Set(['pending','oauth_returned','exchanging','saving','awaiting_account_confirmation']);
/** Draft means already-consented form data, never an OAuth code/token.
 * Millisecond arguments are for this policy model only; real expiry checks happen in SQL.
 * The original deadline is immutable; this function cannot extend it.
 */
export function canRestoreDraft({sameBrowser, draftPresent, status, reason,
  originalDraftExpiresAtMs, nowMs} = {}) {
  if (sameBrowser !== true || draftPresent !== true
    || !Number.isSafeInteger(originalDraftExpiresAtMs) || !Number.isSafeInteger(nowMs)
    || nowMs >= originalDraftExpiresAtMs) return false;
  if (['ATTEMPT_REPLACED','PRIVACY_ERASED','DRAFT_EXPIRED'].includes(reason)) return false;
  if (status === 'cancelled') return reason === 'OAUTH_CANCELLED';
  if (status === 'failed') return new Set(['OAUTH_CANCELLED','REAUTH_REQUIRED',
    'PROVIDER_UNAVAILABLE','STORAGE_UNAVAILABLE','PERMISSIONS_REQUIRED','UNSUPPORTED_ACCOUNT']).has(reason);
  return ACTIVE.has(status);
}
const MAX_I64 = 9223372036854775807n;
function decimal(value, positive = false) {
  if (typeof value !== 'string' || value.length > 19 || !/^(0|[1-9][0-9]*)$/.test(value)) return false;
  const n = BigInt(value);
  return n <= MAX_I64 && (!positive || n > 0n);
}
/** Unknown legacy is allowed only AFTER the separately approved legacy/config/time gates.
 * A successful refresh does not promote 'unknown' to 'connected'.
 */
export function canStartRefreshForStatus(status) {
  return status === 'connected' || status === 'unknown';
}
/** Model of current-row CAS guard; tokenId and rowVersion are SQL TEXT, not JS numbers.
 * Actual implementation must perform this check INSIDE the UPDATE, not read-then-write.
 * Grant/status/source changes must increment the DB version. Never upsert a missing row.
 */
export function canCommitRefresh({snapshot, current} = {}) {
  if (!snapshot || !current || !decimal(snapshot.tokenId,true) || !decimal(current.tokenId,true)
    || !decimal(snapshot.rowVersion) || !decimal(current.rowVersion)) return false;
  return snapshot.tokenId === current.tokenId && snapshot.rowVersion === current.rowVersion
    && snapshot.connectionStatus === current.connectionStatus
    && canStartRefreshForStatus(snapshot.connectionStatus)
    && canStartRefreshForStatus(current.connectionStatus);
}
