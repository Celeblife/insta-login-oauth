import { ConnectingClient } from "@/components/onboarding/connecting-client";
import { OnboardingShell } from "@/components/onboarding/shell";
import { getConfig } from "@/lib/config/env";
import { allowsUiPreview } from "@/lib/config/preview";

export default async function ConnectingPage({ searchParams }: { searchParams: Promise<{ attemptId?: string; preview?: string }> }) {
  const params = await searchParams;
  const preview = params.preview === "loading" && allowsUiPreview(getConfig());
  return (
    <OnboardingShell>
      <ConnectingClient attemptId={params.attemptId ?? ""} preview={preview} />
    </OnboardingShell>
  );
}
