import type { ApiError, PublicErrorCode, Stage, StartResponse, StatusResponse } from "./types";

export type FieldErrors = Partial<Record<"fullName" | "phone" | "email" | "instagramUsername" | "consents", string>>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function normalizeInstagramUsername(value: string): string {
  return value.trim().replace(/^@+/, "").toLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+82")) {
    return trimmed.replace(/[^\d+]/g, "");
  }
  return trimmed.replace(/[^\d-]/g, "");
}

export function validateApplyFields(input: {
  fullName: string;
  phone: string;
  email: string;
  instagramUsername: string;
  consents: Record<string, boolean>;
}): FieldErrors {
  const errors: FieldErrors = {};
  const fullName = input.fullName.trim();
  const phone = normalizePhone(input.phone);
  const email = input.email.trim();
  const instagramUsername = normalizeInstagramUsername(input.instagramUsername);
  const hasControl = /[\u0000-\u001F\u007F]/;

  if (!fullName) errors.fullName = "이름을 입력해 주세요.";
  else if (fullName.length > 50 || hasControl.test(fullName)) errors.fullName = "이름은 1~50자로 입력해 주세요.";

  const domestic = /^0[1-9][0-9-]{7,11}$/.test(phone) && phone.replace(/\D/g, "").length >= 9 && phone.replace(/\D/g, "").length <= 11;
  const internationalKr = /^\+82[1-9][0-9]{7,9}$/.test(phone);
  if (!phone) errors.phone = "연락처를 입력해 주세요.";
  else if (!domestic && !internationalKr) errors.phone = "한국 연락처 형식을 확인해 주세요.";

  if (!email) errors.email = "이메일을 입력해 주세요.";
  else if (email.length > 254 || hasControl.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "이메일 주소를 확인해 주세요.";

  if (!instagramUsername) errors.instagramUsername = "인스타그램 아이디를 입력해 주세요.";
  else if (!/^[a-z0-9_][a-z0-9_.]{0,29}$/.test(instagramUsername)) errors.instagramUsername = "영문, 숫자, 마침표, 밑줄로 된 아이디를 입력해 주세요.";

  if (!input.consents.age || !input.consents.terms || !input.consents.privacy || !input.consents.instagramData) {
    errors.consents = "필수 동의를 모두 확인해 주세요.";
  }

  return errors;
}

export function stageIndex(stage: Stage, intent: "unknown" | "new" | "reconnection"): 0 | 1 | 2 {
  if (stage === "account") return 0;
  if (stage === "storage") return 1;
  return intent === "reconnection" || intent === "new" || intent === "unknown" ? 2 : 2;
}

export function shouldAcceptStatus(current: StatusResponse | null, incoming: StatusResponse, attemptId: string): boolean {
  if ("attemptId" in incoming && incoming.attemptId !== null && incoming.attemptId !== attemptId) return false;
  if (!current) return true;
  if ("attemptId" in current && current.attemptId !== null && "attemptId" in incoming && incoming.attemptId !== null && current.attemptId !== incoming.attemptId) return false;
  if (current.status === "completed" && incoming.status !== "completed") return false;
  return incoming.revision >= current.revision;
}

export function errorCopy(code?: PublicErrorCode, draftAvailable = false) {
  const copy: Record<PublicErrorCode, { title: string; body: string; cta: string }> = {
    VALIDATION_FAILED: { title: "입력한 정보를 확인해 주세요.", body: "필수 정보와 동의 항목을 다시 확인해 주세요.", cta: "정보 입력으로 돌아가기" },
    CONSENT_REQUIRED: { title: "필수 동의가 필요해요.", body: "신청 접수를 위해 모든 필수 동의를 확인해 주세요.", cta: "정보 입력으로 돌아가기" },
    POLICY_CHANGED: { title: "약관이 변경되었어요.", body: "최신 안내를 다시 확인한 뒤 연결을 시작해 주세요.", cta: "정보 입력으로 돌아가기" },
    CSRF_REJECTED: { title: "연결 시간이 지나 다시 시작해야 해요.", body: "브라우저 보안을 위해 정보 입력 단계부터 다시 진행해 주세요.", cta: "정보 입력으로 돌아가기" },
    RATE_LIMITED: { title: "요청이 잠시 많아요.", body: "잠시 후 현재 상태를 다시 확인해 주세요.", cta: "상태 다시 확인" },
    CONFIGURATION_ERROR: { title: "연결 설정을 확인하고 있어요.", body: "서비스 설정 문제로 지금은 연결을 마칠 수 없습니다.", cta: "정보 입력으로 돌아가기" },
    OAUTH_CANCELLED: { title: "인스타그램 연결이 취소되었어요.", body: draftAvailable ? "입력한 정보가 남아 있어요. 계정을 확인한 뒤 새 인증을 시작해 주세요." : "취소된 인증은 재사용하지 않고 새 인증을 시작해야 합니다.", cta: "다시 연결하기" },
    INVALID_STATE: { title: "연결을 확인하지 못했어요.", body: "브라우저가 바뀌었거나 연결 정보가 맞지 않습니다. 처음부터 다시 진행해 주세요.", cta: "처음부터 다시 연결" },
    SESSION_EXPIRED: { title: "연결 시간이 지나 다시 시작해야 해요.", body: "만료된 정보로는 접수를 완료할 수 없습니다.", cta: "정보 입력으로 돌아가기" },
    REAUTH_REQUIRED: { title: "인스타그램을 다시 연결해야 해요.", body: "안전한 확인을 위해 새 인증을 시작해 주세요.", cta: "다시 연결하기" },
    PROVIDER_UNAVAILABLE: { title: "인스타그램 연결 확인이 지연되고 있어요.", body: "최종 실패로 단정하지 않고 현재 상태를 다시 확인할 수 있습니다.", cta: "상태 다시 확인" },
    STORAGE_UNAVAILABLE: { title: "신청 저장 상태를 확인하고 있어요.", body: "저장 결과를 확인한 뒤 안전하게 이어가겠습니다.", cta: "상태 다시 확인" },
    IDEMPOTENCY_CONFLICT: { title: "신청 정보가 변경되었어요.", body: "이전 요청과 다른 정보가 감지되어 새로 제출해야 합니다.", cta: "정보 확인 후 새로 제출" },
    ACTIVE_ATTEMPT_EXISTS: { title: "다른 연결 작업이 진행 중이에요.", body: "이미 시작된 연결 상태를 먼저 확인해 주세요.", cta: "진행 상황 확인" },
    ACTIVE_PROCESSING: { title: "연결 신청을 처리하고 있어요.", body: "처리 중인 작업이 끝날 때까지 현재 상태를 확인해 주세요.", cta: "진행 상황 확인" },
    STALE_ATTEMPT: { title: "더 최근의 연결 정보가 있어요.", body: "최신 상태를 다시 확인해 주세요.", cta: "최신 상태 확인" },
    STALE_CONFIRMATION: { title: "연결 상태가 변경되었어요.", body: "오래된 확인창으로는 계정을 승인할 수 없습니다.", cta: "다시 확인하기" },
    PERMISSIONS_REQUIRED: { title: "필요한 인스타그램 권한을 확인해 주세요.", body: "분석 신청에 필요한 권한이 부족합니다.", cta: "다시 연결하기" },
    UNSUPPORTED_ACCOUNT: { title: "이 계정으로는 연결을 완료할 수 없어요.", body: "지원되는 Instagram 계정 유형을 확인해 주세요.", cta: "지원 계정 안내" },
  };
  return copy[code ?? "INVALID_STATE"];
}

export function retryActionLabel(action?: "retry_status" | "retry_complete" | "restart_oauth" | "return_form") {
  const labels = {
    retry_status: "상태 다시 확인",
    retry_complete: "완료 처리 다시 요청",
    restart_oauth: "다시 연결하기",
    return_form: "정보 입력으로 돌아가기",
  };
  return labels[action ?? "return_form"];
}

export function startResponsePath(response: StartResponse): string {
  if (response.action === "resume") {
    return `${response.nextPath}?attemptId=${encodeURIComponent(response.attemptId)}`;
  }
  return response.authorizeUrl;
}

export async function parseApiError(response: Response): Promise<ApiError | null> {
  try {
    return (await response.json()) as ApiError;
  } catch {
    return null;
  }
}
