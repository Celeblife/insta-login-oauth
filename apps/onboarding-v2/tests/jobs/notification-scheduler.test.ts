import { afterEach, describe, expect, it, vi } from "vitest";

import type { StatusResponse } from "@/lib/contracts/onboarding";
import {
  scheduleCompletedNotificationRetry,
  scheduleNotificationRetryAfterResponse,
} from "@/lib/jobs/notification-scheduler";
import { runNotificationRetryJob } from "@/lib/jobs/notification-retry";

vi.mock("@/lib/jobs/notification-retry", () => ({
  runNotificationRetryJob: vi.fn(),
}));

const originalEnv = { ...process.env };
const runNotificationRetryJobMock = vi.mocked(runNotificationRetryJob);

afterEach(() => {
  vi.restoreAllMocks();
  runNotificationRetryJobMock.mockReset();
  process.env = { ...originalEnv };
});

describe("notification retry after-response scheduler", () => {
  it("schedules the retry job after a completed onboarding response", async () => {
    setValidJobEnv();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    runNotificationRetryJobMock.mockResolvedValue({
      status: "PASS",
      claimed: 1,
      sent: 1,
      failed: 0,
      stale: 0,
      failureCodes: {},
    });
    const tasks: Array<() => Promise<void>> = [];

    scheduleCompletedNotificationRetry(completed(), "complete", {
      after: (task) => {
        tasks.push(task as () => Promise<void>);
      },
    });

    expect(tasks).toHaveLength(1);
    await tasks[0]?.();
    expect(runNotificationRetryJobMock).toHaveBeenCalledWith({
      supabase: expect.any(Object),
      owner: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("does not schedule for non-completed responses", () => {
    const afterFn = vi.fn();

    scheduleCompletedNotificationRetry(
      {
        status: "processing",
        attemptId: "00000000-0000-4000-8000-000000000123",
        revision: 1,
        stage: "account",
        retryAfterMs: 1000,
        submissionIntent: "unknown",
      },
      "complete",
      { after: afterFn },
    );

    expect(afterFn).not.toHaveBeenCalled();
    expect(runNotificationRetryJobMock).not.toHaveBeenCalled();
  });

  it("does not call after when internal notification jobs are disabled", () => {
    setValidJobEnv();
    process.env.NOTIFICATION_RETRY_ENABLED = "false";
    const afterFn = vi.fn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    scheduleNotificationRetryAfterResponse("confirm-account", {
      after: afterFn,
    });

    expect(afterFn).not.toHaveBeenCalled();
    expect(runNotificationRetryJobMock).not.toHaveBeenCalled();
  });

  it("does not run an unawaited fallback when after is unavailable", () => {
    setValidJobEnv();
    const afterFn = vi.fn(() => {
      throw new Error("outside request");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    scheduleNotificationRetryAfterResponse("complete", { after: afterFn });

    expect(afterFn).toHaveBeenCalledOnce();
    expect(runNotificationRetryJobMock).not.toHaveBeenCalled();
  });
});

function completed(): Extract<StatusResponse, { status: "completed" }> {
  return {
    status: "completed",
    attemptId: "00000000-0000-4000-8000-000000000123",
    revision: 2,
    result: {
      kind: "v2",
      requestId: "00000000-0000-4000-8000-000000000777",
      receivedAt: "2026-09-11T00:00:00.000Z",
      fullName: "Creator",
      email: "creator@example.com",
      phone: "+821012345678",
      instagramUsername: "creator",
      connectionKind: "new",
      analysisRequested: true,
      reviewStatus: "pending_review",
    },
  };
}

function jwtWithRole(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function setValidJobEnv() {
  process.env.INTERNAL_JOBS_ENABLED = "true";
  process.env.NOTIFICATION_RETRY_ENABLED = "true";
  process.env.MAIL_ENABLED = "true";
  process.env.APP_ENV = "production";
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_EXPECTED_PROJECT_REF = "project";
  process.env.VERCEL_PROJECT_ID = "vercel-project";
  process.env.VERCEL_PROJECT_ID_EXPECTED = "vercel-project";
  process.env.SUPABASE_SERVICE_ROLE_KEY = jwtWithRole("service_role");
}
