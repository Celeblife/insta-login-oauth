# v1.3.2 감사 — 재현된 결함과 명세 보완을 분리한 검토

2026-09-10 · 검토 입력: v1.3.1 ZIP. 범위: 로컬 문서·공개 계약·SQL 초안·참고 함수·승인 UI와 production CSS·통합 문서 생성기. 원격 GitHub의 현재 작업 코드, 운영 DB/Vercel/Meta/NAVER WORKS는 이번 검토 대상이 아니며 변경하지 않았다.

입력 ZIP SHA-256: `b3de478f67a6fa1dbcca05733946c3e821f7b53d3c5e1ded4a8e6c0e1d0709ff`.

## 1. 판정과 이전 ‘최종’ 표현 정정

이 패키지는 구현 인계자료이며, 작동하는 서비스가 아니다. 이전 ‘최종’, ‘검토를 닫는다’는 표현이 결함이 더는 없다는 보증처럼 읽혔다면 부정확하다. 기존 테스트가 통과하는 것과 확인하지 않은 조건까지 안전한 것은 다르다.

이번 판정은 **기존 111개 참고함수 회귀 통과, 기존 모바일 보정 회귀 통과, 문서 생성기 결함 1건 수정, 명세 충돌 1건 정정, 보안 경계 명시 누락 1건 보완**이다. 셋 모두를 실서비스에서 재현한 버그라고 부르지 않는다. 새 제품 질문·프레임워크 변경·디자인 변경은 없다.

## 2. 고정한 검토 영역과 결과

| 영역 | 확인 방법 | 결과/한계 |
|---|---|---|
| 확정 제품 결정 | 사용자 6개 답변과 V2_SPEC 대조 | 연락처 입력만, 다계정, 재연동 분석 중복 금지, 고정 담당자 메일, 테스트자료만 초기화 유지 |
| 요청·세션·복구 | state/TTL/완료 재조회/restart/취소 문구와 계약 대조 | 취소와 초안 접근의 모순 A01 정정 |
| 토큰·권한·경합 | version/CAS/철회/삭제 조건의 반례 모델 | 상태만 변경된 경우의 보호 누락 A02 보완; 실제 DB 검증 아님 |
| 참고 코드 | 기존111개를 수정 전 재실행; 신규 경계 판정20개 추가 | 131/131 통과; 기존5개 참고 모듈 자체는 변경 없음 |
| API | 동일 TypeScript 계약·예제 재검사 | 통과; 실제 HTTP 서버는 없음 |
| UI·모바일 | 원본↔분리본 비교, 70개 폭/상태, 긴값·짧은 모달·글자 probe, 계정확인창9조건 | 기존 보정본 모두 통과; 새 CSS 수정 없음 |
| 키보드 | 순차입력·Space·Enter·Escape·배경포커스 검사 | 6개 좁은 DOM 조건 통과; native browser chrome 이동은 별도로 기록 |
| 문서 인계 | 모든 HTML ID와 목차 목적지 대조 | A03 실제 오이동 재현 및 생성기 수정 |
| 운영·외부서비스 | 이번에는 실행하지 않음 | 아래 NOT_RUN 및 기존 RELEASE_CHECKLIST 유지 |

## 3. 발견 항목

### A01 — 명세 충돌 / 중간 우선순위: 취소된 인증과 폼 초안은 다른 권한

**기존 문구:** BACKEND_DB_SPEC은 ‘취소/만료 자료는 즉시 접근 금지’, TEST_MATRIX AU04는 취소 후 ‘유효 draft 복원’을 요구했다. 모든 cancelled 자료를 일괄 차단하면 복원이 불가능하고, 인증자료까지 복원하면 취소한 state/code를 재사용할 위험이 있다.

**정정:** 정상적으로 바인딩된 Instagram 승인 취소 시 해당 OAuth state/code/token은 즉시 무효화·삭제한다. 동일 브라우저의 동의 후 입력 초안만 원래 30분 제안기한 안에서 폼 복원에 사용할 수 있다. 취소/restart/조회로 원래 기한을 연장하지 않는다. 만료·대체·개인정보 삭제·다른 브라우저는 복원하지 않는다. 새 시도에는 새 state/code가 필요하다. 정책이 달라지면 폼에서 재동의한다.

