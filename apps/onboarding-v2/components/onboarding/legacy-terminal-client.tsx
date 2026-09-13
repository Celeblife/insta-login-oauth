"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { Steps } from "./shell";

export function LegacyTerminalComplete({ instagramUsername }: { instagramUsername: string }) {
  useEffect(() => {
    void fetch("/api/onboarding/legacy-terminal", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
    });
  }, []);

  return (
    <section className="view status-view" id="view-success" aria-labelledby="legacy-title">
      <Steps active={3} />
      <div className="success-illustration" aria-hidden="true">
        <div className="success-halo" />
        <div className="success-circle"><Icon id="i-check" /></div>
      </div>
      <h1 id="legacy-title">인스타그램 연결이 확인되었습니다.</h1>
      <p className="subtitle">기존 연결 흐름에서 확인된 계정입니다. 새 개인정보·분석 신청 접수로 표시하지 않습니다.</p>
      <div className="connected-account"><Icon id="i-ig" /><b>@{instagramUsername}</b><span className="connected-pill">연결 완료</span></div>
    </section>
  );
}

export function LegacyTerminalUnavailable() {
  return (
    <section className="view status-view" id="view-error" aria-labelledby="legacy-error-title">
      <div className="error-icon"><Icon id="i-info" /></div>
      <h1 id="legacy-error-title">완료 확인 시간이 지났어요.</h1>
      <p className="subtitle">보안을 위해 완료 화면은 인스타그램 연결 직후 같은 브라우저에서만 표시됩니다.</p>
      <Link className="primary complete-return-link" href="/">처음 화면으로 돌아가기</Link>
    </section>
  );
}
