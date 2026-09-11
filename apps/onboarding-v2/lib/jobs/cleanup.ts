import type { SupabaseClient } from "@supabase/supabase-js";
import { rpc } from "./env";

export type CleanupSummary = {
  status: "PASS" | "NOT_RUN";
  expiredSessions: number;
  scrubbedCompletedSessions: number;
  deadNotifications: number;
};

export async function runCleanupJob(options: {
  supabase: SupabaseClient;
  owner: string;
}): Promise<CleanupSummary> {
  const lease = await rpc<boolean>(options.supabase, "try_acquire_job_lease_v2", {
    p_name: "onboarding-cleanup",
    p_owner: options.owner,
    p_lease_seconds: 90,
  });
  if (!lease) {
    return { status: "NOT_RUN", expiredSessions: 0, scrubbedCompletedSessions: 0, deadNotifications: 0 };
  }

  let success = false;
  try {
    const result = await rpc<{
      expired_sessions: number;
      scrubbed_completed_sessions: number;
      dead_notifications: number;
    }>(options.supabase, "cleanup_onboarding_v2", {});
    success = true;
    return {
      status: "PASS",
      expiredSessions: result.expired_sessions,
      scrubbedCompletedSessions: result.scrubbed_completed_sessions,
      deadNotifications: result.dead_notifications,
    };
  } finally {
    await rpc<boolean>(options.supabase, "release_job_lease_v2", {
      p_name: "onboarding-cleanup",
      p_owner: options.owner,
      p_success: success,
    }).catch(() => undefined);
  }
}
