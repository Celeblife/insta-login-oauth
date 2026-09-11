# 결정 및 변경 이력

## 2026-09-10 / 설계 v1.0

**사용자 확정:** 승인 UI 그대로 사용, Streamlit/대시보드 제거, 정보 4개+동의, 실제 Instagram 외부 인증, 토큰 보관/갱신, 담당자 네이버웍스 메일, 약 하루 분석/연락 안내, 기존 서비스 중단 금지.

**이번 설계 선택:** 기존 레포의 별도 branch+apps/onboarding-v2 독립 앱; Next.js/TypeScript 서버; callback→처리 화면→완료 POST; browser-bound 임시 세션; 원자적 v2 RPC; persistent request+outbox; 운영/스테이징 분리. 새 GitHub 저장소, 별도 관리자 UI, 분석 실행은 추가하지 않음.

**이전 논의에서 구체화:** 기존 user_consents 구조버전1은 그대로 재사용 가능하므로 UIv2라는 이유만으로 version2 CHECK 변경하지 않음. 이메일 작업만 있고 정식 접수 기록이 없는 구성을 피하기 위해 onboarding_requests 명시. 크론 경합 방지용 job_leases 추가.

**인계 코드와 최종 앱 구분:** ui/는 모의 UI, server-reference/는 순수 함수, contracts/는 계약, SQL은 rollback하는 설계 초안. 실제 서비스는 Codex가 구현한다.

**보안 선택:** 기존 tokens.access_token에 암호문을 임의 저장하지 않음. 기존 소비자 계약 유지의 잔여 위험을 출시 전 검토. 임시 code/token은 새 전용 암호화. 전체 장기 token 암호화는 모든 소비자 이식과 함께 별도 결정.

**미확정/출시 blocker:** 회사 SMTP 발신/수신/문의 계정, 실제 domain/Meta 승인/redirect 설정, prod/test DB와 Vercel 프로젝트 식별, 확정 정책/보유기간, 운영 플랜/재시도 스케줄, 실제 1영업일 처리, v2→v1 rollback callback bridge 검증.

---

후속 변경은 날짜·변경 이유·영향 코드·테스트·운영 승인 필요 여부를 여기에 추가하고 V2_SPEC 해당 절을 수정한다. 승인 reference HTML을 편집해 변경 이력을 지우지 않는다.

## 2026-09-10 / 설계 v1.1 — 사용자 6개 답변 반영

- **사용자 확정 D01:** 기존 토큰 사용 코드는 존재하나 현재 실제 셀럽 등록·가동 부하는 없음. 소비자 없음으로 오해하지 않는다.
- **사용자 확정 D02:** 기존 등록은 본인 테스트 계정. 새 버전에서 처음부터 정보/동의/인스타 인증을 받기 위해 테스트 자료 초기화. 정식 데이터 이관·일괄 정보 보완은 만들지 않는다.
- **사용자 확정 D03:** 기존 계정 재연동은 토큰과 최신 연락처 갱신, 이력, 재연동 알림. 새 분석 신청 중복 생성 금지.
- **사용자 확정 D04:** 연락처는 입력만 받음. SMS/메일 소유권 인증 없음.
- **사용자 확정 D05:** 같은 연락처의 복수 계정 허용. 계정 기준으로 분리, 연락처 UNIQUE 없음.
- **사용자 확정 D06:** 담당자 메일 `dkssud374@celeblife.co.kr`. 발신 기본안도 같은 계정으로 두지만 SMTP 허용/인증은 실환경 검증. 공개 문의 주소로 자동 노출하지 않음.

**정정:** v1.0의 “새 attempt는 별도 접수가 될 수 있음”을 세분화했다. 연결 이력은 매 성공 attempt마다 기록하되 최초 정식 v2 신청만 pending_review, 재연동 이력은 not_requested다. 기존 v1 users 행만 있으면 첫 정상 v2 신청을 만든다. 재연동 완료 화면은 같은 디자인의 갱신 완료 문구로 처리한다.

**운영 안전:** 데이터 초기화 방향은 승인됐으나 이번 답변으로 실제 DB를 즉시 삭제한 것은 아니다. 기존 구조와 토큰 읽기 계약은 첫 전환까지 유지. RESET_PLAN에 대상·동시 변경 보호·초기화 시점을 분리했다. 장기 토큰 암호화를 완료했다고 주장하지 않으며, 소비자 이식과 함께 별도 결정한다.

