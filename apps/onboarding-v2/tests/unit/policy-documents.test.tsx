import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PolicyContent } from "@/components/onboarding/policies";
import { V1_PRIVACY_BODY, V1_PRIVACY_BODY_SHA256, V1_TERMS_BODY, V1_TERMS_BODY_SHA256 } from "@/lib/policies/v1-consent";

function canonicalConsentBody(key: "terms_accepted" | "privacy_accepted") {
  const source = readFileSync(resolve(process.cwd(), "../../src/consent.py"), "utf8");
  const match = source.match(new RegExp(`key="${key}",[\\s\\S]*?body="""([\\s\\S]*?)"""`));
  if (!match?.[1]) throw new Error(`Missing canonical ${key} body`);
  return match[1];
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

describe("v1 policy documents", () => {
  it("keeps v2 service terms byte-identical to the v1 consent body", () => {
    const canonical = canonicalConsentBody("terms_accepted");
    expect(V1_TERMS_BODY).toBe(canonical);
    expect(sha256(V1_TERMS_BODY)).toBe(V1_TERMS_BODY_SHA256);
    expect(V1_TERMS_BODY_SHA256).toBe("bb351d586f401aec43e0c3fbf7e875a2e9a0fdfbd690976ae08ffb5c5d7fbb5f");
  });

  it("keeps v2 privacy and collection copy byte-identical to the v1 consent body", () => {
    const canonical = canonicalConsentBody("privacy_accepted");
    expect(V1_PRIVACY_BODY).toBe(canonical);
    expect(sha256(V1_PRIVACY_BODY)).toBe(V1_PRIVACY_BODY_SHA256);
    expect(V1_PRIVACY_BODY_SHA256).toBe("aef5d3455b047c298d31493f0f878a6d922e0c8e1b5f583ded6ad4763847a602");
  });

  it("renders the v1 terms details with the required late sections", () => {
    const html = renderToStaticMarkup(<PolicyContent type="terms" contactEmail="support@example.com" />);
    expect(html).toContain("제25조 (개별 캠페인 조건의 우선)");
    expect(html).toContain("별표 1 | 소싱 제품 보호 예외 판단 기준");
    expect(html).toContain("별표 2 | 노쇼·취소 운영 원칙");
    expect(html).toContain("부칙");
    expect(html).toContain("DM, 문서 등 기록이 남는 방식");
  });

  it("renders the same v1 privacy details for collection consent and public privacy page", () => {
    const collection = renderToStaticMarkup(<PolicyContent type="collection" contactEmail="support@example.com" />);
    const privacy = renderToStaticMarkup(<PolicyContent type="privacy" contactEmail="support@example.com" />);
    expect(collection).toBe(privacy);
    expect(collection).toContain("최종 업데이트: 2026년 8월 26일");
    expect(collection).toContain("Instagram 개인 메시지(DM)는 수집하거나 분석하지 않습니다.");
    expect(collection).toContain("본 개인정보처리방침은 2026년 8월 26일부터 시행합니다.");
  });
});
