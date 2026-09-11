# v1.1 검증 범위

사용자 답변을 반영한 설계/계약/SQL 초안/참고 함수 갱신이다. 실제 Next.js 백엔드·DB migration·SMTP·OAuth는 여전히 미구현/미검증이다.

- 이번 버전의 참고 함수 실행 결과: `v1.1-core-tests.tap`.
- 이번 버전의 타입 검사: `v1.1-typecheck.txt`.
- 원본 패키지 대비 승인 reference/분리 UI 바이트 보존: `v1.1-verification.json`.
- 이번 버전에서는 브라우저 스크린샷을 다시 촬영하지 않는다. 아래 10개 화면/7개 동작 기록은 **이전 v1.0 검증 기록**이며 현재 실행 결과로 합산하지 않는다.
- SQL 초안은 실행하지 않았고 실제 초기화/실제 메일 발송/운영 설정 변경도 없다.

---

## 이전 v1.0 검증 기록 (보존)

# 이번 인계 패키지 검증 결과

작성일: 2026-09-10. 모든 결과는 **현재 인계 패키지**에 대한 것이며, 앞으로 구현할 실제 서비스의 검증 결과가 아니다.

| 검증 | 결과 | 증거 |
|---|---|---|
| 승인 HTML 원본 보존 | 바이트 동일 | source-manifest.json의 SHA-256 |
| CSS/JS 추출 무손실 | 동일 | 원본 style/script 본문과 직접 비교 |
| 순수 함수 단위 테스트 | 43/43 PASS | core-tests.tap |
| TypeScript 공개 계약 | strict typecheck PASS | typecheck.txt |
| 원본/분리본 화면 비교 | 10/10 픽셀 동일 | ui-verification.json, *-approved/*-split.png |
| 데모 UI 상호작용 | 7/7 PASS | ui-verification.json |
| 실제 OAuth / DB / SMTP / Cron | 실행하지 않음 | 구현·외부 계정 설정 필요 |
| DB 설계 초안 실행 | 실행하지 않음 | .sql.draft는 실행용 migration 아님 |
| GitHub/운영 설정 변경 | 실행하지 않음 | 이번 작업은 로컬 인계 산출물 생성 |

## 화면 비교 조건과 제한

동일 Chromium 환경에서 desktop1440×960, mobile390×844의 시작/폼/처리/완료/오류 5개 상태를 비교했다. 두 파일의 내용과 분리한 로컬 CSS/JS를 메모리로 주입해 렌더링했으며, 원본과 분리본 간 화면 차이는 없었다. 폰트나 viewport를 달리한 기존 승인 PNG와 새 PNG의 직접 일치를 주장하지 않는다.

현재 실행 환경의 Chromium은 URL 탐색이 관리 정책으로 제한되어 로컬 HTTP 탐색이 차단됐다. 정책을 변경하지 않고 `scripts/verify_ui.py --memory`로 로컬 내용의 DOM/렌더링/동작을 검증했다. 이 모드에서는 테스트 하네스에서만 CSS/JS를 inline으로 주입한다. 배포할 소스나 원본의 CSP를 바꾸지 않았다.

따라서 분리 파일의 실제 HTTP 자산 로딩, 운영 CSP 헤더, production Next.js build, 실기기 Safari/Instagram in-app browser는 이 결과에 포함되지 않는다. Codex 환경에서는 URL 탐색이 가능한 브라우저로 `python scripts/verify_ui.py` 및 새 앱의 E2E를 추가 실행해야 한다.

7개 상호작용: 빈 폼 거절, 예시 입력 시 동의 미체크, 전체/개별 동의 동기화, 약관 Escape 닫기, 취소 시 탭 내 입력 유지, 모의 전체 흐름, 320px 가로 넘침 없음.

이전 시안의 테스트 보고서는 reference/approved/previous-ui-test-report.json에 별도로 보관했다. 그것을 이번 서비스 검증 결과로 합산하지 않았다.
