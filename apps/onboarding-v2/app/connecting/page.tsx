import { ConnectingClient } from "@/components/onboarding/connecting-client";
import { OnboardingShell } from "@/components/onboarding/shell";

export default async function ConnectingPage({ searchParams }: { searchParams: Promise<{ attemptId?: string }> }) {
  const params = await searchParams;
  return (
    <OnboardingShell>
      <ConnectingClient attemptId={params.attemptId ?? ""} />
    </OnboardingShell>
  );
}
