import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runNotificationRetryJob } from "@/lib/jobs/notification-retry";

const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

const originalEnv = { ...process.env };
const owner = "00000000-0000-4000-8000-000000000001";

afterEach(() => {
  vi.restoreAllMocks();
  createTransportMock.mockReset();
  sendMailMock.mockReset();
  process.env = { ...originalEnv };
});

describe("notification retry SMTP delivery", () => {
  it("marks a claimed notification sent only after both configured recipients are accepted", async () => {
    setValidSmtpEnv();
    process.env.NOTIFICATION_ADDITIONAL_TO = "second@example.com";
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValue({
      accepted: ["second@example.com", "dkssud374@celeblife.co.kr"],
      rejected: [],
    });
    const rpcCalls: RpcCall[] = [];
    const supabase = supabaseWithRpc(rpcCalls, {
      claim_notification_outbox_v2: [claim()],
      mark_notification_outbox_sent_v2: true,
    });

    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      status: "PASS",
      claimed: 1,
      sent: 1,
      failed: 0,
      stale: 0,
      failureCodes: {},
    });

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["dkssud374@celeblife.co.kr", "second@example.com"],
        messageId: "<celeblife-00000000-0000-4000-8000-000000000123@celeblife.co.kr>",
      }),
    );
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "try_acquire_job_lease_v2",
      "claim_notification_outbox_v2",
      "mark_notification_outbox_sent_v2",
      "release_job_lease_v2",
    ]);
    expect(rpcCalls[2]?.args).toMatchObject({
      p_outbox_id: "00000000-0000-4000-8000-000000000777",
      p_owner: owner,
      p_delivery: {
        accepted: ["second@example.com", "dkssud374@celeblife.co.kr"],
        rejected: [],
        messageId: "<celeblife-00000000-0000-4000-8000-000000000123@celeblife.co.kr>",
      },
    });
  });

  it("marks partial recipient acceptance failed and leaves the same event retryable", async () => {
    setValidSmtpEnv();
    process.env.NOTIFICATION_ADDITIONAL_TO = "second@example.com";
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValue({
      accepted: ["dkssud374@celeblife.co.kr"],
      rejected: ["second@example.com"],
    });
    const rpcCalls: RpcCall[] = [];
    const supabase = supabaseWithRpc(rpcCalls, {
      claim_notification_outbox_v2: [claim()],
      mark_notification_outbox_failed_v2: true,
    });

    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      status: "PASS",
      claimed: 1,
      sent: 0,
      failed: 1,
      stale: 0,
      failureCodes: { SMTP_RECIPIENT_REJECTED: 1 },
    });

    expect(rpcCalls.map((call) => call.name)).toEqual([
      "try_acquire_job_lease_v2",
      "claim_notification_outbox_v2",
      "mark_notification_outbox_failed_v2",
      "release_job_lease_v2",
    ]);
    expect(rpcCalls[2]?.args).toMatchObject({
      p_outbox_id: "00000000-0000-4000-8000-000000000777",
      p_owner: owner,
      p_error_code: "SMTP_RECIPIENT_REJECTED",
    });
  });

  it("retries the same event with stable ids and all configured recipients after a partial failure", async () => {
    setValidSmtpEnv();
    process.env.NOTIFICATION_ADDITIONAL_TO = "second@example.com";
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock
      .mockResolvedValueOnce({
        accepted: ["dkssud374@celeblife.co.kr"],
        rejected: ["second@example.com"],
      })
      .mockResolvedValueOnce({
        accepted: ["dkssud374@celeblife.co.kr", "second@example.com"],
        rejected: [],
      });
    const rpcCalls: RpcCall[] = [];
    const retryClaim = claim();
    const supabase = supabaseWithRpc(rpcCalls, {
      claim_notification_outbox_v2: [[retryClaim], [retryClaim]],
      mark_notification_outbox_failed_v2: true,
      mark_notification_outbox_sent_v2: true,
    });

    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      failed: 1,
      failureCodes: { SMTP_RECIPIENT_REJECTED: 1 },
    });
    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      failed: 0,
      failureCodes: {},
    });

    expect(sendMailMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        to: ["dkssud374@celeblife.co.kr", "second@example.com"],
        messageId: "<celeblife-00000000-0000-4000-8000-000000000123@celeblife.co.kr>",
      }),
    );
    expect(sendMailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: ["dkssud374@celeblife.co.kr", "second@example.com"],
        messageId: "<celeblife-00000000-0000-4000-8000-000000000123@celeblife.co.kr>",
      }),
    );
    expect(rpcCalls.filter((call) => call.name === "mark_notification_outbox_failed_v2")).toHaveLength(1);
    expect(rpcCalls.filter((call) => call.name === "mark_notification_outbox_sent_v2")).toHaveLength(1);
  });

  it("keeps one recipient snapshot during a batch and reads changed env on the next invocation", async () => {
    setValidSmtpEnv();
    process.env.NOTIFICATION_ADDITIONAL_TO = "second@example.com";
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock
      .mockImplementationOnce(async () => {
        process.env.NOTIFICATION_ADDITIONAL_TO = "third@example.com";
        return {
          accepted: ["dkssud374@celeblife.co.kr", "second@example.com"],
          rejected: [],
        };
      })
      .mockResolvedValueOnce({
        accepted: ["dkssud374@celeblife.co.kr", "second@example.com"],
        rejected: [],
      })
      .mockResolvedValueOnce({
        accepted: ["dkssud374@celeblife.co.kr", "third@example.com"],
        rejected: [],
      });
    const rpcCalls: RpcCall[] = [];
    const supabase = supabaseWithRpc(rpcCalls, {
      claim_notification_outbox_v2: [
        [
          claim(),
          claim({
            outbox_id: "00000000-0000-4000-8000-000000000778",
            request_id: "00000000-0000-4000-8000-000000000124",
            instagram_username: "second.creator",
          }),
        ],
        [claim({ outbox_id: "00000000-0000-4000-8000-000000000779" })],
      ],
      mark_notification_outbox_sent_v2: true,
    });

    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      claimed: 2,
      sent: 2,
      failed: 0,
    });
    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      claimed: 1,
      sent: 1,
      failed: 0,
    });

    expect(sendMailMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: ["dkssud374@celeblife.co.kr", "second@example.com"] }),
    );
    expect(sendMailMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: ["dkssud374@celeblife.co.kr", "second@example.com"] }),
    );
    expect(sendMailMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ to: ["dkssud374@celeblife.co.kr", "third@example.com"] }),
    );
  });

  it("returns NOT_RUN without RPC or SMTP transport when mail is disabled", async () => {
    setValidSmtpEnv();
    process.env.MAIL_ENABLED = "false";
    process.env.NOTIFICATION_ADDITIONAL_TO = "second@example.com";
    const rpcCalls: RpcCall[] = [];
    const supabase = supabaseWithRpc(rpcCalls, {});

    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toEqual({
      status: "NOT_RUN",
      claimed: 0,
      sent: 0,
      failed: 0,
      stale: 0,
      failureCodes: {},
    });
    expect(rpcCalls).toEqual([]);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("counts sent RPC conflicts as stale after SMTP delivery succeeds", async () => {
    setValidSmtpEnv();
    process.env.NOTIFICATION_ADDITIONAL_TO = "second@example.com";
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValue({
      accepted: ["dkssud374@celeblife.co.kr", "second@example.com"],
      rejected: [],
    });
    const rpcCalls: RpcCall[] = [];
    const supabase = supabaseWithRpc(rpcCalls, {
      claim_notification_outbox_v2: [claim()],
      mark_notification_outbox_sent_v2: false,
    });

    await expect(runNotificationRetryJob({ supabase, owner })).resolves.toMatchObject({
      claimed: 1,
      sent: 0,
      failed: 0,
      stale: 1,
    });
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "try_acquire_job_lease_v2",
      "claim_notification_outbox_v2",
      "mark_notification_outbox_sent_v2",
      "release_job_lease_v2",
    ]);
  });

  it("validates notification recipient config before acquiring a lease or claiming events", async () => {
    setValidSmtpEnv();
    process.env.NOTIFICATION_ADDITIONAL_TO = "Second User <second@example.com>";
    const rpcCalls: RpcCall[] = [];
    const supabase = supabaseWithRpc(rpcCalls, {});

    await expect(runNotificationRetryJob({ supabase, owner })).rejects.toThrow("INVALID_NOTIFICATION_ADDITIONAL_TO");
    expect(rpcCalls).toEqual([]);
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

type ClaimFixture = {
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

function supabaseWithRpc(rpcCalls: RpcCall[], responses: Record<string, unknown>): SupabaseClient {
  const responseQueues = new Map(
    Object.entries(responses).map(([name, value]) => [name, Array.isArray(value) && Array.isArray(value[0]) ? [...value] : undefined]),
  );
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "try_acquire_job_lease_v2") return { data: true, error: null };
      if (name === "release_job_lease_v2") return { data: true, error: null };
      const queued = responseQueues.get(name);
      if (queued) return { data: queued.shift() ?? null, error: null };
      return { data: responses[name] ?? null, error: null };
    },
  } as unknown as SupabaseClient;
}

function claim(overrides: Partial<ClaimFixture> = {}): ClaimFixture {
  return {
    outbox_id: "00000000-0000-4000-8000-000000000777",
    request_id: "00000000-0000-4000-8000-000000000123",
    event_key: "creator.connected:00000000-0000-4000-8000-000000000123",
    full_name: "Creator",
    email: "creator@example.com",
    phone: "+821012345678",
    instagram_username: "actual.creator",
    received_at: "2026-09-11T00:00:00.000000Z",
    is_reconnection: false,
    ...overrides,
  };
}

function setValidSmtpEnv() {
  process.env.MAIL_ENABLED = "true";
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_USER = "user";
  process.env.SMTP_PASSWORD = "password";
  process.env.MAIL_FROM = "no-reply@celeblife.co.kr";
}
