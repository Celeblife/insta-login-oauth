# API 연결 계약 — v1.2 FINAL

실행된 서버가 아닌 구현 계약이다. 정식 타입은 `onboarding.ts`. 모든 브라우저 API는 same-origin, no-store, 안전한 오류 매핑을 사용한다. 일반 POST는 JSON + `X-CSRF-Token` + 정확한 Origin/Fetch Metadata + HttpOnly cookie 바인딩을 확인한다. **외부 OAuth callback은 cross-site GET이므로 Origin 일치 검사를 적용하지 않고 state+cookie로 검증**한다. 내부 Cron은 별도 Bearer secret/운영 가드로 인증한다.

| 경로 | 입력 | 성공 | 실패/의미 |
|---|---|---|---|
| GET bootstrap | cookie | csrfToken/policyBundleId/허용된 activeAttempt/draft | 유효 cookie를 반복 교체하지 않음 |
| POST start | StartRequest | 201 최초, 200 같은 요청; StartResponse | 다른 입력 같은 키409; 암호화 state 재사용 |
| GET auth/callback | 제공자 code/state 또는 error | 303 /connecting?attemptId=UUID 또는 안전한 완료/오류 경로 | OAuth code/state·PII 전달 금지; 검증된 attemptId만 허용 |
| POST complete | `{attemptId}` | 200 완료/확인필요, 202 진행 중 | 비밀 token/client account ID 입력 금지 |
| GET status | `?attemptId=UUID` | StatusResponse | UUID만으로 권한 없음; 타인 조회차단 |
| POST confirm-account | `{attemptId,expectedRevision,accept:true}` | complete와 같은 응답 | stale revision409 |
| POST restart | `{attemptId,requestKey}` | StartResponse | processing 재시작409; 정책 변경 시 폼 |

## 1. 폼 제출

```json
{"requestKey":"b1c9a751-283b-4e88-97cc-8229c74059d4","policyBundleId":"approved-bundle","fullName":"김셀럽","email":"creator@example.com","phone":"010-0000-0000","instagramUsername":"celeblife_demo","consents":{"age":true,"terms":true,"privacy":true,"instagramData":true}}
```

같은 requestKey로 입력값을 바꾸지 않는다. 입력 수정/명시적 새 시도에는 새 UUID를 만든다. 다른 활성 attempt가 있으면 안내 후 `replaceAttemptId`를 start에 명시할 수 있으나 서버 exchanging/saving은 중단하지 않는다. 개인정보는 정규화된 payload에만 포함하며 예상 외 필드는 저장으로 전파하지 않는다.

```json
{"action":"authorize","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":0,"authorizeUrl":"https://www.instagram.com/oauth/authorize?EXAMPLE_ONLY","expiresAt":"2026-09-10T06:10:00Z"}
```

위 URL은 설명용이며 실제 endpoint/파라미터는 검증한 Meta 어댑터에서 생성한다. 응답 URL은 정확한 https host allowlist로 검증 후 같은 탭으로 이동한다. start 응답 유실 시 stored encrypted state로 같은 URL을 재생성한다. 이미 처리 중이면 아래 resume을 반환한다.

```json
{"action":"resume","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":3,"nextPath":"/connecting"}
```

`nextPath`는 열거된 로컬 경로만 허용한다. expiresAt은 state 유효기간이고 등록 완료 예정시각이 아니다. bootstrap의 draft는 해당 attempt의 미만료 제출 자료만이며 동의 전 키 입력 자동 수집은 없다.

## 2. 실제 처리 요청

```json
{"attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d"}
```

서버는 lease를 claim하고 외부 요청/최종 DB 작업을 await한다. 진행 중인 중복 요청은 202다.

```json
{"status":"processing","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":2,"stage":"account","retryAfterMs":2000,"submissionIntent":"unknown"}
```

candidate 확인은 서버 revision과 연결한다.

```json
{"status":"account_confirmation_required","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":3,"enteredUsername":"aaa","connectedUsername":"bbb"}
```

```json
{"attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","expectedRevision":3,"accept":true}
```

confirm/restart도 cookie/CSRF와 서버 상태검증이 필수다. body attemptId를 바꿔 타인의 후보를 승인할 수 없어야 한다. 서버는 새 후보 token을 body에서 받지 않는다.

## 3. 완료 결과

```json
{"status":"completed","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":5,"result":{"kind":"v2","requestId":"b1c9a751-283b-4e88-97cc-8229c74059d4","receivedAt":"2026-09-10T06:00:30Z","fullName":"김셀럽","email":"creator@example.com","phone":"+821000000000","instagramUsername":"celeblife_demo","connectionKind":"new","analysisRequested":true,"reviewStatus":"pending_review"}}
```

재연동 결과는 `connectionKind=reconnection`, `analysisRequested=false`, `reviewStatus=not_requested`, `initialRequestId=같은 계정 최초 접수 UUID`다. 같은 attempt 재전송은 같은 requestId를 반환한다. 각 receipt는 해당 시점 연락처 snapshot을 반환하며, 이후 다른 접수에서 수정한 연락처를 과거 세션에 노출하지 않는다.