restart 응답 유실은 동일 browser+requestKey의 child를 재사용하도록 명시했다. parent 취소 후 동일 재요청이 왔다고 새 child를 생성하지 않는다. 이미 완료된 부모는 완료 결과를 보존한다.

**증거:** 문구 대조와 `lifecycle-counterexamples.json`의 규칙 모델, 신규 판정 테스트. **실제 취소 API나 DB를 실행해 장애를 재현한 것은 아니다.**

### A02 — 명시 누락 / 높은 구현 우선순위: 상태만 해제돼도 오래된 갱신을 막아야 함

**기존 조건의 반례:** worker가 version7의 connected 토큰을 읽은 뒤, token/expiry는 그대로이고 상태만 revoked가 됐다고 하자. 문서가 명시한 ‘token/expiry 변경 시 버전 증가’만 구현하면 version7이 유지된다. 버전·만료일만 확인한 오래된 worker는 이후 쓰기를 통과할 수 있다. 실제 구현자가 더 강한 조건을 넣을 수도 있으므로, 이것을 이미 배포된 취약점이라고 단정하지 않는다.

**보완:** 상태·권한·발급원 정보 변경도 보안 버전을 증가시킨다. 최종 refresh는 같은 행·현재 보안 버전·사용 가능한 상태를 하나의 조건부 UPDATE에서 검사한다. revoked/reauth_required 제외, 삭제된 행의 UPSERT/재생성 금지, refresh만으로 unknown→connected 승격 금지. 권한 복구는 새 정상 OAuth 승인으로 처리한다. 외부 호출 성공과 최종 DB 저장 성공을 구분한다.

**증거:** v1.3.1에 명시된 최소 조건을 모델링하면 old write=true, 보완 조건에서는 false. 새 순수 판정 테스트는 상태/버전/삭제/정수경계를 확인했다. **트리거·실제 PostgreSQL 동시성·Meta 철회 동작은 NOT_RUN**이다. SQL의 조건 확인과 쓰기를 한 문장 안에 묶는 설계 근거는 PostgreSQL Transaction Isolation 공식 문서의 UPDATE 조건 재평가 설명을 참고했다.

### A03 — 재현된 코드 결함 / 중간 우선순위: 통합 인계서 목차가 다른 장으로 이동

**재현:** build_reader.py는 모든 `10.`, `11.` 같은 내부 제목도 최상위 문서 섹션으로 인식했다. 원본 HTML에 `section-10`부터 `section-15`까지 6종의 중복 ID가 생겼고, 27개 목차 항목 중 12개는 첫 번째 같은 ID가 붙은 다른 제목으로 이동했다. ‘실제 앱 인수 테스트’를 눌러 ‘완료 기준’으로 이동하는 식이다.

**수정:** 생성기가 정한 최상위 ‘번호+문서제목’ 전체와 일치하는 제목에만 앵커를 부여한다. 원본 상세 Markdown의 제품 요구사항을 바꾸는 수정은 아니다. `verify_reader.py`가 전역 ID 중복·목차와 실제 목적지 제목·누락된 내부 링크를 검사한다.

**증거:** `baseline-reader.json`에 잘못된 목적지12개, 수정 후 `reader.json`에 중복0/오이동0을 기록한다. 이는 인계문서 생성기 버그이며 서비스 OAuth/DB 버그는 아니다.

## 4. 이번에 고치지 않은 것

승인 원본·분리 UI·production CSS·공개 TypeScript 타입·기존5개 순수 참고 모듈은 그대로다. 새 테이블/서비스/대시보드/인증 절차를 추가하지 않았다. SQL 초안에는 버전 트리거와 UPDATE 요구를 주석으로 명확히 했으며, 완성 migration이나 실제 트리거를 구현했다고 하지 않는다.

장기 토큰 평문 저장의 잔여 위험, 실제 권한 확인 방법, 운영 연락처/보유기간/약관, 상업 플랜·Cron 지원, SMTP 설정은 기존 출시 조건이다. 이번에 새로 발견한 결함 수에 포함하지 않았다. 이 조건은 개발자가 임의로 통과 처리하지 못한다.

