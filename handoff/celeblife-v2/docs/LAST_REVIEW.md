# 최종 재검토 — 셀럽라이프 v2 v1.3.1

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
