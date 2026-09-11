# v1.3.2 실제 실행 검증

2026-09-10 · 대상은 로컬 인계자료. 운영서비스 검증이 아니다. Node v22.16.0, TypeScript 5.8.3, Chromium144.0.7559.96/Playwright. 과거 결과는 history 및 LAST_REVIEW/SECOND_REVIEW에 분리한다.

| 검증 | 이번 결과 | 증거 |
|---|---|---|
| 수정 전 기존 참고함수 | 111/111 PASS | deep-audit/baseline.tap |
| 수정 후 참고함수 | 131/131 PASS: 기존111 + 신규20 | deep-audit/final-tests.tap |
| 공개 API 타입 | PASS | deep-audit/final-types.txt |
| 원본·이미지·분리 UI | 14개 모두 SHA256 동일 | deep-audit/unchanged-files.json |
| production CSS·기존5개 참고모듈·공개타입 | 바이트 동일 | 같은 JSON의 additional_unchanged_files |
| 원본↔분리본 | 10개 화면 픽셀 동일, 모의 상호작용7개 PASS | deep-audit/equivalence/ui-verification.json |
| production 모바일 회귀 | 일반70/70, 긴값5/5, 짧은모달3/3, 글자 probe1/1 | deep-audit/mobile/results.json |
| 계정확인 모달 회귀 | 9/9 PASS | deep-audit/confirmation/confirmation-probes.json |
| 독립 키보드 probe | 6/6 PASS, 배경컨트롤 차단 기준 | deep-audit/keyboard-probes.json |
| 취소·철회 규칙 대조 | 문구의 모순/누락 조건에 대한 반례 모델; DB 검증 아님 | deep-audit/lifecycle-counterexamples.json |
| 통합문서 이전 버전 | ID6종 중복, 목차27개 중 오이동12개 | deep-audit/baseline-reader.json |
| 수정 후 통합문서 | verify_reader.py 실행 결과, 고유 목차 목적지 확인 | deep-audit/reader.json |
| 파일·링크·ZIP | verify_package 및 별도 archive 검사 | package-check.json / 별도 패키징 결과 |

키보드 첫 probe의 실패는 browser chrome 포커스를 배경 폼으로 오인한 검사조건이었다. 원본 기록과 focus trace를 보존하고 수정된 좁은 검사기준을 명시했다. 모달 포커스 순환·전체 접근성 완료로 확대 해석하지 않는다.

localhost HTTP 탐색은 ERR_BLOCKED_BY_ADMINISTRATOR. --memory로 로컬 자산만 검사했고 브라우저 보안을 비활성화하지 않았다. 원본 preview와 production CSS의 차이는 기존에 승인된 이식 보정이며 이번 CSS 변경은 없다.

**NOT_RUN:** 실제 React/Next.js API/build/CSP, PostgreSQL RPC/trigger/RLS/동시성, 암호화/키회전, Meta/NAVER WORKS, 운영 Cron/배포/초기화/롤백, 물리 iOS/Android 및 인앱 OAuth/가상키보드/OS확대/스크린리더. 새 lifecycle 참조함수는 이들 구현이나 인증을 대체하지 않는다.
