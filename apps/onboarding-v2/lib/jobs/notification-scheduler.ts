import { after } from "next/server";

import type { StatusResponse } from "@/lib/contracts/onboarding";
import { buildTrustedJobContext } from "@/lib/jobs/env";
import { runNotificationRetryJob } from "@/lib/jobs/notification-retry";

type NotificationTrigger = "complete" | "confirm-account";
type AfterFn = typeof after;

export function scheduleCompletedNotificationRetry(
  response: StatusResponse,
  trigger: NotificationTrigger,
  options: { after?: AfterFn } = {},
): void {
  if (response.status !== "completed") return;
  scheduleNotificationRetryAfterResponse(trigger, options);
}

export function scheduleNotificationRetryAfterResponse(
  trigger: NotificationTrigger,
  options: { after?: AfterFn } = {},
): void {
  if (process.env.MAIL_ENABLED !== "true") {
    logNotificationRetry("not_scheduled", trigger, "MAIL_DISABLED");
    return;
  }
  const context = buildTrustedJobContext("NOTIFICATION_RETRY_ENABLED");
  if (!context.ok) {
    logNotificationRetry("not_scheduled", trigger, context.code);
    return;
  }

  const afterFn = options.after ?? after;
  const task = async () => {
    try {
      const result = await runNotificationRetryJob({
        supabase: context.supabase,
        owner: context.owner,
      });
      logNotificationRetry(result.failed === 0 ? "completed" : "failed", trigger, result.status);
    } catch {
      logNotificationRetry("failed", trigger, "JOB_ERROR");
    }
  };

  try {
    afterFn(task);
  } catch {
    logNotificationRetry("not_scheduled", trigger, "AFTER_UNAVAILABLE");
  }
}

function logNotificationRetry(
  outcome: "not_scheduled" | "completed" | "failed",
  trigger: NotificationTrigger,
  code: string,
): void {
  const payload = { outcome, trigger, code };
  if (outcome === "completed") console.info("[notification-retry-after-response]", payload);
  else console.warn("[notification-retry-after-response]", payload);
}
