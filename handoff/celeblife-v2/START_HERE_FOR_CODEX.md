# Codex 최종 개발 지시문 — v1.3.1 AUDITED

대상 레포는 `Celeblife/insta-login-oauth`. 인계자료 위치는 `handoff/celeblife-v2/`다. 위치가 다르면 실제 `START_HERE_FOR_CODEX.md`를 찾아 기준 경로를 잡는다. 이번 ZIP은 이전 인계자료를 대체하지만, 이미 구현한 앱 코드나 사용자 작업파일을 덮어쓰지 않는다.

## 최종 패치 v1.3.1

이 패키지는 v1.3을 대체한다. `docs/LAST_REVIEW.md`의 세 가지 좁은 정정(긴 확인 버튼, completed 역행 차단, 마이크로초 순서 비교)을 반영한다. 실제 앱·DB·외부 인증 검증 전이며 새 제품 질문은 없다. `verification/FINAL_VERIFICATION.md`에서 이번 실행 결과를 확인한다.

## 목표

승인 UI 그대로 **정보·동의 → 실제 Instagram 로그인/권한 → 우리 로딩 → 완료**를 구현한다. Next.js+TypeScript+Node runtime, 기존 Supabase, 네이버웍스 담당자 알림이다. 단기→장기 토큰 교환과 자동 갱신을 모두 구현한다. Streamlit·대시보드·실제 AI 분석·게시물 수집·새 연락처 인증은 제외한다.

## 먼저 읽을 순서

먼저 `docs/DEEP_AUDIT.md`의 현재 감사 결과를 확인한 뒤 아래 기준 문서를 읽는다.

1. 레포의 기존 AGENTS.md, git status 및 현재 운영 코드 구조
2. 이 폴더의 `AGENTS.md`와 `docs/V2_SPEC.md`
3. `docs/UI_UX_SPEC.md`, `docs/BACKEND_DB_SPEC.md`, `contracts/API.md`, `contracts/onboarding.ts`
4. `docs/FINAL_REVIEW.md`, `docs/REPO_MAP.md`, `docs/IMPLEMENTATION_PLAN.md`
5. `docs/TEST_MATRIX.md`, `docs/RESET_PLAN.md`, `docs/RELEASE_CHECKLIST.md`
6. `reference/approved/index.html`, screenshots, `ui/`, `server-reference/`, `templates/`
7. `verification/FINAL_VERIFICATION.md`로 현재 실행된 범위와 NOT_RUN을 구분

## 확정 결정 — 다시 묻지 않는다

기존 토큰 소비 코드는 있으나 현재 실셀럽 부하는 없다. 호환은 조사하고 기존 access_token 저장 계약을 임의 변경하지 않는다. 기존 테스트 계정은 초기화 후 새 가입을 받되 초기화는 대상·시점을 확정한 별도 운영작업이다. 재연동은 기존 계정/최초 분석 유지, token/contact 갱신과 재연동 이력·알림만 생성한다. 같은 요청 중복은 이력도 추가하지 않는다.

이메일/전화번호는 입력·형식 검사만 하고 verified=false다. 같은 연락처 여러 IG 계정 허용. 수신 `dkssud374@celeblife.co.kr`; 발신 기본안도 같지만 SMTP 로그인/허용은 확인 필요. 이 주소를 공개 CONTACT_EMAIL로 자동 복사하지 않는다.

## 구현 규칙

