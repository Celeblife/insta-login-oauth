import { getConfig } from "@/lib/config/env";
import { clearLegacyTerminalReceiptCookie, readLegacyTerminalReceipt } from "@/lib/legacy/terminal-receipt";
import { jsonResponse } from "@/lib/services/http";
import { sha256Hmac } from "@/lib/security/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const config = getConfig();
  const cookieHeader = request.headers.get("cookie");
  const browserSecret = parseCookies(cookieHeader)[config.cookieName];
  const receipt = browserSecret
    ? readLegacyTerminalReceipt(config, sha256Hmac(config.browserSecretKey, browserSecret), cookieHeader)
    : null;

  return jsonResponse({ ok: Boolean(receipt) }, { status: receipt ? 200 : 401 }, clearLegacyTerminalReceiptCookie(config));
}

function parseCookies(header: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return result;
}
