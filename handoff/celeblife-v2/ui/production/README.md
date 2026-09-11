# 실제 앱용 사용성 보정

승인 원본 `../styles.css` **뒤에** `usability-overrides.css`를 import하고 `body`에 `data-celeblife-production="true"`를 설정한다. React 구현에서는 원형 DOM/CSS를 유지하되 UI_UX_SPEC의 실제 기능과 카피를 적용한다.

이 파일은 긴 텍스트 줄바꿈, 모달 하단 버튼, 주요 터치영역, 일부 보조글 대비, safe-area의 CSS 이식 예시다. 실제 인증·React컴포넌트·동의문서·입력검증·데모 타이머 제거를 구현해 주는 코드가 아니다. 일반 프리뷰 ui/index.html에 자동 적용하지 않아 승인 원본 비교를 유지했다.

검사: `python scripts/verify_mobile_review.py` (패키지 루트에서). 결과는 `verification/mobile-review/`에 기록한다. 메모리 DOM 검사이지 실기기/실서비스 테스트가 아니다.

## v1.3.1

긴 실제 계정명이 CTA에 포함된 경우의 줄바꿈, 보조 버튼의 큰 글자 최소높이, 극단적으로 낮은 확인 모달의 전체 세로 스크롤 fallback이 추가됐다. 승인 데모는 바꾸지 않는다. `python scripts/verify_last_review.py`로 로컬 probe를 재현한다.
