# CelebLife Instagram Onboarding v2 — 기준 설계서

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
