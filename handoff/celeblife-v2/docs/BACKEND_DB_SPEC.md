# 백엔드·DB 리팩토링 상세 명세

버전 1.3.2 AUDIT · `V2_SPEC.md`의 구현 상세. 서버/DB 실구현·RPC는 Codex 작업 대상이다.

## 1. 아키텍처와 책임

Next.js App Router + TypeScript + Node.js Route Handlers 안에 서버를 모은다. 별도 Python 서버/회원 비밀번호/관리자 UI/메시지 브로커를 만들지 않는다. Supabase는 등록 데이터 기준 저장소로 유지한다. 파일 수집·AI 추론·시장조사는 다른 시스템이다.

```text
우리 UI ── same-origin API ── onboarding service ── v2 RPC ── Supabase
                                  │                       │
                                  ├─ Instagram adapter    └─ outbox → SMTP
                                  └─ credential module        ↑
                                        ↑                retry Cron
                                  token refresh Cron
```

Route는 입력/인증/응답만, service는 업무 흐름, repository는 DB, provider adapter는 외부 요청/안전한 오류분류를 맡는다. `server-only` 경계를 테스트하고 번들에 DB키·토큰·SMTP 비밀번호가 들어가지 않게 한다. 내부 서버 타입과 브라우저 공개 타입을 분리한다.

## 2. 서버 모듈

| 모듈 | 입력/출력 경계 | 책임 |
|---|---|---|
| config | env → 검증된 config | env간 DB/메일/프로젝트 오접속 차단 |
| sessions | cookie+CSRF → bound attempt | requestKey·state·receipt 수명/재시도 |
| consent | bundle ID → canonical snapshot | 문서 버전/hash·동의시각 고정 |
| instagram | code/token → 검증된 결과 | 제한시간, allowlist, 응답 형식, 실제 승인권한 확인 |
| onboarding | attempt → receipt/status | claim·checkpoint·후보확인·등록 확정 |
| repository | 내부 typed command → RPC | prepared query, 명시적 schema, 오류 redaction |
| credentials | 계정/token snapshot → 저장/조회 | 읽기 계약·만료·row version·갱신 |
| outbox/email | event → SMTP 처리 | 멱등키, escape, lease, 실패 복구 |
| cleanup | 기한/상태 → 자료정리 | 민감 임시자료·만료 세션만 정리 |

Instagram 어댑터는 계정 확인에 필요한 최소 필드만 요청한다. 프로필 사진·팔로워수·게시물수를 UI에서 쓰지 않는데 수집하거나 원본 전체 응답을 저장하지 않는다. API 버전/host를 사용자 입력으로 받지 않는다. 일반 OAuth의 refresh_token grant와 기존 Instagram의 ig_refresh_token 구현을 섞지 않는다. 현재 Meta 사양은 실제 앱 설정과 다시 대조해야 한다.[S2]

## 3. 핵심 불변조건

| ID | 반드시 지킬 조건 |
|---|---|
| INV-01 | token+연락처+동의+receipt+outbox가 최종 한 트랜잭션에서 확정되기 전 성공 표시 금지 |
| INV-02 | 같은 attempt 재전송은 동일 receipt. 새 code 교환/새 알림/새 신청 0 |
| INV-03 | 계정별 최초 new 접수 1개. 재연동 이력은 분석 큐 제외 |
| INV-04 | 이메일/전화번호는 non-unique·미인증. 계정 병합키는 제공자 ID |
| INV-05 | 사용자 입력 username은 인증 근거가 아님. 실제 계정 불일치 확인 필요 |
| INV-06 | stale lease/다른 attempt/낮은 revision이 최신 처리를 승인·저장할 수 없음 |
| INV-07 | 모든 v2 DB→JS BIGINT ID는 TEXT로 무손실 이동 |
| INV-08 | 메일 실패가 commit된 접수를 취소하지 않음 |
| INV-09 | expired/revoked token을 자동으로 살렸다고 표시하지 않음 |
| INV-10 | reset은 배포 migration과 분리. v2 신규 자료·타 서비스 삭제 금지 |

