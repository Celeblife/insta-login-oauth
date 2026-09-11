/** Pure reference functions. No API/DB calls. The real app must validate again server-side. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const plain = x => typeof x === 'string' ? x.trim() : '';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);

export function normalizeInstagram(value) {
  return plain(value).replace(/^@+/, '').toLowerCase();
}
export function normalizeKoreanPhone(value) {
  const text = plain(value);
  if (!text || text.length > 30 || !/^[+0-9() -]+$/.test(text)) return null;
  const compact = text.replace(/[() -]/g, '');
  // Product scope: Korean contact numbers. Formatting validity is NOT ownership verification.
  if (/^0[1-9]\d{7,9}$/.test(compact)) return '+82' + compact.slice(1);
  if (/^\+82[1-9]\d{7,9}$/.test(compact)) return compact;
  return null;
}
export function validateStart(input, expectedPolicyBundleId) {
  if (!object(input)) return { ok:false, errors:{ form:'잘못된 요청입니다.' } };
  if (typeof expectedPolicyBundleId !== 'string' || !expectedPolicyBundleId.trim()) {
    throw new Error('SERVER_POLICY_BUNDLE_NOT_CONFIGURED');
  }
  const errors = {};
  const fullName = plain(input.fullName);
  const email = plain(input.email);
  const phone = normalizeKoreanPhone(input.phone);
  const instagramUsername = normalizeInstagram(input.instagramUsername);
  if (!fullName || fullName.length > 50 || CONTROL.test(fullName)) errors.fullName='이름을 확인해 주세요.';
  if (!email || email.length > 254 || CONTROL.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) errors.email='이메일 주소를 확인해 주세요.';
  if (!phone) errors.phone='연락 가능한 전화번호를 확인해 주세요.';
  if (!/^[a-z0-9_][a-z0-9_.]{0,29}$/.test(instagramUsername)) errors.instagramUsername='인스타그램 아이디를 확인해 주세요.';
  if (typeof input.requestKey !== 'string' || !UUID.test(input.requestKey)) errors.requestKey='유효한 요청 식별자가 필요합니다.';
  if (input.replaceAttemptId !== undefined && (typeof input.replaceAttemptId !== 'string' || !UUID.test(input.replaceAttemptId))) errors.replaceAttemptId='유효한 이전 작업 식별자가 필요합니다.';
  if (input.policyBundleId !== expectedPolicyBundleId) errors.policyBundleId='최신 동의 내용을 다시 확인해 주세요.';
  const fields=['age','terms','privacy','instagramData'];
  if (!object(input.consents) || fields.some(key=>input.consents[key] !== true)) errors.consents='필수 동의 항목을 확인해 주세요.';
  if (Object.keys(errors).length) return {ok:false, errors};
  // Explicit projection: unexpected properties such as accessToken are never carried forward.
  return {ok:true,value:{requestKey:input.requestKey.toLowerCase(),policyBundleId:expectedPolicyBundleId,
    fullName,email,phone,instagramUsername,consents:Object.fromEntries(fields.map(key=>[key,true])),
    ...(input.replaceAttemptId === undefined ? {} : {replaceAttemptId:input.replaceAttemptId.toLowerCase()})}};
}
