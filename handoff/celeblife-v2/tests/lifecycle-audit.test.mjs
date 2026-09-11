import test from 'node:test';
import assert from 'node:assert/strict';
import {canRestoreDraft,canCommitRefresh,canStartRefreshForStatus} from '../server-reference/lifecycle-policy.mjs';
const draft={sameBrowser:true,draftPresent:true,status:'cancelled',reason:'OAUTH_CANCELLED',originalDraftExpiresAtMs:1800000,nowMs:300000};
test('voluntary provider cancel preserves only bound unexpired form draft',()=>assert.equal(canRestoreDraft(draft),true));
test('cancelled draft cannot be read by another browser',()=>assert.equal(canRestoreDraft({...draft,sameBrowser:false}),false));
test('draft expiry boundary denies access',()=>assert.equal(canRestoreDraft({...draft,nowMs:1800000}),false));
test('repeated draft checks do not extend original expiry',()=>{
 const copy=structuredClone(draft);for(const nowMs of [300000,1799999,1800000,1900000])assert.equal(canRestoreDraft({...copy,nowMs}),nowMs<1800000);
 assert.deepEqual(copy,draft);
});
test('deleted/replaced/expired data cannot be restored despite leftover ciphertext',()=>{
 for(const reason of ['PRIVACY_ERASED','ATTEMPT_REPLACED','DRAFT_EXPIRED'])assert.equal(canRestoreDraft({...draft,reason}),false);
});
test('completed and expired attempts do not expose draft',()=>{
 for(const status of ['completed','expired'])assert.equal(canRestoreDraft({...draft,status}),false);
});
test('unknown cancellation reason fails closed',()=>assert.equal(canRestoreDraft({...draft,reason:undefined}),false));
test('missing payload cannot be called recoverable',()=>assert.equal(canRestoreDraft({...draft,draftPresent:false}),false));
test('recoverable storage error permits bound draft',()=>assert.equal(canRestoreDraft({...draft,status:'failed',reason:'STORAGE_UNAVAILABLE'}),true));
test('unknown state or invalid clock fails closed',()=>{
 assert.equal(canRestoreDraft({...draft,status:'anything'}),false);assert.equal(canRestoreDraft({...draft,nowMs:NaN}),false);
});
const snapshot={tokenId:'9007199254740993',rowVersion:'7',connectionStatus:'connected'};
test('eligible same-row same-security-version refresh guard succeeds',()=>assert.equal(canCommitRefresh({snapshot,current:{...snapshot}}),true));
test('status-only revoke blocks even before version correction',()=>assert.equal(canCommitRefresh({snapshot,current:{...snapshot,connectionStatus:'revoked'}}),false));
test('proper revoke generation bump invalidates old worker',()=>assert.equal(canCommitRefresh({snapshot,current:{...snapshot,rowVersion:'8',connectionStatus:'revoked'}}),false));
test('new grant after revoke still blocks pre-revoke snapshot',()=>assert.equal(canCommitRefresh({snapshot,current:{...snapshot,rowVersion:'9'}}),false));
test('permissions-only version change rejects stale refresh',()=>assert.equal(canCommitRefresh({snapshot,current:{...snapshot,rowVersion:'8'}}),false));
test('deleted row is not eligible for refresh recreation',()=>assert.equal(canCommitRefresh({snapshot,current:null}),false));
test('different row or unsafe number boundary is rejected',()=>{
 assert.equal(canCommitRefresh({snapshot,current:{...snapshot,tokenId:'9007199254740994'}}),false);
 assert.equal(canCommitRefresh({snapshot,current:{...snapshot,rowVersion:7}}),false);
});
test('revoked/reauth-required/unknown status spelling is not started',()=>{
 for(const status of ['revoked','reauth_required','made_up',undefined])assert.equal(canStartRefreshForStatus(status),false);
});
test('approved legacy unknown can be refreshed without status promotion',()=>{
 const legacy={...snapshot,connectionStatus:'unknown'};const current={...legacy};
 assert.equal(canCommitRefresh({snapshot:legacy,current}),true);assert.equal(current.connectionStatus,'unknown');
 assert.equal(canCommitRefresh({snapshot:legacy,current:{...current,connectionStatus:'connected'}}),false);
});
test('noncanonical or overflowing SQL BIGINT values fail closed',()=>{
 for(const rowVersion of ['07','-1','9223372036854775808','7.0'])assert.equal(canCommitRefresh({snapshot,current:{...snapshot,rowVersion}}),false);
});
