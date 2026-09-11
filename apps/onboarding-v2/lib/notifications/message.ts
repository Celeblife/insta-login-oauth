const CONTROL = /[\u0000-\u001f\u007f]/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NotificationInput = {
  requestId: string;
  fullName: string;
  email: string;
  phone: string;
  instagramUsername: string;
  receivedAt: string;
  isReconnection?: boolean;
};

export type NotificationMessage = {
  subject: string;
  text: string;
  html: string;
  eventKey: string;
  messageIdLocal: string;
};

function safe(value: unknown, limit = 254): string {
  if (typeof value !== "string") throw new Error("INVALID_NOTIFICATION_FIELD");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > limit || CONTROL.test(trimmed)) {
    throw new Error("INVALID_NOTIFICATION_FIELD");
  }
  return trimmed;
}

export function escapeHtml(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function buildNotification(input: NotificationInput): NotificationMessage {
  const requestId = safe(input.requestId, 36);
  if (!UUID.test(requestId)) throw new Error("INVALID_REQUEST_ID");

  const fullName = safe(input.fullName, 50);
  const email = safe(input.email);
  const phone = safe(input.phone, 30);
  const username = safe(input.instagramUsername, 30);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$/.test(username)) {
    throw new Error("INVALID_USERNAME");
  }

  const receivedAt = safe(input.receivedAt, 40);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(receivedAt) || !Number.isFinite(Date.parse(receivedAt))) {
    throw new Error("INVALID_RECEIVED_AT");
  }

  const receivedKst = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(receivedAt));
  const isReconnection = input.isReconnection === true;
  const kind = isReconnection ? "재연동" : "신규 등록";
  const status = isReconnection
    ? "연결 정보 갱신 / 신규 분석 신청 없음"
    : "연동 완료 / 담당자 확인 대기";
  const subject = `[셀럽라이프] ${kind} 접수 - @${username}`;
  const pairs = [
    ["이름", fullName],
    ["인스타그램", `@${username}`],
    ["이메일", email],
    ["연락처", phone],
    ["접수번호", requestId],
    ["접수시각", `${receivedKst} (KST)`],
    ["상태", status],
  ] as const;

  return {
    subject,
    text: pairs.map(([key, value]) => `${key}: ${value}`).join("\n"),
    html:
      `<h2>${escapeHtml(subject)}</h2><table>` +
      pairs
        .map(
          ([key, value]) =>
            `<tr><th align="left">${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`,
        )
        .join("") +
      "</table>",
    eventKey: `creator.connected:${requestId}`,
    messageIdLocal: `celeblife-${requestId}`,
  };
}
