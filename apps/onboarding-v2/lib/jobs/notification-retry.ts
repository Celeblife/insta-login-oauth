import type { SupabaseClient } from "@supabase/supabase-js";
import { buildNotification } from "../notifications/message";
import { classifySmtpFailure, readSmtpConfig, sendNotificationMail, type SmtpFailureCode } from "../notifications/smtp";
import { readPositiveInt, rpc } from "./env";

export type OutboxClaim = {
  outbox_id: string;
  request_id: string;
  event_key: string;
  full_name: string;
  email: string;
  phone: string;
  instagram_username: string;
  received_at: string;
  is_reconnection: boolean;
};

export type NotificationRetrySummary = {
  status: "PASS" | "NOT_RUN";
  claimed: number;
  sent: number;
  failed: number;
  stale: number;
  failureCodes: Partial<Record<SmtpFailureCode, number>>;
};

export async function runNotificationRetryJob(options: {
  supabase: SupabaseClient;
  owner: string;
}): Promise<NotificationRetrySummary> {
  const smtp = readSmtpConfig();
  if (!smtp.enabled) return { status: "NOT_RUN", claimed: 0, sent: 0, failed: 0, stale: 0, failureCodes: {} };

  const lease = await rpc<boolean>(options.supabase, "try_acquire_job_lease_v2", {
    p_name: "notification-retry",
    p_owner: options.owner,
    p_lease_seconds: 90,
  });
  if (!lease) return { status: "NOT_RUN", claimed: 0, sent: 0, failed: 0, stale: 0, failureCodes: {} };

  const summary: NotificationRetrySummary = {
    status: "PASS",
    claimed: 0,
    sent: 0,
    failed: 0,
    stale: 0,
    failureCodes: {},
  };

  try {
    const claimed = await rpc<OutboxClaim[]>(options.supabase, "claim_notification_outbox_v2", {
      p_owner: options.owner,
      p_limit: readPositiveInt("JOB_BATCH_SIZE", 25),
      p_lease_seconds: 90,
    });
    summary.claimed = claimed.length;

    for (const item of claimed) {
      try {
        const message = buildNotification({
          requestId: item.request_id,
          fullName: item.full_name,
          email: item.email,
          phone: item.phone,
          instagramUsername: item.instagram_username,
          receivedAt: item.received_at,
          isReconnection: item.is_reconnection,
        });
        const delivery = await sendNotificationMail(message, smtp);
        const marked = await rpc<boolean>(options.supabase, "mark_notification_outbox_sent_v2", {
          p_outbox_id: item.outbox_id,
          p_owner: options.owner,
          p_delivery: delivery,
        });
        if (marked) summary.sent += 1;
        else summary.stale += 1;
      } catch (error) {
        const failureCode = classifySmtpFailure(error);
        const marked = await rpc<boolean>(options.supabase, "mark_notification_outbox_failed_v2", {
          p_outbox_id: item.outbox_id,
          p_owner: options.owner,
          p_error_code: failureCode,
        });
        if (marked) {
          summary.failed += 1;
          summary.failureCodes[failureCode] = (summary.failureCodes[failureCode] ?? 0) + 1;
        } else summary.stale += 1;
      }
    }
    return summary;
  } finally {
    await rpc<boolean>(options.supabase, "release_job_lease_v2", {
      p_name: "notification-retry",
      p_owner: options.owner,
      p_success: summary.failed === 0,
    }).catch(() => undefined);
  }
}
