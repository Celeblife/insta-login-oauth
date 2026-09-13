import type { PublicErrorCode } from "@/lib/contracts/onboarding";

export type OnboardingEvent = {
  name:
    | "bootstrap"
    | "start"
    | "callback_code_checkpointed"
    | "callback_rejected"
    | "legacy_callback_failed"
    | "complete_claimed"
    | "short_exchange_started"
    | "short_token_checkpointed"
    | "long_exchange_started"
    | "long_token_checkpointed"
    | "account_checkpointed"
    | "completed"
    | "failed";
  traceId?: string;
  attemptId?: string;
  revision?: number;
  code?: PublicErrorCode;
  status?: string;
};

export function logOnboardingEvent(event: OnboardingEvent): void {
  const safe = Object.fromEntries(
    Object.entries(event).filter(([, value]) => value !== undefined && value !== null),
  );
  console.info("onboarding_v2", JSON.stringify(safe));
}
