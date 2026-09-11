# 실제 앱에서 필요한 검증

아래는 **앞으로 Codex가 구현할 앱의 인수 테스트**다. 패키지의 참고 코드 단위 테스트와는 구분한다(이번 인계 패키지 실행 결과는 verification/FINAL_VERIFICATION.md). 각 항목에 실행 환경, 결과, evidence 경로를 남긴다.

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| UI01 | desktop1440/모바일390에서 원본-이식 비교 | 의도한 demo toolbar 제거 외 디자인 유지 |
| UI02 | 320/768 폭, 큰 글자/긴 이메일 | 가로 넘침/버튼 가림 없음 |
| UI03 | 최초 폼 | 개인정보·동의가 미리 채워져 있지 않음 |
| UI04 | 비어 있는 폼 제출 | 필드 오류와 첫 오류 포커스 |
| UI05 | 전체/개별 동의 | all/indeterminate 동기화, 불완전 동의 차단 |
| UI06 | 약관 모달 keyboard/Escape | focus trap/복귀, 내용 스크롤 |
| UI07 | reduced motion | 불필요한 animation 억제, 정보 손실 없음 |
| UI08 | production build | preview toolbar/mock dialog/demo data/hash success 없음 |
| UI09 | callback 복귀/느린 제공자 | 토큰 교환 완료 전에 로딩 화면이 보임 |
| UI10 | /complete 직접 접속 | 세션+DB 결과 없으면 성공 표시 안 함 |
| AU01 | 일반 정상 승인 | 공식 제공자→서버 code 교환→장기토큰→DB 완료 |
| AU02 | 기존 Instagram 로그인 session | 제공자 흐름에 맡기고 중복 로그인 UI 없음 |
| AU03 | 테스트 계정 추가 인증 요구 | 실제 제공자에서 처리, 우리 앱이 인증번호 안 받음 |
| AU04 | 취소/거절 | 등록/알림 없음, 유효 draft 복원 |
| AU05 | state 변조/누락/만료 | 토큰 교환/DB 완료 금지 |
| AU06 | cookie 없음/다른 브라우저 | state만으로 통과 불가 |
| AU07 | callback 재전송 | 한 번만 code 소비, 완료면 같은 receipt |
| AU08 | 두 탭 동시 complete | DB claim 보호, unique request/outbox |
| AU09 | Instagram 입력 계정 불일치 | 실제 계정 확인 전 개인정보/토큰 최종 연결 안 함 |
| AU10 | code 교환 timeout | 불확실한 code를 자동 반복 소비하지 않음 |
| AU11 | long token 이후 저장 실패 | checkpoint 기반 재시도 또는 안전한 재연동, 가짜 완료 없음 |
| AU12 | lease owner 함수 종료 | 만료 후 checkpoint에 따른 회복 |
| AU13 | callback URL/query 로깅 | code/state/token raw가 로그/analytics로 나가지 않음 |
| AU14 | 인앱/외부 브라우저 전환 | 바인딩 실패를 명확히 안내, 검증 완화 안 함 |
| AU15 | unsupported/private account/권한 부족 | 승인·요구권한 상태를 검증하고 명확한 안내 |
| DB01 | profile/user/consent/token/request/outbox 중간 실패 | 최종 transaction 전체 rollback |
| DB02 | DB commit 후 HTTP 응답 유실 | 재조회하면 같은 requestId 반환 |
| DB03 | v1 신규 연결 | 기존 RPC/문서 버전으로 계속 저장 가능 |
| DB04 | 새 정책과 기존 schema_version | 구조버전1 유지, v2 RPC의 새 문서 버전 기록 |
| DB05 | 정책이 로그인 중 변경 | 사용자가 실제 본 bundle/version을 저장 또는 재동의 |
| DB06 | anon/authenticated 접근 | token/profile/session/request/outbox/RPC 접근 차단 |
| DB07 | user_id/receipt UUID 추측 | 다른 사용자 개인정보 조회/갱신 불가 |
| DB08 | 같은 IG 계정 재연동 | 기존 user_id/최초 검토 상태 유지, 토큰·최신 프로필 갱신, reconnection/not_requested 이력, 신규 분석 0 |
| DB09 | 연락처 같은 서로 다른 IG 계정 | 이메일/전화번호로 사용자 병합하지 않음 |
| DB10 | 사용자 삭제 | 연결된 개인정보/토큰/접수/알림/임시자료 처리 검증 |
| SE01 | Origin/CSRF 위조 | start/complete/confirm/restart 모두 차단 |
| SE02 | 과도한 body/연속 start | 크기 제한/rate limit, DB 무제한 쌓기 방지 |
| SE03 | XSS/메일 CRLF | HTML escape/헤더 거절, 입력값을 실행하지 않음 |
| SE04 | client bundle/response/sourcemap 검사 | service key/app secret/token/SMTP password 없음 |
| SE05 | URL/localStorage/sessionStorage 검사 | 개인정보/token/secret 미보관 |
| SE06 | 계정 ID 정밀도 | BIGINT/IG ID 문자열 왕복 무손실 |
| MA01 | 실제 회사 test mailbox | 인증/TLS/발신 허용/수신함 도착 확인 |
| MA02 | SMTP 오류/timeout | 사용자 완료 유지, outbox pending/retry |
| MA03 | worker 두 개 동시 실행 | lease로 정상 중복 소비 방지 |
| MA04 | 발송 후 sent 기록 실패 | 중복 가능성 기록, 안정적인 Message-ID/event key |
| MA05 | 재시도 소진 | dead 항목/oldest pending 경고, 조용한 유실 없음 |
| MA06 | 사용자 이메일 악성 입력 | 고정 담당자 To/From 불변, 임의 발송 불가 |
| TO01 | 최초 승인 | short→long 교환 실제 expires_in 저장 |
| TO02 | 만료 7일 이상/24h 미만 | 갱신 skip |
| TO03 | 유효+임박+24h 경과 | eligible token 실제 refresh 및 새 expiry 확인 |
| TO04 | expires_in 누락/음수/문자열 | 임의 60일 fallback 없이 실패 |
| TO05 | expired/revoked | reauth_required, 자동 복구한다고 표시 안 함 |
| TO06 | 재연동과 refresh 동시 실행 | CAS로 새 사용자 token 덮어쓰기 금지 |
| TO07 | dry-run | 외부 refresh/토큰 쓰기 없음 |
| OP01 | 스테이징 프로젝트의 Vercel Production 배포 | 운영 DB/메일/Cron에 접근 못 함 |
| OP02 | Cron secret 누락/틀림 | 보호 경로 실패, raw secret 로그 없음 |
| OP03 | v1→v2 전환 중 v1 인증 | 기존 10분 state·cookie 검증 후 기존 RPC 정상 |
| OP04 | rollback 중 진행 중이던 v2 인증 | bridge/route 유지 전략 실제 검증 |
| OP05 | 새 앱 artifact | Streamlit/분석 scheduler 의존성 없음 |
| OP06 | expired 임시세션/receipt | 즉시 접근 차단, 정리 job 물리삭제 확인 |
| OP07 | DB 롤백 없는 앱 rollback | 기존 계약 유지, 개인정보/접수 보존 |

