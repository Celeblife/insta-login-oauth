/** Project policy ported from the observed legacy job; verify Meta requirements at implementation. */
const DAY = 86_400_000;
function timestamp(value) {
  if (typeof value !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(value)) return NaN;
  return Date.parse(value);
}
export function tokenRefreshDecision({savedAt,expiresAt,now,daysBeforeExpiry=7}) {
  const n=timestamp(now), saved=timestamp(savedAt), expiry=timestamp(expiresAt);
  if (!Number.isFinite(n)) throw new Error('INVALID_NOW');
  if (!Number.isFinite(daysBeforeExpiry) || daysBeforeExpiry<=0) throw new Error('INVALID_THRESHOLD');
  if (!Number.isFinite(expiry)) return 'metadata_missing';
  if (expiry<=n) return 'reauth_required';
  if (!Number.isFinite(saved) || saved>n) return 'metadata_missing';
  if (saved>n-DAY) return 'too_new';
  return expiry<n+daysBeforeExpiry*DAY ? 'refresh' : 'not_due';
}
export function expiryFromResponse(response,now) {
  const n=timestamp(now);
  if (!Number.isFinite(n)) throw new Error('INVALID_NOW');
  if (response===null || typeof response!=='object' || Array.isArray(response)
      || typeof response.access_token!=='string' || !response.access_token.trim()
      || !Number.isSafeInteger(response.expires_in) || response.expires_in<=0) {
    throw new Error('INVALID_TOKEN_RESPONSE');
  }
  const result=n+response.expires_in*1000;
  if (!Number.isSafeInteger(result) || Math.abs(result)>8.64e15) throw new Error('INVALID_TOKEN_EXPIRY');
  return new Date(result).toISOString();
}
// Caller must additionally compare the returned expiry with prior expiry and perform DB CAS.
// This module does not refresh, store, or expose any token.