- 같은 레포의 `v2-onboarding` 또는 충돌 없는 branch/worktree에서 `apps/onboarding-v2/` 독립 앱으로 구현. 기존 운영 경로/루트 설정은 P0~P5에서 보존.
- 버전은 구현 시 공식 보안/호환성을 확인하고 lockfile 고정. 새 UI 라이브러리/전역 reset으로 디자인을 바꾸지 않는다.
- 승인 HTML은 이미지 참고가 아니라 실제 DOM/CSS/SVG 이식 원본이다. UIUX의 허용된 기능·접근성 차이만 별도 적용한다.
- Instagram 비밀번호/OTP UI를 만들지 않는다. 모의 인증창·성공 타이머·예시 fallback은 실제 빌드에서 제거한다.
- bootstrap 바인딩 재사용, start payload/key 멱등성, attemptId/revision 확인, 실제 서버 상태, receipt 만료 분리를 구현한다.
- 모든 외부 요청에 시간제한·허용 host·비밀정보 로그 차단. 일회성 code는 불확실한 실패 뒤 맹목 재사용하지 않는다.
- 실제 계정·필요 grant 확인 후 개인정보/동의/token/접수/outbox를 v2 RPC로 원자 확정. 서로 다른 attempt의 최신 token/profiles와 최초 접수를 보호한다.
- token row_version trigger 및 성공/실패 CAS를 테스트한다. 첫 전환의 평문 장기 token 계약과 암호화 임시 checkpoint를 구분한다.
- 등록 SMTP는 commit 뒤 outbox 기반, 실패해도 등록 유지. 만료 processing lease 복구와 지원 플랜의 정기 재시도 포함.
- 정책/비밀키가 없어도 mock/로컬 구현·테스트는 진행한다. 실서비스 검증을 했다고 추정하지 않는다.
- SQL draft는 migration 완성본이 아니다. 실제 테스트 DB에서 migration/RPC/trigger/권한을 검증한다.
- 운영 DB SQL/테스트자료 삭제, main push/merge, 운영 Vercel·Meta 설정 변경, 실제 메일 발송/키 교체는 이번 자동 실행 범위에서 제외한다. 실행 범위가 명시된 별도 승인 후 진행한다.

## 실행

P0~P5를 문서만 재작성하지 말고 구현·테스트까지 수행한다. P6 운영 전환은 준비만 한다. 이미 앱 개발이 시작됐다면 변경 명세를 diff로 반영하고 사용자 코드를 파괴하지 않는다.

## 완료 보고

변경 파일/브랜치, 실행방법, 실제 테스트명령·결과, 승인 UI 비교 이미지, 아직 미구현 항목, 운영 설정 이름(값 제외), 출시 blocker를 제출한다. '참고 함수 테스트', '실제 앱 mock', '실제 Postgres', 'Meta 실계정', 'SMTP 실수신', 'eligible token refresh', '운영 배포'를 따로 PASS/FAIL/NOT_RUN으로 보고한다.

## v1.3 재검토 보완을 적용할 것

`docs/SECOND_REVIEW.md`를 읽고 UIUX의 모바일 보정과 BACKEND_DB_SPEC의 완료 재조회/만료/경합 순서를 반영한다. 승인 원본을 그대로 두고 `ui/production/usability-overrides.css`를 실제 앱의 승인 CSS 뒤에 이식한다. 이는 가짜 인증 타이머/예시 fallback을 실제 앱에 허용하는 뜻이 아니다.

모바일에 관해서는 390px 이미지 하나로 완료 처리하지 말고 TEST_MATRIX MOB01~05의 실제 앱/실기기 검증을 분리한다. API nextPath는 로컬 pathname enum이며 실제 navigation은 서버가 검증한 attemptId query를 붙여 특정 작업을 복원한다. UUID 자체는 권한이 아니다.

## v1.3.2 감사 개정 적용

현재 결과는 `docs/DEEP_AUDIT.md`와 `verification/FINAL_VERIFICATION.md`다. 과거 LAST_REVIEW/FINAL_REVIEW의 '최종' 표현과 숫자는 이력으로 읽는다. UI·production CSS는 이번에 변경하지 않았다. 취소된 인증정보와 본인 입력 초안 복원을 분리하고, 연결 상태/권한 변경에도 token row_version을 증가시키며 refresh의 최종 UPDATE에서 현재 상태를 확인한다. `server-reference/lifecycle-policy.mjs`는 DB 구현이 아닌 판정 참고다. 새 제품 질문을 만들거나 이미 확정된 여섯 답변을 다시 묻지 않는다.
