# 구현 순서와 완료 조건

v1.3.1 AUDITED · 인계 후 실행할 계획. P0~P5는 개발/검증, P6는 별도 승인 대상이다.

| 단계 | 작업 | 산출/종료 기준 |
|---|---|---|
| P0 기준점 고정 | 기존 지침·git status·main/실제 배포 차이·DB 스키마·토큰 소비 경로·Meta 등록 URL 조사 | 범위/미확인 목록, v2 branch/worktree, 운영 파일 보호 |
| P1 승인 UI 이식 | Next App Router에 원본 DOM/CSS/SVG 이식; 데모 별도, production 데모 제거 | UI_UX_SPEC 화면/카피/필드/반응형 기준, 의도된 차이 이미지 |
| P2 서버 계약 | bootstrap/start/callback/complete/status/confirm/restart; mock provider | 원본 CSS 유지, 모든 세션 경계/멱등성/실패 상태 테스트 |
| P3 DB | 추가형 migration, v2 RPC, 동의/프로필/접수/outbox, token version trigger | 실제 로컬 Postgres 트랜잭션/권한/동시성 테스트 |
| P4 외부 어댑터·작업 | Instagram HTTP, SMTP outbox, token refresh, cleanup | timeouts/허용 host/로그 차단, 실패 재시도; 자격증명 없으면 mock과 실검증 분리 |
| P5 회귀/전환 준비 | 실제 앱 build·타입·unit/integration/e2e, security, legacy callback, rollback, reset dry-run | TEST_MATRIX 실행 보고서 + RELEASE_CHECKLIST 미통과 항목 |
| P6 운영 적용 | 실제 대상·시점·승인 확인 후 migration/cutover/scoped reset | 실제 smoke test·단일 Cron·모니터링·복구 증거 |

## 개발 우선순위

처음부터 프레임워크나 디자인을 다시 고르지 않는다. 한 앱/기존 Supabase 구조로 진행한다. 개발 중 main, 기존 Vercel root/env, 운영 DB를 바꾸지 않는다. 기존 작업파일은 reset/clean으로 버리지 않으며 충돌이 있으면 별도 worktree를 사용한다.

P1에서는 화면 이식까지만 구현하고, P2~P4에서 실제 네트워크/DB가 붙어도 UI가 바뀌지 않는지 반복 비교한다. 원본 데모의 입력검증/가짜 타이머는 제품 진실이 아니다. UIUX의 허용된 production 차이를 적용한다.

P3의 `0001_v2_schema.sql.draft`는 완성 migration이 아니다. 전체 파일 끝 ROLLBACK을 지우고 곧바로 실행하는 것이 구현이 아니다. 실제 스키마와 대조해 완성 migration·trigger·RPC·rollback 호환·테스트를 작성한다. 위험한 전역 권한 변경/테이블 DROP/테스트자료 정리 자동실행은 하지 않는다.

## 시작 프롬프트 이후 질문 규칙

확정된 연락처 인증 여부, 여러 계정 허용, 재연동, 수신 주소, 테스트 초기화 방향을 다시 묻지 않는다. 계정 설정이 없으면 코드와 mock/로컬 검증을 진행하고 게이트를 기록한다. 비밀값 입력은 실제 환경 설정에서 수행하며 채팅이나 문서로 받지 않는다.

## 보고 단위

각 단계에 변경 파일/실행명령/검증 결과/증거경로/남은 게이트를 기록한다. 최종 보고는 (1) UI 이식 (2) mock (3) 실제 DB (4) 실제 Meta (5) 실제 SMTP (6) 실제 eligible refresh (7) 운영 배포를 구분한다. 아직 하지 않은 작업에 체크표시하지 않는다.
