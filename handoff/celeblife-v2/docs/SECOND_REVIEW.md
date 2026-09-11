# v1.3 추가 재검토 — 구현 해석·모바일 사용성

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
