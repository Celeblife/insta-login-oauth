import { describe, expect, it } from "vitest";
import { errorCopy, normalizeInstagramUsername, shouldAcceptStatus, validateApplyFields } from "@/components/onboarding/flow";
import type { StatusResponse } from "@/components/onboarding/types";

const attemptId = "a33717b1-8009-40e4-a9a9-5d4e4ed4906d";

describe("onboarding UI contract helpers", () => {
  it("UI02 allows a one-character name without asking for a celebrity ID", () => {
    const errors = validateApplyFields({
      fullName: "김",
      phone: "010-0000-0000",
      email: "creator@example.com",
      consents: { age: true, terms: true, privacy: true, instagramData: true },
    });

    expect(errors).toEqual({});
    expect(normalizeInstagramUsername("@Celeb.Life_01")).toBe("celeb.life_01");
  });

  it("UI02 rejects missing required consent without changing policy viewing into consent", () => {
    const errors = validateApplyFields({
      fullName: "김셀럽",
      phone: "+821012345678",
      email: "creator@example.com",
      consents: { age: true, terms: false, privacy: true, instagramData: true },
    });

    expect(errors.consents).toBe("필수 동의를 모두 확인해 주세요.");
  });

  it("LAST02 does not let completed state move backwards to any non-completed status for the same attempt", () => {
    const completed: StatusResponse = {
      status: "completed",
      attemptId,
      revision: 5,
      result: {
        kind: "v2",
        requestId: "b1c9a751-283b-4e88-97cc-8229c74059d4",
        receivedAt: "2026-09-10T06:00:30Z",
        fullName: "김셀럽",
        email: "creator@example.com",
        phone: "+821000000000",
        instagramUsername: "celeblife_demo",
        connectionKind: "new",
        analysisRequested: true,
        reviewStatus: "pending_review",
      },
    };
    const staleStatuses: StatusResponse[] = [
      { status: "processing", attemptId, revision: 6, stage: "storage", retryAfterMs: 2_000, submissionIntent: "unknown" },
      { status: "awaiting_oauth", attemptId, revision: 6, expiresAt: "2026-09-11T00:10:00.000Z" },
      { status: "account_confirmation_required", attemptId, revision: 6, enteredUsername: "old", connectedUsername: "new" },
      { status: "failed", attemptId, revision: 6, code: "PROVIDER_UNAVAILABLE", retryAction: "retry_status", draftAvailable: false },
    ];

    for (const stale of staleStatuses) {
      expect(shouldAcceptStatus(completed, stale, attemptId)).toBe(false);
    }
  });

  it("AUDIT rejects status from a different attempt", () => {
    const incoming: StatusResponse = {
      status: "processing",
      attemptId: "b33717b1-8009-40e4-a9a9-5d4e4ed4906d",
      revision: 10,
      stage: "account",
      retryAfterMs: 2_000,
      submissionIntent: "unknown",
    };

    expect(shouldAcceptStatus(null, incoming, attemptId)).toBe(false);
  });

  it("UI07 only promises draft recovery when the server marks OAUTH_CANCELLED draftAvailable", () => {
    expect(errorCopy("OAUTH_CANCELLED", true).body).toContain("입력한 정보가 남아 있어요");
    expect(errorCopy("OAUTH_CANCELLED", false).body).not.toContain("입력한 정보가 남아 있어요");
  });

  it("UI07 maps every retry action label", async () => {
    const { retryActionLabel, startResponsePath } = await import("@/components/onboarding/flow");

    expect(retryActionLabel("retry_status")).toBe("상태 다시 확인");
    expect(retryActionLabel("retry_complete")).toBe("완료 처리 다시 요청");
    expect(retryActionLabel("restart_oauth")).toBe("다시 연결하기");
    expect(retryActionLabel("return_form")).toBe("정보 입력으로 돌아가기");
    expect(startResponsePath({ action: "resume", attemptId, revision: 1, nextPath: "/connecting" })).toBe(`/connecting?attemptId=${attemptId}`);
  });
});