## 4. 데이터 사전

기존 `users`, `tokens`, `user_consents`와 v1 RPC는 호환성을 유지한다. 레포 SQL과 운영 스키마가 같다고 가정하지 말고 실제 FK·정책·함수·인덱스를 확인한다.

| 테이블 | 핵심 컬럼 | 역할/제약 |
|---|---|---|
| users | id, instagram_id, instagram_username | 실제 계정 ID UNIQUE. 이메일로 병합 금지 |
| tokens | user_id, token_type, access_token, expires_at, created_at | `(user_id,token_type)` 유지; created_at은 구형 최근 저장시각 의미 보존 |
| tokens 추가 | row_version, source_attempt_id/started_at, connection_status | credential 경합 방지/상태. v1 writer 포함 trigger 필요 |
| tokens 추가 | refresh 시도/성공/실패 metadata, granted_scopes/scopes_checked_at | token 원문 없는 운영 점검 |
| user_consents | user_id, state_nonce, 4동의, 문서 버전/hash, accepted_at | 기존 schema_version=1 유지, v2 nonce namespace |
| creator_profiles | user_id, 이름, 이메일, phone_e164, verified flags | 최신 연락처. source_accepted_at에 따른 역행 방지 |
| onboarding_sessions | id, binding hash, request_key, payload keyed hash, 암호화 state | start 중복 응답 복원·state 일회 처리 |
| onboarding_sessions | 암호화 draft/code/token checkpoint, candidate, expiry | 데이터 최소 보관·중간 복구 |
| onboarding_sessions | revision, status, stage, lease, request_id, receipt_expires_at | 실행/복구/영수증 수명 분리 |
| onboarding_requests | id, user_id, session_id, account/contact snapshot | session_id UNIQUE; 성공한 연결 이력 |
| onboarding_requests | connection_kind, initial_request_id, review_status | new partial UNIQUE(user_id), reconnection→같은 계정 root |
| notification_outbox | event_key, request_id, status, attempts, next_attempt_at, lease | event_key UNIQUE; PII 복제 payload 없이 request에서 메일 조립 |
| job_leases | name, owner, lease_expires_at, last_success_at | 단일 Cron 소유권과 실행 상태 |

성공 이력 `session_id`는 만료 session 삭제와 독립된 영구 멱등키다. 임시 session을 지워 receipt까지 cascade 삭제하지 않는다. root 접수와 reconnection FK는 계정 전체 삭제 시 함께 정리한다. 정책상 접수 보유기간이 지나 root를 삭제할 때 재연동 행을 고아로 남기지 않는다.

`templates/0001_v2_schema.sql.draft`는 열/제약 초안이지 적용할 migration이 아니다. 끝 ROLLBACK만 믿고 운영에서 부분 선택 실행하지 않는다. trigger/RPC/선택적 revoke/권한 테스트/기존 스키마 비교가 완료된 새 migration을 생성한다.

## 5. 등록 확정 RPC의 순서

`complete_instagram_onboarding_v2`는 서버용 권한으로만 호출한다. 권한 revocation은 이 앱의 새 함수/테이블에 한정하고 다른 서비스의 PUBLIC 함수 권한을 일괄 변경하지 않는다. Supabase는 함수 권한을 테이블 RLS와 별도로 통제해야 하며, SECURITY DEFINER이면 search_path를 제한한다.[S5]

