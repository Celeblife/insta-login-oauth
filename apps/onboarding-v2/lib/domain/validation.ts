import type { StartRequest } from "@/lib/contracts/onboarding";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONSENT_FIELDS = ["age", "terms", "privacy", "instagramData"] as const;

function plain(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function normalizeInstagram(value: unknown): string {
  return plain(value).replace(/^@+/, "").toLowerCase();
}

export function normalizeKoreanPhone(value: unknown): string | null {
  const text = plain(value);
  if (!text || text.length > 30 || !/^[+0-9() -]+$/.test(text)) return null;
  const compact = text.replace(/[() -]/g, "");
  if (/^0[1-9]\d{7,9}$/.test(compact)) return `+82${compact.slice(1)}`;
  if (/^\+82[1-9]\d{7,9}$/.test(compact)) return compact;
  return null;
}

export type ValidatedStart =
  | { ok: true; value: StartRequest & { phone: string } }
  | { ok: false; fields: Record<string, string>; policyChanged?: boolean };

export function validateStart(input: unknown, expectedPolicyBundleId: string): ValidatedStart {
  if (!isRecord(input)) {
    return { ok: false, fields: { consents: "잘못된 요청입니다." } };
  }

  const fields: Record<string, string> = {};
  const fullName = plain(input.fullName);
  const email = plain(input.email);
  const phone = normalizeKoreanPhone(input.phone);
  const instagramUsername = normalizeInstagram(input.instagramUsername);

  if (!fullName || fullName.length > 50 || CONTROL.test(fullName)) {
    fields.fullName = "이름을 확인해 주세요.";
  }
  if (
    !email ||
    email.length > 254 ||
    CONTROL.test(email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    fields.email = "이메일 주소를 확인해 주세요.";
  }
  if (!phone) fields.phone = "연락 가능한 전화번호를 확인해 주세요.";
  if (instagramUsername && !/^[a-z0-9_][a-z0-9_.]{0,29}$/.test(instagramUsername)) {
    fields.instagramUsername = "인스타그램 아이디를 확인해 주세요.";
  }
  if (!isUuid(input.requestKey)) {
    fields.requestKey = "유효한 요청 식별자가 필요합니다.";
  }
  if (input.replaceAttemptId !== undefined && !isUuid(input.replaceAttemptId)) {
    fields.replaceAttemptId = "유효한 이전 작업 식별자가 필요합니다.";
  }
  if (input.policyBundleId !== expectedPolicyBundleId) {
    fields.policyBundleId = "최신 동의 내용을 다시 확인해 주세요.";
  }
  const consents = input.consents;
  if (!isRecord(consents) || CONSENT_FIELDS.some((key) => consents[key] !== true)) {
    fields.consents = "필수 동의 항목을 확인해 주세요.";
  }

  if (Object.keys(fields).length > 0) {
    return {
      ok: false,
      fields,
      policyChanged: fields.policyBundleId !== undefined,
    };
  }

  const value: StartRequest & { phone: string } = {
    requestKey: String(input.requestKey).toLowerCase(),
    policyBundleId: expectedPolicyBundleId,
    fullName,
    email,
    phone: phone ?? "",
    instagramUsername,
    consents: { age: true, terms: true, privacy: true, instagramData: true },
  };
  if (typeof input.replaceAttemptId === "string") {
    value.replaceAttemptId = input.replaceAttemptId.toLowerCase();
  }
  return { ok: true, value };
}

export function canonicalPayloadHashPayload(value: StartRequest): unknown {
  return {
    policyBundleId: value.policyBundleId,
    fullName: value.fullName,
    email: value.email,
    phone: value.phone,
    instagramUsername: value.instagramUsername ?? "",
    consents: value.consents,
  };
}
