# 기존 레포 → v2 이식 지도

확인 대상: `Celeblife/insta-login-oauth`, main commit `3c4cdc7ae4f8e399351bd2a30c0db24401347a9e`.
이전 인계 작성 때 이 commit의 주요 코드를 확인했고, 이번 최종 검토에서 GitHub 연결 도구로 main ref가 동일함을 다시 확인했다. **이 commit이 실제 운영 배포라는 뜻은 아니다.** Codex는 시작 시 작업 트리/실제 HEAD를 다시 확인하고 차이를 보고해야 한다. 과거 snapshot으로 강제 reset하지 않는다.

| 원본 | 확인된 책임/특이점 | v2 처리 |
|---|---|---|
| `public/Login/index.html` | 기존 정적 시작·동의 화면 | 새 UI 기준은 인계 승인 HTML. 기존 파일은 개발 중 보존 |
| `public/Login/assets/` | 실제 보라 로고/심벌 PNG | 운영 로고 교체 시 이 경로의 검증된 파일을 사용 |
| `api/instagram_start.js` | Node 기반 로그인 시작/동의 검증 | 새 start route의 Origin/동의/state 보호 규칙에 이식 |
| `src/oauth.py` | signed consent state, 600초 TTL, authorize, code 교환, 장기 token, refresh | 새 Node 서버 모듈로 이식. v1 콜백 호환 테스트도 포트 |
| `src/oauth_callback_service.py` | 인증 검증 뒤 DB 원자적 온보딩 RPC 호출 | v2 onboarding service의 참고 |
| `src/database.py` | user/token/consent 저장, tokens.created_at 기반 CAS 갱신 | 기존 users/token/consent 계약 유지, v2 신규 RPC 추가 |
| `supabase_schema.sql` | users/tokens/user_consents, RLS, 기존 complete RPC | 통째 재실행하지 않고 추가형 migration만 작성 |
| `jobs/refresh_tokens.py` | 만료 7일 미만 후보, 24h 미만 skip, 만료 재연동, dry-run, CAS | TypeScript job으로 포트하고 동등 판정 테스트 |
| `src/token_refresh_route.py` | Cron auth, 운영/DB 가드, 요약 결과/알림 | 새 internal route에 이식, 실제 project ID 가드 추가 |
| `src/config.py` | app ID/secret, callback, Supabase 가드, API v22.0 | 실제 앱 설정 확인. 최신 버전으로 무단 변경하지 않음 |
| `vercel.json` | /→/Login, start rewrite, 00:23 UTC token cron | 기존 설정은 개발 중 보존. v2 앱 안에 독립 설정 작성 |
| `pages/`, Streamlit/분석 의존성 | 대시보드/인사이트/설정 등 | v2 배포 artifact에서 제외; 원본 삭제는 후속 PR |
| `docs/TOKEN_REFRESH.md` | 운영 환경변수/검증 필요사항 | v2 운영 runbook에 통합, 실제 정상 실행은 별도 증거 |

## 직접 확인한 중요한 차이

- 기존 OAuth code 교환/장기 token/계정 조회에는 HTTP timeout이 없는 경로가 있다. refresh 쪽은 timeout과 리다이렉트 차단이 있다. v2는 모든 외부 요청에 시간제한과 안전한 오류 매핑을 적용한다.
- 기존 get_long_lived_token은 expires_in 누락 시 60일 fallback을 사용한다. v2는 누락/잘못된 응답을 실패로 처리해 가짜 만료일을 만들지 않는다.
- scope는 현 코드에 `instagram_business_basic,instagram_business_manage_insights`가 명시되어 있다. UI 삭제와 scope 삭제를 혼동하지 않는다.
- 기존 config가 v22.0을 사용한다는 사실은 현재 Meta 권장 API 버전이 v22.0이라는 의미가 아니다.
- 기존 consent table 구조 버전은 1이고 v1 RPC는 문서 버전을 고정 검사한다. v2 전용 RPC가 필요하며 기존 table의 구조 버전 CHECK를 삭제할 필요는 없다.
- 기존 `tokens.access_token`은 평문 저장 계약이다. 공개 접근이 허용된다는 뜻은 아니지만, RLS/서버키 관리만으로 애플리케이션 암호화가 됐다고 말해서도 안 된다.

## 이식 시 읽을 원문

아래 URL은 관찰한 commit에 고정된 소스다. Codex가 Git checkout에서 읽을 수 있으면 로컬 파일을 우선한다.

- https://github.com/Celeblife/insta-login-oauth/blob/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e/src/oauth.py
- https://github.com/Celeblife/insta-login-oauth/blob/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e/src/config.py
- https://github.com/Celeblife/insta-login-oauth/blob/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e/src/database.py
- https://github.com/Celeblife/insta-login-oauth/blob/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e/supabase_schema.sql
- https://github.com/Celeblife/insta-login-oauth/blob/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e/jobs/refresh_tokens.py
- https://github.com/Celeblife/insta-login-oauth/blob/3c4cdc7ae4f8e399351bd2a30c0db24401347a9e/docs/TOKEN_REFRESH.md