```text
1. attempt 행 lock → browser binding/요청 권한을 먼저 검증
2. 이미 completed면 receipt_expires_at만 확인해 기존 결과 반환: draft TTL·해제된 lease·지운 candidate/code를 요구하지 않음
   미완료인 경우에만 draft TTL·현재 상태·owner/lease·revision·후보를 검사하고 아래 쓰기 진행
3. 검증된 instagram_id로 users upsert/행 lock
4. 같은 계정 최초 v2 접수 탐색, stale attempt/source order 확인
5. source 시각이 적절한 최신 프로필만 반영
6. 실제 본 정책 bundle로 동의 audit 기록
7. token/version/권한/만료 metadata 저장 (최신 credential 보호)
8. 최초 new/pending_review 또는 reconnection/not_requested receipt 생성
9. 해당 receipt ID의 outbox event 생성
10. session completed/receipt_expires_at 지정, 민감 임시 payload 즉시 제거
11. commit 뒤 receipt 반환, after()는 첫 메일 시도에만 사용
```

외부 API/SMTP 호출은 DB transaction 안에서 하지 않는다. account lock 순서를 모든 finalization에서 같게 해 교착을 줄인다. SQL serialization/deadlock 등 재시도 가능한 오류는 code 교환을 반복하지 말고 검증된 checkpoint로 DB 확정만 제한 재시도한다. 통신이 끊기면 commit 여부를 session/request UNIQUE로 재확인한다.

후속 분석자가 읽을 목록은 `connection_kind='new' AND review_status='pending_review'`이며 request ID로 멱등 처리한다. 범용 새 row webhook을 분석 실행으로 직결하지 않는다. 이 앱이 자동 분석을 시작하지 않으므로 '1영업일'은 독립된 담당자 운영 약속이다.

## 6. 인증/세션 경계 보강

### 응답 유실

state hash만 있으면 기존 authorize URL을 복원할 수 없다. `oauth_state_encrypted`를 state TTL 동안 유지하고, 정규화 payload keyed hash와 비교해 동일 start 재요청에만 복호화한다. state plaintext는 로그/metadata에 남기지 않는다. fingerprint key는 별도 비밀이고 활성 세션이 있는데 무계획으로 바꾸지 않는다.

### 다중 탭·재시작

서버 바인딩은 브라우저 소유, 작업은 attemptId 소유다. 동일 브라우저에서 bootstrap을 여러 번 호출해 cookie가 교체되면 기존 인증을 깨뜨리므로 유효 cookie는 재사용한다. complete/confirm/restart 요청에는 명시적 attemptId를 받는다. confirm은 revision 일치까지 확인한다. 프로세싱 중인 작업을 다른 탭의 '다시 시작'이 제거하지 못하게 한다.

### 일회성 code와 checkpoint

교환 전 상태를 durable하게 기록한다. code 교환 타임아웃 뒤에는 성공 여부가 모호하므로 원문을 재전송하지 않는다. 정상 응답 token을 암호화 checkpoint에 보관했다면 이후 계정검증/최종저장을 복구한다. key unavailable, checkpoint 기록 실패, 후보 만료면 새 OAuth를 요구한다.[S6]

동일 callback 재전송은 code hash/state binding을 확인해 기존 상태만 반환한다. 다른 code를 같은 state로 주입하면 거절한다. 만료된 state와 잘못된 cookie는 작업을 진행하지 않으며, 그 요청만으로 정상 세션을 망가뜨리지 않는다.

### 만료와 민감정보

state 10분, draft 30분, 완료 receipt 24시간은 별개 타이머다. 완료 code/token/draft는 즉시 제거하고 receipt만 보관한다. 취소된 OAuth code/state/token은 즉시 무효화·삭제한다. 본인이 Instagram 승인을 취소한 경우의 동의 후 입력 초안은 원래 draft 기한까지 제한된 폼 복원에만 사용할 수 있다. 만료·대체·개인정보 삭제된 초안은 복원하지 않는다. cleanup은 이 구분에 따라 물리 정리한다. callback에 analytics/pixel/session replay를 넣지 않는다. 알려진 code/token/cookie marker를 로그·프런트 번들·HTML·URL에서 검사한다.

## 7. 토큰 관리와 소비자 호환

