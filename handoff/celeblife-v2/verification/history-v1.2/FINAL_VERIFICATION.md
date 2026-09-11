# 이번 최종 패키지 검증 결과

v1.2 FINAL · 2026-09-10 · 환경: Node v22.16.0, Version 5.8.3, Python 3.13.5, Chromium + Playwright.

| 검증 | 실제 결과 | 증거 |
|---|---|---|
| 참고 함수 단위 테스트 | **95/95 PASS** | final-core-tests.tap |
| 공개 API 타입 + 정상/오류 타입 예제 | **PASS** | final-types.txt는 tsc 오류 출력 없음 |
| 승인 HTML·이미지·split 소스 무변경 | **14개 파일 SHA256 동일** | approved-source-integrity.json |
| 승인 원본 vs split 데스크톱1440×960 / 모바일390×844 | **5상태×2뷰포트 =10개 픽셀 동일** | ui-verification.json, 이번 *-approved.png/*-split.png |
| 모의 UI 상호작용 | **7개 PASS** | 입력/동의/모달/취소/모의완료/320px 넘침 등 |
| UI runtime page error / 외부 요청 | **0 / 0** (아래 제한된 모드) | ui-verification.json |
| HTTP로 로컬 HTML 열기 | **BLOCKED**: 환경이 localhost navigation 차단 | http-ui-attempt.txt/json |
| 대체 UI 로딩 | **메모리에 로컬 HTML/CSS/JS 주입** 후 비교 | final-ui-run.txt; HTTP/CSP 검증을 대체하지 않음 |
| 패키지 링크·해시·포함파일 | 별도 구조 검사 결과 참고 | package-check.json |

## 실패 후 수정·제한

최초 타입 검사에서 테스트 예제의 `confirmation_required`가 계약의 `account_confirmation_required`와 불일치하여 실패했다. 예제를 올바른 계약명으로 바꾼 뒤 타입 검사를 다시 통과했다. 최초 오류 증거는 typecheck-before-fix.txt에 보존한다.

이 환경에서는 `http://127.0.0.1` 탐색이 정책으로 차단되었다. 브라우저 보안을 꺼서 우회하지 않았으며, 기존 검증 스크립트의 `--memory` 모드로 **로컬 자산을 화면 메모리에 주입한 결과만** 검증했다. 이때 harness가 CSS/JS를 inline으로 바꾸는 것은 테스트용 복사본에만 적용된다. 배포 소스/CSP는 변경하지 않았다. 실제 정적 파일 서버·CSP·React 이식·OAuth 네트워크 검증은 별도다.

## 이번에 실행하지 않은 것 — NOT_RUN

실제 Next.js 앱 구현·build, 실제 DB migration/RPC/trigger/RLS/동시성, 암호화 round-trip·키회전, 실제 Meta OAuth·grant 확인·갱신, 실제 NAVER WORKS 인증·메일 수신, 운영 Cron·도메인 전환·rollback·데이터 초기화는 수행하지 않았다.

95개는 순수 참고 함수 테스트 수이며 95개 서비스 통합 테스트를 뜻하지 않는다. 원본과 split의 픽셀 일치는 새 Next 앱이나 새 재연동/오류 화면이 완성됐다는 뜻이 아니다. 향후 구현자는 TEST_MATRIX의 인수검사를 별도로 실행한다.