## v1.1 추가 인수 조건

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| NEW01 | 같은 계정 최초 attempt A(먼저 시작), B(나중 시작)를 서로 다른 완료 순서로 실행 | A→B: new 1/reconnection 1. B→A: B new 1/A STALE_ATTEMPT, 추가 receipt/outbox 0. account lock/partial UNIQUE 모두 확인 |
| NEW02 | legacy users row만 있고 최초 v2 신청 없음 | 첫 v2 신청 new/pending_review |
| NEW03 | 기존 v2 신청이 in_review/contacted인 계정 재연동 | 최초 시각/상태 유지, 재연동 행 not_requested |
| NEW04 | 재연동 완료 UI와 메일 | 동일 승인 레이아웃, 연결 갱신/새 분석 없음, 처리기한 재약속 없음 |
| NEW05 | 연락처가 같은 서로 다른 실제 IG 계정 | 각각 등록, 인증 로직/UNIQUE/자동 병합 없음, verified=false |
| NEW06 | 다른 사람의 최초 접수 ID를 reconnection root로 저장 시도 | RPC 거절/전체 rollback |
| RESET01 | 초기화 dry-run | 지정 project/테스트 계정/관련 행/시각만 보고, 실제 삭제 0 |
| RESET02 | 새 실셀럽 또는 기존 테스트 계정의 v2 재등록 발생 | allowlist/row 변경/v2 root 검증으로 해당 데이터 삭제 거절 |
| RESET03 | 전환 중 토큰 갱신/legacy callback 도착 | 정리 경합 차단, 정상 신규 데이터 보존 |
| RESET04 | 초기화 후 본인 계정 처음부터 재등록 | 새 동의/토큰/최초 접수/신규 알림, 구 테스트 자료 복원 없음 |
| MAIL11 | 수신 주소 고정 | dkssud374@celeblife.co.kr, 프런트 입력 주소로 덮어쓰기 불가 |
| MAIL12 | 같은 계정 발신 기본안 | SMTP 설정 없으면 disabled/명시 오류, 성공으로 추정 금지 |


