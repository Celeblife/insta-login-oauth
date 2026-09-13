import { CompleteClient } from "@/components/onboarding/complete-client";
import { OnboardingShell } from "@/components/onboarding/shell";
import { getConfig } from "@/lib/config/env";
import { allowsUiPreview } from "@/lib/config/preview";
import type { StatusResponse } from "@/components/onboarding/types";

type CompletedStatus = Extract<StatusResponse, { status: "completed" }>;

const samplePreviewStatus = {
  status: "completed",
  attemptId: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  result: {
    kind: "v2",
    requestId: "22222222-2222-4222-8222-222222222222",
    receivedAt: "2026-09-13T00:00:00.000Z",
    fullName: "샘플 셀럽",
    email: "sample@example.invalid",
    phone: "+820000000000",
    instagramUsername: "sample_creator",
    connectionKind: "new",
    analysisRequested: true,
    reviewStatus: "pending_review",
  },
} satisfies CompletedStatus;

export default async function CompletePage({ searchParams }: { searchParams: Promise<{ attemptId?: string; preview?: string }> }) {
  const params = await searchParams;
  const config = getConfig();
  const contactEmail = config.publicContactEmail;
  const previewStatus = params.preview === "success" && allowsUiPreview(config) ? samplePreviewStatus : undefined;
  const attemptId = previewStatus ? samplePreviewStatus.attemptId : params.attemptId ?? "";
  return (
    <OnboardingShell contactEmail={contactEmail}>
      <CompleteClient attemptId={attemptId} contactEmail={contactEmail} previewStatus={previewStatus} />
    </OnboardingShell>
  );
}
