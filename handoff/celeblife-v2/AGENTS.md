# v2 인계 자료 작업 규칙

이 문서는 이 인계 디렉터리에 적용되는 지침이다. 다른 디렉터리의 AGENTS.md를 덮어쓰지 않는다. Codex 시작 프롬프트는 이 문서를 명시적으로 읽도록 요청한다. 실제 앱에는 관련 지침을 `apps/onboarding-v2/AGENTS.md`로 옮기되 기존 루트 지침을 보존한다.

- 요구사항 기준은 `docs/V2_SPEC.md`, 디자인 기준은 `reference/approved/index.html`이다.
- 이 작업은 리디자인이 아니라 승인 UI를 실제 기능에 연결하는 작업이다. 색상, 배치, 여백, 크기, 반응형 구조를 유지한다.
- `reference/approved/`는 수정 금지. `ui/`는 분리된 모의 동작 기준이며, 실제 서비스라고 표시하지 않는다.
- 별도 작업 브랜치 및 `apps/onboarding-v2/`에 구현한다. main push, 운영 배포, 운영 DB SQL 실행, Meta 앱/도메인 변경, 비밀키 교체를 자동 실행하지 않는다.
- 기존 사용자 변경사항을 보존한다. 작업 트리가 깨끗하지 않다고 reset/clean/stash/checkout -f 하지 않는다. 필요한 경우 별도 worktree를 사용한다.
- Streamlit/Python/인사이트 수집을 새 앱 런타임에 포함하지 않는다. 기존 인증의 검증 규칙과 토큰 갱신 기능은 TypeScript 서버 코드로 이식한다.
- Instagram 로그인·2FA·권한 승인 UI를 복제하지 않는다. 실제 제공자 리다이렉트를 사용한다. 비밀번호·인증번호를 받지 않는다.
- API 응답 전 성공 표시, 타이머 기반 접수 완료, 클라이언트의 성공 플래그 신뢰를 금지한다.
- 원본 토큰·앱 비밀키·서버 DB 키·SMTP 비밀번호는 브라우저, URL, Git, 로그, 메일 본문에 노출하지 않는다.
- 개인정보는 OAuth state나 URL에 넣지 않는다. 세션은 서버에 저장하고 브라우저에 바인딩한다.
- 실제 DB 키/SMTP 비밀번호가 없어도 mock/test까지 계속 구현한다. 빈 값을 성공으로 취급하거나 실서비스 연결을 했다고 보고하지 않는다.
- DB는 추가형 migration과 v2 전용 RPC로 확장한다. 기존 `users`, `tokens`, `user_consents` 및 v1 RPC 계약을 파괴하지 않는다.
- 프런트는 데모 데이터가 아니라 서버가 검증한 연결 계정/접수 결과를 사용한다.
- 메일 실패는 접수 실패가 아니다. 접수 트랜잭션에서 outbox를 남기고 재시도한다. SMTP의 정확히 한 번 전달을 보장한다고 쓰지 않는다.
- 실제 AI 분석/수집은 이 앱의 범위 밖이다. `pending_review` 접수 기록까지만 만든다.
- 테스트 증거는 실제 실행한 결과만 기록한다. mock OAuth 통과를 실계정 인증 성공으로 보고하지 않는다.
- 동작 변경과 배포 준비 상태는 `docs/DECISIONS.md`와 실행 보고서에 남긴다. 기준 설계서를 매번 새 문서로 대체하지 않는다.

## v1.1 확정 규칙

- 위 6개 사용자 결정은 V2_SPEC 0절을 따른다. 초기화 방향을 실제 DB 즉시 삭제 승인으로 오해하지 않는다.
- 새 연결 이력과 새 분석 신청은 다르다. 최초 new/pending_review 한 건, 재연동 reconnection/not_requested로 구분한다. 재연동 때문에 최초 상태를 초기화하지 않는다.
- 이메일/전화번호 소유권 인증은 추가하지 않는다. 같은 연락처 여러 계정은 허용한다.
- 담당자 알림 수신 주소는 dkssud374@celeblife.co.kr. UI의 예시 사용자 이메일이나 CONTACT_EMAIL을 이 주소로 바꾸지 않는다.
- 토큰 소비 코드가 존재한다. 현재 부하가 없다는 이유로 외부 레포의 토큰 읽기 호환을 생략하거나 운영 계약을 깨뜨리지 않는다.

## v1.2 최종 기준

기준: V2_SPEC → UI_UX_SPEC/BACKEND_DB_SPEC → contracts → 참고 코드. 실제 타입 필드가 어긋나면 임의 해석하지 말고 기준에 맞춰 함께 수정·테스트한다. RELEASE_CHECKLIST/FINAL_REVIEW를 읽고 운영 미확인 값을 성공으로 가정하지 않는다. start 응답 유실, 다중 탭 attempt/revision, receipt 별도 기한, token 상태 CAS, 만료된 outbox lease 복구를 빠뜨리지 않는다.

기존 승인 reference와 split preview는 immutable 검증자료다. 실제 앱에서 허용된 기능성/접근성 차이는 UI_UX_SPEC에 따라 제한적으로 적용·기록한다. 통합 읽기용 HTML/FINAL_HANDOFF는 문서의 파생본이며 원본 기준 문서를 수정한 뒤 다시 생성한다.