## v1.2 추가 인수 조건 — 모두 실제 앱 실행 필요

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| FINAL01 | start DB commit 후 응답 유실, 동일 requestKey·동일 payload 재요청 | 같은 attempt/state authorize URL 또는 정확한 resume 결과 |
| FINAL02 | 동일 key로 입력값/동의 bundle 변경 | IDEMPOTENCY_CONFLICT, 기존 개인정보 덮어쓰기 없음 |
| FINAL03 | 완료 중 다른 탭 bootstrap/restart | 바인딩 유지, processing 취소/대체 금지 |
| FINAL04 | 구 모달에서 다른 attempt/이전 revision 확인 | STALE_CONFIRMATION, 새 계정이 승인되지 않음 |
| FINAL05 | draft 30분 경과 vs completed receipt 24시간 | 임시 민감자료 없음, 유효 receipt 조회만 허용 |
| FINAL06 | 오래된 OAuth가 새 token 뒤에 도착 | STALE_ATTEMPT, 연락처/token 역행 없음 |
| FINAL07 | old refresh 실패가 새 연결 이후 완료 | 실패 상태도 CAS skip, 새 연결은 connected 유지 |
| FINAL08 | BIGINT가 JS safe integer 초과 | DB RPC의 text 반환부터 무손실 |
| FINAL09 | SMTP accepted 후 DB 오류/worker 종료 | stale lease 회수, 중복 가능성은 명시, 영구 유실 방지 |
| FINAL10 | 5분 Cron 배포와 실패 | 지원 플랜 검증, 다음 due 조회 복구, 자동 즉시 재호출로 가정 안 함 |
| FINAL11 | grant 일부 거절 | 필요한 권한 확인 전 completed 금지 |
| FINAL12 | 원본 demo 한자 이름/00 전화/+82/유선 검증 차이 | 실제 앱 client/server/SQL 일치, 원본 reference는 수정 없음 |
| FINAL13 | 오래된 status HTTP 응답 | attempt/revision을 비교해 최신 UI 역행 없음 |
| FINAL14 | 손실된 최종 응답 후 cancel/restart 경합 | 완료 DB 결과를 보존, 같은 code를 다시 소비하지 않음 |
| FINAL15 | 문서 링크·정책 구분·지원 문의 | 개인정보처리방침과 수집동의 구분, 내부 운영 메일 자동 공개 없음 |

## 결과 보고 양식

```text
UI 동등성: PASS/FAIL/NOT_RUN + 환경/이미지
Mock 전체 흐름: PASS/FAIL/NOT_RUN + 테스트 명령
실제 Meta 연결: PASS/FAIL/NOT_RUN + 테스트 계정 식별정보 최소화
실제 네이버웍스 수신: PASS/FAIL/NOT_RUN + 시각/traceId(비밀 없음)
실제 token refresh: PASS/FAIL/NOT_RUN + eligible 대상/집계(토큰 없음)
운영 DB/배포 변경: 실행하지 않음 또는 별도 승인/실행 증거
남은 blocker: 환경설정/정책/권한/결함을 구분
```

