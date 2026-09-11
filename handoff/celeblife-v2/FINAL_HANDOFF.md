# 셀럽라이프 온보딩 v2 · 재검토 인계서

**v1.3.2 AUDIT · 2026-09-10**

승인 UI·제품 결정을 유지한 감사 개정본입니다. 취소 초안 복원과 연결 해제·갱신 경계를 명확히 하고 통합 문서 목차를 수정했습니다. 실제 서비스·실기기·외부 계정 검증은 별도입니다. 이 통합본은 상세 문서의 읽기용 파생본입니다.


---

## 01. 고정 범위 감사 결과

원문: `docs/DEEP_AUDIT.md`


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


---

## 02. 이전 v1.3.1 검토 이력

원문: `docs/LAST_REVIEW.md`


2026-09-10 · 기준: 사용자가 승인한 v1.3 ZIP의 실제 문서·참고 함수·타입·모바일 CSS.

## 결론

**설계 인계 가능. 전면 재설계나 새 제품 결정은 필요하지 않다.** 이번에 직접 재현한 세 가지 좁은 결함/누락을 패치했다. v1.3.1을 Codex 구현 기준으로 사용한다. 이 판정은 실제 앱 완성·운영 출시 승인이 아니다.

제품 범위, 승인 원본, 최초/재연동 정책, 연락처 무인증, 동일 연락처의 다계정 허용, 담당자 수신 주소, 테스트자료 초기화 방향은 변경하지 않았다. 원격 GitHub, 운영 DB, Vercel, Meta, 회사 메일에는 접근·변경·발송을 하지 않았다. 검토 대상은 로컬 인계 패키지이며 원격 레포 최신 커밋을 다시 확인한 것은 아니다.

## 1. 재현한 문제와 수정

| ID | 실제 재현 | 수정 범위 | 의미/남은 일 |
|---|---|---|---|
| L01 계정 확인 모달 | 명세의 `@실제계정으로 연결` 버튼에 30자 아이디를 넣으면 폭320에서 버튼234px보다 텍스트 범위가 커서 잘림. 두 버튼+낮은 화면 또는 두 배 텍스트에서는 보조 버튼/본문도 가릴 수 있었음 | production CSS에 flex 버튼 줄바꿈, 보조 버튼 최소높이, 본문 최소 가시영역 및 극단적 높이에서 전체 모달 스크롤 fallback | 기존 승인 원본은 보존. 명세상 추가 확인창을 승인 DOM에 구성한 로컬 probe이며 실제 React 모달을 구현한 것은 아님 |
| L02 완료 상태 보호 | shouldAcceptStatus에 completed→processing과 더 큰 revision을 전달하면 기존 함수가 true 반환 | currentStatus/receivedStatus를 필수 검사하고 completed 역행 차단. 호출 테스트도 두 status를 명시 | 실제 401/403/410 권한·세션 만료는 별도 경로에서 개인정보를 비우도록 명세. 완료 화면 영구 고정이 아님 |
| L03 연결 순서 정밀도 | `.000001Z`와 `.000999Z`를 기존 Date.parse가 같은 밀리초로 비교해 UUID 사전순으로 오래된 작업을 잘못 판정 | 참고 함수에서 마이크로초 보존·정규화 UUID 비교. 실제 최종 판정은 DB TIMESTAMPTZ+UUID, account lock 안에서 수행 | 참고 함수 개선이지 실제 DB 경합/CAS 검증 완료가 아님 |

큰 화면·보통 길이의 입력만 보거나 기존95개 테스트만 돌렸을 때는 모두 통과했다. 이번16개 회귀 테스트와 계정확인 모달 변형 probe가 추가 경계를 검사한다. 새로운 문제를 숨기기 위해 승인 원본이나 기존 정책을 바꾸지 않았다.

## 2. 지금 실행한 검증

| 검사 | 실제 결과 | 증거 위치 |
|---|---|---|
| 수정 전 기존 참고 함수 | 95/95 PASS | verification/last-audit/baseline-tests.tap |
| 수정 후 참고 함수 | 111/111 PASS (기존95+신규16) | verification/last-audit/final-tests.tap |
| API TypeScript | PASS, 오류 출력 없음 | verification/last-audit/final-typecheck.txt |
| 원본·split·승인 이미지 | 14/14 SHA256 동일 | verification/last-audit/approved-integrity.json |
| 원본 vs split | 5상태×2뷰포트, 10/10 픽셀 동일 | verification/last-audit/equivalence/ui-verification.json |
| 모의 UI 상호작용 | 7/7 PASS | 같은 UI JSON |
| 기존 모바일 보정 회귀 | 일반70/70, 긴값5/5, 짧은 약관3/3, 두 배 텍스트1/1 | verification/last-audit/mobile/results.json |
| 계정 확인 모달 추가 | 9/9 PASS, page error0 / 외부요청0 | verification/last-audit/confirmation-probes.json |
| 패키지 무결성 | 최종 manifest/로컬 링크 검사 결과 별도 | verification/package-check.json |

확인창9조건은 폭320/360/390/430/861, 짧은 높이320/420, 좁은 화면의 두 배 computed 텍스트를 조합했다. 낮은 화면에서 고정 머리·꼬리를 무조건 강요하지 않고, 필요한 경우 모달 전체를 스크롤해 모든 정보와 버튼에 접근하도록 했다. 본문 높이가0인데도 버튼이 보인다는 이유로 통과시키지 않았다.

## 3. 검증 한계와 시행착오

localhost HTTP 열기는 이번 실행에서도 ERR_BLOCKED_BY_ADMINISTRATOR였다. 브라우저 보안 설정을 해제하지 않고 로컬 HTML/CSS/JS를 새 페이지 메모리에 주입했다. 따라서 HTTP/CSP/Next.js 런타임을 검증한 것은 아니다.

추가 확인창 harness의 최초 반복 테스트는 한 페이지에 script를 여러 번 넣어 전역 const 재선언 오류를 냈다. 이는 앱 결함으로 계산하지 않았으며 각 조건을 새 브라우저 페이지로 격리한 뒤 page error0으로 다시 실행했다. 최초 결과는 harness-before-isolation.json에 남겼다. 버튼 수정 후에도 짧은 화면·보조 버튼 조건은 실패하여 전체 모달 스크롤 fallback과 secondary 최소높이를 보완한 뒤 재검증했다.

**NOT_RUN:** 실제 Next.js 앱/React 컴포넌트 build, DB migration/RPC/trigger/RLS/동시성, 임시 암호화 round-trip/키회전, Meta OAuth/권한/갱신, NAVER WORKS 인증·실수신, Vercel Cron, 운영 초기화·전환·rollback.

**물리 휴대폰 NOT_RUN:** iPhone Safari, Android Chrome, Instagram 인앱 OAuth, 가상 키보드, 노치 inset, VoiceOver/TalkBack, OS 글자200%. 지금의 Chromium viewport·DOM 글자배율 probe를 이 항목의 PASS로 쓰지 않는다. 전체 WCAG 적합성 검증도 아니다.

## 4. 남아 있는 출시 조건

기존 RELEASE_CHECKLIST를 유지한다. 특히 실제 Meta 사양/앱 설정·토큰 소비자 호환, 회사 SMTP/TLS·발신 허용, 개인정보 보유기간/문서, 연락 담당과 약1영업일 안내, 운영 대상/상업 플랜/작업 스케줄, 실제 DB 권한/초기화 대상은 실행 시 확인한다. 장기 토큰의 기존 평문 저장 계약과 암호화 임시자료를 구분하며, 첫 출시의 잔여 위험 승인은 아직 대신하지 않는다.

이번에 Meta business-login 공식 페이지를 재조회했지만429로 본문을 읽지 못했다. NAVER WORKS SMTP 상세 페이지도 조회되지 않아 회사 설정 미확인 상태를 유지했다. 표준 문서 확인만으로 이 앱의 권한/발신 성공을 추정하지 않았다.

## 5. 다음 단계와 인계 판정

**설계 검토는 여기서 닫고, 구현 단계로 진행하는 것을 권한다.** 반복 검토가 없애지 못하는 외부 API·DB·실기기 위험은 P0~P5의 실제 앱 테스트로 확인한다. Codex는 이 패키지를 읽어 구현·테스트·운영 전환 준비까지 하고, 운영 삭제·배포·실제 발송은 별도 승인을 받는다.

이 패치는 새 서비스를 구현한 것이 아니라 인계자료의 오류를 고친 것이다. 문서만 다시 늘리거나 이미 확정된 여섯 질문을 반복할 필요는 없다.

## 근거