현재 선택은 **legacy_plaintext 저장 계약 유지**다. 이는 임시 code/checkpoint 암호화와 다르다. 유휴 상태여도 외부 소비 코드가 존재하므로 실제 읽기 경로를 찾고 공통 credentials 모듈로 감싼다. 별도 토큰 API는 지금 범위의 필수가 아니며 관리자 키를 신규 레포에 무작정 배포하지 않는다. 장기 저장 암호화는 소비자/구형 fallback/갱신/rollback 전환을 함께 설계하는 후속 결정이다. 잔여 위험은 출시 책임자가 확인해야 한다.

토큰은 유효기간과 저장 시각을 검증하고 **남은 기간 7일 미만**인 대상을 하루 한 번 검사한다. 기존 참고 코드의 엄격한 `<` 경계를 유지하므로 정확히 7일은 당일 skip이다. 저장/갱신 후 24시간 미만은 skip한다. expires_in은 응답의 양의 정수를 쓰고 60일로 임의 보정하지 않는다. 이 정책의 실제 Meta 적합성은 최신 사양·eligible 계정 검증 후 기록한다.[R2/S2]

v2 refresh는 snapshot row_version+created_at+expires_at CAS로 기록한다. 구형 writer도 version 증가 trigger를 거치게 한다. old refresh가 실패했다고 새 정상 token을 reauth_required로 바꾸지 않도록 **실패 metadata 갱신도 version 조건부**로 한다. 외부 장애는 일시 실패, 확인된 무효/철회는 재연동 필요로 분류한다. raw error 문자열을 저장하지 않는다.

토큰 갱신 실패는 기존 선택적 운영 webhook과 집계 로그로 관찰한다. 이번 필수 SMTP 메일 범위는 신규 등록·재연동 알림이며 정상 갱신 메일이나 범용 운영 경보 outbox를 새로 만들지 않는다. webhook이 없으면 외부 경보가 없다는 것을 명시하고 담당자가 last successful run/overdue/reauth_required를 확인할 수 있는 점검 경로를 제공한다. SMTP 자체가 고장났을 때 같은 SMTP 알림만 기대하지 않는다. 일반적인 토큰 상태 메일은 후속 확장 항목이다.

## 8. 알림/정기 작업

최종 DB commit과 outbox 생성까지가 등록의 원자적 범위다. SMTP는 그 뒤다. `after()`는 요청의 max duration 한계를 받으므로 첫 시도 최적화이고 영구 queue 보장이 아니다.[S3]

`notification_outbox` 상태는 pending/processing/sent/dead다. timeout되거나 worker가 죽어 processing에 남은 행도 lease 만료 뒤 회수한다. attempts는 실제 발송 시도 시작 때 증가시키고, next_attempt_at/최대 횟수는 멱등 기록한다. SMTP acceptance 이후 DB sent 기록 실패면 중복 전송 가능성이 남는다. Message-ID는 고정하지만 정확히 한 번 수신/읽음 보장은 하지 않는다.

수신 `dkssud374@celeblife.co.kr`, 발신 기본안 동일. actual company SMTP host/port/TLS/외부 앱 인증은 설정 후 검증한다. 사용자 입력 주소를 To/From/Reply-To/CC/BCC로 쓰지 않는다. SMTP 인증/수신 테스트는 승인된 테스트 정보로만 진행한다. 운영메일의 HTML escape/CRLF 제한/토큰 미포함을 테스트한다.

| 작업 | 기본 스케줄/예산 | 실패 복구 |
|---|---|---|
| token-refresh | 하루1회, 00:23 UTC | 다음 실행/보호된 수동 작업, overdue 관찰 |
| notification-retry | 5분마다, 45초 budget | due+stale-processing claim, 5회 최대시도 기본 |
| cleanup | 하루1회, 00:43 UTC | 만료 자료 물리정리; 접근은 즉시 차단 |

각 작업은 maxDuration/집계/소유권을 따로 두고 동일 DB에 두 Vercel 프로젝트가 동시에 운영하지 않게 한다. 5분 스케줄은 Hobby에서 실행할 수 없고 상업용 운영 플랜도 확인해야 한다.[S4] 스테이징은 수동 테스트가 가능하되 회사 운영 DB/수신자에 접속하지 않는다. 모든 환경 가드는 secret/header/설정 검증을 실제 연결 전에 수행한다.