## 5. 테스트의 오판도 결함과 구분

첫 키보드 probe는 ‘Tab마다 activeElement가 반드시 dialog 안이어야 한다’고 가정해 실패했다. trace를 보니 배경 폼이 아니라 브라우저 chrome으로 이동하며 `document.hasFocus()=false`, activeElement=BODY가 된 경우였다. 이를 앱 버그로 세거나 CSS/JS를 억지로 바꾸지 않았다.

수정한 검사 기준은 ‘문서에 포커스가 있는 동안 배경 컨트롤이 활성화되지 않는가’다. 초기 실패와 trace도 보존한다. 이것은 엄격한 모달 내부 wrap, 실제 스크린리더, WCAG 전체 합격을 입증하지 않는다. 실제 앱에서 요구되는 모달 인수검사는 그대로 남긴다.

localhost HTTP 탐색은 이번에도 ERR_BLOCKED_BY_ADMINISTRATOR였다. 보안을 끄지 않고 로컬 자산을 메모리에 렌더링했다. HTTP/CSP/배포 라우팅이 통과했다고 보고하지 않는다.

## 6. 실제 검증 결과와 재실행

실행한 결과는 `verification/FINAL_VERIFICATION.md`와 `verification/deep-audit/`를 따른다. 기존111개는 그대로 통과했고 새 경계판정20개를 추가해 총131개다. 테스트 개수는 기능 완성도 점수가 아니다. 모델 테스트가 실제 DB 락/함수/제공자를 구현하는 것은 아니다.

```bash
node --test tests/*.test.mjs
tsc --strict --noEmit --target ES2022 --module nodenext --moduleResolution nodenext contracts/onboarding.ts tests/contracts.typecheck.ts
python scripts/verify_ui.py --memory --output-dir verification/deep-audit/equivalence
python scripts/verify_mobile_review.py --output-dir verification/deep-audit/mobile
python scripts/verify_last_review.py --output-dir verification/deep-audit/confirmation
python scripts/verify_keyboard.py
node scripts/model-lifecycle-counterexamples.mjs
python scripts/build_reader.py
python scripts/verify_reader.py
python scripts/verify_package.py
```

메모리 모드는 로컬 HTTP 탐색 불가 시에만 사용하며 서비스 네트워크 검증을 대신하지 않는다.

## 7. NOT_RUN — 남은 구현/운영 조건

실제 Next.js 빌드와 API, PostgreSQL migration/RPC/트리거/RLS/동시성, 암호화 구현·키 회전, Meta 계정·권한·OAuth·갱신, NAVER WORKS 로그인·실수신, Vercel Cron/배포/전환/초기화는 실행하지 않았다. 원격 레포의 최신 커밋도 이번에 다시 검사하지 않았다.

물리 iPhone/Android, Instagram 인앱 브라우저, 실제 키보드·노치·OS 글자확대·VoiceOver/TalkBack도 실행하지 않았다. 해당 조건은 실제 앱 구현 후 인수검사다.

## 8. 다음 검토는 무엇으로 판단할 것인가

현재 발견한 문서 문제는 반영했으며, 검토 범위와 증거를 고정했다. ‘다시 보면 반드시 0건’이라고 보장하지 않는다. 이후 구현자는 동일 TEST_MATRIX에 실제 앱 결과를 채워야 한다. 문구 다듬기 같은 개선 제안과 접수/보안/권한 실패를 같은 blocker로 취급하지 않는다. 운영 무결함 선언 없이도 개발은 진행할 수 있다.

## 근거

검토의 1차 근거는 입력 ZIP·변경 diff·실행 로그다. [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)은 UPDATE 조건의 재평가와 격리수준을, [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after)는 응답 후 작업의 실행 제약을 설명한다. [OAuth Security BCP](https://www.rfc-editor.org/rfc/rfc9700.html) 및 [W3C Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)는 일반 보안·키보드 기준이며 특정 회사의 실제 서비스 합격증이 아니다. Meta/SMTP 계정 설정은 이번 검토에서 확인하지 않았다.
