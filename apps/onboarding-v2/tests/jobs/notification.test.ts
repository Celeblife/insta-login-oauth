import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runNotificationRetryJob } from "@/lib/jobs/notification-retry";
import { buildNotification } from "@/lib/notifications/message";
import { classifySmtpFailure, readSmtpConfig, sendNotificationMail, type SmtpConfig } from "@/lib/notifications/smtp";

const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

const originalEnv = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  createTransportMock.mockReset();
  sendMailMock.mockReset();
  process.env = { ...originalEnv };
});

describe("notification message and SMTP guard", () => {
  it("MAIL12 defaults to the approved NAVER WORKS SMTP account", () => {
    expect(readSmtpConfig({})).toMatchObject({
      enabled: false,
      host: "smtp.worksmobile.com",
      port: 465,
      secure: true,
      requireTLS: true,
      username: "dkssud374@celeblife.co.kr",
      from: "dkssud374@celeblife.co.kr",
      to: "dkssud374@celeblife.co.kr",
    });
    expect(readSmtpConfig({ NOTIFICATION_ADDITIONAL_TO: "" })).not.toHaveProperty("additionalTo");
    expect(readSmtpConfig({ NOTIFICATION_ADDITIONAL_TO: "   " })).not.toHaveProperty("additionalTo");
    expect(readSmtpConfig({ NOTIFICATION_ADDITIONAL_TO: " Second.User+alerts@example.com " })).toMatchObject({
      additionalTo: "Second.User+alerts@example.com",
    });
    expect(readSmtpConfig({ NOTIFICATION_ADDITIONAL_TO: " DKSSUD374@celeblife.co.kr " })).toMatchObject({
      additionalTo: "DKSSUD374@celeblife.co.kr",
    });
  });

  it("MAIL12 classifies SMTP failures without exposing provider messages", () => {
    expect(classifySmtpFailure({ code: "EAUTH", response: "535 account details" })).toBe("SMTP_AUTH_FAILED");
    expect(classifySmtpFailure({ code: "ETIMEDOUT", message: "socket timed out" })).toBe("SMTP_TIMEOUT");
    expect(classifySmtpFailure({ code: "ECONNREFUSED", address: "127.0.0.1" })).toBe("SMTP_CONNECTION_FAILED");
    expect(classifySmtpFailure(new Error("SMTP_ACCEPTED_RECIPIENT_REQUIRED"))).toBe("SMTP_RECIPIENT_REJECTED");
    expect(classifySmtpFailure(new Error("provider detail that must not be returned"))).toBe("SMTP_SEND_FAILED");
  });

  it("SE03 MA04 escapes user content and keeps deterministic event/message ids", () => {
    const message = buildNotification({
      requestId: "00000000-0000-4000-8000-000000000123",
      fullName: "<b>Creator</b>",
      email: "creator@example.com",
      phone: "+821012345678",
      instagramUsername: "actual.creator",
      receivedAt: "2026-09-11T00:00:00Z",
    });

    expect(message.eventKey).toBe("creator.connected:00000000-0000-4000-8000-000000000123");
    expect(message.messageIdLocal).toBe("celeblife-00000000-0000-4000-8000-000000000123");
    expect(message.html).toContain("&lt;b&gt;Creator&lt;/b&gt;");
    expect(message.html).not.toContain("<b>Creator</b>");
  });

  it("SE03 MAIL11 MAIL12 rejects CRLF/header injection and non-fixed recipients", async () => {
    expect(() =>
      buildNotification({
        requestId: "00000000-0000-4000-8000-000000000123",
        fullName: "Creator",
        email: "creator@example.com\r\nBcc: attacker@example.com",
        phone: "+821012345678",
        instagramUsername: "actual.creator",
        receivedAt: "2026-09-11T00:00:00Z",
      }),
    ).toThrow("INVALID_NOTIFICATION_FIELD");

    expect(() => readSmtpConfig({ NOTIFICATION_TO: "someone@example.com" })).toThrow(
      "INVALID_NOTIFICATION_TO",
    );
    for (const additionalTo of [
      "second@example.com,third@example.com",
      "second@example.com;third@example.com",
      "Second User <second@example.com>",
      "group:second@example.com;",
      "second example@example.com",
      "second@example.com\r\nBcc: attacker@example.com",
      "second@example.com\t",
      " second@example.com\u00a0",
      "홍길동@example.com",
      "second@localhost",
      `${"a".repeat(65)}@example.com`,
      `${"a".repeat(242)}@example.com`,
    ]) {
      expect(() => readSmtpConfig({ NOTIFICATION_ADDITIONAL_TO: additionalTo })).toThrow(
        "INVALID_NOTIFICATION_ADDITIONAL_TO",
      );
    }
    await expect(
      sendNotificationMail(
        buildNotification({
          requestId: "00000000-0000-4000-8000-000000000123",
          fullName: "Creator",
          email: "creator@example.com",
          phone: "+821012345678",
          instagramUsername: "actual.creator",
          receivedAt: "2026-09-11T00:00:00Z",
        }),
        {
          enabled: false,
          host: undefined,
          port: 465,
          secure: true,
          requireTLS: true,
          username: undefined,
          password: undefined,
          from: undefined,
          to: "dkssud374@celeblife.co.kr",
          timeoutMs: 10000,
          messageIdDomain: "celeblife.co.kr",
        },
      ),
    ).rejects.toThrow("SMTP_DISABLED");
  });

  it("MAIL11 sends primary only when no additional recipient is configured", async () => {
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValue({
      accepted: ["dkssud374@celeblife.co.kr"],
      rejected: [],
    });

    const result = await sendNotificationMail(message(), smtpConfig());

    expect(createTransportMock).toHaveBeenCalledOnce();
    const mail = sendMailMock.mock.calls[0]?.[0];
    expect(mail).toMatchObject({
      to: ["dkssud374@celeblife.co.kr"],
    });
    expect(mail).not.toHaveProperty("cc");
    expect(mail).not.toHaveProperty("bcc");
    expect(result).toMatchObject({
      accepted: ["dkssud374@celeblife.co.kr"],
      rejected: [],
      messageId: "<celeblife-00000000-0000-4000-8000-000000000123@celeblife.co.kr>",
    });
  });

  it("MAIL11 sends to the primary and one configured additional recipient", async () => {
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValue({
      accepted: ["second@example.com", "DKSSUD374@celeblife.co.kr"],
      rejected: [],
    });

    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "second@example.com" }))).resolves.toMatchObject({
      accepted: ["second@example.com", "DKSSUD374@celeblife.co.kr"],
      rejected: [],
    });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["dkssud374@celeblife.co.kr", "second@example.com"],
      }),
    );
  });

  it("MAIL11 dedupes the primary recipient and rejects partial or malformed SMTP acceptance", async () => {
    createTransportMock.mockReturnValue({ sendMail: sendMailMock });
    sendMailMock.mockResolvedValueOnce({
      accepted: ["DKSSUD374@celeblife.co.kr"],
      rejected: [],
    });
    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "DKSSUD374@celeblife.co.kr" }))).resolves.toMatchObject({
      accepted: ["DKSSUD374@celeblife.co.kr"],
      rejected: [],
    });
    expect(sendMailMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        to: ["dkssud374@celeblife.co.kr"],
      }),
    );

    sendMailMock.mockResolvedValueOnce({
      accepted: ["dkssud374@celeblife.co.kr"],
      rejected: ["second@example.com"],
    });
    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "second@example.com" }))).rejects.toThrow(
      "SMTP_ACCEPTED_RECIPIENT_REQUIRED",
    );

    sendMailMock.mockResolvedValueOnce({
      accepted: ["dkssud374@celeblife.co.kr"],
      rejected: [],
    });
    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "second@example.com" }))).rejects.toThrow(
      "SMTP_ACCEPTED_RECIPIENT_REQUIRED",
    );

    sendMailMock.mockResolvedValueOnce({
      accepted: "dkssud374@celeblife.co.kr",
      rejected: [],
    });
    await expect(sendNotificationMail(message(), smtpConfig())).rejects.toThrow("SMTP_ACCEPTED_RECIPIENT_REQUIRED");

    sendMailMock.mockResolvedValueOnce({
      accepted: ["dkssud374@celeblife.co.kr", "second@example.com"],
      rejected: undefined,
    });
    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "second@example.com" }))).rejects.toThrow(
      "SMTP_ACCEPTED_RECIPIENT_REQUIRED",
    );

    sendMailMock.mockResolvedValueOnce({
      accepted: ["dkssud374@celeblife.co.kr", 123],
      rejected: [],
    });
    await expect(sendNotificationMail(message(), smtpConfig())).rejects.toThrow("SMTP_ACCEPTED_RECIPIENT_REQUIRED");

    sendMailMock.mockResolvedValueOnce({
      accepted: ["dkssud374@celeblife.co.kr", "second@example.com"],
      rejected: ["unexpected@example.com"],
    });
    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "second@example.com" }))).rejects.toThrow(
      "SMTP_ACCEPTED_RECIPIENT_REQUIRED",
    );
  });

  it("MAIL11 validates direct SMTP config recipients before opening a transport", async () => {
    await expect(sendNotificationMail(message(), smtpConfig({ to: "attacker@example.com" }))).rejects.toThrow(
      "INVALID_NOTIFICATION_TO",
    );
    await expect(sendNotificationMail(message(), smtpConfig({ additionalTo: "Bad User <bad@example.com>" }))).rejects.toThrow(
      "INVALID_NOTIFICATION_ADDITIONAL_TO",
    );
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("MAIL12 uses canonical SMTP env names and fails closed without STARTTLS", async () => {
    expect(
      readSmtpConfig({
        MAIL_ENABLED: "true",
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "587",
        SMTP_SECURE: "false",
        SMTP_REQUIRE_TLS: "true",
        SMTP_USER: "user",
        SMTP_PASSWORD: "password",
        MAIL_FROM: "CelebLife <no-reply@celeblife.co.kr>",
        SMTP_MESSAGE_ID_DOMAIN: "celeblife.co.kr",
      }),
    ).toMatchObject({
      username: "user",
      from: "CelebLife <no-reply@celeblife.co.kr>",
      requireTLS: true,
    });

    await expect(
      sendNotificationMail(
        buildNotification({
          requestId: "00000000-0000-4000-8000-000000000123",
          fullName: "Creator",
          email: "creator@example.com",
          phone: "+821012345678",
          instagramUsername: "actual.creator",
          receivedAt: "2026-09-11T00:00:00Z",
        }),
        {
          enabled: true,
          host: "smtp.example.com",
          port: 587,
          secure: false,
          requireTLS: false,
          username: "user",
          password: "password",
          from: "no-reply@celeblife.co.kr",
          to: "dkssud374@celeblife.co.kr",
          timeoutMs: 10000,
          messageIdDomain: "bad_host",
        },
      ),
    ).rejects.toThrow("SMTP_REQUIRE_TLS_REQUIRED");
  });

  it("MA04 MAIL11 marks malformed claimed snapshots failed and releases the job lease", async () => {
    process.env.MAIL_ENABLED = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASSWORD = "password";
    process.env.MAIL_FROM = "no-reply@celeblife.co.kr";

    const calls: string[] = [];
    const failedArgs: Record<string, unknown>[] = [];
    const supabase = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push(name);
        if (name === "try_acquire_job_lease_v2") return { data: true, error: null };
        if (name === "claim_notification_outbox_v2") {
          return {
            data: [
              {
                outbox_id: "00000000-0000-4000-8000-000000000777",
                request_id: "00000000-0000-4000-8000-000000000123",
                event_key: "creator.connected:00000000-0000-4000-8000-000000000123",
                full_name: "Creator\r\nBcc: attacker@example.com",
                email: "creator@example.com",
                phone: "+821012345678",
                instagram_username: "actual.creator",
                received_at: "2026-09-11T00:00:00.000000Z",
                is_reconnection: false,
              },
            ],
            error: null,
          };
        }
        if (name === "mark_notification_outbox_failed_v2") {
          failedArgs.push(args);
          return { data: true, error: null };
        }
        if (name === "release_job_lease_v2") return { data: true, error: null };
        return { data: null, error: { code: "UNEXPECTED_RPC" } };
      },
    } as unknown as SupabaseClient;

    await expect(
      runNotificationRetryJob({ supabase, owner: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toMatchObject({ claimed: 1, failed: 1, stale: 0, failureCodes: { SMTP_MESSAGE_INVALID: 1 } });
    expect(failedArgs).toEqual([
      expect.objectContaining({ p_error_code: "SMTP_MESSAGE_INVALID" }),
    ]);
    expect(calls).toEqual([
      "try_acquire_job_lease_v2",
      "claim_notification_outbox_v2",
      "mark_notification_outbox_failed_v2",
      "release_job_lease_v2",
    ]);
  });
});

function message() {
  return buildNotification({
    requestId: "00000000-0000-4000-8000-000000000123",
    fullName: "Creator",
    email: "creator@example.com",
    phone: "+821012345678",
    instagramUsername: "actual.creator",
    receivedAt: "2026-09-11T00:00:00Z",
  });
}

function smtpConfig(overrides: Partial<SmtpConfig> = {}): SmtpConfig {
  return {
    enabled: true,
    host: "smtp.example.com",
    port: 465,
    secure: true,
    requireTLS: true,
    username: "user",
    password: "password",
    from: "no-reply@celeblife.co.kr",
    to: "dkssud374@celeblife.co.kr",
    timeoutMs: 10000,
    messageIdDomain: "celeblife.co.kr",
    ...overrides,
  };
}
