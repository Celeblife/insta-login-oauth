# v1.3.1 현재 검증 결과

2026-09-10 · Node v22.16.0 / TypeScript5.8.3 / Python3.13.5 / Chromium + Playwright.

이번 실행은 `verification/last-audit/` 아래다. 이전버전 결과는 그 버전의 이력이며 현재 실서비스 검증을 뜻하지 않는다. v1.3의 요약 파일은 history-v1.3/FINAL_VERIFICATION.md로 보존했다.

| 항목 | 결과 |
|---|---|
| 기존 참고 함수 baseline | 95/95 PASS |
| 패치 후 참고 함수 | 111/111 PASS |
| API 공개 타입 검사 | PASS |
| 승인 원본 및 split의 SHA256 | 14/14 동일 |
| 원본 vs split 동일환경 렌더 | 10/10 픽셀 동일 |
| 데모 상호작용 | 7/7 PASS |
| production CSS 모바일 회귀 | 정상70/70, 긴값5/5, 짧은약관3/3, 두배텍스트1/1 |
| 추가 계정확인 모달 | 9/9 PASS; page error0; 외부요청0 |
| localhost HTTP navigation | BLOCKED_BY_ADMINISTRATOR |
| 실행 대안 | 로컬 자산의 페이지 메모리 렌더, 보안 비활성화 없음 |

실제 Next.js 앱/DB/Meta/SMTP/Cron/배포/초기화/암호화는 NOT_RUN. 물리 iPhone/Android/인앱 브라우저/키보드/OS 글자확대/스크린리더도 NOT_RUN. 상세는 docs/LAST_REVIEW.md. 111개는 네트워크·DB 없는 참고함수 테스트다.

검토 중 발생한 harness의 전역 const 재선언은 페이지 격리 후 재검증했다. 새 모달의 추가 높이/secondary 조건 실패는 CSS 보정 후9/9로 재검증했다. 실패 증거를 성공 결과로 덮어 주장하지 않는다.

## 재현

```bash
node --test tests/*.test.mjs
tsc --strict --noEmit --target ES2022 --module nodenext --moduleResolution nodenext contracts/onboarding.ts tests/contracts.typecheck.ts
python scripts/verify_ui.py --memory --output-dir verification/last-audit/equivalence
python scripts/verify_mobile_review.py --output-dir verification/last-audit/mobile
python scripts/verify_last_review.py
python scripts/verify_package.py
```

브라우저 이미지 재생성은 OS/글꼴/Chromium 버전에 따라 파일 hash를 바꿀 수 있다. manifest는 배포된 인계파일의 무결성 기준이며, 실행환경 차이로 새 증거가 생성됐다고 원격 서비스 오류라고 해석하지 않는다.
