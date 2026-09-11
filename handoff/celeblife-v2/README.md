# 셀럽라이프 인스타 연동 v2 — 최종 인계 패키지

**v1.3.2 AUDIT · 2026-09-10**

승인 UI를 그대로 기능에 연결하기 위한 개발 인계자료다. 완료된 Next.js 서비스나 운영 적용된 DB가 아니다. 기존 GitHub/운영 DB/Vercel/Meta/메일은 변경하지 않았다.

## 이번 감사 개정

v1.3.2는 v1.3.1 전체 패키지를 대체한다. `docs/DEEP_AUDIT.md`가 이번 감사 결과다. 실제 문서 생성기 결함, 명세 충돌/보완, 운영 미검증 항목을 분리한다. 승인 UI와 보정 CSS는 변경하지 않았다. 기존 자료의 FINAL/최종 표현은 당시 이력이며 무결함·운영 합격 선언으로 쓰지 않는다.

## 시작

이 폴더 내용을 레포의 `handoff/celeblife-v2/`에 둔다. 레포 루트에 덮어쓰지 말고, 이전 인계자료와 이미 작성한 앱 코드를 구분한다. Codex에는 `START_HERE_FOR_CODEX.md`를 읽고 P0~P5를 구현하도록 요청한다.

읽기용 통합 문서는 `FINAL_HANDOFF.md`와 `FINAL_HANDOFF.html`이다. HTML은 로컬 브라우저에서 열 수 있고 외부 계정 연결·입력 전송이 없다. 전체 개발 기준 문서는 아래와 같으며 통합본은 이 문서들의 파생본이다.

| 파일 | 역할 |
|---|---|
| [현재 감사](docs/DEEP_AUDIT.md) | v1.3.2 범위·발견·증거·잔여 위험 |
| [이전 검토](docs/LAST_REVIEW.md) | v1.3.1 검토 이력 |
| [V2_SPEC](docs/V2_SPEC.md) | 범위·사용자 확정 결정·상태·정책의 단일 기준 |
| [UI_UX_SPEC](docs/UI_UX_SPEC.md) | 승인 UI, 각 화면/카피/입력/반응형/접근성/실제 API 연결 |
| [BACKEND_DB_SPEC](docs/BACKEND_DB_SPEC.md) | 업무 모듈·데이터 사전·트랜잭션·권한·경합·작업 복구 |
| [API 계약](contracts/API.md) | 공개 타입과 endpoint 요청·응답·오류 |
| [최종 검토](docs/FINAL_REVIEW.md) | 발견/수정사항 및 잔여 위험 |
| [출시 게이트](docs/RELEASE_CHECKLIST.md) | 아직 확인하지 않은 외부설정·정책·운영 승인 |
| [구현 순서](docs/IMPLEMENTATION_PLAN.md) | P0~P5 개발, 별도 승인 P6 |
| [인수 테스트](docs/TEST_MATRIX.md) | 실제 앱에서 실행해야 할 검증 |
| [초기화 계획](docs/RESET_PLAN.md) | 테스트 데이터만 안전하게 정리하는 별도 절차 |
| [이번 검증](verification/FINAL_VERIFICATION.md) | 이 패키지에서 실제 실행한 것과 NOT_RUN |

`reference/approved/`: 원본 HTML/이미지 그대로. `ui/`: HTML/CSS/JS 분리된 모의 UI. `server-reference/`: 네트워크·DB 없는 순수 참고함수. `contracts/`: 실제 구현이 따라야 할 TypeScript 공개 타입. `templates/*.draft`: 검토용 SQL 초안, 자동 적용 금지. `verification/history-v1.1/`: 과거 증거, 이번 검증과 구분.

## 패키지 자체 재검증

```bash
node --test tests/*.test.mjs
tsc --strict --noEmit --target ES2022 --module nodenext --moduleResolution nodenext contracts/onboarding.ts tests/contracts.typecheck.ts
python scripts/verify_ui.py
python scripts/verify_reader.py
python scripts/verify_package.py
```

UI 검증에는 Python Playwright/Pillow와 Chromium이 필요하다. `--memory`는 로컬 URL 탐색이 불가능할 때만 쓰는 제한된 대안이며 HTTP/CSP 검증을 대신하지 않는다. 이 패키지는 폰트 파일을 포함하지 않으며 글꼴에 따른 렌더링 차이는 동일 환경에서 비교한다.

## 개발용 핵심 안전조건

실계정 token/code/DB 키/SMTP 비밀번호를 문서에 붙이지 않는다. `MAIL_ENABLED`/`TOKEN_REFRESH_ENABLED`는 기본 꺼짐. 설정이 없으면 mock만 실행하며 실제 완료로 보고하지 않는다. 테스트자료 초기화 방향과 운영 삭제 실행 승인은 별개다.

## v1.3 재검토

[추가 검토 결과](docs/SECOND_REVIEW.md)에 재현한 문제와 범위를 기록했다. [실제 앱용 CSS 보정](ui/production/usability-overrides.css)은 승인 파일을 변경하지 않으며, [모바일 레이아웃 검사](scripts/verify_mobile_review.py)로 보정 전후를 비교한다. 통합본은 이번 상세 명세를 다시 모은 파생본이다.