## v1.3 모바일·상태 회귀 조건

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| MOB01 | 320/345/346/360/375/390/412/430/768/860/861/900/1080/1440 × 5상태 | configured viewport를 기준으로 가로 넘침0; innerWidth가 내용에 따라 늘어난 것을 pass로 착각하지 않음 |
| MOB02 | 이름50자/계정30자/긴 이메일 완료 화면 | 전체 텍스트 확인 가능; 배지/계정 줄바꿈 정상 |
| MOB03 | 약관 모달 높이320/420/568 | 본문만 스크롤, 하단 확인/상단 닫기 보임 |
| MOB04 | 실제 iPhone/Android 키보드·글자확대·노치·인앱 OAuth | 실제 기기별 PASS/FAIL/NOT_RUN 분리 |
| MOB05 | 보조 버튼·동의 label | 44px 프로젝트 목표; 작은 아이콘의 시각 크기는 유지 가능 |
| LIFE01 | 완료 후 draft 만료, lease/candidate 지워진 상태에서 재조회 | 유효 receipt 기한이면 동일 결과, 재쓰기0 |
| LIFE02 | cleanup 실행 전 draft 만료된 pending 이후 start | expired 전이를 적용하고 새 attempt 가능; 무한 ACTIVE_ATTEMPT_EXISTS 없음 |
| LIFE03 | 완료 탭 두 개의 새로고침/뒤로가기 | URL의 각 attemptId+cookie로 자신의 receipt만 표시 |
| LIFE04 | 같은 계정 A/B 시작·완료 순서를 바꾼 경쟁 | 수정 NEW01의 두 기대값과 STALE_ATTEMPT 정책 일치 |

## v1.3.1 추가 인수 조건

| ID | 시나리오 | 실제 앱 기대 결과 |
|---|---|---|
| LAST01 | 계정 확인 버튼에 실제 계정명30자, 폭320/390, 두 배 텍스트 probe | 버튼 문구가 잘리지 않음; 본문·보조 버튼 모두 접근 가능 |
| LAST02 | 완료 뒤 같은/더 큰 revision의 processing 응답 | completed UI 역행 없음 |
| LAST03 | 완료 뒤 서버401/403/410, BFCache 복귀 뒤 만료 | 개인정보 DOM·메모리 정리, 완료 고정 규칙이 만료를 억제하지 않음 |
| LAST04 | 두 started_at이 같은 밀리초 안에서 서로 다른 마이크로초 | UUID 사전순과 관계없이 DB의 실제 시각 순서 유지 |
| LAST05 | 같은 시각·서로 다른 timezone/UUID 대소문자 표기 | 정규화 후 동일한 결정적 결과; DB 정밀도 보존 |

현재 패키지의 순수 함수/probe PASS는 이 표의 실제 앱·DB PASS가 아니다.

## v1.3.2 고정 인수 항목 — 구현 후 검증

| ID | 시나리오 | 기대 결과 |
|---|---|---|
| AUDIT01 | 정상 OAuth 취소 후 같은 브라우저로 폼 복귀 | 원래 TTL 안에서만 입력 복원, 취소 code/state/token은 사용0 |
| AUDIT02 | 취소 반복/다른 브라우저/기한 경과/개인정보 삭제 | TTL 연장0, 불가 조건에서는 draftAvailable=false |
| AUDIT03 | restart 응답 유실 후 같은 key/parent 재전송 | child 하나, 동일 authorize 또는 정확한 resume; 다른 parent이면409 |
| AUDIT04 | 연결 상태만 revoked로 변경, token/expiry 동일 | row_version 증가, old refresh 쓰기0, 새 알림/접수0 |
| AUDIT05 | 권한 변경 또는 connected→revoked→새 OAuth connected | 각 보안 버전 증가, 더 오래된 worker는 새 연결 변경0 |
| AUDIT06 | refresh 시작 후 토큰 행 삭제 | 최종 UPDATE0, UPSERT/재생성0 |
| AUDIT07 | unknown legacy 토큰을 호환 경로에서 갱신 | 새 승인증거 없이 connected로 승격0 |
| AUDIT08 | 통합 HTML 재생성 | id 중복0, 목차 항목마다 정확한 장 제목으로 이동 |

AUDIT01~07의 참고함수/모델 통과는 실제 SQL·콜백·브라우저 통합 통과를 뜻하지 않는다. 운영에 필요한 테스트는 FAIL/NOT_RUN을 숨기지 않는다.