프로젝트 판단은 현재 ZIP·실행 로그와 사용자가 확정한 요구사항을 기준으로 한다. [PostgreSQL Date/Time](https://www.postgresql.org/docs/current/datatype-datetime.html)은 timestamp의1마이크로초 해상도를, [MDN Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)는 밀리초 표현을 설명한다. [W3C Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html)는 확대 시 내용·기능 손실 방지를 설명한다. 해당 문서는 본 앱의 실기기·접근성·운영 합격증이 아니다.


---

## 03. 인계 요약

원문: `README.md`


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


---

## 04. 제품·시스템 기준

원문: `docs/V2_SPEC.md`


버전 1.3.2 AUDIT · 2026-09-10 · 상태: 최종 인계 기준 / 구현·운영 검증은 별도

이 문서의 숫자 중 세션 TTL, 재시도 간격, 타임아웃은 **이번 프로젝트의 제안 기본값**이다. 외부 서비스의 보장값으로 해석하지 않는다. 최신 외부 사양과 실제 환경은 출시 전 검증한다. 기존 코드 확인 기준과 출처는 `REPO_MAP.md`, `SOURCES.md`에 기록했다.

## 문서 사용 규칙

이 파일이 요구사항의 단일 기준이다. UI 세부 명세는 `UI_UX_SPEC.md`, 서버/DB 불변조건은 `BACKEND_DB_SPEC.md`, 구현 순서는 `IMPLEMENTATION_PLAN.md`, 출시 차단 조건은 `RELEASE_CHECKLIST.md`에서 구체화한다. API 필드의 정식 이름은 `../contracts/onboarding.ts`를 따른다. 최종 리뷰의 변경 이유는 `FINAL_REVIEW.md`에 있다.

동일 기능에 대해 문서/코드가 다르면 제품 정책은 이 파일을 기준으로 하되, 형식만 임의로 고치지 말고 계약·테스트도 함께 수정한다. `reference/approved/`와 `ui/`는 보존한 **모의 시안**이며, 동작 차이는 UI_UX_SPEC의 이식 예외를 적용한다. 과거 검증 보고서는 `verification/history-v1.1/`에 격리했다.

## v1.3.1 좁은 최종 정정

제품 정책·테이블 구조·공개 API 필드는 변경하지 않는다. v1.3의 모바일 보정 위에 긴 계정 확인 버튼 줄바꿈을 추가한다. 상태 참고 함수는 currentStatus/receivedStatus를 필수로 검사하고, 같은 attempt의 completed를 processing으로 되돌리지 않는다. 단, 서버가 세션/권한 상실을 확인한 401/403/410은 별도 경로에서 개인정보 화면을 즉시 비우고 안내해야 한다.

연결 순서는 DB의 `(started_at TIMESTAMPTZ, attempt UUID)`를 같은 정밀도로 비교한다. JavaScript Date로 밀리초까지만 읽고 UUID로 동률 판정을 하면 PostgreSQL 마이크로초가 유실될 수 있다. 실제 최종 판정은 DB 안에서 한다. 참고 함수도 0~6자리 소수를 보존하도록 수정했으며, 타임스탬프는 클라이언트 입력이 아니라 서버 생성값이다. 변경 근거와 실행 증거는 `LAST_REVIEW.md`를 따른다.

## 0. 사용자 답변으로 확정한 결정 — v1.1에서 유지

| 항목 | 확정 사항 | 구현에 미치는 영향 |
|---|---|---|
| 토큰 소비자 | 기존 토큰 사용 코드는 있지만 현재 실셀럽 등록·실사용 부하는 없음 | 호출부 호환은 확인한다. 사용 코드가 없다고 추정하거나 임의로 암호문을 기존 컬럼에 넣지 않는다. |
| 기존 등록자 | 현재 기록은 사용자 본인의 테스트 계정. 초기화 후 v2에서 정보·동의·인스타 인증을 처음부터 받는다 | 기존 테스트 자료를 새 정식 접수로 이관하거나 정보 보완 기능을 만들지 않는다. 초기화는 아래 별도 운영 절차다. |
| 재연동 | 기존 계정 유지, 토큰·정당한 최신 연락처 갱신, 재연동 알림, 분석 중복 신청 금지 | 연결 이력/영수증과 최초 분석 접수를 구분한다. |
| 연락처 | 입력 및 형식 검사만. 이메일·문자 인증 없음 | `email_verified=false`, `phone_verified=false`. 연락처를 계정 소유권 증거로 사용하지 않는다. |
| 여러 계정 | 동일 연락처로 여러 Instagram 계정 등록 허용 | 이메일/전화번호 UNIQUE 금지. 실제 Instagram ID가 계정 구분 기준이다. |
| 담당자 메일 | `dkssud374@celeblife.co.kr` | 내부 알림 수신 주소로 확정. 같은 주소를 SMTP_USER/MAIL_FROM의 연결 기본안으로 두되 발신 허용과 SMTP 인증은 실환경 검증 대상이다. |

위 답변은 **데이터 초기화 방향을 승인한 것**이며, 아직 대상 DB/행/시점을 지정한 운영 삭제를 실행한 것은 아니다. 이번 패키지는 원격 삭제·배포·발송을 수행하지 않았다. 서버 모듈·추가형 스키마·기존 토큰 읽기 계약 유지 방침은 그대로이며, 보유기간 등 출시 정책을 임의 확정하지 않는다.

메일 수신 주소는 비밀키가 아니지만 내부 운영 설정이다. 공개 문의 주소 `CONTACT_EMAIL`과 자동으로 같게 만들지 않는다. 사용자가 준 주소에 있던 Markdown 이스케이프 `\@`는 제거하여 실제 주소에는 `@` 하나만 사용한다.

## 1. 확정 범위와 비목표

**확정:** 승인된 디자인 유지, 개인정보 4개 입력, 명시적 필수 동의, Instagram 공식 인증, 장기 토큰 저장, 토큰 갱신, 담당자 네이버웍스 이메일 알림, 최초 분석 신청의 약 1영업일 분석/검토 안내, 사용자 대시보드 없음. 재연동은 신규 분석 신청이나 새로운 처리기한 약속을 만들지 않는다.

**비목표:** Streamlit, 게시물/인사이트/영상 수집, AI/LLM 호출, 분석 결과 화면, 별도 회원 비밀번호, 셀럽용 장기 로그인 시스템, 관리자 대시보드, SMS/메일 소유권 인증 신규 도입, 사용자에게 자동 결과 메일 보내기.

이 앱에서 “AI 분석 신청 접수”는 **최초 연결 시 후속 검토용 접수 DB 기록 생성**을 뜻한다. 실제 분석이 시작됐거나 완료됐다는 뜻이 아니다. 별도 분석 서비스가 미구현이면 담당자가 수동 처리한다. 1영업일 문구는 운영자가 충족할 수 있는지 확인해야 할 안내 목표이지 시스템 보장값이 아니다.

### 식별자 구분

- `instagramUsername`: 폼에 입력한 @사용자명. `@` 제거, 소문자 비교. 계정 소유권의 증거가 아니다.
- `instagramId`: 제공자 인증 결과에서 얻은 실제 계정 식별자. **문자열**로 다룬다. username, 이메일, 전화번호로 사용자를 병합하지 않는다.
- `users.id`: 기존 내부 BIGINT 식별자. v2 DB RPC의 반환값부터 `id::text`/문자열 JSON으로 전달한다. JS에서 이미 정밀도를 잃은 number를 뒤늦게 String() 하는 것은 불가하다. 기존 v1 RPC의 반환형은 바꾸지 않는다.
- `onboarding_requests.id`: 개별 접수 UUID. 단순 접수번호이지 조회 권한은 아니다.
- 입력 이메일/전화번호는 연락처로만 취급한다. 별도 인증하지 않았으므로 `verified=true`로 기록하지 않는다.

## 2. 개발/배포 구조

기존 GitHub 레포 + `v2-onboarding` 브랜치 + `apps/onboarding-v2/` 독립 Next.js 앱을 사용한다. 초기 단계에는 루트 `vercel.json`, Python/Streamlit 파일, 기존 로그인 경로, DB RPC를 수정하지 않는다.

```text
apps/onboarding-v2/
├── app/
│   ├── layout.tsx / page.tsx          # / 시작
│   ├── apply/page.tsx                # /apply 정보·동의
│   ├── connecting/page.tsx           # 인증 복귀 후 실제 처리
│   ├── complete/page.tsx             # 서버 접수 결과가 있을 때만 완료
│   ├── connection-error/page.tsx
│   ├── auth/callback/route.ts        # 등록된 콜백 경로 유지
│   ├── api/onboarding/bootstrap/route.ts
│   ├── api/onboarding/start/route.ts
│   ├── api/onboarding/complete/route.ts
│   ├── api/onboarding/status/route.ts
│   ├── api/onboarding/confirm-account/route.ts
│   ├── api/onboarding/restart/route.ts
│   ├── internal/token-refresh/route.ts
│   ├── internal/notification-retry/route.ts
│   ├── internal/onboarding-cleanup/route.ts
│   └── policies/{terms,privacy,instagram,deletion}/page.tsx
├── components/onboarding/            # 원본 DOM에 대응하는 컴포넌트
├── styles/onboarding.css             # 승인 CSS 우선 유지
├── lib/client/                       # 서버 공개 계약 사용, 비밀키 없음
├── lib/server/                       # server-only 경계
│   ├── config.ts / http.ts / sessions.ts
│   ├── instagram.ts / onboarding.ts / repository.ts
│   ├── consent.ts / crypto.ts / email.ts
│   └── token-refresh.ts / outbox.ts
├── public/brand/                     # 레포 실제 로고; 교체는 별도 시각 검증
├── supabase/migrations/
├── tests/{unit,integration,e2e}/
├── package.json / package-lock.json
├── .env.example / next.config.ts / vercel.json
└── AGENTS.md / README.md
```

Next.js App Router + TypeScript, 서버 어댑터는 Node.js runtime으로 통일한다. 버전은 구현 시점의 공식 호환/보안 상태를 확인해 lockfile에 고정한다. 초기에는 별도 monorepo 도구, 전역 UI 컴포넌트 라이브러리, 대규모 큐 제품을 도입하지 않는다.

스테이징 전용 Vercel 프로젝트는 root directory를 `apps/onboarding-v2`로 설정한다. 해당 프로젝트의 배포가 Vercel상 Production이어도 실제 회사 운영은 아니다. `APP_ENV`, 정확한 DB project ref, 실제 운영 Vercel project ID를 함께 검사한다. 실제 키를 프런트용 `NEXT_PUBLIC_*`에 넣지 않는다.

### 기존 URL 호환

`/Login`은 새 시작 화면으로, `/Login?step=consent`는 `/apply`로 연결한다. 기존 페이지를 이미 열어둔 브라우저의 `POST /auth/instagram/start`는 안전한 303으로 `/apply`로 안내하거나 검증된 legacy start 호환을 제공한다. 이 요청만으로 새 개인정보 동의를 완료했다고 간주하지 않는다. 기존 `/Dashboard` 접근은 대시보드를 다시 만들지 말고 세션에 맞는 시작/안내 화면으로 보낸다. 아무 세션 없이 완료 화면을 표시하지 않는다.

기존 Meta 앱에 등록된 삭제/연동해제 callback, 개인정보/약관/삭제 안내 URL을 감사해 정확한 경로를 이식한다. 등록된 callback이 있다면 제공자의 서명과 대상 계정을 검증한 뒤 처리한다. 공개 이메일 주소나 계정명만으로 타인 토큰을 삭제하는 API는 만들지 않는다.

## 3. 승인 UI 보존 규칙

원본 `reference/approved/index.html`은 승인 기준이다. CSS·SVG·레이아웃·한글 문구를 직접 이식한다. PNG를 참고해 비슷한 화면을 다시 그리는 작업이 아니다. `ui/styles.css`와 `ui/preview.js`는 원본에서 그대로 추출되었다.

| 원본 선택자 | 앱 역할 | 이식 시 원칙 |
|---|---|---|
| `.story`, `.connection` | 좌측 브랜드 패널 | 색상·도형·여백·카피 유지 |
| `.content-panel`, `.view-wrap` | 우측 및 모바일 콘텐츠 틀 | 반응형 폭 유지 |
| `#view-intro` | 시작 화면 | 기본 진입 화면으로 사용 |
| `#view-form` | 정보·동의 | 실제 서버 start 요청으로 연결 |
| `#view-loading` | 처리 화면 | 실제 서버 상태로 단계 표시 |
| `#view-success` | 접수 완료 | 서버 결과 없이는 렌더링 금지 |
| `#view-error` | 실패/취소/만료 | 실제 오류 유형에 맞춰 문구 변경 |
| `#info-dialog` | 약관/도움말 | 모달 모양 유지, 확정 문서 연결 |
| `#oauth-dialog`, `.previewbar` | 데모 도구 | 실제 빌드에서 제거 |

### 허용하는 기능성 변경

1. 상단 `V2 UI PREVIEW`, 탭, 예시 채우기, 모의 인증창을 운영 빌드에서 제거한다. `--preview-height:0px`로 본문이 전체 viewport를 사용하게 한다. 제거된 도구 높이에 따른 위치 이동은 허용된 차이이며, 가짜 빈 여백은 남기지 않는다. 본문 디자인은 유지한다.
2. 연결 버튼 아래에 “다음 단계에서 Instagram 로그인 및 권한 승인이 진행됩니다. 완료 후 셀럽라이프로 돌아옵니다.” 안내를 추가한다. 기존 잠금 안내와 시각 스타일을 맞춘다.
3. 완료 화면의 데모 문구를 실제 접수번호로 바꾼다. 이름·계정·이메일·전화번호는 서버가 반환한 현재 세션의 정보다. 접수번호만으로 다른 사람 정보를 조회할 수 없어야 한다.
4. 실제 계정 불일치 확인, 재시도, 세션 만료, 개인정보 수정 문의를 기존 모달/오류 디자인으로 처리한다.
5. 원본은 약관 초안이며 footer의 개인정보처리방침 버튼도 동일 초안 모달을 연다. 운영에서는 **수집·이용 동의서와 개인정보처리방침 전문을 구분**해 각각 올바른 콘텐츠를 제공한다.
6. 재연동 완료는 같은 레이아웃을 쓰되 “인스타그램이 다시 연결되었습니다 / 연결 정보가 업데이트되었어요”로 표시한다. 최초 접수의 1영업일 약속을 다시 시작하거나 “새 분석 신청 완료”로 표시하지 않는다. 후속 안내 카드도 “연결 정보 갱신 / 기존 신청 내역 유지”로 바꾼다. 연결 이력 ID를 표시하고, 서버가 새 분석 신청을 만들지 않았다는 것을 반영한다.
7. 원본 로고/심벌은 임시 표현이다. 첫 UI 이식은 승인된 표현을 보존한다. 레포의 실제 로고로 교체하는 일은 크기/여백 비교를 포함한 명시적 별도 변경으로 기록한다.

### 모의 코드와 실제 코드의 경계

`startSimulation()`의 1.8/3.6/5.6초 타이머, `demo`, `displayData()`의 예시 fallback, `#success` 직접 표시, `simulate-btn`, `simulate-error`는 개발 미리보기에만 남긴다. 실제 앱은 서버가 실패하면 반드시 실패/재시도 상태를 표시한다. `setTimeout`으로 성공 판정하지 않는다.

HTML의 `connect-src 'none'`, `form-action 'none'`는 데모 안전장치다. 실제 앱에 그대로 복사하면 서버 요청이 막힌다. 앱에서는 프런트→동일 출처 API만 허용하는 CSP/보안 헤더를 별도로 설정한다. 기존 정책을 무조건 `*`로 완화하지 않는다. OAuth 페이지 이동과 fetch의 CORS를 혼동하지 않는다.

React 이식 시 `class`→`className`, `<use>` 참조, `dialog` 포커스, 체크박스 indeterminate, CSS animation을 보존한다. document 전체를 `dangerouslySetInnerHTML`로 주입해 실제 입력/인증 화면을 구현하지 않는다. 애니메이션 외에는 불필요한 리렌더링/실시간 polling을 시작 화면에서 실행하지 않는다.

## 4. 실제 화면 흐름

```text
우리 / → /apply
  이름·연락처·이메일·셀럽 ID, 필수 동의
  ↓ POST /api/onboarding/start
  임시 신청 + 동의 스냅샷 + OAuth state 저장
  ↓ 서버가 만든 허용된 Instagram URL로 location.assign
Instagram 공식 로그인 → 필요시 2FA/보안 확인 → 접근 권한 승인
  ↓ GET /auth/callback?code=...&state=...
우리 서버가 state와 브라우저 바인딩 검증, code 암호화 임시 저장
  ↓ 즉시 303 /connecting (깨끗한 URL)
우리 로딩 UI가 먼저 렌더링
  ↓ POST /api/onboarding/complete
  인증코드 교환 → 장기 토큰 → 실제 계정 확인 → 원자적 접수
  ↓ /complete
접수 완료, 약 1영업일 분석/검토, 담당자 연락 안내
```

Instagram 로그인·2FA·권한 UI는 재현하지 않는다. 이 앱은 Instagram 비밀번호, 문자코드, 인증 앱 코드를 수집하지 않는다. 인앱 브라우저→외부 브라우저로 바뀌어 cookie가 끊기면 보안을 낮추지 말고 같은 브라우저에서 다시 시작하도록 안내한다. 대상 비즈니스/크리에이터 계정, 앱 모드, 권한 접근 수준은 실제 Meta 앱 설정으로 검증한다.

### 왜 콜백과 완료 요청을 나누는가

콜백에서 모든 작업을 끝내고 나서 로딩 화면으로 보내면 사용자가 가장 기다리는 동안 승인된 로딩 UI를 보지 못한다. 따라서 콜백은 검증·짧은 임시 저장·깨끗한 URL 이동만 한다. `/connecting` 렌더링 이후 실제 서버 POST가 작업을 **await**한다. 서버리스 함수에서 응답을 먼저 반환하고 `void doOAuth()`를 방치하는 패턴을 금지한다.

`/connecting`의 GET은 멱등 조회/화면 렌더링만 한다. React Strict Mode, 새로고침, 탭 복원으로 complete POST가 중복되어도 서버의 DB claim/멱등성이 보호한다. 프런트 버튼 disabled만으로 중복 방지를 끝내지 않는다.

## 5. 임시 세션, 보안, 실패 복구

### 제안 기본값

- OAuth state 유효기간: 10분. 임시 정보/작업 세션: 30분.
- 완료 후 영수증 조회 세션: **완료 시각부터** 24시간. draft/state 만료와 별도로 `receipt_expires_at`을 둔다. 브라우저 비밀 쿠키는 이 조회 만료까지 유지하되 세션 권한 자체는 확장하지 않는다. 만료 이후 공개 접수번호로 개인정보 조회 불가.
- 외부 API 요청별 시간제한: 10초, 완료 작업 총 예산: 45초. 필요 시 실제 Vercel duration 안에서 조정.
- 단일 작업 lease: 90초, owner 임의 UUID. 작업 도중 재획득할 수 없는 CAS/기한 검사.
- status polling: 1.5~2초 간격에서 시작, 지연 시 backoff. 완료/오류/비활성 탭에서는 중단. 45초 초과 시 상태 재확인 UI로 바꾸며 접수 실패를 추정하지 않는다.
- 임시 자료 정리: 매일 청소 job. 만료 즉시 접근 차단, 실제 물리 삭제는 다음 청소 주기까지 가능. 이 차이를 개인정보 문서에 반영한다.

### Bootstrap와 start

서버 `bootstrap`에서 랜덤 브라우저 비밀값을 HttpOnly/Secure/SameSite=Lax/Path=/ host-only cookie로 설정한다. 이미 유효한 cookie는 매 호출마다 교체하지 않는다. 로컬 HTTP 개발은 별도 dev cookie 이름을 사용한다. DB에는 secret의 hash만 저장한다. bootstrap은 서버가 정한 활성 약관 bundle ID와 CSRF 토큰을 반환한다. 이 GET은 예외적으로 cookie 설정만 허용하며 접수/동의/토큰 생성은 하지 않는다.

모든 작업 요청과 응답은 `attemptId`를 명시한다. 이 ID는 비밀이나 인증수단이 아니고 cookie+CSRF와 함께 대조하는 식별자다. status revision은 동일 attempt 안에서만 비교한다. confirm은 `attemptId+expectedRevision`을 받아 예전에 본 모달이 새 계정을 승인하지 못하게 한다. 정책 문서의 실제 전문/버전은 승인 순간의 서버 스냅샷이다.

start 멱등성은 `(browser_secret_hash, request_key)`로 보장한다. 검증된 payload의 keyed hash와 암호화된 임시 state를 함께 저장한다. 최초 start 응답이 유실돼도 **같은 입력/같은 키** 재요청에는 동일 authorize URL을 복원한다. 입력이 달라졌으면 409 IDEMPOTENCY_CONFLICT다. 인증이 이미 진행/완료된 attempt면 새 URL 대신 `action=resume`을 반환한다. state hash만 저장하고 원문을 복원할 수 없는 설계는 금지한다. 취소/만료 state를 되살리지 않는다.

start는 같은 출처 Origin/Fetch Metadata, CSRF, 요청크기 상한, 타입/길이, 필수동의, 서버가 발급한 bundle, rate limit을 검증한다. 폼과 이메일/전화번호는 유효 형식만 검증하며 소유권 확인으로 취급하지 않는다. 무차별 임시 레코드 생성과 타인 연락처 덮어쓰기 방지 테스트를 둔다.

state는 충분한 난수로 만들고 DB에 hash+만료를 저장한다. 이름/이메일/전화번호/토큰을 state, URL, 브라우저 storage에 넣지 않는다. URL에 보이는 UUID도 권한이 아니다. callback의 state hash와 바인딩 cookie가 모두 일치해야 한다. 한 브라우저에서 활성 attempt는 하나만 허용한다. 새 키로 활성 작업을 묵시적으로 대체하지 않고 ACTIVE_ATTEMPT_EXISTS를 반환한다. 사용자 확인 뒤 `replaceAttemptId`를 명시한 start 또는 `attemptId+requestKey`의 restart만 이전 작업을 취소할 수 있다. 이미 exchanging/saving이면 ACTIVE_PROCESSING으로 거절하고 상태 확인으로 안내한다.

### 콜백

허용된 callback URI만 사용한다. 요청 Host 헤더로 임의 redirect URI를 만들지 않는다. code/state 누락·변조·만료·cookie 불일치를 거절한다. 단, **같은 정상 callback의 재전송**은 cookie 바인딩+저장된 code hash를 확인하여 재교환 없이 기존 진행/완료 화면으로 보낸다. 소비된 state에 다른 code가 붙으면 거절한다. 유효하지 않은 callback만으로 정상 활성 세션을 취소하거나 덮어쓰지 않는다. 제공자 오류 query/raw error_description은 출력하지 않고 내부 allowlist 오류코드로 변환한다.

code는 서버 전용 암호화(AES-256-GCM 등 검증된 구현, nonce/tag/key ID/AAD 포함) 후 단기 저장한다. 암호키는 DB와 분리한 환경변수로 둔다. code 수신 URL은 access/error logs와 모니터링에서 query redaction하고 `Cache-Control: no-store`, `Referrer-Policy: no-referrer`를 설정한다. callback에 광고/analytics 태그를 넣지 않는다.

### 완료 작업과 멱등성

DB에 `pending → oauth_returned → exchanging → saving → completed` 상태를 둔다. `awaiting_account_confirmation`, `failed`, `cancelled`, `expired`도 별도 처리한다. complete 요청은 현재 브라우저와 바인딩된 세션만 claim할 수 있다. lease를 DB 조건부 갱신으로 확보하고 네트워크 작업 중 DB transaction을 길게 유지하지 않는다.

code는 단일 사용이다. 교환 타임아웃은 제공자가 이미 code를 소비했는지 알 수 없으므로 **동일 code를 무조건 재시도하지 않는다**. code 교환 시작 여부와 복구 가능한 암호화 token checkpoint를 구분한다. 성공 응답을 받은 단기/장기 토큰은 최소 기간의 암호화 checkpoint에 저장해, 최종 DB 트랜잭션 재시도 때 이미 소비한 code를 다시 교환하지 않도록 한다. checkpoint 저장 자체에 실패했다면 안전하게 재연동을 요구한다.

완료 후 raw code와 임시 토큰/폼 payload, 암호화 state는 즉시 지운다. 멱등 식별용 hash와 완료 receipt 참조만 별도 만료까지 유지한다. 취소된 OAuth 시도는 code/state/token 재사용을 즉시 금지한다. 단, 제공자 승인 취소(OAUTH_CANCELLED)로 끝난 본인 시도의 동의 후 입력 초안은 원래 draft 기한 안에서 폼 복원만 허용한다. 만료·대체·개인정보 삭제된 초안은 복원하지 않는다. 인증정보와 폼 초안의 접근권한을 같은 것으로 취급하지 않는다. 청소 job은 종류별 기한에 따라 물리 삭제한다. 프로세스가 죽은 lease는 checkpoint 유무로 재개/재연동을 판정한다. 새로고침 후 프런트는 서버 status를 확인한다.

실제 계정 username이 입력값과 다르면 DB 최종 접수 전에 기존 모달 스타일로 실제 계정 확인을 받는다. “@실제계정으로 연결” 또는 “다른 계정으로 다시 연결”만 제공한다. 확인 요청은 클라이언트가 보낸 username/토큰을 신뢰하지 않고 서버의 검증된 후보를 사용한다. 입력값과 다른 계정을 조용히 연결하지 않는다.

### 재연동 확정 규칙

동일 실제 Instagram 계정으로 돌아오면 `users.id`를 유지한다. 같은 attempt의 재전송은 기존 결과를 반환하고 토큰 교환·이력·알림을 중복 생성하지 않는다.

새 attempt가 성공한 경우 **성공한 연결 이력/영수증은 남기되, 분석 신청을 무조건 새로 만들지 않는다.** 최초 정상 v2 분석 접수가 있는 계정이면 `connection_kind=reconnection`, `review_status=not_requested`, `analysisRequested=false`로 새 이력을 남기고 `initial_request_id`로 최초 접수를 가리킨다. 최초 접수의 검토 상태·담당자 연락 상태·접수시각은 재연동 때문에 초기화하지 않는다. 갱신한 토큰·최신 연락처는 앞으로 사용할 값으로 저장하고, 접수 당시 연락처 snapshot은 과거 기록으로 보존한다.

서버에 계정 row만 있고 최초 정상 v2 접수는 없는 경우(전환 중 v1 연결 등)는 **첫 v2 분석 신청**으로 분류한다. `connection_kind=new`, `review_status=pending_review`, `analysisRequested=true`이다. 단순히 `users` 행이 존재한다는 이유로 첫 신청을 누락시키지 않는다.

한 계정으로 서로 다른 attempt가 동시에 완료되는 경우 users 행을 기준으로 최종 트랜잭션을 직렬화하고, 계정별 최초 접수 partial UNIQUE 제약으로 최초 신청 하나만 허용한다. 클라이언트는 new/reconnection 판정값을 결정할 수 없다. 재연동 알림은 보내되 자동 분석 재실행을 요청하지 않는다. 별도의 재분석 신청 기능은 이번 범위 밖이다.

## 6. API 계약

정식 타입은 `contracts/onboarding.ts`, 상세 예시는 `contracts/API.md`를 따른다. 서버 내부의 pending token/code/ciphertext/DB key는 어느 응답 타입에도 포함하지 않는다.

| API | 성공 동작 | 주요 실패 |
|---|---|---|
| GET bootstrap | session cookie, CSRF, 정책 bundle | rate limited/configuration |
| POST start | 서버 저장 후 authorizeUrl 반환 | validation/consent/csrf/rate limit |
| GET auth/callback | 검증 및 임시저장, 303 /connecting | cancelled/expired/invalid state |
| POST complete | DB 완료면 result, 진행 중이면 202 | account mismatch/reauth/storage |
| GET status | 바인딩된 세션의 안전한 상태 | unauthorized/session expired |
| POST confirm-account | 서버 후보 계정 확정 및 최종 저장 | invalid state/expired candidate |
| POST restart | 기존 활성 attempt 폐기, 새 state 준비 | expired draft/consent changed |

완료 응답/GET complete 모두 DB에서 확인한다. query `success=true`, hash, localStorage의 완료값은 의미가 없다. status가 오래돼 값이 역행하는 것을 막기 위해 `revision` 증가값을 사용하고 최신 값만 반영한다. completed는 프런트의 최종 상태다.

재연동으로 판정되면 세 번째 단계의 라벨을 “연결 정보 갱신”으로 바꾸며 신규 AI 접수라고 표시하지 않는다. `Stage=submission`은 내부 처리 위치를 나타낼 뿐, 신규 분석 발생 여부는 완료 결과의 `analysisRequested`로 판단한다.

3단계 로딩을 보여주기 위해 불필요한 지연을 추가하지 않는다. 실제 저장과 접수 기록은 같은 트랜잭션이므로 빠르면 두 체크가 동시에 완료돼도 된다. 저장 전 AI 신청 접수에 완료 체크를 표시하지 않는다.

## 7. 데이터 모델과 v1 호환

기존 `users`, `tokens`, `user_consents` 및 `complete_instagram_onboarding`의 **구조와 API 계약**은 우선 보존한다. 추가형 migration만 사용한다. 전체 `supabase_schema.sql` 재실행/테이블 DROP/기존 필수 컬럼 변경 금지.

**기존 테스트 데이터는 v2로 이관하지 않는 것으로 확정했다.** 모든 기존 계정을 정식 v2 신청으로 이관하는 대신, 전환 때 확인된 테스트 자료만 별도 초기화한다. 구조 마이그레이션과 데이터 정리는 다른 작업이며 배포 자동화에 삭제를 섞지 않는다. 정확한 대상·가드·실행 순서는 `RESET_PLAN.md`를 따른다. Supabase 프로젝트, DB 전체, `auth.users`, Storage, 다른 서비스 테이블은 초기화 범위가 아니다.

| 새 테이블 | 책임 |
|---|---|
| `creator_profiles` | users.id에 연결된 최신 이름·이메일·전화번호·비인증 표기·갱신시각 |
| `onboarding_sessions` | 브라우저 바인딩/state hash/암호화 임시자료/처리 단계/lease |
| `onboarding_requests` | 성공한 연결 이력/영수증. 최초는 new/pending_review, 재연동은 reconnection/not_requested + 최초 접수 참조 |
| `notification_outbox` | 접수 알림 event key, 발송 상태, 시도 횟수, 다음 시도, lease |
| `job_leases` | 운영 Cron 중복실행 방지용 짧은 lease |

`creator_profiles`의 PK는 user_id여서 같은 Instagram 계정의 최신 연락처를 유지한다. **email/phone에는 UNIQUE 제약을 두지 않는다.** 다른 계정에 같은 연락처가 이미 있어도 등록을 허용하며, 입력 연락처에는 `email_verified=false`, `phone_verified=false`를 저장한다. 접수 당시 연락처 snapshot은 `onboarding_requests.contact_snapshot`에 별도로 저장한다. 개인정보 복제이므로 보유·삭제 정책에 모두 포함한다. 순서가 뒤바뀐 재연동 요청이 최신 프로필을 되돌리지 않도록 서버 접수시각을 비교해 최신 갱신만 반영한다.

### 동의는 기존 테이블에 새 문서 버전으로 저장 가능

기존 `user_consents`는 consent_schema_version=1을 요구한다. 이 값은 동의 데이터 구조 버전이며 **UI v2라고 2로 바꾸면 안 된다**. 기존 4개 동의 구조를 유지하면 schema_version=1로 저장하면서 terms/privacy/instagram 문서 버전만 새 값으로 지정할 수 있다.

기존 v1 RPC는 문서 버전을 하드코딩 검사하므로 새 문서 버전으로 호출하지 않는다. **새 `complete_instagram_onboarding_v2` RPC를 작성**하고 기존 함수는 유지한다. v2 state_nonce는 `v2:<attempt UUID>` 등 충돌 없는 내부 식별자를 사용한다. 문서 전문/버전/hash, accepted_at은 폼을 본 당시 서버의 canonical bundle로 고정한다. 배포 도중 약관이 바뀌었다고 사용자에게 새로 보여주지 않은 버전으로 바꿔 저장하지 않는다.

### 최종 접수 트랜잭션

v2 RPC는 service-role만 실행 가능하도록 PUBLIC/anon/authenticated 권한을 명시적으로 REVOKE하고 필요한 역할에만 GRANT한다. SECURITY DEFINER를 사용한다면 search_path를 제한한다. 검증은 서버와 DB 양쪽에서 수행한다.

하나의 DB transaction에서: session lock + browser 권한 확인 → completed이면 receipt 기한만 확인해 기존 결과 반환 → 미완료일 때만 draft TTL/lease/revision/후보 확인 → 실제 Instagram ID로 users upsert/행 lock → 최초 v2 접수 존재 확인 → 오래된 attempt/토큰 버전 확인 → 정당한 최신 프로필 갱신 → 동의 audit insert → `tokens(user_id,'user')` CAS/upsert → 최초 또는 재연동 이력 insert → 그 이력에 해당하는 outbox insert → session completed/receipt_expires_at 설정/민감 임시필드 삭제.

`onboarding_requests`에 새 이력이 생겼다는 이유만으로 분석을 실행하지 않는다. 후속 처리 조회는 `connection_kind='new' AND review_status='pending_review'`에 한정하고, 소비자도 request ID로 멱등 처리한다. 재연동 행은 `initial_request_id`가 같은 user의 new 행을 가리키는지 RPC에서 검증하고 신규 분석 목록에서 제외한다. legacy users 행만 있으면 첫 new 행을 만든다. 사용자 계정별 new partial UNIQUE와 세션별 UNIQUE를 모두 둔다.

어느 단계든 실패하면 최종 쓰기는 전부 rollback한다. 네트워크 오류 뒤 이미 commit됐을 가능성은 session/request의 unique key로 재조회한다. `session_id UNIQUE`, `notification_outbox.event_key UNIQUE`, consent state_nonce UNIQUE로 DB 수준 멱등성을 확보한다.

### 토큰 저장 암호화와 기존 소비자

사용자는 **토큰 사용 코드가 존재하지만 현재 실셀럽 등록이 없어 즉시 처리 중인 부하는 없다**고 설명했다. 따라서 대량 데이터 이관은 생략할 수 있지만 코드 호환을 자동 생략할 수는 없다. Codex는 사용 가능한 레포/설정에서 토큰 읽기·쓰기 경로를 목록화한다. 외부 레포가 안 보이면 보이지 않는다는 것을 기록하고 저장 포맷을 임의 변경하지 않는다.

이번 첫 전환에서는 기존 분석 소비자가 읽는 **`tokens.access_token` 계약을 유지**한다. 이 컬럼은 기존 코드상 평문이며, 임의로 암호문을 넣으면 v1/분석기/갱신이 깨진다. 따라서 첫 출시 명세는 서버 전용 접근, RLS/권한 검증, 키 분리, 로그 차단을 필수로 하고 **기존 토큰 컬럼의 애플리케이션 암호화는 구현됐다고 주장하지 않는다**.

임시 OAuth code/token checkpoint는 v2 전용 암호화를 적용한다. 장기 토큰 컬럼 암호화는 소비자·v1 fallback·갱신기·rollback을 함께 바꾸는 별도 migration 결정이다. 출시 책임자가 기존 저장 방식의 잔여 위험을 검토해야 하며, 암호화를 출시 필수로 정하면 모든 소비자의 호환 이식을 완료하기 전 배포하지 않는다. 서로 다른 선택을 숨겨서 동시에 적용하지 않는다.

추가 테이블 전부 RLS 활성화, anon/authenticated 직접 읽기/쓰기 금지, 서버만 접근한다. 기존 키가 client bundle에 없다는 것도 테스트한다. 사용자 삭제 시 profile/request/outbox/consent/token/임시자료의 연결 삭제를 검증하며 과거 데이터/백업의 처리 기준은 확정 정책을 따른다.

## 8. Instagram 토큰 처리

현 코드에는 단기→장기 토큰 교환과 별도 refresh가 모두 있다. 새 앱에서 빠뜨리지 않는다. 기본 scope는 현 코드의 `instagram_business_basic`, `instagram_business_manage_insights`를 출발점으로 하되 실제 앱 승인 상태·최신 공식 요구와 맞춰 검증한다. 대시보드를 없앤다는 이유로 후속 분석에 필요한 insights scope를 제거하지 않는다. 요청 scope 문자열을 승인 증거로 저장하지 말고 제공자의 지원되는 권한 응답/검증 방법으로 실제 승인 범위를 확인한다. 필수 권한이 빠졌으면 PERMISSIONS_REQUIRED, 지원되지 않는 계정이면 UNSUPPORTED_ACCOUNT로 처리하며 정상 분석 접수로 확정하지 않는다. 검증 실패(제공자 장애)는 PROVIDER_UNAVAILABLE로 구분한다. 실제 방법은 최신 Meta 문서와 테스트 계정으로 확인하고, 확인되지 않은 debug/permissions endpoint를 임의로 추가하지 않는다.

OAuth 일반 보안 권고에서 confidential client에도 PKCE가 권장된다.[S7] 이 Instagram Login 흐름에서 S256 지원이 확인되면 state/browser binding과 함께 적용한다. 지원 여부 미확인 상태에서 지원을 주장하거나 문서에 없는 파라미터를 필수로 강제하지 않는다. 지원/미지원 결정과 테스트 증거를 외부 연동 게이트에 남긴다.

제공자 응답 `expires_in`을 양의 정수로 검증하고 서버 UTC 시각 기준 expires_at을 계산한다. 60일 상수로 덮어쓰거나 필드가 없는데 성공 처리하지 않는다. API base/version은 허용한 Meta host 및 명시적 설정으로 한정하고 요청으로 받지 않는다. 현재 레포의 v22.0을 ‘최신’으로 가정하지 않는다. 최초 포트에서는 행동 호환을 지키고 버전 변경은 별도 테스트한다.

### 자동 갱신

현 동작을 기준으로 매일 한번 만료 7일 이내 후보를 검사한다. 만료됨/권한철회는 재연동 필요. 저장/갱신 직후 24시간 미만은 skip. 날짜 메타데이터가 없으면 오류로 분류한다. 24시간 제한은 현재 코드의 보수적 판정이며 출시 때 공식 사양을 재확인한다.

v2 토큰 운영정보는 `tokens`의 추가 nullable/default 컬럼으로 관리한다: `row_version`, `connection_status`, `last_refresh_attempt_at`, `last_refreshed_at`, `refresh_failure_count`, `last_refresh_error_code`, `source_attempt_id`, `source_attempt_started_at`, `granted_scopes`, `scopes_checked_at`. 구형 writer까지 포함해 access_token, expires_at, created_at, source_attempt_id/started_at, connection_status, granted_scopes, scopes_checked_at 중 보안 판단에 쓰는 값이 바뀌면 DB trigger가 row_version을 증가시킨다. 호출자가 row_version을 낮추거나 동일 값으로 강제할 수 없어야 한다. 감사용 시도시각/실패횟수만 바뀐 경우는 이 보안 버전과 구분한다. 기존 필수 컬럼/유니크 키는 유지한다. 미검증 구형 행은 상태 unknown이며 사용자에게 건강한 연결이라고 단정하지 않는다.

새 토큰과 만료시각을 검증한 뒤 DB CAS로 저장한다. 읽었던 token row의 row_version 또는 created_at/expires_at이 바뀌었으면, 사용자가 재연동했을 가능성이 있으므로 덮어쓰지 않는다. 신규 승인 A가 느리게 끝나는 사이 더 늦게 시작한 승인 B가 확정됐다면 A는 STALE_ATTEMPT로 거절한다. 최종 저장 직전에 서버 started_at+attemptId 순서와 해당 account lock을 검사한다. CAS 충돌 시 최신 행을 다시 읽고 본인이 만든 승인보다 최신 값인지 확인하며 무조건 덮어쓰지 않는다. 현재 created_at은 기존 코드에서 최근 저장/갱신시각으로 사용되므로 이름만 보고 의미를 바꾸지 않는다.

보호된 `/internal/token-refresh` 경로와 cron을 앱에 이식한다. `CRON_SECRET` Bearer 확인, 정확한 운영 DB ref, APP_ENV, 운영 Vercel project ID, job lease를 적용한다. `TOKEN_REFRESH_ENABLED`는 명시적으로 켠다. dry-run은 API 호출·토큰 갱신 쓰기 없이 판정만 한다.

성공/실패/too_new/reauth_required/metadata_missing/CAS-skipped 집계, last successful run, oldest overdue 후보를 관찰한다. 정상 크론 호출과 실제 갱신 성공을 구분한다. v1과 v2가 동시에 같은 운영 토큰을 갱신하지 않게 전환한다. 과도한 반복이나 신규 토큰 강제 갱신으로 실계정 테스트하지 않는다.

## 9. 네이버웍스 담당자 알림

수신자는 **`dkssud374@celeblife.co.kr`로 확정**한다. 발신 기본안도 같은 계정으로 하며 `SMTP_USER`/`MAIL_FROM`에 이 주소를 사용하도록 설정 예시에 반영한다. 이는 해당 계정의 발신 허용·SMTP 로그인 성공을 확인했다는 뜻이 아니며, 비밀번호·host·port·TLS는 실제 관리 설정에서 확인한다. `MAIL_ENABLED=false`가 개발 기본값이다.

발신자는 회사에서 허용한 네이버웍스 계정, 수신자는 고정된 내부 담당자 주소다. 사용자 입력 이메일을 To/From으로 사용하지 않는다. SMTP host/port/TLS/외부 앱 비밀번호는 실제 회사 계정 설정으로 확인한다. 이 문서가 회사 계정의 SMTP 사용 가능/활성화를 검증한 것은 아니다.

최종 확정 트랜잭션에서 `creator.connected:<연결 이력 UUID>` event를 outbox에 기록한다. 같은 attempt 재전송은 같은 event를 재사용한다. 첫 신청과 독립적인 재연동 모두 메일을 보내되, 재연동 본문에는 “토큰·연락처 갱신 / 신규 분석 신청 없음”이라고 표시한다. 이메일에는 이름·연결된 @계정·입력 연락처·접수번호·한국시간·신규/재연동 여부만 포함한다. 토큰, code, state, 쿠키, 내부 SQL 에러는 포함하지 않는다. 제목의 CR/LF를 거절하고 HTML escape를 적용한다.

첫 발송은 commit 뒤 `after()`와 같이 플랫폼이 추적하는 post-response hook으로 빠르게 시도할 수 있다. 그러나 hook은 영구 queue가 아니므로 outbox와 별도 재시도 스케줄이 복구의 기준이다. 이 앱에서 `after()`는 메일 발송에만 사용하고 OAuth 핵심 처리를 그 안으로 미루지 않는다. Next.js 공식 문서의 duration 제약을 따른다.[S3]

재시도 worker는 DB claim/lease로 due pending 행과 lease가 만료된 processing 행을 잡는다. 메일 어댑터 시간제한 < worker 실행 예산 < lease 시간 순서를 지킨다. owner/기한/fencing 검사를 write마다 수행한다. 삭제된 접수의 stale worker는 새 발송을 시작하지 않는다.

스케줄 기본안: 토큰 검사 `23 0 * * *` UTC, 알림 재시도 `*/5 * * * *`, 임시자료 정리 `43 0 * * *`. 분 단위 재시도는 해당 플랜에서 가능한지 확인한다. Hobby는 하루 1회 제한이므로 이 기본안과 호환되지 않는다.[S4] Vercel 상업용 허용 플랜/비용은 소유자가 확정하고, 이를 바꾸기 전까지 실제 발송/작업은 꺼 둔다. backoff의 1분 등은 **다음 발송 가능 시점**이며 5분 worker가 정확히 그 시각에 발송한다는 보장이 아니다. 첫 실패 후 1분, 5분, 15분, 60분 등의 backoff(제안값)를 기록하고 cron은 due 행만 처리한다. 설정된 최대 시도 뒤 dead 상태로 남기고 담당자가 원인을 확인할 수 있게 집계 경고를 제공한다. 주기 실행 실패도 outbox age로 감지한다.[S4]

SMTP가 메일을 받았지만 DB의 sent 기록에 실패하면 재시도 중 중복 메일 가능성이 있다. outbox 유일키·lease·고정 Message-ID로 위험을 줄이되 **정확히 한 번 수신을 보장하지 않는다**. 메일 수신이 늦어져도 사용자 접수 완료를 취소하지 않는다. 사용자 화면에 “담당자가 메일을 읽었습니다” 같은 검증되지 않은 상태를 쓰지 않는다.

`MAIL_ENABLED=false`는 로컬 기본값이다. SMTP test는 별도 수신 계정으로 제한한다. 실제 메일 발송을 검사하려고 운영 사용자 개인정보를 fixture로 복사하지 않는다.

## 10. 개인정보/약관/운영설정 게이트

UI에 있던 약관 초안을 운영 동의서로 배포하지 않는다. 기존 전문은 보존하고 새 수집 항목/목적/보유기간/거부 영향/해지·삭제 요청/위탁·국외이전 등 실제 구성에 맞는 문서를 책임자가 검토한다. 여기에는 법률 검토 완료를 주장하지 않는다.

입력 항목을 보내는 시점에 명시적 동의를 검증하고, 동의 전 keystroke 수집/임시 PII 자동 저장/analytics 전송을 하지 않는다. 개인정보처리방침과 수집·이용 동의는 다른 문서 역할이다. 새 이메일/전화번호의 필수 여부는 각각 연락 용도에 비춰 출시 전에 확인한다.

출시 게이트별 담당/증거/미확정 값을 `RELEASE_CHECKLIST.md`에서 관리한다. 임시 TTL 제안값을 확정된 법정 보유기간으로 복사하지 않는다. 이미 확정된 수신 주소를 다시 묻지 않는다. 같은 주소의 발신 기본안은 회사 SMTP 설정으로 검증한다. 아직 모르는 값을 임의로 채우지 않는다: 공개 문의 이메일, 운영 URL, Meta 앱 ID/secret/scopes/redirect allowlist, test/production DB ref, SMTP/TLS, 개인정보 보유기간, 확정 문서버전/해시, 실제 1영업일 처리 운영. env가 없어도 mock 및 로컬 개발은 진행한다. 운영 시작 시 필수값/법적 문서 승인 플래그를 검증해 누락이면 fail closed 한다.

## 11. 전환/복구

P0~P5 동안 v1 서비스와 설정을 그대로 유지한다. 기존 배포의 실제 commit/config/env 이름(값 제외)을 기록한다. `main`에 push하거나 기존 Vercel root를 변경하지 않는다.

운영 전환은 추가형 DB migration → staged v2 build → 테스트 DB/계정 검증 → 기존 테스트 데이터 초기화 dry-run/대상 확정 → v1 인프라/콜백 호환 확인 → 승인 후 트래픽 전환 및 정리 순서다. 테스트 데이터 초기화는 `RESET_PLAN.md`의 보호 조건을 충족한 별도 운영 단계에서만 적용한다. live 서비스 코드를 먼저 중단하거나 DB를 즉시 비우지 않는다. Vercel 프로젝트 간 테스트 배포를 그대로 promote한다고 가정하지 않는다. 최종 프로젝트의 root/framework/build/env 설정으로 다시 빌드·검증한다.

### 전환 중이던 v1 인증 보호 — 출시 조건

기존 v1 state는 서명된 JSON 형식, TTL10분, 브라우저 바인딩을 사용한다. v2 state와 다르다. **같은 `/auth/callback`에서 v1 정상 응답을 처리할 호환 분기**를 TypeScript에 포트하고, 기존 서명/동의/expiry/cookie 검증 테스트를 그대로 이식한다. 유효성 확인 전 payload를 신뢰하지 않는다.

v1 callback은 검증을 유지하되 해당 계정이 이미 v2로 연결됐다면 구형 결과로 v2 token/profile을 덮어쓰지 않는다. 이 경우 v2 연결 확인/재연결 안내로 보내고 새로운 v2 접수를 만들지 않는다. 아직 v2 연결이 없는 계정만 기존 RPC로 저장하고 연락처가 없으므로 “인스타그램 연동이 완료되었습니다”라는 legacy 완료 변형만 보여준다. 연락처 수집/담당자 연락 접수가 완료됐다고 거짓말하지 않는다. `legacy` 결과는 연락처/분석접수 상태가 없다는 것을 타입으로 구분한다. v2와 v1의 idempotency namespace를 섞지 않는다.

### 롤백 중 v2 인증도 고려

v2 배포를 즉시 v1로 되돌리면 이미 시작된 v2 callback은 v1이 이해하지 못할 수 있다. 이를 해결하지 않은 상태에서 “무중단 롤백”을 보장하지 않는다. 전환 전 v1 rollback 빌드에 v2 state를 안전하게 v2 callback 서비스로 프록시하는 bridge를 별도 테스트하거나, 도메인의 callback/API 경로를 v2에 유지한 채 UI만 되돌리는 검증된 라우팅 방식을 준비한다. 바인딩 cookie는 검증하는 서버까지 안전하게 전달되어야 하며 임의 외부 URL로 전달하지 않는다. 이 호환 작업은 일반 P0~P5의 운영 파일 보호 예외이므로 소유자 승인 후 제한된 변경으로 수행한다.

운영 중 장애 시 우선 v2의 신규 start만 차단하고 이미 받은 콜백/완료 요청을 drain할 수 있도록 flag를 둔다. rollback으로 DB를 되돌리지 않는다. 초기화 이후 정상 등록된 v2 데이터도 보존한다. 삭제한 과거 테스트 토큰은 예전 상태로 자동 복원하지 않는다. 필요하면 본인 계정을 다시 인증한다. 추가 테이블은 남기고 v1 계약을 유지한다. 토큰 갱신 소유권을 v1 또는 v2 한 곳으로 재설정한다.

Streamlit은 v2 배포 artifact에 포함하지 않는다. 기존 파일을 Git에서 정리하는 일은 전환 안정화와 복구기간 종료 뒤 별도 PR이다. 레포에 v1 파일이 보존되는 것과 실제 v2 런타임에 Streamlit이 남는 것은 다르다.

## 12. 완료 기준

`TEST_MATRIX.md`의 UI/인증/트랜잭션/보안/알림/갱신/전환 테스트를 실제로 실행하고 증거를 남긴다. UI 동등성, mock 전체 흐름, 실제 Meta 연동, 실제 SMTP 수신, 실제 eligible 토큰 갱신은 각각 독립 상태로 보고한다.

이번 개발의 완료는 **구현+테스트+운영 전환 준비**다. 운영 전환 자체는 별도 승인 없이는 실행하지 않는다.

## v1.3 명시적 화면 복귀 식별자

`/connecting?attemptId=<UUID>`와 `/complete?attemptId=<UUID>`를 정식 복귀/완료 주소로 사용한다. callback은 서버가 검증한 UUID만 붙여 303으로 이동하고, OAuth code/state는 제거한다. `nextPath` 타입은 기존의 로컬 pathname enum을 유지하며, UI는 응답의 `attemptId`를 URLSearchParams로 인코딩해 붙인다. 개인정보·토큰·code·state는 붙이지 않는다.

UUID는 공개 가능한 작업 식별자일 뿐 조회 권한이 아니다. 서버는 URL/query의 attemptId를 검증하고 HttpOnly cookie 바인딩을 대조한 뒤에만 status/receipt를 반환한다. 서로 다른 두 완료 탭을 새로고침해도 각자의 receipt를 조회해야 한다. '가장 최근 접수'를 임의로 선택해 다른 계정 정보를 보여주지 않는다. attemptId가 없는 직접 접근은 bootstrap이 바인딩된 현재 작업 한 건을 확정할 수 있을 때만 해당 주소로 안내하고, 애매하면 입력/재시작 안내를 보여준다.

## v1.3 완료 재조회·만료 정리의 우선순위

최종 RPC와 complete/status route는 권한을 먼저 확인한 뒤 completed 분기를 처리한다. 완료 결과는 receipt_expires_at을 적용하고 이미 소모·삭제된 code, draft, candidate, 종료된 lease를 다시 요구하지 않는다. 미완료 작업만 draft TTL/상태/lease를 적용한다. 완료 재조회는 token/profile/동의/receipt/outbox를 새로 쓰지 않는다.

매일 cleanup이 실행되기 전에도 만료된 활성 attempt가 새 start를 막아서는 안 된다. start/restart 트랜잭션은 해당 브라우저의 expired 상태 전이를 먼저 수행해 partial UNIQUE 충돌을 해제한다. 살아 있는 processing lease는 임의로 취소하지 않으며, 만료 lease의 회수·fencing은 BACKEND_DB_SPEC 규칙을 적용한다. stale 작업이 완료됐다고 기존에 commit된 새 계정 데이터를 되돌리지 않는다.

승인 원본은 변경하지 않는다. 이번에 재현한 모바일 경계 문제의 실제 앱 보정은 `ui/production/usability-overrides.css`와 UI_UX_SPEC v1.3 절을 함께 따른다. 이 CSS는 API/React 구현을 대신하지 않는다.

## 13. v1.3.2 감사 정정 — 취소·복원과 연결 해제

제품 결정은 변경하지 않는다. 이 절은 같은 동작을 다르게 구현할 수 있었던 두 경계를 명확히 한다. 감사 분류와 증거는 `DEEP_AUDIT.md`를 따른다.

**OAuth 승인 취소와 개인정보 삭제는 다르다.** 제공자가 반환한 정상 바인딩 취소는 해당 state/code/token 처리권한을 끝낸다. 같은 브라우저의 이미 동의·제출된 폼 초안만 원래 `expires_at`까지 조회·복원할 수 있다. 취소/restart/read를 반복해 이 기한을 연장하지 않는다. 바뀐 약관이면 폼으로 돌아가 변경 항목을 재동의한다. 대체된 시도, 개인정보 삭제, 만료, 다른 브라우저에는 초안을 반환하지 않는다. 새 재시도는 새 state/code를 쓰고 오래된 취소 콜백은 새 attempt를 취소하지 못한다.

**연결 해제는 이미 실행 중인 갱신도 무효화한다.** `connection_status`나 승인권한만 달라져도 row_version을 증가시킨다. refresh의 조회·외부 호출 직전·DB 최종 쓰기에서 `revoked/reauth_required`는 제외한다. 최종 쓰기는 같은 token row의 보안 버전과 현재 상태를 동시에 검사하는 조건부 UPDATE이며 실패시 skip한다. 삭제된 행에 refresh upsert를 하지 않는다. refresh는 권한 재승인이 아니므로 unknown을 connected로 승격하거나 revoked를 되살리지 않는다. 새 정상 OAuth 승인만 새 연결을 활성화한다. 실제 제공자 오류 분류는 연동 검증 대상이다.


---

## 05. UI/UX 구현 명세

원문: `docs/UI_UX_SPEC.md`


버전 1.3.2 AUDIT · 2026-09-10 · 대상: 프런트엔드 구현자 / QA / 담당자

## 1. 디자인 기준과 우선순위

`reference/approved/index.html`과 `ui/styles.css`를 직접 이식한다. 화면 이미지를 보고 비슷하게 새로 디자인하지 않는다. 정식 기능·동의·접수 정책은 `V2_SPEC.md`, API는 `contracts/onboarding.ts`가 기준이다. 이 문서는 화면별 동작과 실제 연동 시 필요한 차이를 정의한다.

승인 원본과 분리 UI는 **데모**다. 모의 인증창과 시간 기반 성공을 실제 제품으로 옮기지 않는다. 원본 파일을 수정하지 않고 Next.js 앱에서 실제 기능으로 교체한다. 이하 신규 오류/재연동 문구는 승인 레이아웃을 사용하는 구현 명세이며, 이미 디자인된 추가 PNG가 있다고 가정하지 않는다.

### 승인 화면

![승인한 PC 정보·동의 화면](reference/approved/screenshots/desktop-form.png)

![승인한 모바일 정보 입력·연동·완료 흐름](reference/approved/screenshots/mobile-flow.png)

전체 승인 PNG는 `reference/approved/screenshots/`. 임시 로고는 승인 원형 유지가 기본이며 실제 회사 로고 교체는 별도 시각 비교를 거친다. 폰트 파일은 이 패키지에 포함하지 않는다.

## 2. 시각 토큰과 레이아웃

| 항목 | 원본 기준 | 구현 조건 |
|---|---|---|
| 주색 | `#7d4fde` | CTA/강조/단계 활성색 |
| 진한 주색 | `#6e3ed2` | hover |
| 연한 배경 | `#f8f5ff`, 브랜드 패널 `#f8f7fb` | 원본 그라디언트·그림자 유지 |
| 본문 | `#211b2c` | 가독성 우선 |
| 보조·선 | `#797282`, `#eae5f0` | 후반 legibility override까지 포함 |
| 글꼴 | Pretendard 우선, Noto/Malgun Gothic/system fallback | 웹폰트 추가 시 네트워크·라이선스·레이아웃 재검증 |
| 데스크톱 | 좌 브랜드 패널 / 우 폼 | `minmax(440px,1fr) minmax(540px,1.04fr)` 기준 |
| 1080px 이하 | 좌우 폭·간격 축소 | 원본 media query 유지 |
| 860px 이하 | 브랜드 패널 숨김 / 한 열 / 상단 로고 | 모바일 전용 폼 틀 |
| 420px 이하 | 좌우 22px 내외 여백 | 실제 CSS 우선 |
| 345px 이하 | 이름·전화번호도 1열 | 320px 가로 넘침 금지 |
| 폼 폭 | 기본 max 455px, 넓은 화면 490px | 임의 카드 폭 확장 금지 |
| 입력 | 46~49px 높이, 9px radius | 모바일 실제 입력 font-size 16px |
| CTA | 53px 높이, 10px radius | 로딩 중 동일 폭 유지 |

원본 CSS에는 뒤쪽 보정 규칙이 있다. 앞쪽 선언만 가져오지 않는다. 원본 preview toolbar 42px/67px는 제품에서 제거한다. 그만큼 콘텐츠가 전체 viewport를 쓰는 것은 승인된 이식 차이이며, 위쪽에 빈 띠를 남기지 않는다. `min-height:100svh`와 모바일 safe-area를 고려하고 내용이 길어지면 세로 스크롤을 허용한다.

이식 후 WCAG AA 수준의 텍스트 대비·키보드 접근을 검사한다. 대비가 부족한 보조 문구는 같은 보라/회색 계열 안에서 최소 보정하고 변경 전후와 이유를 기록한다. '원본 보존'을 접근성 결함 유지의 이유로 쓰지 않는다. 색상 변경을 포함한 시각 차이를 테스트 보고서에서 숨기지 않는다.

## 3. 화면 지도

| ID | 경로/구간 | 서버 전제 | 종료/다음 행동 |
|---|---|---|---|
| UX-01 시작 | `/` | 개인정보 조회 불필요 | 연결 시작 → `/apply` |
| UX-02 정보·동의 | `/apply` | bootstrap, 활성 정책 | 검증 성공 → 실제 Instagram 이동 |
| EXT-01 외부 인증 | Instagram | Meta가 제공하는 로그인/추가 인증/권한 UI | 승인 → 우리 callback, 취소 → 오류 |
| UX-03 처리 중 | `/connecting` | 정상 callback, 현재 attempt | complete 요청 및 status 확인 |
| UX-04 계정 불일치 | 기존 모달 | 서버 candidate+revision | 실제 계정 승인 / 다시 연결 |
| UX-05 최초 완료 | `/complete` | DB 완료, new, analysisRequested=true | 접수 안내 후 종료 |
| UX-06 재연동 완료 | 같은 `/complete` | DB 완료, reconnection | 갱신 안내 후 종료 |
| UX-07 실패/취소 | `/connection-error` | 안전한 오류 코드 | 상태 재확인/재연결/폼 복귀 |
| UX-08 약관·안내 | 모달 및 `/policies/*` | 확정 문서 콘텐츠 | 닫기, 원래 위치·포커스 복귀 |
| UX-09 전환기 완료 | 같은 틀의 legacy 변형 | 유효 v1 callback만 | 연결 사실만 안내, 가짜 연락처 금지 |

## 4. UX-01 시작 화면

좌측 '반응을 읽고, 선택의 기준을 만듭니다.' 카피, Instagram 타일, 심벌, 장식, 혜택 3개를 유지한다. 우측 제목은 '셀럽님의 다음 기회, 연결에서 시작됩니다.'다. CTA '인스타그램 연결 시작하기'는 우리 폼으로 간다. 아직 Instagram으로 바로 이동하지 않는다.

'연동이 궁금하신가요?'는 안내 모달. Instagram 비밀번호/2FA 코드를 우리가 받지 않는다고 설명한다. Meta 승인·인증을 받았다는 별도 보증마크로 문구를 확대하지 않는다.

## 5. UX-02 정보·동의 폼

제목: **먼저, 셀럽님을 알려주세요.**
설명: **분석 결과와 담당자 안내를 받을 정보를 입력해 주세요.**

| 필드 | name / ID | 제품 검증 규칙 | 표시/보안 |
|---|---|---|---|
| 이름 | fullName / full-name | trim 후 1~50자, 제어문자 금지 | 한 글자 이름 허용; 이름 진위 인증 아님 |
| 연락처 | phone / phone | 한국 번호 형식, 0 뒤 1~9로 시작; 정규화 후 `+82[1-9][0-9]{7,9}` | type=tel, inputmode=tel, 문자 인증 없음 |
| 이메일 | email / email | trim, 최대 254자, 이메일 기본 형식·제어문자 검사 | inputmode=email, 소유권 인증 없음 |
| 셀럽 ID | instagramUsername / instagram | @ 제거·영문 소문자, 영문/숫자/_ 시작, 이후 . 허용, 최대30자 | 인스타 계정명 참고값; 소유권 판단 금지 |

국내 연락처 형식 지원은 현재 참고 코드의 구현 기본값이다. '+'를 숫자가 아니라며 지우거나 국제형 한국 번호를 무조건 010 포맷으로 바꾸지 않는다. 휴대전화와 지역번호는 각각 표시하고, 사용자 입력을 의미 없이 재작성하지 않는다. 해외 번호 지원은 별도 범위 변경이다.

**프런트와 서버는 같은 검증 모듈/테스트를 사용한다.** 원본 demo의 2글자 제한, 무조건 숫자만 추출하는 전화번호 처리, 임의 이메일 fallback은 실제 앱에서 교체한다. 이름 1자 허용은 v1.1 서버 기준을 그대로 따르는 동작 정합성 수정이다. 개인정보는 입력 중 서버 전송·자동 저장·analytics 기록하지 않는다. 동의 후 제출한 유효 draft만 제한 시간 동안 복원한다.

동의 4개는 만14세 이상, 서비스 약관, 개인정보 수집·이용, Instagram 데이터 이용이다. 모두 기본 해제. 전체 동의는 자식 checkbox와 indeterminate를 동기화한다. 약관 '보기' 클릭이 자동 동의로 이어지지 않는다. 수집·이용 동의와 footer 개인정보처리방침은 다른 문서로 연결한다.

CTA: **동의하고 Instagram 연결**. 폼이 빈 상태에서도 누르면 오류를 안내한다. 네트워크 제출 중에만 disabled 처리하고 '연결 화면으로 이동 중…'으로 바꾼다. 서버 오류가 나면 입력값과 선택을 유지하되 변경된 약관이면 해당 항목은 다시 확인시킨다.

CTA 아래 유지 문구: '인스타그램 비밀번호는 셀럽라이프에 저장하지 않아요.'
추가 문구: **다음 단계에서 Instagram 로그인 및 권한 승인이 진행됩니다. 완료 후 셀럽라이프로 돌아옵니다.**

입력 오류는 필드 아래에 표시하고 첫 오류로 포커스를 이동한다. 서버 requestKey/policy 오류는 인풋 내부 ID를 노출하지 않고 폼 상단의 안전한 안내로 표시한다. 필드 오류와 제출 오류를 구분한다.

## 6. EXT-01 Instagram 화면

같은 탭 `window.location.assign(authorizeUrl)`으로 이동한다. 팝업/iframe 로그인, 외부 페이지 scraping, 우리 사이트 안의 Instagram 비밀번호 화면은 만들지 않는다. 이미 로그인돼 있으면 제공자 판단으로 일부 화면이 생략될 수 있으므로 비밀번호 입력부터 반드시 강제하지 않는다.[S6]

인앱 브라우저에서 외부 브라우저로 넘어가 바인딩 cookie가 없어졌다면 자동 연결 성공으로 처리하지 않는다. '처음 연결을 시작한 브라우저에서 다시 진행해 주세요'를 안내한다. 비밀 cookie나 code를 복사하도록 시키지 않는다. Android/iOS 실제 기기 검증은 별도 출시 검사다.

## 7. UX-03 연동 처리 중

정상 callback → 민감 query를 지운 `/connecting` → 로딩 UI 렌더 → complete POST 순서다. 최초 버튼 제출 직후의 짧은 전환 대기와, Instagram에서 복귀한 뒤 토큰 처리 대기를 구분한다. 로딩 아이콘은 진행 중 표식이지 퍼센트가 아니다.

| 서버 상태 | UI 단계 | 허용 문구 |
|---|---|---|
| exchanging / account | 1번 활성 | 인스타그램 계정을 확인하고 있어요 |
| saving / storage | 1번 완료·2번 활성 | 신청 정보를 안전하게 저장하고 있어요 |
| submission, intent unknown | 3번 대기/활성 | 연결 신청을 마무리하고 있어요 |
| submission, intent new | 3번 활성 | AI 분석 신청을 접수하고 있어요 |
| submission, intent reconnection | 3번 활성 | 연결 정보를 갱신하고 있어요 |
| completed | 실제 commit 결과대로 | 최초/재연동 완료 분기 |

실제 신규/재연동 판정 전에는 '새 분석 신청'을 확정해 보여주지 않는다. `submittedIntent`라는 임의 필드를 만들지 말고 API의 `submissionIntent`를 사용한다. 빠른 작업에서 2·3단계가 함께 완료되어도 된다. 애니메이션을 위해 5.6초를 강제로 기다리지 않는다.

확인 전 계정 태그는 '계정 확인 중' 또는 '입력한 계정 @...'로 표시한다. '연결 완료' 라벨은 제공자 검증 뒤에만 붙인다. 이름/이메일/전화번호는 서버 receipt의 스냅샷을 사용하고 demo fallback을 금지한다.

45초(프로젝트 기본값)를 넘기면 '연결 확인이 지연되고 있어요. 현재 상태를 다시 확인해 주세요.'와 '상태 다시 확인'을 제공한다. 타임아웃만으로 실패나 성공을 추정하지 않는다. status가 retry_complete를 허용할 때만 완료 작업을 다시 요청한다. code 교환 성공 여부가 불명확하면 새 OAuth를 시작한다.[S6]

비활성 탭은 polling을 멈추고 복귀 시 상태부터 조회한다. 2초 기반 polling과 backoff는 진행 화면에만 적용한다. 시작/완료 화면에서 DB 실시간 구독을 만들지 않는다.

## 8. UX-04 실제 계정 불일치

제목: **연결된 계정을 확인해 주세요.**
본문: '입력하신 계정은 @입력계정, Instagram에서 확인된 계정은 @실제계정입니다.'
주 버튼: **@실제계정으로 연결**. 보조 버튼: **다른 계정으로 다시 연결**.

주 버튼은 `{attemptId,expectedRevision,accept:true}`만 보낸다. 클라이언트 username/token으로 후보를 바꾸지 않는다. 오래된 탭/모달이면 '연결 상태가 변경되었어요. 다시 확인해 주세요.'를 보여주고 새 상태를 조회한다. 재시작은 새 requestKey를 만들되 요청 재전송에는 같은 키를 쓴다.

## 9. UX-05 최초 완료

제목: **연동이 완료되었습니다.**
설명: '**{이름}님의 분석 신청이 정상적으로 접수되었어요.**'
계정: 실제 검증된 @계정 + 연결 완료.
후속 카드: '이제, 이렇게 진행돼요 / 약 1영업일', '채널에 맞는 분석을 준비합니다', '담당자가 직접 연락드립니다'.
하단: 본 접수의 이메일·연락처, **이 페이지는 닫으셔도 됩니다.**, 실제 접수번호.

이 앱 안에서 분석은 수행하지 않는다. 'AI 분석 완료', 가짜 결과, 담당자 읽음, 메일 전달 완료는 표시하지 않는다. 1영업일은 운영자가 수용할 안내 목표다. 실제 서비스 개시 전 담당자 처리 체계를 확인한다. 후속 자동화가 미연결이면 담당자가 pending_review 접수를 수동 처리한다.

## 10. UX-06 재연동 완료

같은 완료 레이아웃과 애니메이션을 사용하며 아래 내용만 바꾼다.

| 영역 | 재연동 문구 |
|---|---|
| 제목 | 인스타그램이 다시 연결되었습니다. |
| 설명 | 연결 정보가 업데이트되었어요. 기존 분석 신청 내역은 유지됩니다. |
| 카드 제목 | 연결 정보가 업데이트되었어요 |
| 첫 항목 | 계정 연결과 연락처를 갱신했습니다 |
| 둘째 항목 | 기존 신청 내역은 그대로 유지됩니다 |
| 기간 배지 | '약 1영업일' 제거; '기존 신청 유지'로 대체 |
| 번호 | 이번 연결 이력 번호 표시 |
| 종료 안내 | 이 페이지는 닫으셔도 됩니다. |

새 분석을 실행하거나 기존 담당자 검토 상태를 초기화하지 않는다. 최초 신청이 취소돼 있어도 재연동만으로 새 신청을 부활시키지 않는다. 별도 재분석 버튼은 만들지 않는다.

## 11. UX-07 오류·복구 문구

| 원인 | 제목/본문 핵심 | 기본 CTA |
|---|---|---|
| 인증 취소 | 인스타그램 연결이 취소되었어요 | 다시 연결하기 |
| 세션 만료 | 연결 시간이 지나 다시 시작해야 해요 | 정보 입력으로 돌아가기 |
| 브라우저 바인딩 불일치 | 연결을 시작한 브라우저에서 다시 진행해 주세요 | 처음부터 다시 연결 |
| 제공자 장애 | 인스타그램 연결 확인이 지연되고 있어요 | 상태 다시 확인 / 안전한 재연결 |
| 저장 장애 | 신청 저장 상태를 확인하고 있어요 | 상태 다시 확인 |
| 권한 부족 | 필요한 인스타그램 권한을 확인해 주세요 | 다시 연결하기 |
| 미지원 계정 | 이 계정으로는 연결을 완료할 수 없어요 | 지원 계정 안내 |
| 같은 키 다른 입력 | 신청 정보가 변경되었어요 | 정보 확인 후 새로 제출 |
| 다른 탭 진행 중 | 다른 연결 작업이 진행 중이에요 | 진행 상황 확인 |
| 오래된 작업 | 더 최근의 연결 정보가 있어요 | 최신 상태 확인 |

'입력하신 정보가 그대로 남아 있어요'는 `draftAvailable=true`일 때만 사용한다. 만료/다른 브라우저에서는 이 약속을 하지 않는다. 상태 조회가 실패한 것과 최종 저장 실패는 다르다. 개인정보가 있는 화면은 no-store이며 세션 만료 뒤 BFCache/pageshow에서도 상태를 재검증한다.

연락처 수정 버튼은 이번에 새 인증/설정 화면을 만들지 않는다. 유효한 자신의 완료 세션에서 기존 문의 모달로 안내하고 **확정된 공개 CONTACT_EMAIL**을 사용한다. 내부 담당자 수신 주소를 자동으로 공개하지 않는다. 이메일/전화번호만으로 데이터 수정·삭제를 허용하지 않는다.

## 12. 접근성·모바일·안전성

label/for, 오류 aria-describedby, 필수 표시, 실제 button type, focus-visible을 유지한다. 모달은 focus trap/Escape/닫기/원래 트리거 복귀를 지원한다. 페이지 전환 시 제목 포커스, 진행 문구 aria-live=polite, 중복 낭독 억제, reduced-motion을 적용한다.

320/390/768/860/861/1080/1440 폭에서 검사하고 200% 글자 확대·긴 이메일·긴 이름을 확인한다. 화면 상하 고정 CTA 때문에 입력창이 키보드에 가리지 않도록 한다. 체크박스는 그림 크기를 바꾸지 않아도 label hit area를 확보한다. target-size와 대비의 실제 수치는 선택한 접근성 표준으로 검사한다.[S8]

URL, hash, localStorage, sessionStorage에 PII/token/code/state를 앱이 저장하지 않는다. 단, OAuth 제공자가 callback URL에 전달하는 code/state는 불가피한 프로토콜 값이며 서버에서 처리 후 깨끗한 URL로 이동·로그 redaction한다. HTML의 demo CSP를 그대로 복사하지 말고 Next.js nonce/hash 등 실제 빌드와 맞춘다.

## 13. UI 승인/검증 분리

**이번 패키지 검증:** 승인 원본↔분리 UI 렌더 및 demo 동작. **Codex 구현 후 검증:** 승인 원본↔실제 React 앱. 후자는 아직 수행되지 않았다. 저장된 원본 PNG와 다른 OS 폰트에서 비교한 결과를 0픽셀 동일이라고 보고하지 않는다.

생산 이식 허용 차이: preview 제거, 실계정/접수 데이터, 외부 인증 안내, 검증 오류, 재연동 분기, 확정 약관 전문, 접근성 최소 보정. 나머지 디자인 변경은 전후 비교와 이유가 필요하다. 기존 전체/개별 동의와 모달 동작이 사라지면 미완료다.

## v1.3 명시적 화면 복귀 식별자

`/connecting?attemptId=<UUID>`와 `/complete?attemptId=<UUID>`를 정식 복귀/완료 주소로 사용한다. callback은 서버가 검증한 UUID만 붙여 303으로 이동하고, OAuth code/state는 제거한다. `nextPath` 타입은 기존의 로컬 pathname enum을 유지하며, UI는 응답의 `attemptId`를 URLSearchParams로 인코딩해 붙인다. 개인정보·토큰·code·state는 붙이지 않는다.

UUID는 공개 가능한 작업 식별자일 뿐 조회 권한이 아니다. 서버는 URL/query의 attemptId를 검증하고 HttpOnly cookie 바인딩을 대조한 뒤에만 status/receipt를 반환한다. 서로 다른 두 완료 탭을 새로고침해도 각자의 receipt를 조회해야 한다. '가장 최근 접수'를 임의로 선택해 다른 계정 정보를 보여주지 않는다. attemptId가 없는 직접 접근은 bootstrap이 바인딩된 현재 작업 한 건을 확정할 수 있을 때만 해당 주소로 안내하고, 애매하면 입력/재시작 안내를 보여준다.

## 14. v1.3 모바일 실측 보완 — 원형 유지, 결함은 이식하지 않기

현재 Chromium의 좁은 viewport를 사용한 DOM 실측에서 일반 데이터 14개 폭×5상태는 가로 넘침이 없었다. 그러나 이름 50자·계정명30자·긴 이메일을 조합한 완료 화면은 320/360/390/430/861 폭에서 가로 넘침이 재현되었다. 높이 320/420/568의 약관 모달은 확인 버튼이 패널 밖으로 잘렸다. 이 수치는 실제 기기 인증 검사가 아닌 원본 데모의 레이아웃 검사다.

`ui/production/usability-overrides.css`를 승인 CSS **뒤에** 가져오고 앱 body에 `data-celeblife-production="true"`를 설정한다. 원본 `reference/approved/` 및 `ui/styles.css`는 바꾸지 않는다. 프로젝트의 실제 CSS 구성에 이식하되 다음 조건을 유지한다.

- 이름·실제 계정명·연락처는 줄바꿈 가능하게 하고 계정 상태 배지가 찌그러지지 않도록 한다. 가로 overflow:hidden으로 정보를 숨겨 해결하지 않는다.
- 약관 모달은 열렸을 때 세로 flex, 일반 높이는 머리/꼬리 보존과 본문 스크롤을 사용한다. 극단적 낮은 높이/큰 글자에서는15절의 전체 모달 스크롤 fallback으로 모든 버튼을 접근 가능하게 한다.
- 주요 보조 버튼과 동의 label의 터치 높이 목표는 44 CSS px다. 기존 약관 보기25×30, label높이33은 WCAG의24px 최소와는 별개로 더 크게 보정한다. 44px를 WCAG AA의 일괄 의무로 설명하지 않는다.[M1]
- 중요 보조 문구를 같은 계열에서 진하게 보정한다. 원본의 도움말3.42:1, 버튼 아래 설명3.82:1(흰 배경 기준)은 일반 텍스트4.5:1 목표보다 낮다. 이번 CSS는 일부 핵심 선택자를 #776583으로 보정한 예시이며 전체 WCAG 적합성 검증 완료를 의미하지 않는다.[M2]
- CTA의 높이를 고정값이 아니라 최소높이로 해 큰 글자에도 문구가 가려지지 않게 한다. safe-area 여백을 적용한다. 실제 OS 글자확대/키보드/노치 검사는 아래 실기기 표로 남긴다.

### 실제 휴대폰 출시 검사

| 환경 | 해야 할 검사 | 현재 상태 |
|---|---|---|
| iPhone Safari | 한글 입력·연락처/이메일 키보드·돌아가기·추가인증·OAuth 복귀·세션 복원 | NOT_RUN |
| Android Chrome | 동일 흐름, 회전/작은 높이/긴 계정/네트워크 복구 | NOT_RUN |
| Instagram 인앱 브라우저 iOS/Android | 진입→외부 인증→복귀의 cookie 유지 또는 안전한 실패 | NOT_RUN |
| OS 글자크기200%, VoiceOver/TalkBack | 문구·버튼 가림, 읽기 순서, 오류/모달 포커스 | NOT_RUN |

인앱→외부 브라우저 전환으로 cookie가 없어지면 기존 오류의 '처음 브라우저로 돌아가라'만 반복하지 않는다. **'브라우저가 바뀌어 연결을 확인하지 못했어요. Safari 또는 Chrome에서 셀럽라이프를 다시 열고 처음부터 연결해 주세요.'**를 안내한다. 깨끗한 서비스 시작 URL만 복사/열도록 하고 token/code/state나 개인정보를 공유하지 않는다. 플랫폼에서 임의로 특정 브라우저를 열 수 있다고 보장하지 않는다. 입력 재작성 가능성도 고지한다.

`python scripts/verify_mobile_review.py`는 원본과 보정 CSS의 레이아웃 회귀를 재현한다. 이 스크립트는 메모리 로딩 방식이며 HTTP/CSP/실기기/Next.js 앱은 검사하지 않는다. 창 높이를 줄이는 것은 OS 키보드 테스트가 아니며, computed font를 두 배로 한 것은 실제 iOS/Android 글자확대 검증이 아니다.[M3]

## 15. v1.3.1 계정 확인 버튼·완료 상태 정정

UX-04의 `@실제계정으로 연결`은 30자 사용자명에서도 버튼 안에서 모두 읽을 수 있어야 한다. 원래 버튼 문구와 디자인을 유지하되 production 보정 CSS의 `overflow-wrap:anywhere`를 적용한다. React에서 텍스트를 span으로 감싸면 그 span에도 `min-width:0`을 적용해 flex 최소폭 때문에 넘치지 않게 한다. 잘라내기나 말줄임표로 계정 식별정보를 숨기지 않는다.

상태 적용 함수는 attemptId/revision뿐 아니라 currentStatus/receivedStatus를 받는다. completed 이후 도착한 processing/awaiting 응답은 무시한다. receipt 조회에 401/403/410이 오거나 서버 만료를 확인하면 이 단조성 규칙보다 앞서 개인정보 DOM·메모리를 비우고 재시작/만료 안내를 보여준다. 오류를 무시하고 오래된 개인정보를 계속 보이라는 뜻이 아니다.

추가 모달 검사는 문서에 정의된 계정 확인 변형을 승인된 모달 DOM에 구성한 probe다. 이 결과는 실제 React 모달·물리 휴대폰 OAuth 검증이 아니다.

확인창에 주/보조 버튼이 모두 있으면 secondary 역시 고정높이 대신 최소높이로 표시한다. 본문이0으로 줄어 정보가 사라지지 않도록 최소 가시영역을 두고, header+actions가 짧은 화면에 들어가지 않을 때는 모달 자체의 세로 스크롤을 허용한다. 평상시의 본문 단독 스크롤은 유지한다. 둘 다 보이게 하려고 화면 밖 버튼을 clip하거나 정보를 숨기지 않는다.

## 16. v1.3.2 취소 안내 정합성 — 디자인 변경 없음

이번 버전은 승인 HTML·분리 UI·production 보정 CSS를 바꾸지 않는다. 정상 취소 후 '입력한 정보가 남아 있어요'는 같은 브라우저, 원래 draft 기한, 서버의 `draftAvailable=true`를 만족할 때만 표시한다. 개인정보 삭제나 만료에는 이 문구를 쓰지 않는다. 취소된 Instagram 인증을 재개하는 것이 아니라 새 인증을 시작하는 흐름이다. 공개/비공개 연락처·재연동 정책은 그대로다.

모달의 키보드 검사에서 브라우저 주소창으로 포커스가 이동하는 것과 배경 폼이 활성화되는 것을 혼동하지 않는다. 브라우저 chrome 포커스는 DOM `document.hasFocus()`가 false가 될 수 있다. 실제 앱은 배경 상호작용 차단, 닫기/Escape와 트리거 복귀, 표준 모달 내부 순환을 검증한다. 이번 DOM probe가 React/실기기 접근성 검증을 대신하지 않는다.


---

## 06. 백엔드·DB

원문: `docs/BACKEND_DB_SPEC.md`


버전 1.3.2 AUDIT · `V2_SPEC.md`의 구현 상세. 서버/DB 실구현·RPC는 Codex 작업 대상이다.

## 1. 아키텍처와 책임

Next.js App Router + TypeScript + Node.js Route Handlers 안에 서버를 모은다. 별도 Python 서버/회원 비밀번호/관리자 UI/메시지 브로커를 만들지 않는다. Supabase는 등록 데이터 기준 저장소로 유지한다. 파일 수집·AI 추론·시장조사는 다른 시스템이다.

```text
우리 UI ── same-origin API ── onboarding service ── v2 RPC ── Supabase
                                  │                       │
                                  ├─ Instagram adapter    └─ outbox → SMTP
                                  └─ credential module        ↑
                                        ↑                retry Cron
                                  token refresh Cron
```

Route는 입력/인증/응답만, service는 업무 흐름, repository는 DB, provider adapter는 외부 요청/안전한 오류분류를 맡는다. `server-only` 경계를 테스트하고 번들에 DB키·토큰·SMTP 비밀번호가 들어가지 않게 한다. 내부 서버 타입과 브라우저 공개 타입을 분리한다.

## 2. 서버 모듈

| 모듈 | 입력/출력 경계 | 책임 |
|---|---|---|
| config | env → 검증된 config | env간 DB/메일/프로젝트 오접속 차단 |
| sessions | cookie+CSRF → bound attempt | requestKey·state·receipt 수명/재시도 |
| consent | bundle ID → canonical snapshot | 문서 버전/hash·동의시각 고정 |
| instagram | code/token → 검증된 결과 | 제한시간, allowlist, 응답 형식, 실제 승인권한 확인 |
| onboarding | attempt → receipt/status | claim·checkpoint·후보확인·등록 확정 |
| repository | 내부 typed command → RPC | prepared query, 명시적 schema, 오류 redaction |
| credentials | 계정/token snapshot → 저장/조회 | 읽기 계약·만료·row version·갱신 |
| outbox/email | event → SMTP 처리 | 멱등키, escape, lease, 실패 복구 |
| cleanup | 기한/상태 → 자료정리 | 민감 임시자료·만료 세션만 정리 |

Instagram 어댑터는 계정 확인에 필요한 최소 필드만 요청한다. 프로필 사진·팔로워수·게시물수를 UI에서 쓰지 않는데 수집하거나 원본 전체 응답을 저장하지 않는다. API 버전/host를 사용자 입력으로 받지 않는다. 일반 OAuth의 refresh_token grant와 기존 Instagram의 ig_refresh_token 구현을 섞지 않는다. 현재 Meta 사양은 실제 앱 설정과 다시 대조해야 한다.[S2]

## 3. 핵심 불변조건

| ID | 반드시 지킬 조건 |
|---|---|
| INV-01 | token+연락처+동의+receipt+outbox가 최종 한 트랜잭션에서 확정되기 전 성공 표시 금지 |
| INV-02 | 같은 attempt 재전송은 동일 receipt. 새 code 교환/새 알림/새 신청 0 |
| INV-03 | 계정별 최초 new 접수 1개. 재연동 이력은 분석 큐 제외 |
| INV-04 | 이메일/전화번호는 non-unique·미인증. 계정 병합키는 제공자 ID |
| INV-05 | 사용자 입력 username은 인증 근거가 아님. 실제 계정 불일치 확인 필요 |
| INV-06 | stale lease/다른 attempt/낮은 revision이 최신 처리를 승인·저장할 수 없음 |
| INV-07 | 모든 v2 DB→JS BIGINT ID는 TEXT로 무손실 이동 |
| INV-08 | 메일 실패가 commit된 접수를 취소하지 않음 |
| INV-09 | expired/revoked token을 자동으로 살렸다고 표시하지 않음 |
| INV-10 | reset은 배포 migration과 분리. v2 신규 자료·타 서비스 삭제 금지 |

## 4. 데이터 사전

기존 `users`, `tokens`, `user_consents`와 v1 RPC는 호환성을 유지한다. 레포 SQL과 운영 스키마가 같다고 가정하지 말고 실제 FK·정책·함수·인덱스를 확인한다.

| 테이블 | 핵심 컬럼 | 역할/제약 |
|---|---|---|
| users | id, instagram_id, instagram_username | 실제 계정 ID UNIQUE. 이메일로 병합 금지 |
| tokens | user_id, token_type, access_token, expires_at, created_at | `(user_id,token_type)` 유지; created_at은 구형 최근 저장시각 의미 보존 |
| tokens 추가 | row_version, source_attempt_id/started_at, connection_status | credential 경합 방지/상태. v1 writer 포함 trigger 필요 |
| tokens 추가 | refresh 시도/성공/실패 metadata, granted_scopes/scopes_checked_at | token 원문 없는 운영 점검 |
| user_consents | user_id, state_nonce, 4동의, 문서 버전/hash, accepted_at | 기존 schema_version=1 유지, v2 nonce namespace |
| creator_profiles | user_id, 이름, 이메일, phone_e164, verified flags | 최신 연락처. source_accepted_at에 따른 역행 방지 |
| onboarding_sessions | id, binding hash, request_key, payload keyed hash, 암호화 state | start 중복 응답 복원·state 일회 처리 |
| onboarding_sessions | 암호화 draft/code/token checkpoint, candidate, expiry | 데이터 최소 보관·중간 복구 |
| onboarding_sessions | revision, status, stage, lease, request_id, receipt_expires_at | 실행/복구/영수증 수명 분리 |
| onboarding_requests | id, user_id, session_id, account/contact snapshot | session_id UNIQUE; 성공한 연결 이력 |
| onboarding_requests | connection_kind, initial_request_id, review_status | new partial UNIQUE(user_id), reconnection→같은 계정 root |
| notification_outbox | event_key, request_id, status, attempts, next_attempt_at, lease | event_key UNIQUE; PII 복제 payload 없이 request에서 메일 조립 |
| job_leases | name, owner, lease_expires_at, last_success_at | 단일 Cron 소유권과 실행 상태 |

성공 이력 `session_id`는 만료 session 삭제와 독립된 영구 멱등키다. 임시 session을 지워 receipt까지 cascade 삭제하지 않는다. root 접수와 reconnection FK는 계정 전체 삭제 시 함께 정리한다. 정책상 접수 보유기간이 지나 root를 삭제할 때 재연동 행을 고아로 남기지 않는다.

`templates/0001_v2_schema.sql.draft`는 열/제약 초안이지 적용할 migration이 아니다. 끝 ROLLBACK만 믿고 운영에서 부분 선택 실행하지 않는다. trigger/RPC/선택적 revoke/권한 테스트/기존 스키마 비교가 완료된 새 migration을 생성한다.

## 5. 등록 확정 RPC의 순서

`complete_instagram_onboarding_v2`는 서버용 권한으로만 호출한다. 권한 revocation은 이 앱의 새 함수/테이블에 한정하고 다른 서비스의 PUBLIC 함수 권한을 일괄 변경하지 않는다. Supabase는 함수 권한을 테이블 RLS와 별도로 통제해야 하며, SECURITY DEFINER이면 search_path를 제한한다.[S5]

```text
1. attempt 행 lock → browser binding/요청 권한을 먼저 검증
2. 이미 completed면 receipt_expires_at만 확인해 기존 결과 반환: draft TTL·해제된 lease·지운 candidate/code를 요구하지 않음
   미완료인 경우에만 draft TTL·현재 상태·owner/lease·revision·후보를 검사하고 아래 쓰기 진행
3. 검증된 instagram_id로 users upsert/행 lock
4. 같은 계정 최초 v2 접수 탐색, stale attempt/source order 확인
5. source 시각이 적절한 최신 프로필만 반영
6. 실제 본 정책 bundle로 동의 audit 기록
7. token/version/권한/만료 metadata 저장 (최신 credential 보호)
8. 최초 new/pending_review 또는 reconnection/not_requested receipt 생성
9. 해당 receipt ID의 outbox event 생성
10. session completed/receipt_expires_at 지정, 민감 임시 payload 즉시 제거
11. commit 뒤 receipt 반환, after()는 첫 메일 시도에만 사용
```

외부 API/SMTP 호출은 DB transaction 안에서 하지 않는다. account lock 순서를 모든 finalization에서 같게 해 교착을 줄인다. SQL serialization/deadlock 등 재시도 가능한 오류는 code 교환을 반복하지 말고 검증된 checkpoint로 DB 확정만 제한 재시도한다. 통신이 끊기면 commit 여부를 session/request UNIQUE로 재확인한다.

후속 분석자가 읽을 목록은 `connection_kind='new' AND review_status='pending_review'`이며 request ID로 멱등 처리한다. 범용 새 row webhook을 분석 실행으로 직결하지 않는다. 이 앱이 자동 분석을 시작하지 않으므로 '1영업일'은 독립된 담당자 운영 약속이다.

## 6. 인증/세션 경계 보강

### 응답 유실

state hash만 있으면 기존 authorize URL을 복원할 수 없다. `oauth_state_encrypted`를 state TTL 동안 유지하고, 정규화 payload keyed hash와 비교해 동일 start 재요청에만 복호화한다. state plaintext는 로그/metadata에 남기지 않는다. fingerprint key는 별도 비밀이고 활성 세션이 있는데 무계획으로 바꾸지 않는다.

### 다중 탭·재시작

서버 바인딩은 브라우저 소유, 작업은 attemptId 소유다. 동일 브라우저에서 bootstrap을 여러 번 호출해 cookie가 교체되면 기존 인증을 깨뜨리므로 유효 cookie는 재사용한다. complete/confirm/restart 요청에는 명시적 attemptId를 받는다. confirm은 revision 일치까지 확인한다. 프로세싱 중인 작업을 다른 탭의 '다시 시작'이 제거하지 못하게 한다.

### 일회성 code와 checkpoint

교환 전 상태를 durable하게 기록한다. code 교환 타임아웃 뒤에는 성공 여부가 모호하므로 원문을 재전송하지 않는다. 정상 응답 token을 암호화 checkpoint에 보관했다면 이후 계정검증/최종저장을 복구한다. key unavailable, checkpoint 기록 실패, 후보 만료면 새 OAuth를 요구한다.[S6]

동일 callback 재전송은 code hash/state binding을 확인해 기존 상태만 반환한다. 다른 code를 같은 state로 주입하면 거절한다. 만료된 state와 잘못된 cookie는 작업을 진행하지 않으며, 그 요청만으로 정상 세션을 망가뜨리지 않는다.

### 만료와 민감정보

state 10분, draft 30분, 완료 receipt 24시간은 별개 타이머다. 완료 code/token/draft는 즉시 제거하고 receipt만 보관한다. 취소된 OAuth code/state/token은 즉시 무효화·삭제한다. 본인이 Instagram 승인을 취소한 경우의 동의 후 입력 초안은 원래 draft 기한까지 제한된 폼 복원에만 사용할 수 있다. 만료·대체·개인정보 삭제된 초안은 복원하지 않는다. cleanup은 이 구분에 따라 물리 정리한다. callback에 analytics/pixel/session replay를 넣지 않는다. 알려진 code/token/cookie marker를 로그·프런트 번들·HTML·URL에서 검사한다.

## 7. 토큰 관리와 소비자 호환

현재 선택은 **legacy_plaintext 저장 계약 유지**다. 이는 임시 code/checkpoint 암호화와 다르다. 유휴 상태여도 외부 소비 코드가 존재하므로 실제 읽기 경로를 찾고 공통 credentials 모듈로 감싼다. 별도 토큰 API는 지금 범위의 필수가 아니며 관리자 키를 신규 레포에 무작정 배포하지 않는다. 장기 저장 암호화는 소비자/구형 fallback/갱신/rollback 전환을 함께 설계하는 후속 결정이다. 잔여 위험은 출시 책임자가 확인해야 한다.

토큰은 유효기간과 저장 시각을 검증하고 **남은 기간 7일 미만**인 대상을 하루 한 번 검사한다. 기존 참고 코드의 엄격한 `<` 경계를 유지하므로 정확히 7일은 당일 skip이다. 저장/갱신 후 24시간 미만은 skip한다. expires_in은 응답의 양의 정수를 쓰고 60일로 임의 보정하지 않는다. 이 정책의 실제 Meta 적합성은 최신 사양·eligible 계정 검증 후 기록한다.[R2/S2]

v2 refresh는 snapshot row_version+created_at+expires_at CAS로 기록한다. 구형 writer도 version 증가 trigger를 거치게 한다. old refresh가 실패했다고 새 정상 token을 reauth_required로 바꾸지 않도록 **실패 metadata 갱신도 version 조건부**로 한다. 외부 장애는 일시 실패, 확인된 무효/철회는 재연동 필요로 분류한다. raw error 문자열을 저장하지 않는다.

토큰 갱신 실패는 기존 선택적 운영 webhook과 집계 로그로 관찰한다. 이번 필수 SMTP 메일 범위는 신규 등록·재연동 알림이며 정상 갱신 메일이나 범용 운영 경보 outbox를 새로 만들지 않는다. webhook이 없으면 외부 경보가 없다는 것을 명시하고 담당자가 last successful run/overdue/reauth_required를 확인할 수 있는 점검 경로를 제공한다. SMTP 자체가 고장났을 때 같은 SMTP 알림만 기대하지 않는다. 일반적인 토큰 상태 메일은 후속 확장 항목이다.

## 8. 알림/정기 작업

최종 DB commit과 outbox 생성까지가 등록의 원자적 범위다. SMTP는 그 뒤다. `after()`는 요청의 max duration 한계를 받으므로 첫 시도 최적화이고 영구 queue 보장이 아니다.[S3]

`notification_outbox` 상태는 pending/processing/sent/dead다. timeout되거나 worker가 죽어 processing에 남은 행도 lease 만료 뒤 회수한다. attempts는 실제 발송 시도 시작 때 증가시키고, next_attempt_at/최대 횟수는 멱등 기록한다. SMTP acceptance 이후 DB sent 기록 실패면 중복 전송 가능성이 남는다. Message-ID는 고정하지만 정확히 한 번 수신/읽음 보장은 하지 않는다.

수신 `dkssud374@celeblife.co.kr`, 발신 기본안 동일. actual company SMTP host/port/TLS/외부 앱 인증은 설정 후 검증한다. 사용자 입력 주소를 To/From/Reply-To/CC/BCC로 쓰지 않는다. SMTP 인증/수신 테스트는 승인된 테스트 정보로만 진행한다. 운영메일의 HTML escape/CRLF 제한/토큰 미포함을 테스트한다.

| 작업 | 기본 스케줄/예산 | 실패 복구 |
|---|---|---|
| token-refresh | 하루1회, 00:23 UTC | 다음 실행/보호된 수동 작업, overdue 관찰 |
| notification-retry | 5분마다, 45초 budget | due+stale-processing claim, 5회 최대시도 기본 |
| cleanup | 하루1회, 00:43 UTC | 만료 자료 물리정리; 접근은 즉시 차단 |

각 작업은 maxDuration/집계/소유권을 따로 두고 동일 DB에 두 Vercel 프로젝트가 동시에 운영하지 않게 한다. 5분 스케줄은 Hobby에서 실행할 수 없고 상업용 운영 플랜도 확인해야 한다.[S4] 스테이징은 수동 테스트가 가능하되 회사 운영 DB/수신자에 접속하지 않는다. 모든 환경 가드는 secret/header/설정 검증을 실제 연결 전에 수행한다.

## 9. legacy callback 보호

같은 계정에 v2 연결이 있는지 JavaScript에서 조회한 뒤 별도로 old RPC를 부르는 방식은 중간 경합이 남는다. 호환 어댑터는 **같은 DB 트랜잭션의 계정 lock 안에서 v2 여부 확인과 legacy 저장 분기**를 수행한다. 기존 v1 RPC의 문서 버전 규칙은 바꾸지 않되, 새 guarded wrapper를 작성하거나 동등한 검증된 SQL 경로를 사용한다. 새 UI/legacy 완료 분기만으로 쓰기 충돌이 해결됐다고 간주하지 않는다.

## 10. 개발에서 필요한 DB 테스트

동일 계정 두 최초 attempt는 A→B 완료 시 new 1/reconnection 1, B→A 완료 시 new 1/STALE_ATTEMPT 1이며, 같은 attempt 동시 호출 → receipt/outbox 각1, 새 토큰 저장 후 오래된 refresh → CAS skip, 오래된 authorization → STALE_ATTEMPT, 다른 user root 참조 → rollback, anon/authenticated RPC → denied를 실제 PostgreSQL에서 검증한다.

참고 함수 테스트는 DB lock·격리수준·RLS·trigger가 실제 작동한다는 증거가 아니다. SQL draft를 실행한 적이 없으면 DB 통합검증 상태는 반드시 NOT_RUN이다.

## 11. v1.3 재조회·만료·검증 순서

completed 결과 재조회와 새 최종 쓰기의 가드를 분리한다. 권한이 맞는 completed attempt는 receipt 기한 안에서 결과만 반환한다. draft가 30분 지났거나 완료 시 lease/candidate를 비웠다는 이유로 이를 거절하지 않는다. 새로운 처리만 유효 draft/현재 lease/검증된 후보를 요구한다. 권한이 틀린 요청에는 완료 유무나 개인정보를 알려주지 않는다.

만료가 지났지만 status가 pending인 행은 일일 cleanup 전에도 DB unique index에서 활성 행이다. start/restart는 브라우저별 트랜잭션 안에서 expired 상태를 반영한 후 새 활성 행을 생성한다. processing은 operation budget < lease의 조건을 유지하고, 유효 lease를 함부로 해제하지 않는다. 만료 후 old worker가 돌아와도 fencing 검사를 통과하지 못한다.

신규 A와 B의 완료 순서에 관한 제품 우선순위는 '가장 최근에 시작한 정상 연결 보호'다. B(더 늦게 시작)가 먼저 확정되면 늦게 도착한 A는 STALE_ATTEMPT이며 재연동 이력/메일을 만들지 않는다. A가 먼저 확정되고 B가 뒤에 확정되면 정상 new/reconnection 각 한 건이다. 기존 NEW01 기대값은 이 두 순서를 구분하도록 정정했다.

## 12. v1.3.1 연결 순서 정밀도

동일 계정의 최신 연결 보호는 `(서버 생성 started_at, UUID)` SQL 비교로 확정한다. TIMESTAMPTZ의 마이크로초를 Date.parse로 줄여 비교하거나 로캘 정렬로 UUID를 비교하지 않는다. timestamp가 정확히 같을 때만 정규화 UUID의 결정적 순서를 사용한다. 서버 참고 함수는 표준 ISO timezone 필수·소수0~6자리 입력을 BigInt 마이크로초로 비교한다. 이는 DB lock/CAS를 대신하지 않는다.

completed receipt의 재조회와 새로운 작업 실행은 기존 v1.3 순서를 유지한다. 프런트의 완료 상태 보호와 서버의 권한/만료 검사는 별개다. 후자는 언제나 우선한다.

## 13. v1.3.2 취소·복구 권한표

| 서버의 시도 상태/원인 | code/state/token 재사용 | 본인 초안 복원 | 다음 동작 |
|---|---|---|---|
| 정상 승인 취소 / OAUTH_CANCELLED | 금지, 즉시 무효화·삭제 | 같은 browser + 원래 draft TTL + payload 존재 시만 | 폼 또는 새 OAuth 시도 |
| 만료 / expired | 금지 | 금지 | 새 정보·동의 제출 |
| 다른 시도로 대체됨 | 금지 | 이전 시도에서는 금지 | 명시된 새 attempt 상태 조회 |
| 개인정보 삭제 | 금지 | 금지 | 보관된 민감자료 제거, 기존 작업 재개 금지 |
| 정상 완료 | code/token checkpoint 없음 | 초안 없음 | 본인 receipt TTL 안에서 결과만 |

`draftAvailable`은 DB가 이 표로 계산한다. 단순히 encrypted payload가 NULL이 아니라는 이유로 true를 주지 않는다. 잘못된 브라우저 요청에는 어떤 상태인지도 노출하지 않는다. '새로 연동하기'는 취소한 code를 다시 쓰는 것이 아니다.

restart의 응답 유실도 start와 동일하게 처리한다. browser+requestKey에 이미 child attempt가 있으면 parent_attempt_id 일치를 확인한 뒤 그 child의 authorize/resume 결과를 반환한다. 이 replay는 폐기된 parent의 살아 있는 code나 lease를 요구하지 않는다. 새로운 child 생성은 parent 초안의 원래 기한·정당한 본인 접근·현재 정책을 검증한 트랜잭션 안에서만 허용한다. 같은 key로 다른 parent를 지정하면 충돌이다. 이미 완료된 parent는 restart로 새 분석 신청을 만들지 않고 완료 결과를 보존한다. 새 연결을 시작하려면 폼의 명시적 새 start를 사용한다.

## 14. v1.3.2 해제·갱신 경합의 최소 쓰기 조건

row_version은 token 문자열 변경만 나타내는 값이 아니라 **보안 판단용 스냅샷 버전**이다. 상태/권한 변경도 포함한다. 읽었던 상태가 connected인데 토큰 문자열을 남겨둔 채 revoked로만 바뀌었다면 버전도 달라져야 한다. 같은 버전으로 connected→revoked→connected가 왕복하는 ABA를 허용하지 않는다.

1. worker는 해당 환경/계정에서 허용된 연결만 선택한다. connected는 일반 경로, unknown은 기존 토큰 호환 경로이며 새로운 승인 증거가 아니다.
2. 외부 호출 직전에도 최신 상태를 확인한다. 그 직후 권한이 철회될 수 있다는 경합까지 없어진 것으로 주장하지 않는다.
3. 최종 DB 저장은 `id + expected_row_version + eligible connection_status`를 **같은 UPDATE 조건**에서 검사한다. 실패/철회 metadata를 쓰는 작업에도 같은 보호가 필요하다. 관련 created_at/expires_at 스냅샷 검사도 유지한다.
4. row가 삭제됐으면 0행 수정 후 skip한다. refresh는 INSERT/UPSERT로 계정을 복원하지 않는다. 재등록은 별도의 새 동의·OAuth 경로다.
5. '외부 refresh 호출 성공'만으로 권한철회를 취소하거나 unknown을 connected로 바꾸지 않는다. DB commit이 실제 성공하기 전 사용자/작업 상태를 성공으로 표시하지 않는다.

이미 전송된 외부 요청이나 메일을 회수할 수 있다는 보장은 하지 않는다. 이 규칙은 완료되지 않은 로컬 작업이 철회·삭제 이후 데이터를 재활성화하는 것을 막는 조건이다. 실제 SQL 트리거와 동시성 검증은 구현 후 필수다. `server-reference/lifecycle-policy.mjs`는 판정 참고일 뿐 DB 트랜잭션의 구현이 아니다.


---

## 07. API 계약

원문: `contracts/API.md`


실행된 서버가 아닌 구현 계약이다. 정식 타입은 `onboarding.ts`. 모든 브라우저 API는 same-origin, no-store, 안전한 오류 매핑을 사용한다. 일반 POST는 JSON + `X-CSRF-Token` + 정확한 Origin/Fetch Metadata + HttpOnly cookie 바인딩을 확인한다. **외부 OAuth callback은 cross-site GET이므로 Origin 일치 검사를 적용하지 않고 state+cookie로 검증**한다. 내부 Cron은 별도 Bearer secret/운영 가드로 인증한다.

| 경로 | 입력 | 성공 | 실패/의미 |
|---|---|---|---|
| GET bootstrap | cookie | csrfToken/policyBundleId/허용된 activeAttempt/draft | 유효 cookie를 반복 교체하지 않음 |
| POST start | StartRequest | 201 최초, 200 같은 요청; StartResponse | 다른 입력 같은 키409; 암호화 state 재사용 |
| GET auth/callback | 제공자 code/state 또는 error | 303 /connecting?attemptId=UUID 또는 안전한 완료/오류 경로 | OAuth code/state·PII 전달 금지; 검증된 attemptId만 허용 |
| POST complete | `{attemptId}` | 200 완료/확인필요, 202 진행 중 | 비밀 token/client account ID 입력 금지 |
| GET status | `?attemptId=UUID` | StatusResponse | UUID만으로 권한 없음; 타인 조회차단 |
| POST confirm-account | `{attemptId,expectedRevision,accept:true}` | complete와 같은 응답 | stale revision409 |
| POST restart | `{attemptId,requestKey}` | StartResponse | processing 재시작409; 정책 변경 시 폼 |

## 1. 폼 제출

```json
{"requestKey":"b1c9a751-283b-4e88-97cc-8229c74059d4","policyBundleId":"approved-bundle","fullName":"김셀럽","email":"creator@example.com","phone":"010-0000-0000","instagramUsername":"celeblife_demo","consents":{"age":true,"terms":true,"privacy":true,"instagramData":true}}
```

같은 requestKey로 입력값을 바꾸지 않는다. 입력 수정/명시적 새 시도에는 새 UUID를 만든다. 다른 활성 attempt가 있으면 안내 후 `replaceAttemptId`를 start에 명시할 수 있으나 서버 exchanging/saving은 중단하지 않는다. 개인정보는 정규화된 payload에만 포함하며 예상 외 필드는 저장으로 전파하지 않는다.

```json
{"action":"authorize","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":0,"authorizeUrl":"https://www.instagram.com/oauth/authorize?EXAMPLE_ONLY","expiresAt":"2026-09-10T06:10:00Z"}
```

위 URL은 설명용이며 실제 endpoint/파라미터는 검증한 Meta 어댑터에서 생성한다. 응답 URL은 정확한 https host allowlist로 검증 후 같은 탭으로 이동한다. start 응답 유실 시 stored encrypted state로 같은 URL을 재생성한다. 이미 처리 중이면 아래 resume을 반환한다.

```json
{"action":"resume","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":3,"nextPath":"/connecting"}
```

`nextPath`는 열거된 로컬 경로만 허용한다. expiresAt은 state 유효기간이고 등록 완료 예정시각이 아니다. bootstrap의 draft는 해당 attempt의 미만료 제출 자료만이며 동의 전 키 입력 자동 수집은 없다.

## 2. 실제 처리 요청

```json
{"attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d"}
```

서버는 lease를 claim하고 외부 요청/최종 DB 작업을 await한다. 진행 중인 중복 요청은 202다.

```json
{"status":"processing","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":2,"stage":"account","retryAfterMs":2000,"submissionIntent":"unknown"}
```

candidate 확인은 서버 revision과 연결한다.

```json
{"status":"account_confirmation_required","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":3,"enteredUsername":"aaa","connectedUsername":"bbb"}
```

```json
{"attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","expectedRevision":3,"accept":true}
```

confirm/restart도 cookie/CSRF와 서버 상태검증이 필수다. body attemptId를 바꿔 타인의 후보를 승인할 수 없어야 한다. 서버는 새 후보 token을 body에서 받지 않는다.

## 3. 완료 결과

```json
{"status":"completed","attemptId":"a33717b1-8009-40e4-a9a9-5d4e4ed4906d","revision":5,"result":{"kind":"v2","requestId":"b1c9a751-283b-4e88-97cc-8229c74059d4","receivedAt":"2026-09-10T06:00:30Z","fullName":"김셀럽","email":"creator@example.com","phone":"+821000000000","instagramUsername":"celeblife_demo","connectionKind":"new","analysisRequested":true,"reviewStatus":"pending_review"}}
```

재연동 결과는 `connectionKind=reconnection`, `analysisRequested=false`, `reviewStatus=not_requested`, `initialRequestId=같은 계정 최초 접수 UUID`다. 같은 attempt 재전송은 같은 requestId를 반환한다. 각 receipt는 해당 시점 연락처 snapshot을 반환하며, 이후 다른 접수에서 수정한 연락처를 과거 세션에 노출하지 않는다.

legacy result는 `kind=legacy`와 확인된 instagramUsername만 포함한다. 토큰 저장만 끝난 v1 흐름을 새 개인정보·분석 접수 완료로 포장하지 않는다. 테스트 자료 초기화는 이 API의 기능이 아니다.

## 4. 상태 조회와 만료

attemptId는 식별자이고 비밀이 아니다. GET status는 바인딩을 확인한 뒤 해당 attempt 상태만 반환한다. idle은 attemptId=null/revision=0. awaiting_oauth는 아직 code가 없는 상태다. callback 없이 complete를 호출하면 거래가 진행된 것으로 추정하지 않는다.

브라우저는 현재 attempt와 다른 응답, 낮은 revision 응답을 버린다. 동일 attempt의 completed 상태를 다시 processing으로 되돌리지 않는다. 네트워크 오류는 저장 실패와 동의어가 아니다. 활성 탭만 polling하며 terminal에서는 중단한다. 복원 가능한 draft 여부는 `draftAvailable`만 믿는다.

30분 draft 만료와 완료부터 24시간 receipt 만료는 별도다. completed 세션을 draft cleanup 때문에 30분 후 삭제하지 않는다. 반대로 완료 후 draft/token/code 원문을 24시간 동안 그대로 보관하지 않는다. 정확한 만료 검사는 서버 UTC 시각 기준이다.

## 5. HTTP/오류

400 입력/필수 동의, 401 세션 없음, 403 CSRF·바인딩, 409 정책·멱등/상태 경합, 410 만료, 429 제한, 502 제공자 장애, 503 구성/저장 장애. 정상 확인필요 상태는 200 StatusResponse로 반환한다. 오류 code는 `onboarding.ts`의 union에 포함되어야 한다.

```json
{"error":{"code":"VALIDATION_FAILED","message":"입력한 정보를 확인해 주세요.","fields":{"email":"이메일 주소를 확인해 주세요."}},"traceId":"058fcac0-7a95-4bfb-bf50-ea90a26706cd"}
```

상태 조회의 failed에는 retryAction/draftAvailable를 포함한다. API error의 message는 서버 allowlist 문구다. provider error_description/raw SQL/요청 전체 body를 화면·로그에 노출하지 않는다. rate limit은 UI 안내와 Retry-After를 제공하고, 서버리스 메모리 Map 하나만으로 운영 제한을 구현하지 않는다.

## v1.3 명시적 화면 복귀 식별자

`/connecting?attemptId=<UUID>`와 `/complete?attemptId=<UUID>`를 정식 복귀/완료 주소로 사용한다. callback은 서버가 검증한 UUID만 붙여 303으로 이동하고, OAuth code/state는 제거한다. `nextPath` 타입은 기존의 로컬 pathname enum을 유지하며, UI는 응답의 `attemptId`를 URLSearchParams로 인코딩해 붙인다. 개인정보·토큰·code·state는 붙이지 않는다.

UUID는 공개 가능한 작업 식별자일 뿐 조회 권한이 아니다. 서버는 URL/query의 attemptId를 검증하고 HttpOnly cookie 바인딩을 대조한 뒤에만 status/receipt를 반환한다. 서로 다른 두 완료 탭을 새로고침해도 각자의 receipt를 조회해야 한다. '가장 최근 접수'를 임의로 선택해 다른 계정 정보를 보여주지 않는다. attemptId가 없는 직접 접근은 bootstrap이 바인딩된 현재 작업 한 건을 확정할 수 있을 때만 해당 주소로 안내하고, 애매하면 입력/재시작 안내를 보여준다.

## v1.3.1 구현 정정 (공개 필드 변경 없음)

프런트 상태 guard는 현재·수신 status를 함께 검사해 completed→processing 역행을 금지한다. `server-reference/attempt-policy.mjs`의 shouldAcceptStatus 호출부에 두 status를 전달한다. HTTP 401/403/410에 따른 세션/권한 만료 UI 정리는 이 guard 전에 별도로 처리한다. 개인정보를 오래 보여주기 위한 완료 고정이 아니다.

## v1.3.2 취소 후 복원 계약

정상적으로 바인딩된 OAUTH_CANCELLED는 `status=failed`, `code=OAUTH_CANCELLED`로 공개한다. 원래 초안 기한·동일 브라우저·복원 가능한 원인을 만족할 때만 `draftAvailable=true`이며 새 OAuth 또는 폼 복귀를 안내한다. 개인정보 삭제·초안 만료·이전 시도 대체·잘못된 바인딩에서는 초안을 반환하지 않는다. 취소된 code/state/token은 어떤 복원에도 사용하지 않는다. `POST restart`의 동일 requestKey 재전송은 parent의 완료/초안 삭제 여부를 이유로 새로운 child를 생성하지 않고, 이미 생성된 동일 child만 안전하게 재조회한다. parent/child가 바뀌면 IDEMPOTENCY_CONFLICT다. 공개 타입의 필드 추가는 없다.


---

## 08. v1.3 검토 이력

원문: `docs/SECOND_REVIEW.md`


> 이 문서는 v1.3 검토 이력이다. 현재 인계 판정·수정 기준은 v1.3.1의 `LAST_REVIEW.md`와 기준 설계서를 따른다. 아래 테스트 수는 당시 실행 결과다.

2026-09-10 · 대상: v1.2 인계 문서/공개 API 타입/순수 참고 함수/승인 HTML·CSS/DB draft 전체.

## 결론

**Codex가 구현을 시작할 수 있을 만큼 요구사항은 구체적이다. 전면 재설계를 권할 근거는 이번 검토에서 찾지 못했다. 다만 '아무 이상 없음'은 아니며, 아래 모바일 경계 결함과 문서 해석 충돌을 수정 대상으로 확인했다.** v1.3은 원형을 유지한 실제 앱용 CSS 보정과 명세 정정을 묶은 개정본이다. 완성된 Next.js 앱이나 실기기 OAuth 검증이 끝났다는 뜻은 아니다.

새 제품 질문은 발생하지 않았다. 승인 UI·연락처 입력만·다계정 허용·재연동 정책·수신 주소·테스트 자료 초기화 방향은 유지한다. 운영 사이트/DB/GitHub/Meta/메일에 변경을 가하지 않았다.

## 1. 직접 재현한 모바일 문제

| 번호 | 조건·기존 결과 | v1.3 처리 | 검증 범위 |
|---|---|---|---|
| R01 | 이름50자·계정30자·긴 이메일을 완료 화면에 표시하면 320/360/390/430/861px 전부 가로 넘침. 390px에서 문서폭623px | 이름/계정 줄바꿈, 계정 카드 최대폭, 상태배지 shrink 방지 | 동일 DOM + production CSS에서 5/5 통과 |
| R02 | 높이320/420/568px 약관 모달의 footer가 panel 밖으로 잘림 | 모달을 세로 flex, 본문만 스크롤, header/footer 보존 | 높이3조건 모두 footer가 panel 안에 남음 |
| R03 | 원본 도움말 버튼27px, 약관보기25×30px, 동의행33px로 프로젝트44px 터치목표에 못 미침 | 클릭영역44px 확보, 장식/브랜드 원형 유지 | computed geometry 확인; WCAG AA 위반을 크기만으로 단정하지 않음 |
| R04 | 흰 배경의 도움말3.42:1, 버튼 아래 설명3.82:1 등 작은 보조글 대비 부족 | 핵심 선택자를 같은 계열 #776583으로 최소 보정 | 선택한 색상 대비5.28:1. 전체 WCAG 적합성/모든 배경 인증 아님 |
| R05 | 390px에서 computed 텍스트 두 배 probe의 가로 넘침 | 단계·헤더 wrap, CTA 최소높이, 긴 텍스트 wrap | probe 통과; OS 글자확대·브라우저 zoom 실측과 다름 |

원본은 처음부터 모바일 폭·16px 입력 폰트·반응형 규칙을 갖고 있었다. **원본↔분리본의 픽셀 동일성은 원본 자체의 사용성 결함을 찾는 검사와 다르다.** 이번에는 두 복사본을 비교하는 것 외에 길이·높이를 바꾸어 결함을 찾았다.

원본 `reference/approved/`와 `ui/`의 기존 파일14개는 v1.2와 SHA256이 같다. 새 보정은 `ui/production/usability-overrides.css`에만 추가했다. 디자인을 다시 만든 것이 아니라 원본의 긴 텍스트·짧은 모달·작은 클릭영역을 실제 앱에서 교정하는 이식 코드다.

## 2. 문서 해석 충돌·공백 정리

| 번호 | 기존 해석 위험 | 최종 규칙 | 상태 |
|---|---|---|---|
| R06 | DB 순서표에서 lease/후보/TTL을 먼저 검사하면 이미 완료되어 정리된 요청의 정상 재조회가 거절될 수 있음 | 권한 확인 → completed면 receipt 기한 검사·기존 결과 반환 → 미완료만 draft/lease/후보 검사 | 명세 정정, 실제 RPC 미구현 |
| R07 | NEW01은 동시 최초신청에서 항상 new1/reconnection1을 요구하나 최신연결 보호는 오래된 A 거절을 요구 | A먼저완료: new1/reconnection1. 더 새 B먼저완료: B new1/A stale, 추가 기록0 | 테스트 기대값 정정, DB 경합 테스트 미실행 |
| R08 | callback 후 JS 메모리가 사라질 때 어느 attempt를 조회할지 구현자가 임의 선택할 수 있음 | 검증된 attemptId만 connecting/complete query로 전달; cookie가 권한. 새로고침도 정확한 attempt 조회 | API 경로 설명 정리, 타입 필드 변경 없음 |
| R09 | 일일 cleanup 전에 만료된 pending 행이 partial UNIQUE를 점유해 새 신청이 막힐 수 있음 | start/restart의 원자적 expired 전이 후 새 활성 행 생성; 살아 있는 processing lease 보호 | 명세 보강, 실제 DB 미실행 |

이 네 항목은 기능을 늘리는 것이 아니라 기존 멱등성·수명·경합 정책을 일관되게 표현하기 위한 정정이다.

## 3. 실제 재실행 결과

| 항목 | 결과 | 증거 |
|---|---|---|
| 기존 참고 함수 | 95/95 PASS | `verification/mobile-review/reference-tests.tap` |
| API TypeScript | PASS | `verification/mobile-review/typecheck.txt`, 오류출력0 |
| 기존 승인·split 파일 | 14/14 해시동일 | `verification/mobile-review/unchanged-approved.json` |
| 일반 데이터 폭 검사 | 원본70/70, 보정70/70 | `verification/mobile-review/results.json` |
| 긴 데이터 완료화면 | 원본0/5, 보정5/5 | 같은 JSON, before/after PNG |
| 짧은 약관 모달 | 원본0/3, 보정3/3 | 같은 JSON, before/after PNG |
| 두 배 computed 텍스트 probe | 원본FAIL, 보정PASS | 같은 JSON |
| 일반 주요 터치영역 | 보정에서44px 목표 확보 | 같은 JSON targets |

검사 브라우저: Chromium 144.0.7559.96, Playwright mobile/touch emulation. 원본과 보정은 같은 환경이며 CSS 폭14종×5상태를 검사했다. `document.scrollWidth <= innerWidth`만 검사하면 모바일의 layout viewport가 내용에 따라 확장된 것을 놓칠 수 있어 **설정한 viewport 폭**과 대조했다.

## 4. 실행하지 않은 것

이번 검토에서 localhost HTTP 탐색은 `ERR_BLOCKED_BY_ADMINISTRATOR`로 차단되었다. 보안 비활성화로 우회하지 않고 로컬 파일 내용을 새 페이지 메모리에 렌더링했다. 수정한 CSS도 테스트용 HTML 복사본에만 삽입했다.

실제 Next.js build/DOM/CSP, DB migration/RPC/trigger/RLS/동시성, Meta 승인·토큰교환·refresh, SMTP 인증·수신, 실제 Vercel Cron, 운영 초기화·배포는 **NOT_RUN**이다.

**실제 iPhone Safari·Android Chrome·Instagram 인앱 OAuth, 가상 키보드, 노치 safe-area, VoiceOver/TalkBack, OS200% 글자크기는 NOT_RUN**이다. 현재 높이 probe와 에뮬레이션을 이 항목의 PASS로 바꾸면 안 된다. UI_UX_SPEC의 실기기 인수표를 출시 조건으로 유지했다.

## 5. Codex 인계 기준

당시 인계 버전은 v1.3이었다. 현재는 v1.3.1을 사용한다. 제품 기준은 V2_SPEC, 화면은 UI_UX_SPEC, 서버는 BACKEND_DB_SPEC, 공개 필드는 contracts/onboarding.ts다. 시작할 때 이 보고서를 먼저 확인하고 실제 앱에만 보정 CSS와 상태 순서를 적용한다. 통합 인계서는 읽기용 파생본이므로 상세 문서와 독립적으로 바꾸지 않는다.

완료 판단은 구현 단계에서 실제 앱 테스트로 한다. 인계 패키지의 95개 순수 함수 테스트와 모바일 DOM probe는 운영서비스가 검증됐다는 증거로 사용하지 않는다.


---

## 09. 기존 발견사항

원문: `docs/FINAL_REVIEW.md`


> 이 문서는 v1.2 검토 이력이다. 현재 인계 판정·수정 기준은 v1.3.1의 `LAST_REVIEW.md`와 기준 설계서를 따른다. 아래 테스트 수는 당시 실행 결과다.

v1.3 REVIEWED · 2026-09-10 · 기존 v1.2 검토 범위: v1.1 인계 자료 전체, 승인 HTML/이미지, 분리 UI, 공개 타입 계약, 순수 참고 함수, DB 초안, 기존 레포 main 기준점.

이번 추가 재검토·재현 결함·보정 결과는 [SECOND_REVIEW.md](docs/SECOND_REVIEW.md)를 우선 확인한다. 아래 F01~F14는 v1.2에서 정리한 기존 발견 이력이며 계속 유효하다.

## 판단

**구현을 시작할 수 있는 인계 기준은 정리되었다. 완성 서비스나 운영 적합성 검증이 끝났다는 뜻은 아니다.** UI/UX, 서버/DB, 실패 복구, 환경 격리, 테스트와 전환 조건을 같은 버전으로 맞췄다. 실제 앱·DB 마이그레이션·Meta/SMTP 어댑터는 Codex 구현 대상이다.

원본 UI와 소스 분리본은 수정하지 않았다. 참고 함수/API 타입/문서만 수정했다. 기존에 보고됐던 검증 결과는 `verification/history-v1.1/`로 분리했으며, 이번에 다시 실행한 결과는 `verification/FINAL_VERIFICATION.md`를 따른다.

## 발견한 누락·충돌과 처리

| ID | 발견 사항 | 최종 규칙 | 증거의 범위 |
|---|---|---|---|
| F01 | state hash만 저장하면 start 응답 유실 때 같은 authorize URL을 재구성할 수 없음 | short-lived state 암호화 저장 + 정규화 payload keyed hash + 같은 requestKey 재사용 | 순수 재시도 정책 테스트; 암호화/DB는 구현 필요 |
| F02 | 같은 브라우저의 다른 탭이 최신 계정을 잘못 승인할 여지 | 모든 mutation에 attemptId, 계정 확인은 expectedRevision까지 비교 | 타입 및 순수 판정 테스트; 실제 route/DB는 인수 테스트 |
| F03 | bootstrap이 매번 cookie를 바꾸면 진행 중 OAuth가 끊김 | 유효 브라우저 cookie 재사용, 활성 작업 복원; processing 임의 대체 금지 | 설계 보강; 브라우저/API 통합 검증 필요 |
| F04 | 임시자료30분 만료와 완료조회24시간의 충돌 | completed receipt_expires_at 별도, 완료 즉시 code/token/draft 삭제 | DB 초안·명세 정합성; cleanup 실제 실행 필요 |
| F05 | UI는 이름2자, 서버1자; 잘못된 00 전화가 SQL과 다르게 통과 가능 | 실제 이식에서는 이름1~50자, 전화 국내/+82 같은 검증; 승인 데모는 보존 | 전화·입력 참고 함수 테스트; 원본 데모의 제한은 알고 있는 차이 |
| F06 | 새로운 재연동 이후 오래된 authorization/갱신 실패가 최신 값을 덮어쓸 수 있음 | server attempt 순서 + row_version + 성공/실패 모두 CAS, stale attempt 거절 | 정책 순수 테스트; 실제 락/trigger 통합 검증 필요 |
| F07 | request JSON의 BIGINT를 뒤늦게 문자열 변환하면 이미 정밀도 유실 가능 | DB RPC에서 id::text로 반환, HTTP/클라이언트는 문자열 | 타입/설계; 실제 PostgREST 경계 인수 테스트 |
| F08 | 요청 scope와 실제 승인 scope 혼동 가능 | 실제 계정과 필요한 권한 확인 없으면 분석 신청 완료 금지 | 최신 Meta 사양·실환경은 출시 게이트 |
| F09 | mail worker가 죽으면 processing 상태가 영구 잔류 가능 | 만료 lease 회수 + 제한된 재시도 + dead/최고 대기시간 관찰 | DB·작업 명세; 실제 worker 장애 테스트 필요 |
| F10 | 짧은 메일 재시도 지연을 Cron 실시간 보장처럼 읽을 위험 | due 시각과 실제 실행 주기 분리, 기본 5분 scheduler, 플랜 게이트 | 공식 Vercel 문서 확인 [S4] |
| F11 | 재연동 처리 완료를 신규 분석 접수·새 1영업일 약속으로 표시할 위험 | unknown/new/reconnection 로딩 의미, 신규·재연동·legacy 완료 카피 분리 | API union·메일/등록 판정 테스트·UIUX 명세 |
| F12 | 초기화가 도중에 들어온 새로운 접수까지 지울 위험 | allowlist+변경감지+v2 root 보호, legacy callback drain, 별도 운영 작업 | RESET_PLAN; 실제 데이터 삭제는 수행하지 않음 |
| F13 | 연락처 임의 공개, SMTP 사용 가능 추정 | 내부 수신만 확정; CONTACT_EMAIL·발신 허용·host/TLS는 게이트 | 환경설정/문서 정리, 발송 수행하지 않음 |
| F14 | 이미지 동일성을 접근성 검증이나 실제 기능 검증으로 오인 가능 | 승인 원본 보존과 운영 최소 접근성 수정 구분, 증거 종류 분리 | UIUX 인수기준·이번 검증 보고서 |

## 의도적으로 남긴 결정/위험

첫 전환에서 `tokens.access_token`은 호환을 위해 평문 계약을 유지한다. 임시 checkpoint 암호화와 장기 토큰 저장 암호화를 혼동하지 않는다. 사용자에게 후자를 구현했다고 말하지 않으며 위험 수용 또는 별도 암호화 전환은 출시 게이트다.

Meta 최신 문서 본문과 NAVER WORKS 특정 회사 계정의 SMTP 허용 여부는 이번 점검으로 확인하지 못했다. 공식 출처와 실패 범위를 `SOURCES.md`에 기록했다. 60일·PKCE·최신 API 버전·메일 주소만으로 작동을 보장하지 않는다.

법적 문서/보유기간/문의 주소/실제1영업일 운영/실계정 검증은 운영자가 확정해야 한다. 이미 답한 여섯 제품 질문을 반복하지 않되, 미확정 값을 임의로 채워 '운영 완료'로 처리하지 않는다.

## 다음 검토의 기준

Codex는 `TEST_MATRIX.md` 항목별 PASS/FAIL/NOT_RUN을 실제 앱에서 기록해야 한다. 지금의 순수 함수, API 타입, 승인 HTML 동등성 검증은 이 목록의 실제 OAuth·DB·SMTP·운영 전환 검증을 대체하지 않는다.


---

## 10. 출시 게이트

원문: `docs/RELEASE_CHECKLIST.md`


v1.3.1 AUDITED · 2026-09-10 · **이 문서의 체크박스는 실제 서비스 검증 완료를 뜻하지 않는다.** 현재 기본 상태는 NOT_RUN/미확정이다. 설계와 모의 개발은 바로 진행하되 운영 적용은 별도 승인한다.

## 1. 이미 결정되어 다시 질문하지 않을 것

승인 UI 유지, Streamlit/대시보드/실제 AI 분석 제외, 연락처 입력만, 연락처 중복 허용, 재연동 시 분석 중복 접수 없음, 테스트 자료 초기화 방향, 담당자 수신 `dkssud374@celeblife.co.kr`는 확정이다. `V2_SPEC.md` 0절을 따른다.

## 2. 운영자가 채울 값 / 구현자가 검증할 값

| 게이트 | 내용 | 담당 / 통과 증거 |
|---|---|---|
| G01 운영 대상 | 실제 운영 URL, Vercel project ID, DB ref, 기존 배포 commit과 빌드 설정 | 개발자+운영자 / 값 자체는 보호 설정, 보고서는 이름·식별 최소화 |
| G02 환경 격리 | staging 프로젝트의 Vercel Production도 실제 회사 운영과 다름. APP_ENV와 정확한 대상 검증 | 개발자 / 잘못된 대상에서 side effect 이전 거절 테스트 |
| G03 Meta 최신 사양 | 현재 앱 방식, 지원 API 버전·토큰 endpoints, PKCE 지원 여부, 계정 유형, 요청·승인 권한 조회 방법 | 개발자 / 공식 문서와 실제 앱 설정 대조. 이번 문서 검토에서 Meta 문서 본문은 가져오지 못함 |
| G04 Meta 실제 인증 | 본인 테스트 계정으로 실제 승인·장기토큰·계정 확인. 승인 부족·취소·다른 계정·인앱 브라우저도 확인 | 개발자 / 민감값 없는 테스트 기록 |
| G05 최종 개인정보 문서 | 새 필드, 목적, 보유·파기, 임시 자료와 접수 snapshot, 위탁/국외처리 여부, 문의/삭제 경로를 실제 구성에 맞게 확정 | 운영자·책임자 / 버전·hash·시행일, 검토 완료 기록. 법률 검토 완료를 이 문서가 대체하지 않음 |
| G06 보유기간 | draft 접근30분/일일 물리정리, receipt 접근24시간은 기술 기본값. 정식 profile/request/consent/outbox/백업의 장기 보유기간은 별도 확정 | 운영자 / 데이터별 retention 정책과 테스트 |
| G07 공개 문의 | 기존 운영 문서에서 확인 가능한 공개 문의 주소를 조사 후 유지. 내부 알림 메일을 자동 노출하지 않음 | 운영자 / CONTACT_EMAIL 및 문의 UI 실제 연결 |
| G08 업무 안내 | 최초 신청의 '약 1영업일' 분석·담당자 검토 안내를 실제 운영으로 이행할 수 있는지 확인 | 운영자 / 미처리 접수 확인 담당·절차. 재연동에 새 기한을 약속하지 않음 |
| G09 SMTP 설정 | NAVER WORKS host/port/TLS, 외부 앱 인증과 발신 허용. 발신 기본안은 수신과 같은 계정이지만 자동 확정 아님 | 운영자+개발자 / 테스트 정보로 로그인·발신·실제 수신 확인 |
| G10 Cron/상업 운영 | 상업 사용에 맞는 배포 플랜과 5분 재시도 스케줄 가능 여부 | 운영자+개발자 / 실제 배포 승인·스케줄 검증 [S4] |
| G11 운영 DB 안전성 | 실제 스키마·RLS·테이블 권한·RPC EXECUTE·트리거 확인. 과거 공유한 키가 있다면 교체 여부 확인 | 개발자+운영자 / 값 비노출 감사 기록 |
| G12 토큰 저장 위험 | 첫 전환은 legacy_plaintext 계약 유지. '토큰 암호화 완료'로 표시 금지. 소비자 목록과 접근권한을 확인하고 잔여 위험 승인 | 출시 책임자 / TOKEN_STORAGE_RISK_ACCEPTED는 실제 검토 후에만 true |
| G13 초기화 | allowlist/행 버전/FK 영향/시점/백업·파기 계획. v2 정상 기록·새 등록·다른 서비스 보호 | 운영자 / RESET_PLAN dry-run 승인. 자동 migration에 삭제 금지 |
| G14 v1/v2 전환 | legacy callback 호환, v2 rollback bridge 또는 callback 라우팅 유지, 단일 갱신 담당 | 개발자 / 테스트 환경의 전환 중 인증 증거 |
| G15 실제 갱신 | 이미 유효하고 정책상 갱신 가능한 토큰만 테스트. 신규 토큰을 무리하게 즉시 재갱신하지 않음 | 개발자 / eligible refresh 성공 또는 명확한 NOT_RUN |

비밀값은 이 문서나 Git에 기입하지 않는다. 공개 가능한 식별정보와 설정 이름, 담당자, 확인 시각, PASS/FAIL/NOT_RUN, 증거 위치만 실행 보고서에 적는다.

## 3. 배포 직전 인수

- [ ] 실제 Next 앱의 승인 UI 이식·모바일·접근성 필수 검사 통과. 현재 모의 HTML 비교와 구분.
- [ ] start 응답 유실, 중복 complete, 오래된 탭 confirmation, code timeout, commit 응답 유실 테스트 통과.
- [ ] 실제 Postgres의 트랜잭션·동시성·RLS·권한·토큰 CAS 검증 통과.
- [ ] 신규 접수는 최초 분석1, 재연동은 분석0; 두 경우 모두 담당자 알림 이력 존재.
- [ ] 메일 실패로 등록 취소되지 않음. stale processing outbox가 회수됨.
- [ ] 익명 요청·공개 UUID·success query로 개인정보/완료에 접근하지 못함.
- [ ] 새 배포 artifact에 Streamlit/차트/수집기 없음. 기존 운영 파일은 Git에 보존 가능.
- [ ] 정리·배포·Meta 변경은 실행 범위가 명시된 별도 승인 뒤 수행.

## 4. 되돌리는 조건

인증 실패 급증, 접수 저장 장애, 권한 노출, token 소비자 호환 파괴를 발견하면 신규 start를 우선 제한하고 진행 중인 정상 callback/complete는 drain한다. 데이터와 정상 v2 접수는 삭제하지 않는다. UI만 이전 버전으로 바꾸는지 전체 앱을 되돌리는지에 따라 callback 호환 경로를 먼저 확인한다.

API 응답 성공, 함수 호출 성공, 메일 SMTP acceptance, 실제 수신, 운영자가 읽음은 각각 다른 상태다. 서로 대신 통과 처리하지 않는다.

## v1.3 추가 필수 확인

모바일 폭 렌더 결과를 실제 iPhone Safari/Android Chrome/Instagram 인앱 로그인 통과로 대신 표시하지 않는다. `UI_UX_SPEC.md`의 실기기 표는 초기 NOT_RUN이다. 긴 입력값·짧은 모달·선택한 텍스트 대비·터치영역 보정은 구현 후 다시 검사한다.

코드 구현 전에 완료 재조회 가드 순서, 만료 pending 해제, callback 후 exact attempt 식별, NEW01 두 완료 순서를 적용한다. 이 네 가지는 새 제품 기능이 아니라 기존 정책을 일관되게 만드는 요구사항이다.

## v1.3.1 인계 판정

설계 인계는 가능하다. 운영 게이트 상태는 그대로 NOT_RUN/미확정이며 패키지 회귀 테스트로 대체하지 않는다. 특히 실제 DB의 미세 시각 비교와 completed 후 권한만료 UI 정리, 긴 계정 확인 모달을 실제 앱에서 검사한다. 참고는 LAST_REVIEW.md.

## v1.3.2 추가 증거 조건

취소 초안 복원과 인증정보 무효화를 구분한 HTTP/DB 테스트, 상태만 철회한 경우의 version trigger·조건부 refresh UPDATE, 삭제된 token의 재생성 금지, restart 응답 유실 멱등성을 실제 앱에서 확인한다. 정적 명세 검토와 순수 모델 결과만으로 출시 게이트를 통과시키지 않는다.


---

## 11. 구현 순서

원문: `docs/IMPLEMENTATION_PLAN.md`


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


---

## 12. 테스트자료 초기화

원문: `docs/RESET_PLAN.md`


상태: 사용자 방향 확정 / 실행 계획 / 운영 미적용. 이 문서는 실행 SQL이 아니다.

## 범위

사용자는 현재 등록자가 모두 본인 테스트 계정이며 초기화 후 v2에서 처음부터 다시 받기를 원했다. 새 정식 셀럽을 이관하거나 기존 계정의 연락처 보완 화면을 만들 필요는 없다. **사이트를 중단하거나 Supabase 프로젝트 전체를 삭제하는 요구는 아니다.**

대상은 기존 앱의 확인된 테스트 계정 행 및 그 계정에 연결된 토큰·동의·테스트 인사이트 등이다. 실제 FK/타 프로그램 의존성을 먼저 조사하고, 계정 ID와 행 수로 명시적 대상 manifest를 만든다. 스키마/키/Meta 앱 설정/Storage/다른 서비스 DB/auth.users는 기본 대상이 아니다. 시퀀스 RESTART, TRUNCATE CASCADE, unqualified 전 테이블 삭제를 금지한다.

## 개발 단계에서 준비할 것

1. 대상 DB project ref와 테이블/열/FK/트리거를 읽기 전용으로 확인한다. 실제 토큰이나 개인정보를 보고서·로그·Git에 출력하지 않는다.
2. 운영 전환 기준시각과 본인 테스트 계정 ID allowlist를 별도 보호 파일에 기록한다. “현재 사용자 전부”라는 동적 SELECT를 삭제 대상으로 사용하지 않는다.
3. 계정 row, 토큰 row, 연결된 모든 자식 row의 건수·변경 버전·타임스탬프와, 최초 접수 유무를 dry-run으로 조사한다. 이후 변경 여부를 감지할 수 있도록 한다.
4. 백업이 필요하면 승인된 암호화·접근제한 저장 위치를 사용하고 처리 기한을 정한다. 백업을 이번 ZIP/Git/이메일에 넣지 않는다. 개인 데이터와 실제 토큰의 백업 파기 기준도 확인한다.
5. 로컬 또는 분리된 테스트 DB에서 정리와 FK 영향·동시 등록 보호를 검증한다. 운영 자동 migration에는 삭제 구문을 넣지 않는다.

## 실제 실행 시의 보호 조건

- v2 검증이 끝나고 전환할 시점에 대상 DB와 allowlist·건수를 담당자가 확인한다. 답변이 데이터 정리 방향을 승인한 것임을 유지하되, 대상/시점이 확정되지 않은 지금 삭제하지 않는다.
- 정리 대상 계정에는 동시 갱신·콜백·재연동이 간섭하지 않도록 계정 단위 조정/락을 적용한다. v1/v2 갱신 작업 담당을 한 곳으로 정한다.
- 기존 v1 state의 처리/만료가 끝나기 전에 토큰을 지워 다시 생성되는 경쟁을 만들지 않는다. 전환 후 레거시 콜백을 drain하고 재조회한다. 일반 신규 방문자를 막는 전체 서비스 중단으로 대체하지 않는다.
- 삭제 직전에 manifest와 현재 행 버전·자식 행 집합을 트랜잭션 안에서 다시 비교한다. 새로운 v2 접수, 바뀐 토큰, 새 동의/프로필, 변경된 자식 행이 하나라도 있으면 해당 계정을 제외/중단한다.
- 최초 사용자 답변 이후 들어온 다른 계정이나 v2에서 재등록한 본인 계정은 삭제하지 않는다. 날짜만으로 판단하지 않고 ID allowlist + row 변경 감지 + v2 접수 보호를 같이 사용한다.
- 테스트 관련 행 정리는 검증된 FK 그래프에 한정한다. 전체 DB 초기화/프로젝트 재생성, 정상 자료 삭제는 금지한다.
- 완료 증거에는 삭제 건수·제외 건수·trace ID만 남기고 비밀값은 남기지 않는다. 복구 절차가 기존 테스트 토큰을 다시 살리는 자동 동작이 되지 않도록 한다.

## 초기화 후 확인

본인 계정으로 v2 신규 폼 제출 → 새 동의 → 실제 Instagram 인증 → 장기 토큰 저장 → 최초 접수 한 건 → 담당자 신규 알림을 검증한다. 이후 같은 계정 재연동 시 기존 v2 users.id 유지, 토큰/연락처 갱신, 재연동 이력/알림 한 건, **새 분석 신청 0건**인지 확인한다.

DB에서 토큰을 지우는 일과 Instagram 측 앱 권한을 해제하는 일은 별도로 다룬다. 사용자가 요구하지 않은 Meta 앱/전체 계정 권한 일괄 해제를 수행하지 않는다. 다시 연결할 때 이미 로그인/승인된 계정의 제공자 화면은 제공자 상태에 따르며, 비밀번호 입력을 무조건 처음부터 강제하지 않는다.


---

## 13. 실제 앱 인수 테스트

원문: `docs/TEST_MATRIX.md`


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


---

## 14. 현재 검증 결과

원문: `verification/FINAL_VERIFICATION.md`


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


---

## 15. Codex 지시문

원문: `START_HERE_FOR_CODEX.md`


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


---

## 16. 근거·범위

원문: `docs/SOURCES.md`


검토일: 2026-09-10. 링크는 제품 사양을 보완하는 원천 자료이며, 프로젝트의 시간제한/TTL/폴더명은 자체 설계 기본값이다. 접근 실패나 회사 설정 미확인을 성공으로 표시하지 않는다.

## 내부 기준

**R1 — 승인 UI 및 대화에서 확정한 제품 결정.** 원본: `reference/approved/index.html`과 screenshots. 원본 HTML SHA256: `4519c18b79464b398b9e476a828b2dd52ba2038a7af88c3ab13660415a104da1`. 이름/이메일/전화/Instagram handle, 사용자 6개 답변은 V2_SPEC 0절에 반영했다.

**R2 — 기존 GitHub 기준점.** `Celeblife/insta-login-oauth` main을 연결된 GitHub 읽기로 다시 확인했으며 SHA는 `3c4cdc7ae4f8e399351bd2a30c0db24401347a9e`로 이전 코드 검토 기준과 같다. 실제 운영 배포 commit/환경이 같다는 증거는 아니다. 상세 기존 코드 맵은 REPO_MAP.md. [main 기준 commit](https://github.com/Celeblife/insta-login-oauth/commit/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e).

## 외부 1차 자료

| ID | 자료 | 이번에 확인한 범위 / 한계 |
|---|---|---|
| S1 | [OpenAI Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md/) | 공식 안내로 연결됨. 인계 폴더 지침을 앱에서 자동으로 발견한다고 가정하지 않고 시작 프롬프트에 명시적으로 읽도록 지정 |
| S2 | [Meta Instagram business login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/) | 페이지 본문 열기 실패. 최신 버전, grant introspection, PKCE/endpoint 지원 검증 못 함. 기존 코드 호환값을 출발점으로 하고 출시 게이트에서 공식 문서/앱 대시보드/실제 계정 확인 |
| S3 | [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after) | 응답 후 작업과 maxDuration 제약 확인. 영구 큐 대체로 사용하지 않는 설계에 반영 |
| S4a | [Vercel Cron usage](https://vercel.com/docs/cron-jobs/usage-and-pricing) | Hobby 하루1회 제한, Pro/Enterprise 분 단위 주기 범위 확인. 5분 알림 복구 스케줄을 Hobby에서 된다고 약속하지 않음 |
| S4b | [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs) | Cron 실패 자동 재호출 없음, 함수 duration 제약 확인. DB outbox 및 다음 스케줄 회복으로 설계 |
| S4c | [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) | 개인·비상업 용도 제한 확인. 실제 상업 플랜 선택은 출시 게이트 |
| S5 | [Supabase database functions](https://supabase.com/docs/guides/database/functions) | definer search_path와 함수 execute 권한 검토 필요 확인. 새 RPC에 제한된 revoke/grant, 기존 서비스 전역 권한 변경 금지 |
| S6 | [OAuth 2.0 RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html) | 인증 code의 일회성·서버 교환 등 표준 근거. Instagram이 특정 선택 기능을 지원한다는 증거는 아님 |
| S7 | [OAuth Security BCP RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) | PKCE 등 최신 보안 권고 참고. 제공자 지원을 확인하고 지원되지 않은 파라미터를 임의 추가하지 않음 |
| S8a | [W3C contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | 일반 텍스트 최소 대비4.5:1/큰 텍스트3:1 및 예외 참고. 승인 UI가 이미 WCAG 적합하다고 인증한 것은 아님 |
| S8b | [W3C target size minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | 클릭 대상 크기/간격 기준 참고. 프로젝트 모바일44px 권장은 자체 사용성 목표이며 모든 장식을44px로 키우라는 의미 아님 |
| S9 | [NAVER WORKS help](https://help.worksmobile.com/ko/) | 공식 도움말 입구 확인. 특정 SMTP/외부 앱 비밀번호 상세 페이지 접근은 실패. 회사 계정의 host/port/TLS·발신 허용을 확인하지 못함 |

문서의 [S4]는 S4a~c, [S8]은 S8a~b를 뜻한다. 운영계정 키, 라이선스, DB 데이터·실제 발송이나 토큰 갱신은 웹 문서 확인만으로 검증할 수 없다.

## v1.3 재검토 1차 자료

- M1: [W3C Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). 24×24 CSS px 기본 최소와 간격/동등기능 등 예외. 44px는 이번 프로젝트의 더 넓은 터치목표다.
- M2: [W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). 일반 텍스트4.5:1, 큰 텍스트3:1. 일부 computed color의 계산값만 검사했으며 전체 적합성 선언이 아니다.
- M3: [Playwright emulation](https://playwright.dev/docs/emulation). viewport·touch·device properties 시뮬레이션. 이 환경에서 iPhone의 Safari 앱이나 실제 OS 키보드를 실행한 것이 아니다.
- M4: [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). 320 CSS px에서 정보/기능 유실 없는 reflow 목표를 참고했다.

같은 검토에서 Next.js after와 Vercel Cron 공식 문서는 접근 가능했으나 Meta business-login 문서 본문은 재시도도 실패했다. 실계정 Meta/SMTP 동작 검증은 여전히 NOT_RUN이다. 최신 프레임워크 버전으로 패키지를 자동 업그레이드하지 않았다.

## v1.3.1 마지막 재검토 추가 확인

- [PostgreSQL Date/Time](https://www.postgresql.org/docs/current/datatype-datetime.html): TIMESTAMPTZ1마이크로초, precision0~6; 실제 DB 배포 버전 확인과 별개.
- [MDN Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date): 밀리초 time value. 현재 helper의 정밀도 결함은 별도 로컬 재현.
- [W3C Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): 내용/기능 손실 없이 확대·리플로우. 전체 접근성 인증이 아님.
- Meta business-login 재조회429. NAVER WORKS SMTP 상세 조회실패. 지원사항과 회사 계정 설정은 여전히 실환경 게이트.
- 이번 검토는 로컬 v1.3 패키지 대상. 기존 REPO_MAP 커밋은 이전에 확인한 기준점이며 이번에 원격 main을 다시 읽은 것은 아니다.

## v1.3.2 이번 재확인 범위

기존 ZIP을 입력으로 고정했고 원격 레포 최신 코드는 재조회하지 않았다. PostgreSQL transaction-iso, Next.js after, RFC9700, W3C keyboard 공식 본문을 열어 일반 원칙만 확인했다. 최신 Next.js 버전 번호를 프로젝트에 강제하거나 Meta/SMTP 실환경을 확인했다고 주장하지 않았다. 동작 판단과 수치는 로컬 검사 증거를 우선한다.

