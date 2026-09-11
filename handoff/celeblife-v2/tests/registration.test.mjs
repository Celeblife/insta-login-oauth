import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationDecision } from '../server-reference/registration-policy.mjs';
import { buildNotification } from '../server-reference/notification.mjs';

const facts = (initial=false, completed=false) => ({
  hasInitialV2Request: initial, attemptAlreadyCompleted: completed
});

test('first real v2 registration creates one initial analysis request', () => {
  assert.deepEqual(registrationDecision(facts()), {
    action:'initial_registration', createReceipt:true, createAnalysisRequest:true,
    enqueueNotification:true, connectionKind:'new', reviewStatus:'pending_review'
  });
});
test('an existing legacy account without a v2 initial request is still first submission', () => {
  const r=registrationDecision({...facts(), legacyUserExists:true});
  assert.equal(r.action,'initial_registration');
  assert.equal(r.createAnalysisRequest,true);
});
test('reconnection creates a receipt but no new analysis request', () => {
  const r=registrationDecision(facts(true));
  assert.equal(r.connectionKind,'reconnection');
  assert.equal(r.reviewStatus,'not_requested');
  assert.equal(r.createReceipt,true);
  assert.equal(r.createAnalysisRequest,false);
  assert.equal(r.enqueueNotification,true);
});
for (const initial of [false, true]) {
  test(`completed attempt is reused, root=${initial}`, () => {
    assert.deepEqual(registrationDecision(facts(initial,true)), {
      action:'reuse_existing_result',createReceipt:false,
      createAnalysisRequest:false,enqueueNotification:false
    });
  });
}
test('same contacts never affect server account classification', () => {
  const a=registrationDecision({...facts(), email:'same@example.com', phone:'+821000000000'});
  assert.equal(a.createAnalysisRequest,true);
});
for (const bad of [null,[],{}, {hasInitialV2Request:'false',attemptAlreadyCompleted:false},
  {hasInitialV2Request:false,attemptAlreadyCompleted:1}]) {
  test(`invalid server facts are rejected: ${JSON.stringify(bad)}`,()=>{
    assert.throws(()=>registrationDecision(bad), /INVALID_REGISTRATION_FACTS/);
  });
}
const mail={requestId:'a33717b1-8009-40e4-a9a9-5d4e4ed4906d',fullName:'김셀럽',
  email:'creator@example.com',phone:'+821000000000',instagramUsername:'demo',
  receivedAt:'2026-09-10T06:00:00.000Z'};
test('reconnection mail does not claim another pending analysis',()=>{
  const r=buildNotification({...mail,isReconnection:true});
  assert.match(r.subject,/재연동/);assert.match(r.text,/신규 분석 신청 없음/);
  assert.doesNotMatch(r.text,/담당자 확인 대기/);
});
test('initial mail keeps the pending review message',()=>{
  assert.match(buildNotification(mail).text,/담당자 확인 대기/);
});
test('a string reconnection flag is rejected',()=>{
  assert.throws(()=>buildNotification({...mail,isReconnection:'true'}),/INVALID_RECONNECTION_FLAG/);
});
