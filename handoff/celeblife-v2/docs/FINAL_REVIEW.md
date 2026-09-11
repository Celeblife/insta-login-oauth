# 최종 검토 결과

> 이 문서는 v1.2 검토 이력이다. 현재 인계 판정·수정 기준은 v1.3.1의 `LAST_REVIEW.md`와 기준 설계서를 따른다. 아래 테스트 수는 당시 실행 결과다.

v1.3 REVIEWED · 2026-09-10 · 기존 v1.2 검토 범위: v1.1 인계 자료 전체, 승인 HTML/이미지, 분리 UI, 공개 타입 계약, 순수 참고 함수, DB 초안, 기존 레포 main 기준점.

이번 추가 재검토·재현 결함·보정 결과는 [SECOND_REVIEW.md](SECOND_REVIEW.md)를 우선 확인한다. 아래 F01~F14는 v1.2에서 정리한 기존 발견 이력이며 계속 유효하다.

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
