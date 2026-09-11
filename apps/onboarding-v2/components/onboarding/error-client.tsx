"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import { errorCopy, isUuid, parseApiError, retryActionLabel, startResponsePath } from "./flow";
import type { PublicErrorCode, StartResponse, StatusResponse } from "./types";

export function ConnectionErrorClient({ attemptId, code }: { attemptId: string; code?: PublicErrorCode }) {
  const router = useRouter();
  const [failed, setFailed] = useState<Extract<StatusResponse, { status: "failed" }> | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [working, setWorking] = useState(false);
  const restartKeyRef = useState(() => crypto.randomUUID())[0];
  const activeCode = failed?.code ?? code;
  const copy = errorCopy(activeCode, failed?.draftAvailable ?? false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/bootstrap", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("bootstrap");
        const data = (await response.json()) as { csrfToken: string };
        if (!cancelled) setCsrfToken(data.csrfToken);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    if (!isUuid(attemptId)) return;
    const response = await fetch(`/api/onboarding/status?attemptId=${encodeURIComponent(attemptId)}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if ([401, 403, 410].includes(response.status)) {
          return { status: "failed", attemptId, revision: 0, code: "SESSION_EXPIRED", retryAction: "return_form", draftAvailable: false } satisfies Extract<StatusResponse, { status: "failed" }>;
        }
        if (!response.ok) throw new Error("status");
        return (await response.json()) as StatusResponse;
      });
    if (response.status === "failed") setFailed(response);
    else if (response.status === "completed") router.replace(`/complete?attemptId=${encodeURIComponent(attemptId)}`);
    else if (response.status === "processing" || response.status === "account_confirmation_required") router.replace(`/connecting?attemptId=${encodeURIComponent(attemptId)}`);
  }, [attemptId, router]);

  useEffect(() => {
    let cancelled = false;
    if (!isUuid(attemptId)) return undefined;
    const timer = window.setTimeout(() => {
      if (!cancelled) void refreshStatus().catch(() => undefined);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [attemptId, refreshStatus]);

  const primary = async () => {
    const action = failed?.retryAction ?? (activeCode === "PROVIDER_UNAVAILABLE" || activeCode === "STORAGE_UNAVAILABLE" ? "retry_status" : "return_form");
    if (action === "return_form") {
      router.push("/apply");
      return;
    }
    if (action === "retry_status") {
      setWorking(true);
      await refreshStatus().catch(() => undefined);
      setWorking(false);
      return;
    }
    if (action === "restart_oauth") {
      setWorking(true);
      try {
        const response = await fetch("/api/onboarding/restart", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
          body: JSON.stringify({ attemptId, requestKey: restartKeyRef }),
        });
        if (!response.ok) {
          const apiError = await parseApiError(response);
          setFailed({ status: "failed", attemptId, revision: failed?.revision ?? 0, code: apiError?.error.code ?? "REAUTH_REQUIRED", retryAction: "restart_oauth", draftAvailable: failed?.draftAvailable ?? false });
          return;
        }
        const data = (await response.json()) as StartResponse;
        const target = startResponsePath(data);
        if (data.action === "authorize") window.location.assign(target);
        else router.push(target);
      } catch {
        setFailed({ status: "failed", attemptId, revision: failed?.revision ?? 0, code: "PROVIDER_UNAVAILABLE", retryAction: "restart_oauth", draftAvailable: failed?.draftAvailable ?? false });
      } finally {
        setWorking(false);
      }
        return;
    }
    router.push(`/connecting?attemptId=${encodeURIComponent(attemptId)}`);
  };

  return (
    <section className="view status-view" id="view-error" aria-labelledby="error-title">
      <div className="error-icon"><Icon id="i-info" /></div>
      <h1 id="error-title" tabIndex={-1}>{copy.title}</h1>
      <p className="subtitle">{copy.body}</p>
      <button type="button" className="primary error-primary" onClick={primary} disabled={working}>
        {retryActionLabel(failed?.retryAction) ?? copy.cta}
        <Icon id="i-arrow" className="ic trailing" />
      </button>
      <button type="button" className="secondary" onClick={() => router.push("/")}>처음으로 돌아가기</button>
    </section>
  );
}