legacy result는 `kind=legacy`와 확인된 instagramUsername만 포함한다. 토큰 저장만 끝난 v1 흐름을 새 개인정보·분석 접수 완료로 포장하지 않는다. 테스트 자료 초기화는 이 API의 기능이 아니다.

## 4. 상태 조회와 만료

attemptId는 식별자이고 비밀이 아니다. GET status는 바인딩을 확인한 뒤 해당 attempt 상태만 반환한다. idle은 attemptId=null/revision=0. awaiting_oauth는 아직 code가 없는 상태다. callback 없이 complete를 호출하면 거래가 진행된 것으로 추정하지 않는다.

브라우저는 현재 attempt와 다른 응답, 낮은 revision 응답을 버린다. 동일 attempt의 completed 상태를 다시 processing으로 되돌리지 않는다. 네트워크 오류는 저장 실패와 동의어가 아니다. 활성 탭만 polling하며 terminal에서는 중단한다. 복원 가능한 draft 여부는 `draftAvailable`만 믿는다.

30분 draft 만료와 완료부터 24시간 receipt 만료는 별도다. completed 세션을 draft cleanup 때문에 30분 후 삭제하지 않는다. 반대로 완료 후 draft/token/code 원문을 24시간 동안 그대로 보관하지 않는다. 정확한 만료 검사는 서버 UTC 시각 기준이다.

## 5. HTTP/오류

400 입력/필수 동의, 401 세션 없음, 403 CSRF·바인딩, 409 정책·멱등/상태 경합, 410 만료, 429 제한, 502 제공자 장애, 503 구성/저장 장애. 정상 확인필요 상태는 200 StatusResponse로 반환한다. 오류 code는 `onboarding.ts`의 union에 포함되어야 한다.

```json
{"error":{"code":"VALIDATION_FAILED","message":"입력한 정보를 확인해 주세요.","fields":{"email":"이메일 주소를 확인해 주세요."}},"traceId":"058fcac0-7a95-4bfb-bf50-ea90a26706cd"}
```

상태 조회의 failed에는 retryAction/draftAvailable를 포함한다. API error의 message는 서버 allowlist 문구다. provider error_description/raw SQL/요청 전체 body를 화면·로그에 노출하지 않는다. rate limit은 UI 안내와 Retry-After를 제공하고, 서버리스 메모리 Map 하나만으로 운영 제한을 구현하지 않는다.

## v1.3 명시적 화면 복귀 식별자

`/connecting?attemptId=<UUID>`와 `/complete?attemptId=<UUID>`를 정식 복귀/완료 주소로 사용한다. callback은 서버가 검증한 UUID만 붙여 303으로 이동하고, OAuth code/state는 제거한다. `nextPath` 타입은 기존의 로컬 pathname enum을 유지하며, UI는 응답의 `attemptId`를 URLSearchParams로 인코딩해 붙인다. 개인정보·토큰·code·state는 붙이지 않는다.

UUID는 공개 가능한 작업 식별자일 뿐 조회 권한이 아니다. 서버는 URL/query의 attemptId를 검증하고 HttpOnly cookie 바인딩을 대조한 뒤에만 status/receipt를 반환한다. 서로 다른 두 완료 탭을 새로고침해도 각자의 receipt를 조회해야 한다. '가장 최근 접수'를 임의로 선택해 다른 계정 정보를 보여주지 않는다. attemptId가 없는 직접 접근은 bootstrap이 바인딩된 현재 작업 한 건을 확정할 수 있을 때만 해당 주소로 안내하고, 애매하면 입력/재시작 안내를 보여준다.

## v1.3.1 구현 정정 (공개 필드 변경 없음)

프런트 상태 guard는 현재·수신 status를 함께 검사해 completed→processing 역행을 금지한다. `server-reference/attempt-policy.mjs`의 shouldAcceptStatus 호출부에 두 status를 전달한다. HTTP 401/403/410에 따른 세션/권한 만료 UI 정리는 이 guard 전에 별도로 처리한다. 개인정보를 오래 보여주기 위한 완료 고정이 아니다.

## v1.3.2 취소 후 복원 계약

정상적으로 바인딩된 OAUTH_CANCELLED는 `status=failed`, `code=OAUTH_CANCELLED`로 공개한다. 원래 초안 기한·동일 브라우저·복원 가능한 원인을 만족할 때만 `draftAvailable=true`이며 새 OAuth 또는 폼 복귀를 안내한다. 개인정보 삭제·초안 만료·이전 시도 대체·잘못된 바인딩에서는 초안을 반환하지 않는다. 취소된 code/state/token은 어떤 복원에도 사용하지 않는다. `POST restart`의 동일 requestKey 재전송은 parent의 완료/초안 삭제 여부를 이유로 새로운 child를 생성하지 않고, 이미 생성된 동일 child만 안전하게 재조회한다. parent/child가 바뀌면 IDEMPOTENCY_CONFLICT다. 공개 타입의 필드 추가는 없다.
