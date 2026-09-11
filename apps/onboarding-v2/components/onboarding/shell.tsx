"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { BrandMark, Icon, IconDefs } from "./icons";
import { PolicyContent, policyLabels, type PolicyKey } from "./policies";

type ShellProps = {
  children: ReactNode;
  contactEmail?: string;
};

const DialogContext = createContext<(type: PolicyKey, trigger: HTMLElement) => void>(() => undefined);

export function useOnboardingDialog() {
  return useContext(DialogContext);
}

export function OnboardingShell({ children, contactEmail }: ShellProps) {
  const [dialog, setDialog] = useState<PolicyKey | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const openDialog = (type: PolicyKey, trigger: HTMLElement) => {
    triggerRef.current = trigger;
    setDialog(type);
  };

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (dialog && !node.open) {
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      node.showModal();
      requestAnimationFrame(() => node.querySelector<HTMLElement>("[data-close-primary]")?.focus());
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }
    if (!dialog && node.open) node.close();
  }, [dialog]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      setDialog(null);
      triggerRef.current?.focus();
    };
    const handleClose = () => triggerRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !node.open) return;
      const focusables = Array.from(
        node.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])"),
      ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    node.addEventListener("cancel", handleCancel);
    node.addEventListener("close", handleClose);
    node.addEventListener("keydown", handleKeyDown);
    return () => {
      node.removeEventListener("cancel", handleCancel);
      node.removeEventListener("close", handleClose);
      node.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const closeDialog = () => setDialog(null);

  return (
    <DialogContext.Provider value={openDialog}>
      <IconDefs />
      <main className="shell">
        <BrandPanel />
        <section className="content-panel" aria-label="셀럽라이프 온보딩">
          <div className="panel-top">
            <BrandMark mobile />
            <div className="context">
              <span />
              CELEBLIFE ONBOARDING
            </div>
            <button type="button" className="help-link" onClick={(event) => openDialog("help", event.currentTarget)}>
              <Icon id="i-help" />
              연동이 궁금하신가요?
            </button>
          </div>
          <div className="view-wrap">{children}</div>
          <footer className="panel-footer">
            <Link href="/policies/terms">이용약관</Link>
            <i />
            <Link href="/policies/privacy">개인정보처리방침</Link>
            <i />
            <Link href="/policies/deletion">연동 해제·데이터 삭제</Link>
          </footer>
        </section>
      </main>
      <dialog className="dialog" ref={dialogRef} aria-labelledby="dialog-title">
        <div className="dialog-head">
          <h2 id="dialog-title">{dialog ? policyLabels[dialog] : ""}</h2>
          <button type="button" className="close-btn" aria-label="닫기" onClick={closeDialog}>
            <Icon id="i-cross" />
          </button>
        </div>
        <div className="dialog-body" id="dialog-body">
          {dialog ? <PolicyContent type={dialog} contactEmail={contactEmail} /> : null}
        </div>
        <div className="dialog-footer">
          <button className="primary" type="button" onClick={closeDialog} data-close-primary>
            확인했어요
          </button>
        </div>
      </dialog>
    </DialogContext.Provider>
  );
}

function BrandPanel() {
  return (
    <section className="story" aria-label="셀럽라이프 소개">
      <BrandMark />
      <div className="brand-sub">CREATOR COMMERCE INTELLIGENCE</div>
      <div className="story-body">
        <div className="eyebrow">
          <i />
          INSTAGRAM CONNECTION
        </div>
        <h2>
          반응을 읽고,
          <br />
          <em>선택의 기준</em>을 만듭니다.
        </h2>
        <p className="story-desc">인스타그램 계정 연결을 통해 채널 반응과 커머스 기회를 함께 살펴볼 준비를 시작합니다.</p>
        <div className="connection" aria-hidden="true">
          <div className="halo" />
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="ig-tile">
            <Icon id="i-ig" />
          </div>
          <div className="cl-tile">
            <svg className="brand-symbol">
              <use href="#cl-symbol" />
            </svg>
          </div>
          <div className="connection-line" />
          <div className="data-chip">
            <span />
            Insights ready
          </div>
          <svg className="spark sp1" viewBox="0 0 24 24">
            <use href="#i-star" />
          </svg>
          <svg className="spark sp2" viewBox="0 0 24 24">
            <use href="#i-star" />
          </svg>
        </div>
        <div className="story-benefits">
          <div className="benefit">
            <Icon id="i-shield" />
            공식 인증
          </div>
          <div className="benefit">
            <Icon id="i-chart" />
            채널 분석
          </div>
          <div className="benefit">
            <Icon id="i-mail" />
            담당자 안내
          </div>
        </div>
      </div>
      <div className="story-footer">
        <span>셀럽님의 데이터는 동의 후에만 연결됩니다.</span>
        <span>v2 onboarding</span>
      </div>
    </section>
  );
}

export function Steps({ active }: { active: 1 | 2 | 3 }) {
  const labels = ["기본 정보", "인스타그램 연동", "접수 완료"] as const;
  return (
    <nav className="steps" aria-label="신청 단계">
      {labels.map((label, index) => {
        const step = index + 1;
        const state = step < active ? " done" : step === active ? " active" : "";
        return (
          <span key={label} className="step-wrap">
            <span className={`step${state}`} aria-current={step === active ? "step" : undefined}>
              <span className="step-dot">{step < active ? <Icon id="i-check" /> : step}</span>
              {label}
            </span>
            {step < labels.length ? <span className="step-line" /> : null}
          </span>
        );
      })}
    </nav>
  );
}

export function LoadingArt() {
  return (
    <div className="status-illustration" aria-hidden="true">
      <svg className="progress-ring" viewBox="0 0 160 160">
        <circle className="ring-base" cx="80" cy="80" r="74" />
        <circle className="ring-motion" cx="80" cy="80" r="74" />
      </svg>
      <div className="status-orb">
        <svg className="brand-symbol">
          <use href="#cl-symbol" />
        </svg>
      </div>
      <div className="orbit-badge">
        <Icon id="i-ig" />
      </div>
      <svg className="status-twinkle" viewBox="0 0 24 24">
        <use href="#i-star" />
      </svg>
    </div>
  );
}
