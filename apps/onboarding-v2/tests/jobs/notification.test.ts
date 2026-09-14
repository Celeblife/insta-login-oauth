import { afterEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runNotificationRetryJob } from "@/lib/jobs/notification-retry";
import { buildNotification } from "@/lib/notifications/message";
import { readSmtpConfig, sendNotificationMail } from "@/lib/notifications/smtp";

const originalEnv = { ...process.env };

afterEach(() => {
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
    const supabase = {
      rpc: async (name: string) => {
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
        if (name === "mark_notification_outbox_failed_v2") return { data: true, error: null };
        if (name === "release_job_lease_v2") return { data: true, error: null };
        return { data: null, error: { code: "UNEXPECTED_RPC" } };
      },
    } as unknown as SupabaseClient;

    await expect(
      runNotificationRetryJob({ supabase, owner: "00000000-0000-4000-8000-000000000001" }),
    ).resolves.toMatchObject({ claimed: 1, failed: 1, stale: 0 });
    expect(calls).toEqual([
      "try_acquire_job_lease_v2",
      "claim_notification_outbox_v2",
      "mark_notification_outbox_failed_v2",
      "release_job_lease_v2",
    ]);
  });
});
