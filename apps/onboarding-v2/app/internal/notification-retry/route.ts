import { NextResponse } from "next/server";
import { assertInternalJobRequest } from "@/lib/jobs/env";
import { runNotificationRetryJob } from "@/lib/jobs/notification-retry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const guard = assertInternalJobRequest(request, "NOTIFICATION_RETRY_ENABLED");
  if (!guard.ok) return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });

  const result = await runNotificationRetryJob({
    supabase: guard.supabase,
    owner: guard.owner,
  });
  return NextResponse.json({ ok: result.failed === 0, job: "notification-retry", result });
}

export const GET = handle;
export const POST = handle;
