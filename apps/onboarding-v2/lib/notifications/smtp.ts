import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { NotificationMessage } from "./message";

const CONTROL = /[\u0000-\u001f\u007f]/;
const FIXED_NOTIFICATION_TO = "dkssud374@celeblife.co.kr";
const NAVER_WORKS_SMTP_HOST = "smtp.worksmobile.com";
const NAVER_WORKS_SMTP_PORT = 465;
const NAVER_WORKS_SMTP_ACCOUNT = "dkssud374@celeblife.co.kr";
const HOSTNAME = /^(?=.{1,253}$)(?!-)(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,63}$/;

export type SmtpConfig = {
  enabled: boolean;
  host: string | undefined;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  username: string | undefined;
  password: string | undefined;
  from: string | undefined;
  to: string;
  timeoutMs: number;
  messageIdDomain: string;
};

export type SendMailResult = {
  accepted: string[];
  rejected: string[];
  messageId: string;
};

function requireHeaderValue(name: string, value: string | undefined): string {
  if (!value || CONTROL.test(value) || value.includes("\r") || value.includes("\n")) {
    throw new Error(`INVALID_${name}`);
  }
  return value;
}

export function readSmtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig {
  const enabled = env.MAIL_ENABLED === "true";
  const to = env.NOTIFICATION_TO || FIXED_NOTIFICATION_TO;
  if (to !== FIXED_NOTIFICATION_TO) throw new Error("INVALID_NOTIFICATION_TO");

  return {
    enabled,
    host: env.SMTP_HOST || NAVER_WORKS_SMTP_HOST,
    port: Number.parseInt(env.SMTP_PORT || String(NAVER_WORKS_SMTP_PORT), 10),
    secure: env.SMTP_SECURE !== "false",
    requireTLS: env.SMTP_REQUIRE_TLS !== "false",
    username: env.SMTP_USER ?? env.SMTP_USERNAME ?? NAVER_WORKS_SMTP_ACCOUNT,
    password: env.SMTP_PASSWORD,
    from: env.MAIL_FROM ?? env.SMTP_FROM ?? NAVER_WORKS_SMTP_ACCOUNT,
    to,
    timeoutMs: Number.parseInt(env.SMTP_TIMEOUT_MS || "10000", 10),
    messageIdDomain: env.SMTP_MESSAGE_ID_DOMAIN || "celeblife.co.kr",
  };
}

function assertCompleteConfig(config: SmtpConfig): asserts config is SmtpConfig & {
  host: string;
  username: string;
  password: string;
  from: string;
} {
  if (!config.enabled) throw new Error("SMTP_DISABLED");
  if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
    throw new Error("INVALID_SMTP_PORT");
  }
  if (!config.secure && !config.requireTLS) throw new Error("SMTP_REQUIRE_TLS_REQUIRED");
  requireHeaderValue("SMTP_HOST", config.host);
  requireHeaderValue("SMTP_USER", config.username);
  requireHeaderValue("MAIL_FROM", config.from);
  if (!config.password) throw new Error("INVALID_SMTP_PASSWORD");
  requireHeaderValue("SMTP_MESSAGE_ID_DOMAIN", config.messageIdDomain);
  if (!HOSTNAME.test(config.messageIdDomain)) throw new Error("INVALID_SMTP_MESSAGE_ID_DOMAIN");
}

export async function sendNotificationMail(
  message: NotificationMessage,
  config = readSmtpConfig(),
): Promise<SendMailResult> {
  assertCompleteConfig(config);

  const transportOptions: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    auth: {
      user: config.username,
      pass: config.password,
    },
    connectionTimeout: config.timeoutMs,
    greetingTimeout: config.timeoutMs,
    socketTimeout: config.timeoutMs,
  };
  const transporter = nodemailer.createTransport(transportOptions);
  const messageId = `<${message.messageIdLocal}@${config.messageIdDomain}>`;
  const result = await transporter.sendMail({
    from: requireHeaderValue("MAIL_FROM", config.from),
    to: config.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    messageId,
  });

  const accepted = result.accepted.map(String);
  if (!accepted.some((address) => address.toLowerCase() === FIXED_NOTIFICATION_TO.toLowerCase())) {
    throw new Error("SMTP_ACCEPTED_RECIPIENT_REQUIRED");
  }

  return {
    accepted,
    rejected: result.rejected.map(String),
    messageId,
  };
}