**남은 출시 조건:** 실제 SMTP 로그인/TLS/발신·수신, 운영/테스트 DB·Meta·배포 설정, 정책 전문/보유기간/공개 문의 경로, 1영업일 운영 가능성, 초기화 대상과 실행 시점, 콜백·rollback 검증. 이는 제품 질문 6개를 다시 묻는 목록이 아니라 구현/운영 점검 목록이다.

**변경 파일:** V2_SPEC, START_HERE, API 계약, DB draft, env 예시, 실행계획/테스트, 메일 참고 코드, 최초/재연동 판정 참고 코드. 승인 UI/이미지는 수정하지 않는다. 운영 실행·GitHub 변경 없음.

## v1.2 FINAL · 2026-09-10

최종 검토로 UI_UX_SPEC/BACKEND_DB_SPEC/RELEASE_CHECKLIST/FINAL_REVIEW를 추가했다. 사용자 제품결정과 승인 원본은 변경하지 않았다. 실제 요청 계약에 attemptId, expectedRevision, start replay/resume, active attempt bootstrap을 고정했다. state 암호화+payload keyed hash, receipt TTL 분리, stale authorization/refresh CAS, BIGINT DB text 반환을 명세했다. 전화00 거절/replaceAttemptId 검증을 순수 참고 코드에 반영했다.

메일은 등록·재연동 SMTP만 필수이며 토큰 운영 실패는 기존 선택적 webhook/집계 로그 경로를 사용한다. 5분 retry scheduler는 플랜 게이트다. UI 원본의 시각 표현과 실제 입력·재연동·오류 의미를 구분했다. 기존 검증 기록은 history-v1.1, 이번 실행만 FINAL_VERIFICATION에 보고한다. 상세 발견 목록은 FINAL_REVIEW를 따른다.

## v1.3 — 추가 사용자 요청에 따른 전체 재검토

사용자가 Codex의 이해 가능성과 모바일 고려 여부를 재검토하도록 요청했다. 새로운 제품 선택은 하지 않았다. 승인 원본의 긴 완료정보/짧은 약관 모달 결함을 재현하고 production-only CSS를 추가했다. 보조 터치영역/텍스트 대비도 일부 보정했다. 원본 보존과 사용성 결함 복사를 구분한다.

문서의 완료 재조회 가드 순서 및 동시 최초등록 테스트 기대값을 정정했다. callback 후 exact attempt를 안전한 UUID query로 복원하도록 선택하고, cleanup 이전 만료 pending의 새 start를 처리하도록 구체화했다. 이 변경은 운영 데이터·외부 계정·배포를 수정하지 않는다.

## v1.3.1 · 최종 패치

- 제품 요구사항 변경 없음. 기존 승인 UI 원본/분리 시안은 보존.
- production CSS에 긴 인증 계정명 포함 CTA 줄바꿈만 추가.
- shouldAcceptStatus는 status 두 값 필수. completed 역행은 차단, 권한/만료 UI 정리는 별도 우선 경로.
- isOlderAttempt 참고 함수는 DB timestamp 마이크로초를 보존; 실제 판정은 SQL lock 안에서 수행.
- 재검토 결과·실행/미실행 증거는 LAST_REVIEW / FINAL_VERIFICATION. 이전 보고서는 이전 버전의 이력.

## v1.3.2 AUDIT · 2026-09-10

- 제품/UI 결정 변경 없음. 모든 승인 자료와 production CSS 보존.
- A01: 취소 인증정보 재사용 금지와 본인 초안 제한 복원을 분리. restart 멱등 재조회 명확화.
- A02: 연결 해제/권한 변경도 row_version 증가. refresh는 현재 상태 검증 UPDATE만, 삭제 행 재생성 금지.
- A03: 통합 문서의 내부 숫자 제목이 최상위 목차로 잘못 편입되던 생성기 수정. 고유 anchor/실제 목적지 검사 추가.
- 이전의 '최종'은 운영 무결함 의미가 아니다. 실제 결함·설계 보완·실서비스 NOT_RUN을 따로 보고한다.
