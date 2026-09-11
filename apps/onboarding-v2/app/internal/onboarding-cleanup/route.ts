import { NextResponse } from "next/server";
import { assertInternalJobRequest } from "@/lib/jobs/env";
import { runCleanupJob } from "@/lib/jobs/cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const guard = assertInternalJobRequest(request, "ONBOARDING_CLEANUP_ENABLED");
  if (!guard.ok) return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });

  const result = await runCleanupJob({
    supabase: guard.supabase,
    owner: guard.owner,
  });
  return NextResponse.json({ ok: true, job: "onboarding-cleanup", result });
}

export const GET = handle;
export const POST = handle;
