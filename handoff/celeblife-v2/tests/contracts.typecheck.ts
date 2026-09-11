import type { StartRequest, StartResponse, StatusResponse, SubmittedResult, ConfirmAccountRequest } from '../contracts/onboarding.js';
const id='b1c9a751-283b-4e88-97cc-8229c74059d4';
const base={kind:'v2' as const,requestId:id,receivedAt:'2026-09-10T00:00:00Z',fullName:'Test',email:'creator@example.com',phone:'+821000000000',instagramUsername:'test'};
const initial={...base,connectionKind:'new',analysisRequested:true,reviewStatus:'pending_review'} satisfies SubmittedResult;
const reconnect={...base,connectionKind:'reconnection',analysisRequested:false,reviewStatus:'not_requested',initialRequestId:id} satisfies SubmittedResult;
const statuses: StatusResponse[]=[
 {status:'idle',attemptId:null,revision:0},
 {status:'awaiting_oauth',attemptId:id,revision:1,expiresAt:'2026-09-10T01:00:00Z'},
 {status:'processing',attemptId:id,revision:2,stage:'submission',retryAfterMs:2000,submissionIntent:'unknown'},
 {status:'account_confirmation_required',attemptId:id,revision:3,enteredUsername:'typed',connectedUsername:'actual'},
 {status:'completed',attemptId:id,revision:4,result:initial},
 {status:'completed',attemptId:id,revision:5,result:reconnect},
 {status:'failed',attemptId:id,revision:6,code:'SESSION_EXPIRED',retryAction:'return_form',draftAvailable:false},
];
const start:StartResponse={action:'resume',attemptId:id,revision:4,nextPath:'/complete'};
const confirm:ConfirmAccountRequest={attemptId:id,expectedRevision:3,accept:true};
// @ts-expect-error Reconnection cannot create a new analysis.
const invalidReconnection:SubmittedResult={...reconnect,analysisRequested:true};
// @ts-expect-error Client cannot confirm a candidate without its revision.
const invalidConfirmation:ConfirmAccountRequest={attemptId:id,accept:true};
// @ts-expect-error A raw token is never part of a public receipt.
const leaked:SubmittedResult={...initial,accessToken:'fixture-never-real'};
// @ts-expect-error Caller cannot set completion on a start request.
const wrongStart:StartRequest={completed:true};
void [statuses,start,confirm,invalidReconnection,invalidConfirmation,leaked,wrongStart];