## 9. legacy callback 보호

같은 계정에 v2 연결이 있는지 JavaScript에서 조회한 뒤 별도로 old RPC를 부르는 방식은 중간 경합이 남는다. 호환 어댑터는 **같은 DB 트랜잭션의 계정 lock 안에서 v2 여부 확인과 legacy 저장 분기**를 수행한다. 기존 v1 RPC의 문서 버전 규칙은 바꾸지 않되, 새 guarded wrapper를 작성하거나 동등한 검증된 SQL 경로를 사용한다. 새 UI/legacy 완료 분기만으로 쓰기 충돌이 해결됐다고 간주하지 않는다.

## 10. 개발에서 필요한 DB 테스트

동일 계정 두 최초 attempt는 A→B 완료 시 new 1/reconnection 1, B→A 완료 시 new 1/STALE_ATTEMPT 1이며, 같은 attempt 동시 호출 → receipt/outbox 각1, 새 토큰 저장 후 오래된 refresh → CAS skip, 오래된 authorization → STALE_ATTEMPT, 다른 user root 참조 → rollback, anon/authenticated RPC → denied를 실제 PostgreSQL에서 검증한다.

참고 함수 테스트는 DB lock·격리수준·RLS·trigger가 실제 작동한다는 증거가 아니다. SQL draft를 실행한 적이 없으면 DB 통합검증 상태는 반드시 NOT_RUN이다.

## 11. v1.3 재조회·만료·검증 순서

completed 결과 재조회와 새 최종 쓰기의 가드를 분리한다. 권한이 맞는 completed attempt는 receipt 기한 안에서 결과만 반환한다. draft가 30분 지났거나 완료 시 lease/candidate를 비웠다는 이유로 이를 거절하지 않는다. 새로운 처리만 유효 draft/현재 lease/검증된 후보를 요구한다. 권한이 틀린 요청에는 완료 유무나 개인정보를 알려주지 않는다.

만료가 지났지만 status가 pending인 행은 일일 cleanup 전에도 DB unique index에서 활성 행이다. start/restart는 브라우저별 트랜잭션 안에서 expired 상태를 반영한 후 새 활성 행을 생성한다. processing은 operation budget < lease의 조건을 유지하고, 유효 lease를 함부로 해제하지 않는다. 만료 후 old worker가 돌아와도 fencing 검사를 통과하지 못한다.

신규 A와 B의 완료 순서에 관한 제품 우선순위는 '가장 최근에 시작한 정상 연결 보호'다. B(더 늦게 시작)가 먼저 확정되면 늦게 도착한 A는 STALE_ATTEMPT이며 재연동 이력/메일을 만들지 않는다. A가 먼저 확정되고 B가 뒤에 확정되면 정상 new/reconnection 각 한 건이다. 기존 NEW01 기대값은 이 두 순서를 구분하도록 정정했다.

## 12. v1.3.1 연결 순서 정밀도

동일 계정의 최신 연결 보호는 `(서버 생성 started_at, UUID)` SQL 비교로 확정한다. TIMESTAMPTZ의 마이크로초를 Date.parse로 줄여 비교하거나 로캘 정렬로 UUID를 비교하지 않는다. timestamp가 정확히 같을 때만 정규화 UUID의 결정적 순서를 사용한다. 서버 참고 함수는 표준 ISO timezone 필수·소수0~6자리 입력을 BigInt 마이크로초로 비교한다. 이는 DB lock/CAS를 대신하지 않는다.

completed receipt의 재조회와 새로운 작업 실행은 기존 v1.3 순서를 유지한다. 프런트의 완료 상태 보호와 서버의 권한/만료 검사는 별개다. 후자는 언제나 우선한다.

## 13. v1.3.2 취소·복구 권한표

