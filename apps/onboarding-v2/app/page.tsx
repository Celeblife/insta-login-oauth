import { Icon } from "@/components/onboarding/icons";
import { OnboardingShell } from "@/components/onboarding/shell";

export default function HomePage() {
  return (
    <OnboardingShell>
      <section className="view view-intro" id="view-intro" aria-labelledby="intro-title">
        <p className="intro-eyebrow">CONNECT YOUR NEXT CHAPTER</p>
        <h1 id="intro-title" className="intro-title">
          셀럽님의 다음 기회,
          <br />
          연결에서 시작됩니다.
        </h1>
        <p className="subtitle">
          인스타그램을 연결하고,
          <br />내 채널에 맞는 새로운 커머스 가능성을 만나보세요.
        </p>
        <div className="intro-trust">
          <div className="trust-title">
            <Icon id="i-shield" />
            Meta 공식 로그인 방식
            <span className="trust-tag">안전한 연결</span>
          </div>
          <p>
            인스타그램 비밀번호는 셀럽라이프에 공유되지 않습니다.
            <br />
            다음 화면에서 기본 정보와 필수 동의를 먼저 확인해요.
          </p>
        </div>
        <div className="intro-action">
          <a className="primary" href="/apply">
            <Icon id="i-ig" />
            인스타그램 연결 시작하기
            <Icon id="i-arrow" className="ic trailing" />
          </a>
        </div>
        <div className="intro-bottom">
          <Icon id="i-user" />
          기본 정보 입력
          <span />
          계정 연결
          <span />
          분석 신청 완료
        </div>
      </section>
    </OnboardingShell>
  );
}
