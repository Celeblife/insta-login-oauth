function InstagramGlyph({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.05" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.45" cy="6.65" r="1.15" fill="currentColor" />
    </svg>
  );
}

function ShieldGlyph({ className = "cl-shield" }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3.1 19 6v5.45c0 4.24-2.7 7.87-7 9.45-4.3-1.58-7-5.21-7-9.45V6l7-2.9Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12.05 2.05 2.05 4.5-4.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Sparkle({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={`cl-sparkle ${className}`} viewBox="0 0 42 42" fill="none">
      <path
        d="M21 1.5c1.35 11.87 7.63 18.15 19.5 19.5C28.63 22.35 22.35 28.63 21 40.5 19.65 28.63 13.37 22.35 1.5 21 13.37 19.65 19.65 13.37 21 1.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <main className="cl-login-page" data-view="intro">
      <section className="cl-visual-panel" aria-labelledby="cl-story-title">
        <div className="cl-story-inner">
          <div className="cl-brand-mark" role="img" aria-label="CelebLife" />
          <div className="cl-story-content">
            <div className="cl-connection-visual" aria-hidden="true">
              <div className="cl-halo" />
              <div className="cl-orbit cl-orbit-one" />
              <div className="cl-orbit cl-orbit-two" />
              <div className="cl-ig-tile">
                <InstagramGlyph size={82} />
                <span className="cl-tile-shine" />
              </div>
              <div className="cl-symbol-card" />
              <div className="cl-data-chip">
                <span className="cl-data-dot" />
                채널 데이터 연결
              </div>
              <Sparkle className="cl-sparkle-one" />
              <Sparkle className="cl-sparkle-two" />
            </div>
            <div className="cl-story-copy">
              <p className="cl-eyebrow">CELEBLIFE ONBOARDING</p>
              <p className="cl-story-title" id="cl-story-title" role="heading" aria-level={2}>
                인스타그램을 연결해 주세요
              </p>
              <p className="cl-story-lead">채널 데이터를 바탕으로 셀럽님에게 꼭 맞는 판매 전략을 설계합니다.</p>
            </div>
          </div>
        </div>
      </section>
      <section className="cl-form-panel" aria-labelledby="cl-form-title">
        <div className="cl-form-card">
          <div className="cl-brand-mark" role="img" aria-label="CelebLife" />
          <div className="cl-mobile-visual" aria-hidden="true">
            <div className="cl-ig-mini">
              <InstagramGlyph size={48} />
            </div>
            <span className="cl-link-line" />
            <div className="cl-symbol-mini" />
          </div>
          <div>
            <p className="cl-eyebrow">CELEBLIFE ONBOARDING</p>
            <p className="cl-form-title cl-hook-title" id="cl-form-title" role="heading" aria-level={1}>
              <span className="cl-hook-line">반응을 읽고,</span>
              <span className="cl-hook-line">선택의 기준을 만듭니다.</span>
            </p>
            <p className="cl-lead">채널 데이터를 분석해 맞는 제품과 판매 방향을 제안합니다.</p>
          </div>
          <div className="cl-trust-block">
            <div className="cl-trust-badge">
              <ShieldGlyph />
              <strong>Meta 공식 로그인 방식</strong>
              <span>안전한 연결</span>
            </div>
            <p className="cl-trust-copy">
              인스타그램 비밀번호는 셀럽라이프에 공유되거나 저장되지 않습니다. 연결 권한은 언제든 직접 해제할 수 있어요.
            </p>
          </div>
          <div className="cl-actions">
            <a className="cl-instagram-button" href="/apply" target="_self">
              <span className="cl-instagram-icon">
                <InstagramGlyph size={21} />
              </span>
              <span>Instagram으로 계속하기</span>
              <svg aria-hidden="true" className="cl-button-arrow" viewBox="0 0 20 20" fill="none">
                <path d="m7.5 4.5 5 5.5-5 5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </div>
          <div className="cl-card-footer">
            <div className="cl-security-note">
              <ShieldGlyph />
              <span>로그인 정보는 셀럽라이프에 저장되지 않아요.</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
