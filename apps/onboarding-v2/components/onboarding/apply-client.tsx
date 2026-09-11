"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icons";
import type { PolicyKey } from "./policies";
import { Steps, useOnboardingDialog } from "./shell";
import type { BootstrapResponse, StartResponse } from "./types";
import { normalizeInstagramUsername, normalizePhone, parseApiError, validateApplyFields, type FieldErrors } from "./flow";

const consentKeys = ["age", "terms", "privacy", "instagramData"] as const;
type ConsentKey = (typeof consentKeys)[number];

const consentLabels: Record<ConsentKey, { text: string; policy?: PolicyKey }> = {
  age: { text: "만 14세 이상입니다." },
  terms: { text: "서비스 이용약관에 동의합니다.", policy: "terms" },
  privacy: { text: "개인정보 수집·이용에 동의합니다.", policy: "collection" },
  instagramData: { text: "Instagram 데이터 이용에 동의합니다.", policy: "instagramData" },
};

export function ApplyClient() {
  const router = useRouter();
  const openDialog = useOnboardingDialog();
  const [csrfToken, setCsrfToken] = useState("");
  const [policyBundleId, setPolicyBundleId] = useState("");
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", instagramUsername: "" });
  const [restoredAttemptId, setRestoredAttemptId] = useState<string | null>(null);
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ age: false, terms: false, privacy: false, instagramData: false });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const allRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const checkedCount = useMemo(() => consentKeys.filter((key) => consents[key]).length, [consents]);
  const allChecked = checkedCount === consentKeys.length;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = checkedCount > 0 && !allChecked;
  }, [allChecked, checkedCount]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding/bootstrap", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("bootstrap");
        return (await response.json()) as BootstrapResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setCsrfToken(data.csrfToken);
        setPolicyBundleId(data.policyBundleId);
        if (data.draft) {
          setForm({
            fullName: data.draft.fullName,
            phone: data.draft.phone,
            email: data.draft.email,
            instagramUsername: data.draft.instagramUsername,
          });
          setRestoredAttemptId(data.draft.attemptId);
        } else {
          setRestoredAttemptId(null);
        }
        if (data.activeAttempt?.nextPath && data.activeAttempt.nextPath !== "/apply") {
          const url = `${data.activeAttempt.nextPath}?attemptId=${encodeURIComponent(data.activeAttempt.attemptId)}`;
          router.replace(url);
        }
      })
      .catch(() => {
        if (!cancelled) setSubmitError("연결 준비 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const updateConsent = (key: ConsentKey, value: boolean) => {
    setConsents((current) => ({ ...current, [key]: value }));
    if (errors.consents) {
      setErrors((current) => {
        const next = { ...current };
        delete next.consents;
        return next;
      });
    }
  };

  const firstInvalid = (nextErrors: FieldErrors) => {
    const order = ["fullName", "phone", "email", "instagramUsername", "consents"] as const;
    const key = order.find((item) => nextErrors[item]);
    if (!key) return;
    const selector = key === "consents" ? "[data-consent]:not(:checked)" : `[name="${key}"]`;
    formRef.current?.querySelector<HTMLElement>(selector)?.focus();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateApplyFields({ ...form, consents });
    setErrors(nextErrors);
    setSubmitError("");
    if (Object.keys(nextErrors).length > 0) {
      firstInvalid(nextErrors);
      return;
    }
    if (!csrfToken || !policyBundleId) {
      setSubmitError("연결 준비 정보를 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(".form-alert")?.focus());
      return;
    }
    setSubmitting(true);
    const requestKey = crypto.randomUUID();
    try {
      const response = await fetch("/api/onboarding/start", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify({
          requestKey,
          policyBundleId,
          fullName: form.fullName.trim(),
          phone: normalizePhone(form.phone),
          email: form.email.trim(),
          instagramUsername: normalizeInstagramUsername(form.instagramUsername),
          consents: { age: true, terms: true, privacy: true, instagramData: true },
          ...(restoredAttemptId ? { replaceAttemptId: restoredAttemptId } : {}),
        }),
      });
      if (!response.ok) {
        const apiError = await parseApiError(response);
        if (apiError?.error.fields) setErrors(apiError.error.fields);
        throw new Error(apiError?.error.message ?? "start failed");
      }
      const data = (await response.json()) as StartResponse;
      if (data.action === "authorize") {
        window.location.assign(data.authorizeUrl);
      } else {
        router.push(`${data.nextPath}?attemptId=${encodeURIComponent(data.attemptId)}`);
      }
    } catch (error) {
      setSubmitting(false);
      setSubmitError(error instanceof Error ? error.message : "연결을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(".form-alert")?.focus());
    }
  };

  return (
    <section className="view apply-view" id="view-form" aria-labelledby="form-title">
      <button type="button" className="text-button" onClick={() => router.push("/")}>
        <Icon id="i-back" />
        처음으로
      </button>
      <Steps active={1} />
      <div className="view-head">
        <h1 id="form-title" tabIndex={-1}>
          먼저, 셀럽님을 알려주세요.
        </h1>
        <p className="subtitle">분석 결과와 담당자 안내를 받을 정보를 입력해 주세요.</p>
      </div>
      <p className="required-caption">
        <b>*</b> 필수 입력
      </p>
      <form ref={formRef} id="onboarding-form" noValidate onSubmit={submit}>
        {submitError ? (
          <div className="form-alert" role="alert" tabIndex={-1}>
            {submitError}
          </div>
        ) : null}
        <div className="form-grid">
          <Field id="full-name" name="fullName" label="이름" error={errors.fullName}>
            <input name="fullName" id="full-name" autoComplete="name" value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} aria-invalid={Boolean(errors.fullName)} aria-describedby="name-error" />
          </Field>
          <Field id="phone" name="phone" label="연락처" error={errors.phone}>
            <input name="phone" id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} aria-invalid={Boolean(errors.phone)} aria-describedby="phone-error" />
          </Field>
          <Field id="email" name="email" label="이메일" error={errors.email}>
            <input className="has-icon" name="email" id="email" type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} aria-invalid={Boolean(errors.email)} aria-describedby="email-error" />
            <Icon id="i-mail" />
          </Field>
          <Field
            id="instagram"
            name="instagramUsername"
            label="셀럽 ID"
            error={errors.instagramUsername}
            hint={<p className="field-hint" id="instagram-hint">Instagram 계정명 참고값이며 소유권 판단에 쓰지 않습니다.</p>}
          >
            <span className="input-prefix">@</span>
            <input className="has-prefix" name="instagramUsername" id="instagram" autoCapitalize="none" autoCorrect="off" value={form.instagramUsername} onChange={(event) => setForm({ ...form, instagramUsername: event.target.value })} onBlur={() => setForm((current) => ({ ...current, instagramUsername: normalizeInstagramUsername(current.instagramUsername) }))} aria-invalid={Boolean(errors.instagramUsername)} aria-describedby="instagram-error instagram-hint" />
            <Icon id="i-ig" />
          </Field>
        </div>
        <div className="consent-box">
          <label className="all-agree">
            <span className="cb">
              <input ref={allRef} type="checkbox" checked={allChecked} onChange={(event) => setConsents({ age: event.target.checked, terms: event.target.checked, privacy: event.target.checked, instagramData: event.target.checked })} />
              <span><Icon id="i-check" /></span>
            </span>
            필수 항목 전체 동의
          </label>
          <div className="checks">
            {consentKeys.map((key) => (
              <div className="check-row" key={key}>
                <label>
                  <span className="cb">
                    <input data-consent type="checkbox" checked={consents[key]} onChange={(event) => updateConsent(key, event.target.checked)} />
                    <span><Icon id="i-check" /></span>
                  </span>
                  <span className="required-text">[필수]</span> {consentLabels[key].text}
                </label>
                {consentLabels[key].policy ? (
                  <button type="button" className="policy-link" aria-label={`${consentLabels[key].text} 보기`} onClick={(event) => openDialog(consentLabels[key].policy as PolicyKey, event.currentTarget)}>
                    <Icon id="i-chevron" />
                  </button>
                ) : null}
              </div>
            ))}
            <p id="consent-error" className="field-error" role="alert" hidden={!errors.consents}>{errors.consents}</p>
          </div>
        </div>
        <div className="form-action">
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? "연결 화면으로 이동 중…" : "동의하고 Instagram 연결"}
            <Icon id="i-arrow" className="ic trailing" />
          </button>
          <p className="action-caption"><Icon id="i-lock" />인스타그램 비밀번호는 셀럽라이프에 저장하지 않아요.</p>
          <p className="action-caption">다음 단계에서 Instagram 로그인 및 권한 승인이 진행됩니다. 완료 후 셀럽라이프로 돌아옵니다.</p>
        </div>
      </form>
    </section>
  );
}

function Field({ id, name, label, error, hint, children }: { id: string; name: string; label: string; error?: string | undefined; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`field ${name === "email" || name === "instagramUsername" ? "full" : ""}`}>
      <label htmlFor={id}>
        {label} <span className="req">*</span>
      </label>
      <div className="input-wrap">{children}</div>
      {hint}
      <p className="field-error" id={`${id === "full-name" ? "name" : id}-error`} role="alert" hidden={!error}>{error}</p>
    </div>
  );
}
