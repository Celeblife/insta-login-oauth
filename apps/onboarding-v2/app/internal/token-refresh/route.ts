import { NextResponse } from "next/server";
import { assertInternalJobRequest } from "@/lib/jobs/env";
import { runTokenRefreshJob } from "@/lib/jobs/token-refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const guard = assertInternalJobRequest(request, "TOKEN_REFRESH_ENABLED");
  if (!guard.ok) return NextResponse.json({ ok: false, code: guard.code }, { status: guard.status });

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const result = await runTokenRefreshJob({
    supabase: guard.supabase,
    owner: guard.owner,
    dryRun,
  });
  return NextResponse.json({ ok: result.failed === 0, job: "token-refresh", result });
}

export const GET = handle;
export const POST = handle;
