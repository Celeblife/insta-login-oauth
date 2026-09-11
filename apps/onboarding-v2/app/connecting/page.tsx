import { ConnectingClient } from "@/components/onboarding/connecting-client";
import { OnboardingShell } from "@/components/onboarding/shell";

export default async function ConnectingPage({ searchParams }: { searchParams: Promise<{ attemptId?: string; preview?: string }> }) {
  const params = await searchParams;
  const preview = process.env.NODE_ENV === "development" && params.preview === "loading";
  return (
    <OnboardingShell>
      <ConnectingClient attemptId={params.attemptId ?? ""} preview={preview} />
    </OnboardingShell>
  );
}
