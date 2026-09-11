import { CompleteClient } from "@/components/onboarding/complete-client";
import { OnboardingShell } from "@/components/onboarding/shell";
import { getConfig } from "@/lib/config/env";

export default async function CompletePage({ searchParams }: { searchParams: Promise<{ attemptId?: string }> }) {
  const params = await searchParams;
  const contactEmail = getConfig().publicContactEmail;
  return (
    <OnboardingShell contactEmail={contactEmail}>
      <CompleteClient attemptId={params.attemptId ?? ""} contactEmail={contactEmail} />
    </OnboardingShell>
  );
}
