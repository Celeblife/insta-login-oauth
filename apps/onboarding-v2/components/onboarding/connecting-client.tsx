"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { errorCopy, isUuid, parseApiError, shouldAcceptStatus, stageIndex, startResponsePath } from "./flow";
import { LoadingArt, Steps } from "./shell";
import type { PublicErrorCode, StartResponse, StatusResponse } from "./types";

const stageLabels = ["인스타그램 계정 확인", "신청 정보 안전하게 저장", "AI 분석 신청 접수"] as const;

function previewStatus(attemptId: string): Extract<StatusResponse, { status: "processing" }> {
  return {
    status: "processing",
    attemptId,
    revision: 0,
    stage: "account",
    retryAfterMs: 60_000,
    submissionIntent: "unknown",
  };
}

export function ConnectingClient({ attemptId, preview = false }: { attemptId: string; preview?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusResponse | null>(() => (preview ? previewStatus(attemptId) : null));
  const [longWait, setLongWait] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [restartError, setRestartError] = useState<PublicErrorCode | null>(null);
  const [restarting, setRestarting] = useState(false);
  const currentRef = useRef<StatusResponse | null>(preview ? previewStatus(attemptId) : null);
  const csrfRef = useRef("");
  const restartKeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const accept = useCallback((incoming: StatusResponse) => {
    if (!shouldAcceptStatus(currentRef.current, incoming, attemptId)) return;
    currentRef.current = incoming;
    setStatus(incoming);
    if (incoming.status === "completed") {
      router.replace(`/complete?attemptId=${encodeURIComponent(attemptId)}`);
    } else if (incoming.status === "failed") {
      router.replace(`/connection-error?attemptId=${encodeURIComponent(attemptId)}&code=${encodeURIComponent(incoming.code)}`);
    }
  }, [attemptId, router]);

  const fetchStatus = useCallback(async () => {
    const response = await fetch(`/api/onboarding/status?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) {
      if ([401, 403, 410].includes(response.status)) {
        router.replace("/connection-error?code=SESSION_EXPIRED");
        return;
      }
      throw new Error("status");
    }
    accept((await response.json()) as StatusResponse);
  }, [accept, attemptId, router]);

  const complete = useCallback(async () => {
    const response = await fetch("/api/onboarding/complete", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfRef.current },
      body: JSON.stringify({ attemptId }),
    });
    if (!response.ok) {
      if ([401, 403, 410].includes(response.status)) {
        router.replace("/connection-error?code=SESSION_EXPIRED");
        return;
      }
      const apiError = await parseApiError(response);
      router.replace(`/connection-error?attemptId=${encodeURIComponent(attemptId)}&code=${encodeURIComponent(apiError?.error.code ?? "STORAGE_UNAVAILABLE")}`);
      return;
    }
    accept((await response.json()) as StatusResponse);
  }, [accept, attemptId, router]);

  useEffect(() => {
    if (preview) return;
    if (!isUuid(attemptId)) {
      router.replace("/connection-error?code=INVALID_STATE");
      return;
    }
    let cancelled = false;
    fetch("/api/onboarding/bootstrap", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("bootstrap");
        const data = (await response.json()) as { csrfToken: string };
        csrfRef.current = data.csrfToken;
      })
      .then(() => {
        if (!cancelled) return complete();
      })
      .catch(() => {
        if (!cancelled) setLongWait(true);
      });
    const longWaitTimer = window.setTimeout(() => setLongWait(true), 45_000);
    return () => {
      cancelled = true;
      window.clearTimeout(longWaitTimer);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [attemptId, complete, preview, router]);

  useEffect(() => {
    if (preview) return;
    if (!status || status.status !== "processing") return;
    if (document.visibilityState === "hidden") return;
    timeoutRef.current = setTimeout(() => {
      void fetchStatus().catch(() => setLongWait(true));
    }, Math.max(status.retryAfterMs, 1_500));
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [fetchStatus, preview, status]);

  useEffect(() => {
    if (preview) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && currentRef.current?.status === "processing") {
        void fetchStatus().catch(() => setLongWait(true));
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [fetchStatus, preview]);

  const activeStage = status?.status === "processing" ? stageIndex(status.stage, status.submissionIntent) : 0;
  const account = status?.status === "account_confirmation_required" ? `@${status.connectedUsername}` : "계정 확인 중";
  const message = status?.status === "processing"
    ? {
        account: "인스타그램 계정을 확인하고 있어요.",
        storage: "신청 정보를 안전하게 저장하고 있어요.",
        submission: status.submissionIntent === "reconnection" ? "연결 정보를 갱신하고 있어요." : status.submissionIntent === "new" ? "AI 분석 신청을 접수하고 있어요." : "연결 신청을 마무리하고 있어요.",
      }[status.stage]
    : longWait
      ? "연결 준비 정보를 확인하지 못했어요. 현재 상태를 다시 확인해 주세요."
      : "인스타그램 계정을 확인하고 있어요.";

  const confirmAccount = async () => {
    if (status?.status !== "account_confirmation_required") return;
    setConfirming(true);
    const response = await fetch("/api/onboarding/confirm-account", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfRef.current },
      body: JSON.stringify({ attemptId, expectedRevision: status.revision, accept: true }),
    });
    setConfirming(false);
    if (!response.ok) {
      router.replace(`/connection-error?attemptId=${encodeURIComponent(attemptId)}&code=STALE_CONFIRMATION`);
      return;
    }
    accept((await response.json()) as StatusResponse);
  };

  const restartOauth = async () => {
    if (status?.status !== "account_confirmation_required") return;
    restartKeyRef.current ??= crypto.randomUUID();
    setRestarting(true);
    setRestartError(null);
    try {
      const response = await fetch("/api/onboarding/restart", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfRef.current },
        body: JSON.stringify({ attemptId, requestKey: restartKeyRef.current }),
      });
      if (!response.ok) {
        const apiError = await parseApiError(response);
        const code = apiError?.error.code ?? "REAUTH_REQUIRED";
        setRestartError(code);
        if (code === "ACTIVE_PROCESSING") {
          router.push(`/connecting?attemptId=${encodeURIComponent(attemptId)}`);
        }
        return;
      }
      const data = (await response.json()) as StartResponse;
      const target = startResponsePath(data);
      if (data.action === "authorize") window.location.assign(target);
      else router.push(target);
    } catch {
      setRestartError("PROVIDER_UNAVAILABLE");
    } finally {
      setRestarting(false);
    }
  };

  if (status?.status === "account_confirmation_required") {
    return (
      <section className="view status-view" id="view-loading" aria-labelledby="confirm-title">
        <Steps active={2} />
        <LoadingArt />
        <h1 id="confirm-title" tabIndex={-1}>연결된 계정을 확인해 주세요.</h1>
        <p className="subtitle">입력하신 계정은 @{status.enteredUsername}, Instagram에서 확인된 계정은 @{status.connectedUsername}입니다.</p>
        {restartError ? <p className="form-alert" role="alert">{errorCopy(restartError, false).body}</p> : null}
        <button type="button" className="primary account-confirm-primary" onClick={confirmAccount} disabled={confirming}>
          @{status.connectedUsername}으로 연결
          <Icon id="i-arrow" className="ic trailing" />
        </button>
        <button type="button" className="secondary" onClick={restartOauth} disabled={restarting}>{restarting ? "다시 연결 준비 중…" : "다른 계정으로 다시 연결"}</button>
      </section>
    );
  }

  return (
    <section className="view status-view" id="view-loading" aria-labelledby="loading-title" aria-busy={status?.status === "processing"}>
      <Steps active={2} />
      <LoadingArt />
      <div className="status-tag"><Icon id="i-link" /><span>{account}</span></div>
      <h1 id="loading-title" tabIndex={-1}>셀럽님과 연결하고 있어요.</h1>
      <p className="subtitle loading-copy" aria-live="polite">{message}<br />완료 전까지 이 페이지를 유지해 주세요.</p>
      <ol className="loading-list" aria-label="연동 진행 상황">
        {stageLabels.map((label, index) => {
          const done = index < activeStage;
          const active = index === activeStage;
          return (
            <li key={label} className={`loading-step${done ? " done" : active ? " active" : ""}`}>
              <span className="loading-node">{done ? <Icon id="i-check" /> : index + 1}</span>
              <span>{label}</span>
              <span className="loading-detail">{done ? "완료" : active ? "확인 중" : "대기"}</span>
            </li>
          );
        })}
      </ol>
      <p className="loading-note"><Icon id="i-lock" />연결이 완료될 때까지 이 페이지를 유지해 주세요.</p>
      {longWait ? (
        <div className="timeout-actions">
          <p className="long-wait">연결 확인이 지연되고 있어요. 현재 상태를 다시 확인해 주세요.</p>
          <button type="button" className="secondary" onClick={() => void fetchStatus()}>상태 다시 확인</button>
        </div>
      ) : null}
    </section>
  );
}
