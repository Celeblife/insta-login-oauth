"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "./icons";
import { errorCopy, isUuid, shouldAcceptStatus } from "./flow";
import { Steps, useOnboardingDialog } from "./shell";
import type { StatusResponse, SubmittedResult } from "./types";

export function CompleteClient({ attemptId, contactEmail }: { attemptId: string; contactEmail: string }) {
  const openDialog = useOnboardingDialog();
  const [status, setStatus] = useState<StatusResponse | null>(() =>
    isUuid(attemptId) ? null : { status: "failed", attemptId, revision: 0, code: "INVALID_STATE", retryAction: "return_form", draftAvailable: false },
  );
  const currentRef = useRef<StatusResponse | null>(status);

  const accept = useCallback((next: StatusResponse) => {
    if (!shouldAcceptStatus(currentRef.current, next, attemptId)) return;
    currentRef.current = next;
    setStatus(next);
  }, [attemptId]);

  const purgeExpired = useCallback(() => {
    const expired = { status: "failed", attemptId, revision: 0, code: "SESSION_EXPIRED", retryAction: "return_form", draftAvailable: false } satisfies StatusResponse;
    currentRef.current = expired;
    setStatus(expired);
  }, [attemptId]);

  useEffect(() => {
    if (!isUuid(attemptId)) return;
    let cancelled = false;
    const revalidate = () => {
      fetch(`/api/onboarding/status?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if ([401, 403, 410].includes(response.status)) {
          return { expired: true as const };
        }
        if (!response.ok) throw new Error(String(response.status));
        return { expired: false as const, status: (await response.json()) as StatusResponse };
      })
      .then((next) => {
        if (cancelled) return;
        if (next.expired) {
          purgeExpired();
          return;
        }
        accept(next.status);
      })
      .catch(() => {
        if (!cancelled && !currentRef.current) setStatus(null);
      });
    };
    revalidate();
    const onReturn = () => {
      if (document.visibilityState === "visible") revalidate();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("pageshow", onReturn);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("pageshow", onReturn);
    };
  }, [accept, attemptId, purgeExpired]);

  if (!status) return <PendingReceipt />;
  if (status.status !== "completed") {
    const copy = status.status === "failed" ? errorCopy(status.code, status.draftAvailable) : errorCopy("SESSION_EXPIRED", false);
    return <ReceiptUnavailable title={copy.title} body={copy.body} />;
  }
  if (status.result.kind === "legacy") return <LegacyComplete result={status.result} />;
  return <V2Complete result={status.result} contactEmail={contactEmail} openDialog={openDialog} />;
}

function PendingReceipt() {
  return (
    <section className="view status-view" id="view-loading" aria-labelledby="receipt-title">
      <Steps active={3} />
      <h1 id="receipt-title">접수 결과를 확인하고 있어요.</h1>
      <p className="subtitle">서버에 저장된 완료 결과가 확인된 뒤에만 완료 화면을 표시합니다.</p>
    </section>
  );
}

function ReceiptUnavailable({ title, body }: { title: string; body: string }) {
  return (
    <section className="view status-view" id="view-error" aria-labelledby="error-title">
      <div className="error-icon"><Icon id="i-info" /></div>
      <h1 id="error-title">{title}</h1>
      <p className="subtitle">{body}</p>
      <Link className="primary complete-return-link" href="/apply">정보 입력으로 돌아가기</Link>
    </section>
  );
}

function V2Complete({ result, contactEmail, openDialog }: { result: SubmittedResult; contactEmail: string; openDialog: (type: "contact", trigger: HTMLElement) => void }) {
  const reconnection = result.connectionKind === "reconnection";
  return (
    <section className="view status-view" id="view-success" aria-labelledby="success-title">
      <Steps active={3} />
      <div className="success-illustration" aria-hidden="true"><div className="success-halo" /><div className="success-circle"><Icon id="i-check" /></div><span className="success-dot" /><svg className="success-star" viewBox="0 0 24 24"><use href="#i-star" /></svg></div>
      <h1 id="success-title" tabIndex={-1}>{reconnection ? "인스타그램이 다시 연결되었습니다." : "연동이 완료되었습니다."}</h1>
      <p className="subtitle">{reconnection ? "연결 정보가 업데이트되었어요. 기존 분석 신청 내역은 유지됩니다." : `${result.fullName}님의 분석 신청이 정상적으로 접수되었어요.`}</p>
      <div className="connected-account"><Icon id="i-ig" /><b>@{result.instagramUsername}</b><span className="connected-pill">연결 완료</span></div>
      <div className="next-card">
        <div className="next-header"><Icon id="i-clock" />{reconnection ? "연결 정보가 업데이트되었어요" : "이제, 이렇게 진행돼요"}<span>{reconnection ? "기존 신청 유지" : "약 1영업일"}</span></div>
        <div className="next-step"><span className="next-number">1</span><div><b>{reconnection ? "계정 연결과 연락처를 갱신했습니다" : "채널에 맞는 분석을 준비합니다"}</b><br />{reconnection ? "앞으로 사용할 연결 정보가 업데이트됩니다." : "AI 분석과 담당자 검토가 함께 진행됩니다."}</div></div>
        <div className="next-step"><span className="next-number">2</span><div><b>{reconnection ? "기존 신청 내역은 그대로 유지됩니다" : "담당자가 직접 연락드립니다"}</b><br />{reconnection ? "새 분석 신청이나 검토 상태 초기화는 발생하지 않습니다." : "접수 확인 후 입력하신 연락처로 안내드릴게요."}</div></div>
      </div>
      <p className="contact-line">안내받을 이메일 <b>{result.email}</b><br />연락처 {result.phone}</p>
      <p className="finish-note"><Icon id="i-check" />이 페이지는 닫으셔도 됩니다.</p>
      <p className="success-reference">{reconnection ? "연결 이력 번호" : "접수번호"} {result.requestId}</p>
      <button type="button" className="subtle-btn" onClick={(event) => openDialog("contact", event.currentTarget)} data-contact-email={contactEmail ? "public" : "missing"}>입력한 연락처에 수정이 필요한가요?</button>
    </section>
  );
}

function LegacyComplete({ result }: { result: { instagramUsername: string } }) {
  return (
    <section className="view status-view" id="view-success" aria-labelledby="legacy-title">
      <Steps active={3} />
      <div className="success-illustration" aria-hidden="true"><div className="success-halo" /><div className="success-circle"><Icon id="i-check" /></div></div>
      <h1 id="legacy-title">인스타그램 연결이 확인되었습니다.</h1>
      <p className="subtitle">기존 연결 흐름에서 확인된 계정입니다. 새 개인정보·분석 신청 접수로 표시하지 않습니다.</p>
      <div className="connected-account"><Icon id="i-ig" /><b>@{result.instagramUsername}</b><span className="connected-pill">연결 완료</span></div>
    </section>
  );
}
