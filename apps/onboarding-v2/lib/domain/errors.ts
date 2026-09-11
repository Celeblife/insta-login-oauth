import type { PublicErrorCode } from "@/lib/contracts/onboarding";

const PUBLIC_MESSAGES: Record<PublicErrorCode, string> = {
  VALIDATION_FAILED: "입력한 정보를 확인해 주세요.",
  CONSENT_REQUIRED: "필수 동의 항목을 확인해 주세요.",
  POLICY_CHANGED: "최신 동의 내용을 다시 확인해 주세요.",
  CSRF_REJECTED: "요청을 확인할 수 없습니다. 새로고침 후 다시 시도해 주세요.",
  RATE_LIMITED: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  CONFIGURATION_ERROR: "서비스 설정을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.",
  OAUTH_CANCELLED: "인스타그램 연결이 취소되었습니다.",
  INVALID_STATE: "인증 요청을 확인할 수 없습니다. 다시 연결해 주세요.",
  SESSION_EXPIRED: "인증 시간이 만료되었습니다. 다시 진행해 주세요.",
  REAUTH_REQUIRED: "인스타그램 연결을 다시 진행해 주세요.",
  PROVIDER_UNAVAILABLE: "인스타그램 연결을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  STORAGE_UNAVAILABLE: "접수를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  IDEMPOTENCY_CONFLICT: "같은 요청 식별자로 다른 정보가 제출되었습니다.",
  ACTIVE_ATTEMPT_EXISTS: "이미 진행 중인 신청이 있습니다.",
  ACTIVE_PROCESSING: "현재 연결을 처리 중입니다. 잠시만 기다려 주세요.",
  STALE_ATTEMPT: "더 최근 연결이 있어 이 요청은 완료할 수 없습니다.",
  STALE_CONFIRMATION: "확인 정보가 오래되었습니다. 현재 상태를 다시 확인해 주세요.",
  PERMISSIONS_REQUIRED: "필수 인스타그램 권한을 확인할 수 없습니다.",
  UNSUPPORTED_ACCOUNT: "지원하지 않는 인스타그램 계정입니다.",
};

export class PublicApiError extends Error {
  readonly code: PublicErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string>;
  readonly retryAfterMs?: number;

  constructor(
    code: PublicErrorCode,
    status = statusForCode(code),
    options: { fields?: Record<string, string>; retryAfterMs?: number; message?: string } = {},
  ) {
    super(options.message ?? PUBLIC_MESSAGES[code]);
    this.name = "PublicApiError";
    this.code = code;
    this.status = status;
    if (options.fields) this.fields = options.fields;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }
}

export function publicMessage(code: PublicErrorCode): string {
  return PUBLIC_MESSAGES[code];
}

export function statusForCode(code: PublicErrorCode): number {
  switch (code) {
    case "VALIDATION_FAILED":
    case "CONSENT_REQUIRED":
      return 400;
    case "SESSION_EXPIRED":
      return 401;
    case "CSRF_REJECTED":
    case "INVALID_STATE":
      return 403;
    case "POLICY_CHANGED":
    case "IDEMPOTENCY_CONFLICT":
    case "ACTIVE_ATTEMPT_EXISTS":
    case "ACTIVE_PROCESSING":
    case "STALE_ATTEMPT":
    case "STALE_CONFIRMATION":
      return 409;
    case "OAUTH_CANCELLED":
    case "REAUTH_REQUIRED":
      return 410;
    case "RATE_LIMITED":
      return 429;
    case "PROVIDER_UNAVAILABLE":
    case "PERMISSIONS_REQUIRED":
    case "UNSUPPORTED_ACCOUNT":
      return 502;
    case "CONFIGURATION_ERROR":
    case "STORAGE_UNAVAILABLE":
      return 503;
  }
}
