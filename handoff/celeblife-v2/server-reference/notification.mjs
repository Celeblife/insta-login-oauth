/** Builds an internal notification only; SMTP transport and recipient configuration are server-only. */
const CONTROL=/[\u0000-\u001f\u007f]/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safe(value,limit=254) {
  if(typeof value!=='string'||!value.trim()||value.length>limit||CONTROL.test(value)) throw new Error('INVALID_NOTIFICATION_FIELD');
  return value.trim();
}
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function buildNotification(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new Error('INVALID_NOTIFICATION');
  const requestId=safe(input.requestId,36);
  if(!UUID.test(requestId)) throw new Error('INVALID_REQUEST_ID');
  const fullName=safe(input.fullName,50), email=safe(input.email), phone=safe(input.phone,30);
  const username=safe(input.instagramUsername,30);
  if(!/^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(username)) throw new Error('INVALID_USERNAME');
  const receivedAt=safe(input.receivedAt,40), time=Date.parse(receivedAt);
  if(!/(Z|[+-]\d\d:\d\d)$/.test(receivedAt)||!Number.isFinite(time)) throw new Error('INVALID_RECEIVED_AT');
  const timeKst=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(time));
  if (input.isReconnection !== undefined && typeof input.isReconnection !== 'boolean') {
    throw new Error('INVALID_RECONNECTION_FLAG');
  }
  const isReconnection = input.isReconnection === true;
  const kind = isReconnection ? '재연동' : '신규 등록';
  const status = isReconnection
    ? '연결 정보 갱신 / 신규 분석 신청 없음'
    : '연동 완료 / 담당자 확인 대기';
  const subject=`[셀럽라이프] ${kind} 접수 — @${username}`;
  const pairs=[['이름',fullName],['인스타그램','@'+username],['이메일',email],['연락처',phone],['접수번호',requestId],['접수시각',timeKst+' (KST)'],['상태',status]];
  return {subject,text:pairs.map(([k,v])=>`${k}: ${v}`).join('\n'),
    html:'<h2>'+escapeHtml(subject)+'</h2><table>'+pairs.map(([k,v])=>`<tr><th align="left">${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`).join('')+'</table>',
    eventKey:`creator.connected:${requestId}`,
    messageIdLocal:`celeblife-${requestId}`};
}
// Do not use user input for To/From or Message-ID domain. The durable outbox retries attempts;
// SMTP may duplicate delivery and permanent delivery failure remains possible.
// Deterministic IDs reduce duplicate risk; they do not guarantee receipt or exactly-once delivery.