| 서버의 시도 상태/원인 | code/state/token 재사용 | 본인 초안 복원 | 다음 동작 |
|---|---|---|---|
| 정상 승인 취소 / OAUTH_CANCELLED | 금지, 즉시 무효화·삭제 | 같은 browser + 원래 draft TTL + payload 존재 시만 | 폼 또는 새 OAuth 시도 |
| 만료 / expired | 금지 | 금지 | 새 정보·동의 제출 |
| 다른 시도로 대체됨 | 금지 | 이전 시도에서는 금지 | 명시된 새 attempt 상태 조회 |
| 개인정보 삭제 | 금지 | 금지 | 보관된 민감자료 제거, 기존 작업 재개 금지 |
| 정상 완료 | code/token checkpoint 없음 | 초안 없음 | 본인 receipt TTL 안에서 결과만 |

`draftAvailable`은 DB가 이 표로 계산한다. 단순히 encrypted payload가 NULL이 아니라는 이유로 true를 주지 않는다. 잘못된 브라우저 요청에는 어떤 상태인지도 노출하지 않는다. '새로 연동하기'는 취소한 code를 다시 쓰는 것이 아니다.

restart의 응답 유실도 start와 동일하게 처리한다. browser+requestKey에 이미 child attempt가 있으면 parent_attempt_id 일치를 확인한 뒤 그 child의 authorize/resume 결과를 반환한다. 이 replay는 폐기된 parent의 살아 있는 code나 lease를 요구하지 않는다. 새로운 child 생성은 parent 초안의 원래 기한·정당한 본인 접근·현재 정책을 검증한 트랜잭션 안에서만 허용한다. 같은 key로 다른 parent를 지정하면 충돌이다. 이미 완료된 parent는 restart로 새 분석 신청을 만들지 않고 완료 결과를 보존한다. 새 연결을 시작하려면 폼의 명시적 새 start를 사용한다.

## 14. v1.3.2 해제·갱신 경합의 최소 쓰기 조건

row_version은 token 문자열 변경만 나타내는 값이 아니라 **보안 판단용 스냅샷 버전**이다. 상태/권한 변경도 포함한다. 읽었던 상태가 connected인데 토큰 문자열을 남겨둔 채 revoked로만 바뀌었다면 버전도 달라져야 한다. 같은 버전으로 connected→revoked→connected가 왕복하는 ABA를 허용하지 않는다.

1. worker는 해당 환경/계정에서 허용된 연결만 선택한다. connected는 일반 경로, unknown은 기존 토큰 호환 경로이며 새로운 승인 증거가 아니다.
2. 외부 호출 직전에도 최신 상태를 확인한다. 그 직후 권한이 철회될 수 있다는 경합까지 없어진 것으로 주장하지 않는다.
3. 최종 DB 저장은 `id + expected_row_version + eligible connection_status`를 **같은 UPDATE 조건**에서 검사한다. 실패/철회 metadata를 쓰는 작업에도 같은 보호가 필요하다. 관련 created_at/expires_at 스냅샷 검사도 유지한다.
4. row가 삭제됐으면 0행 수정 후 skip한다. refresh는 INSERT/UPSERT로 계정을 복원하지 않는다. 재등록은 별도의 새 동의·OAuth 경로다.
5. '외부 refresh 호출 성공'만으로 권한철회를 취소하거나 unknown을 connected로 바꾸지 않는다. DB commit이 실제 성공하기 전 사용자/작업 상태를 성공으로 표시하지 않는다.

이미 전송된 외부 요청이나 메일을 회수할 수 있다는 보장은 하지 않는다. 이 규칙은 완료되지 않은 로컬 작업이 철회·삭제 이후 데이터를 재활성화하는 것을 막는 조건이다. 실제 SQL 트리거와 동시성 검증은 구현 후 필수다. `server-reference/lifecycle-policy.mjs`는 판정 참고일 뿐 DB 트랜잭션의 구현이 아니다.
