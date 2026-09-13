import { cookies } from "next/headers";
import { LegacyTerminalComplete, LegacyTerminalUnavailable } from "@/components/onboarding/legacy-terminal-client";
import { OnboardingShell } from "@/components/onboarding/shell";
import { getConfig } from "@/lib/config/env";
import { readLegacyTerminalReceipt } from "@/lib/legacy/terminal-receipt";
import { sha256Hmac } from "@/lib/security/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LegacyCompletePage() {
  const config = getConfig();
  const cookieStore = await cookies();
  const browserSecret = cookieStore.get(config.cookieName)?.value;
  const receipt = browserSecret
    ? readLegacyTerminalReceipt(config, sha256Hmac(config.browserSecretKey, browserSecret), cookieStore.toString())
    : null;

  return (
    <OnboardingShell contactEmail={config.publicContactEmail}>
      {receipt ? <LegacyTerminalComplete instagramUsername={receipt.instagramUsername} /> : <LegacyTerminalUnavailable />}
    </OnboardingShell>
  );
}
