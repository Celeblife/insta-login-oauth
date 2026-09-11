// MODELS of v1.3.1 specification clauses, not a running application or DB.
// Synthetic token markers only. This demonstrates insufficiency, not an observed incident.
import fs from 'node:fs';
const a={version:7,status:'connected',token:'FAKE_TOKEN_A',expiry:'2026-09-15T00:00:00Z'};
const revoked={...a,status:'revoked'};
// v1.3.1 explicitly lists token/expiry as version-trigger change conditions.
const v131FieldsChanged=(x,y)=>x.token!==y.token||x.expiry!==y.expiry;
if(v131FieldsChanged(a,revoked))revoked.version++;
const literalCasAllowsWrite=a.version===revoked.version && a.expiry===revoked.expiry;
const v132SecurityChanged=(x,y)=>v131FieldsChanged(x,y)||x.status!==y.status;
const guarded={...a,status:'revoked'};
if(v132SecurityChanged(a,guarded))guarded.version++;
const fixedAllowsWrite=a.version===guarded.version && ['connected','unknown'].includes(guarded.status);
const cancel={status:'cancelled',bound:true,draftExpiresAt:'2026-09-10T00:30:00Z',now:'2026-09-10T00:05:00Z'};
const blanketCancelledReadForbidden=false;
const recoverableDraftRequired=cancel.bound&&cancel.now<cancel.draftExpiresAt;
const report={scope:'counterexample models of conflicting/insufficient written predicates; no production code/SQL executed',
 revocation:{baselineSnapshot:a,afterRevoke:revoked,literalCasAllowsWrite,afterVersioning:guarded,fixedAllowsWrite},
 cancellation:{blanketCancelledReadForbidden,uiRestorationRequirement:recoverableDraftRequired,contradiction:blanketCancelledReadForbidden!==recoverableDraftRequired}};
fs.writeFileSync(new URL('../verification/deep-audit/lifecycle-counterexamples.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
