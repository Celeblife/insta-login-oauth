/** Pure decisions, NOT authorization/DB locking. Call only after server binding checks. */
const hash = s => typeof s==='string' && /^[0-9a-f]{64}$/.test(s);
const iso = s => typeof s==='string' && /(Z|[+-]\d\d:\d\d)$/.test(s) ? Date.parse(s) : NaN;
export function startReplayDecision({payloadHash,storedPayloadHash,status,stateExpiresAt,now}) {
 if(!hash(payloadHash)||!hash(storedPayloadHash)||!Number.isFinite(iso(now))) throw new Error('INVALID_REPLAY_INPUT');
 if(payloadHash!==storedPayloadHash) return 'idempotency_conflict';
 if(status==='completed') return 'resume_complete';
 if(['oauth_returned','exchanging','saving','awaiting_account_confirmation'].includes(status)) return 'resume_connecting';
 if(['failed','cancelled','expired'].includes(status)) return 'restart_required';
 if(status!=='pending') throw new Error('INVALID_ATTEMPT_STATUS');
 const expiry=iso(stateExpiresAt);
 if(!Number.isFinite(expiry)) throw new Error('INVALID_STATE_EXPIRY');
 return expiry>iso(now) ? 'same_authorize_url' : 'restart_required';
}
export function confirmationMatches({requestedAttemptId,activeAttemptId,expectedRevision,revision,status}) {
 return typeof requestedAttemptId==='string' && requestedAttemptId.length>0 && requestedAttemptId===activeAttemptId
  && Number.isSafeInteger(expectedRevision) && expectedRevision>=0 && Number.isSafeInteger(revision)
  && expectedRevision===revision && status==='awaiting_account_confirmation';
}
export function canReplaceAttempt(status) {
 if(['exchanging','saving'].includes(status)) return false;
 if(['pending','oauth_returned','awaiting_account_confirmation','failed','cancelled','expired','completed'].includes(status)) return true;
 throw new Error('INVALID_ATTEMPT_STATUS');
}
const PUBLIC_STATUSES = new Set(['idle','awaiting_oauth','processing',
 'account_confirmation_required','completed','failed']);
/** Apply only after validating the public response schema.
 * Handle authorization loss / receipt expiry separately: clear private UI on 401/403/410.
 * This guard prevents stale/inconsistent status data from undoing a committed receipt;
 * it is not authorization and must not suppress a real session-expiry response.
 */
export function shouldAcceptStatus({expectedAttemptId,receivedAttemptId,currentRevision,receivedRevision,
 currentStatus,receivedStatus}) {
 if (!PUBLIC_STATUSES.has(currentStatus) || !PUBLIC_STATUSES.has(receivedStatus)) return false;
 if (currentStatus==='completed' && receivedStatus!=='completed') return false;
 return typeof expectedAttemptId==='string' && expectedAttemptId.length>0
  && expectedAttemptId===receivedAttemptId
  && Number.isSafeInteger(currentRevision) && currentRevision>=0
  && Number.isSafeInteger(receivedRevision) && receivedRevision>=currentRevision;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Reference parser for server-produced ISO timestamps, precision 0..6 fractional digits.
 * SQL TIMESTAMPTZ comparison is authoritative; never reduce it to JS milliseconds.
 * Not a general-purpose user date parser. Extra precision is rejected, never truncated.
 */
function orderedAttempt(value) {
 if (!value || typeof value!=='object' || typeof value.id!=='string' || !UUID.test(value.id)
     || typeof value.startedAt!=='string') throw new Error('INVALID_ATTEMPT_ORDER');
 const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value.startedAt);
 if (!m) throw new Error('INVALID_ATTEMPT_ORDER');
 const localMs=Date.parse(m[1]+'Z');
 // Reject normalized impossible dates, 24:00, missing zones and invalid offsets.
 if (!Number.isFinite(localMs) || new Date(localMs).toISOString().slice(0,19)!==m[1]) {
  throw new Error('INVALID_ATTEMPT_ORDER');
 }
 let offsetMinutes=0;
 if (m[3]!=='Z') {
  const hours=Number(m[3].slice(1,3)), minutes=Number(m[3].slice(4,6));
  if (hours>23 || minutes>59) throw new Error('INVALID_ATTEMPT_ORDER');
  offsetMinutes=(hours*60+minutes)*(m[3][0]==='+'?1:-1);
 }
 const epochUs=BigInt(localMs)*1000n+BigInt((m[2]??'').padEnd(6,'0'))
  - BigInt(offsetMinutes)*60_000_000n;
 return {epochUs,id:value.id.toLowerCase()};
}
export function isOlderAttempt(candidate,current) {
 const a=orderedAttempt(candidate);
 if (current===null) return false;
 const b=orderedAttempt(current);
 return a.epochUs<b.epochUs || (a.epochUs===b.epochUs && a.id<b.id);
}
