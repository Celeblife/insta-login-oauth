import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { StartRequest } from "@/lib/contracts/onboarding";
import { canonicalPayloadHashPayload, validateStart } from "@/lib/domain/validation";

describe("onboarding validation canonical payload", () => {
  it("excludes request/replacement identifiers while preserving submitted field and consent differences", () => {
    const base = validStart({ requestKey: randomUUID() });
    expect(canonicalPayloadHashPayload(validStart({ requestKey: randomUUID(), replaceAttemptId: randomUUID() }))).toEqual(canonicalPayloadHashPayload(base));
    expect(canonicalPayloadHashPayload(validStart({ requestKey: randomUUID(), email: "changed@example.com" }))).not.toEqual(canonicalPayloadHashPayload(base));
    expect(canonicalPayloadHashPayload({ ...validStart({ requestKey: randomUUID() }), consents: { ...base.consents, privacy: false as unknown as true } })).not.toEqual(canonicalPayloadHashPayload(base));
  });

  it("accepts start requests without a celebrity ID and stores an internal empty username placeholder", () => {
    const withoutInstagramUsername: Record<string, unknown> = { ...validStart() };
    delete withoutInstagramUsername.instagramUsername;

    expect(validateStart(withoutInstagramUsername, "approved-bundle")).toMatchObject({
      ok: true,
      value: { fullName: "김셀럽", phone: "+821000000000", email: "creator@example.com", instagramUsername: "" },
    });
  });
});

function validStart(overrides: Partial<StartRequest> = {}): StartRequest {
  return {
    requestKey: randomUUID(),
    policyBundleId: "approved-bundle",
    fullName: "김셀럽",
    email: "creator@example.com",
    phone: "+821000000000",
    instagramUsername: "celeblife_demo",
    consents: { age: true, terms: true, privacy: true, instagramData: true },
    ...overrides,
  };
}
