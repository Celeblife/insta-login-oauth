# 근거·확인 범위

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
