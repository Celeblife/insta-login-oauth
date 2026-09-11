import { Icon } from "@/components/onboarding/icons";
import { OnboardingShell } from "@/components/onboarding/shell";

export default function HomePage() {
  return (
    <OnboardingShell>
      <section className="view view-intro" id="view-intro" aria-labelledby="intro-title">
        <div className="intro-eyebrow">CREATOR ONBOARDING</div>
        <h1 id="intro-title" className="intro-title">
          셀럽님의 다음 기회,
          <br />
          연결에서 시작됩니다.
        </h1>
        <p className="subtitle">Instagram 계정 연결 후 채널에 맞는 분석 신청을 접수합니다.</p>
        <div className="intro-trust">
          <div className="trust-title">
            <Icon id="i-shield" />
            Instagram 공식 승인 화면에서 진행돼요
            <span className="trust-tag">SAFE</span>
          </div>
          <p>셀럽라이프는 Instagram 비밀번호나 2단계 인증 코드를 직접 입력받지 않습니다.</p>
        </div>
        <div className="intro-action">
          <a className="primary" href="/apply">
            인스타그램 연결 시작하기
            <Icon id="i-arrow" className="ic trailing" />
          </a>
        </div>
        <div className="intro-bottom">
          <Icon id="i-lock" />
          비밀번호 저장 없음
          <span />
          명시적 동의 후 연결
        </div>
      </section>
    </OnboardingShell>
  );
}
