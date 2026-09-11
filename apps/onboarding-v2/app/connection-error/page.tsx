import { ConnectionErrorClient } from "@/components/onboarding/error-client";
import { OnboardingShell } from "@/components/onboarding/shell";
import type { PublicErrorCode } from "@/components/onboarding/types";

const PUBLIC_ERROR_CODES = new Set<PublicErrorCode>([
  "VALIDATION_FAILED",
  "CONSENT_REQUIRED",
  "POLICY_CHANGED",
  "CSRF_REJECTED",
  "RATE_LIMITED",
  "CONFIGURATION_ERROR",
  "OAUTH_CANCELLED",
  "INVALID_STATE",
  "SESSION_EXPIRED",
  "REAUTH_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
  "IDEMPOTENCY_CONFLICT",
  "ACTIVE_ATTEMPT_EXISTS",
  "ACTIVE_PROCESSING",
  "STALE_ATTEMPT",
  "STALE_CONFIRMATION",
  "PERMISSIONS_REQUIRED",
  "UNSUPPORTED_ACCOUNT",
]);

export default async function ConnectionErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ attemptId?: string; code?: PublicErrorCode }>;
}) {
  const params = await searchParams;
  const code = sanitizePublicErrorCode(params.code);
  const props = code ? { attemptId: params.attemptId ?? "", code } : { attemptId: params.attemptId ?? "" };
  return (
    <OnboardingShell>
      <ConnectionErrorClient {...props} />
    </OnboardingShell>
  );
}

function sanitizePublicErrorCode(value: unknown): PublicErrorCode | undefined {
  return typeof value === "string" && PUBLIC_ERROR_CODES.has(value as PublicErrorCode) ? (value as PublicErrorCode) : undefined;
}
