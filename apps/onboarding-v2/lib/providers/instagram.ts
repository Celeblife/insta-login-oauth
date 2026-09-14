import type { AppConfig } from "@/lib/config/env";
import { PublicApiError } from "@/lib/domain/errors";

export type InstagramShortToken = {
  accessToken: string;
  providerUserId: string;
  grantedScopes: readonly string[];
};

export type InstagramToken = InstagramShortToken & { expiresAt: string };

export type InstagramAccount = {
  providerAccountId: string;
  username: string;
  accountType: "business" | "creator" | "personal" | "unknown";
};

export class AmbiguousProviderExchangeError extends PublicApiError {
  constructor() {
    super("PROVIDER_UNAVAILABLE", 502, { message: "AMBIGUOUS_PROVIDER_EXCHANGE" });
    this.name = "AmbiguousProviderExchangeError";
  }
}

export interface InstagramProvider {
  buildAuthorizeUrl(input: { state: string }): string;
  exchangeCodeForShortToken(input: { code: string }): Promise<InstagramShortToken>;
  exchangeShortTokenForLongToken(input: { shortToken: InstagramShortToken }): Promise<InstagramToken>;
  fetchAccount(input: { token: InstagramToken }): Promise<InstagramAccount>;
}

export function createInstagramProvider(config: AppConfig): InstagramProvider {
  if (config.providerMode === "instagram") return new FetchInstagramProvider(config);
  return new MockInstagramProvider(config);
}

class MockInstagramProvider implements InstagramProvider {
  constructor(private readonly config: AppConfig) {}

  buildAuthorizeUrl(input: { state: string }): string {
    const url = new URL(this.config.instagram.oauthAuthorizeBaseUrl);
    url.searchParams.set("client_id", this.config.instagram.clientId);
    url.searchParams.set("redirect_uri", this.config.instagram.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.config.instagram.requiredPermissions.join(","));
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  async exchangeCodeForShortToken(input: { code: string }): Promise<InstagramShortToken> {
    if (input.code === "timeout") throw new AmbiguousProviderExchangeError();
    if (input.code === "malformed_expiry") throw new PublicApiError("PROVIDER_UNAVAILABLE");
    const scopes = input.code === "missing_scope" ? ["instagram_business_basic"] : this.config.instagram.requiredPermissions;
    assertRequiredScopes(scopes, this.config.instagram.requiredPermissions);
    return {
      accessToken: `mock-short-${input.code}`,
      providerUserId: input.code === "mismatch_user_id" ? "ig_expected" : providerIdFromCode(input.code),
      grantedScopes: scopes,
    };
  }

  async exchangeShortTokenForLongToken(input: { shortToken: InstagramShortToken }): Promise<InstagramToken> {
    if (input.shortToken.accessToken.includes("long_timeout")) throw new AmbiguousProviderExchangeError();
    return {
      accessToken: input.shortToken.accessToken.replace("mock-short-", "mock-long-"),
      providerUserId: input.shortToken.providerUserId,
      expiresAt: expiryFromPositiveSeconds(60 * 24 * 60 * 60),
      grantedScopes: input.shortToken.grantedScopes,
    };
  }

  async fetchAccount(input: { token: InstagramToken }): Promise<InstagramAccount> {
    assertRequiredScopes(input.token.grantedScopes, this.config.instagram.requiredPermissions);
    const suffix = input.token.accessToken.replace(/^mock-long-/, "") || "celeblife_demo";
    const username = suffix.startsWith("user_") ? suffix.slice("user_".length) : suffix;
    if (username === "unsupported") throw new PublicApiError("UNSUPPORTED_ACCOUNT");
    return {
      providerAccountId: username === "bigint" ? "9223372036854775806" : input.token.providerUserId,
      username,
      accountType: "creator",
    };
  }
}

class FetchInstagramProvider implements InstagramProvider {
  constructor(private readonly config: AppConfig) {}

  buildAuthorizeUrl(input: { state: string }): string {
    const url = this.assertAllowedUrl(this.config.instagram.oauthAuthorizeBaseUrl);
    url.searchParams.set("client_id", this.config.instagram.clientId);
    url.searchParams.set("redirect_uri", this.config.instagram.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", this.config.instagram.requiredPermissions.join(","));
    url.searchParams.set("state", input.state);
    return url.toString();
  }

  async exchangeCodeForShortToken(input: { code: string }): Promise<InstagramShortToken> {
    const url = this.assertAllowedUrl(this.config.instagram.oauthTokenUrl);
    const json = await this.fetchJson(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.instagram.clientId,
        client_secret: this.config.instagram.clientSecret,
        grant_type: "authorization_code",
        redirect_uri: this.config.instagram.redirectUri,
        code: input.code,
      }),
    });
    const token = shortTokenFromCodeExchange(json, this.config.instagram.requiredPermissions);
    assertRequiredScopes(token.grantedScopes, this.config.instagram.requiredPermissions);
    return token;
  }

  async exchangeShortTokenForLongToken(input: { shortToken: InstagramShortToken }): Promise<InstagramToken> {
    const url = this.assertAllowedUrl(`${this.config.instagram.graphBaseUrl}/access_token`);
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", this.config.instagram.clientSecret);
    url.searchParams.set("access_token", input.shortToken.accessToken);
    const token = longTokenFromJson(await this.fetchJson(url, { method: "GET" }), input.shortToken);
    assertRequiredScopes(token.grantedScopes, this.config.instagram.requiredPermissions);
    return token;
  }

  async fetchAccount(input: { token: InstagramToken }): Promise<InstagramAccount> {
    assertRequiredScopes(input.token.grantedScopes, this.config.instagram.requiredPermissions);
    const url = this.assertAllowedUrl(`${this.config.instagram.graphBaseUrl.replace(/\/+$/u, "")}/${this.config.instagram.graphApiVersion}/me`);
    url.searchParams.set("fields", "user_id,username,account_type");
    url.searchParams.set("access_token", input.token.accessToken);
    const json = accountRowFromResponse(await this.fetchJson(url, { method: "GET" }));
    const providerUserId = isRecord(json) ? providerUserIdFromValue(json.user_id) : null;
    if (
      !isRecord(json) ||
      !providerUserId ||
      typeof json.username !== "string" ||
      !/^[a-z0-9_][a-z0-9_.]{0,29}$/i.test(json.username)
    ) {
      throw new PublicApiError("PROVIDER_UNAVAILABLE");
    }
    if (providerUserId !== input.token.providerUserId) throw new PublicApiError("PROVIDER_UNAVAILABLE");
    const accountType = accountTypeFromOfficial(json.account_type);
    if (accountType === "personal") throw new PublicApiError("UNSUPPORTED_ACCOUNT");
    return { providerAccountId: providerUserId, username: json.username.toLowerCase(), accountType };
  }

  private assertAllowedUrl(value: string): URL {
    const url = new URL(value);
    if (url.protocol !== "https:" || !this.config.instagram.allowedHosts.includes(url.hostname)) {
      throw new PublicApiError("CONFIGURATION_ERROR");
    }
    return url;
  }

  private async fetchJson(url: URL, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.instagram.requestTimeoutMs);
    try {
      const response = await fetch(url, { ...init, redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) throw new PublicApiError("PROVIDER_UNAVAILABLE");
      if (!response.ok) throw new PublicApiError("PROVIDER_UNAVAILABLE");
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > this.config.instagram.responseSizeLimitBytes) throw new PublicApiError("PROVIDER_UNAVAILABLE");
      const text = await readBoundedResponseText(response, this.config.instagram.responseSizeLimitBytes);
      return parseProviderJson(text);
    } catch (error) {
      if (error instanceof PublicApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") throw new AmbiguousProviderExchangeError();
      throw new PublicApiError("PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function shortTokenFromCodeExchange(json: unknown, requiredScopes: readonly string[]): InstagramShortToken {
  if (!isRecord(json)) throw new PublicApiError("PROVIDER_UNAVAILABLE");
  const row = codeExchangeRowFromResponse(json);
  if (typeof row.access_token !== "string" || !row.access_token.trim()) {
    throw new PublicApiError("PROVIDER_UNAVAILABLE");
  }
  const providerUserId = providerUserIdFromValue(row.user_id);
  if (!providerUserId) throw new PublicApiError("PROVIDER_UNAVAILABLE");
  const grantedScopes = parseCodeExchangeScopes(row, requiredScopes);
  if (!grantedScopes) throw new PublicApiError("PERMISSIONS_REQUIRED");
  return { accessToken: row.access_token, providerUserId, grantedScopes };
}

function longTokenFromJson(json: unknown, shortToken: InstagramShortToken): InstagramToken {
  if (!isRecord(json) || typeof json.access_token !== "string" || !json.access_token.trim()) throw new PublicApiError("PROVIDER_UNAVAILABLE");
  if (typeof json.expires_in !== "number" || !Number.isSafeInteger(json.expires_in) || json.expires_in <= 0) throw new PublicApiError("PROVIDER_UNAVAILABLE");
  return {
    accessToken: json.access_token,
    providerUserId: shortToken.providerUserId,
    expiresAt: expiryFromPositiveSeconds(json.expires_in),
    grantedScopes: shortToken.grantedScopes,
  };
}

function accountRowFromResponse(json: unknown): unknown {
  if (isRecord(json) && Object.prototype.hasOwnProperty.call(json, "data")) {
    if (!Array.isArray(json.data)) throw new PublicApiError("PROVIDER_UNAVAILABLE");
    if (json.data.length !== 1 || !isRecord(json.data[0])) throw new PublicApiError("PROVIDER_UNAVAILABLE");
    return json.data[0];
  }
  return json;
}

function codeExchangeRowFromResponse(json: Record<string, unknown>): Record<string, unknown> {
  if (Object.prototype.hasOwnProperty.call(json, "data")) {
    if (!Array.isArray(json.data)) throw new PublicApiError("PROVIDER_UNAVAILABLE");
    if (json.data.length !== 1 || !isRecord(json.data[0])) throw new PublicApiError("PROVIDER_UNAVAILABLE");
    return json.data[0];
  }
  return json;
}

function providerUserIdFromValue(value: unknown): string | null {
  if (typeof value === "string") return /^[0-9A-Za-z_:-]{1,128}$/u.test(value) ? value : null;
  return null;
}

function parseProviderJson(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) => {
    if (key !== "user_id" || typeof value !== "number") return value;
    const source = context?.source;
    return source && /^[0-9]+$/u.test(source) ? source : null;
  }) as unknown;
}

function parseScopes(json: Record<string, unknown>): readonly string[] | null {
  const raw = typeof json.scope === "string" ? json.scope : typeof json.permissions === "string" ? json.permissions : null;
  return raw ? raw.split(/[,\s]+/u).map((scope) => scope.trim()).filter(Boolean) : null;
}

function parseCodeExchangeScopes(json: Record<string, unknown>, requiredScopes: readonly string[]): readonly string[] | null {
  const hasScope = Object.prototype.hasOwnProperty.call(json, "scope");
  const hasPermissions = Object.prototype.hasOwnProperty.call(json, "permissions");
  if (!hasScope && !hasPermissions) return requiredScopes;
  return parseScopes(json);
}

function assertRequiredScopes(grantedScopes: readonly string[], requiredScopes: readonly string[]): void {
  const granted = new Set(grantedScopes);
  if (requiredScopes.some((scope) => !granted.has(scope))) throw new PublicApiError("PERMISSIONS_REQUIRED");
}

function accountTypeFromOfficial(value: unknown): "business" | "creator" | "personal" {
  if (typeof value !== "string") throw new PublicApiError("PROVIDER_UNAVAILABLE");
  const rawType = value.toLowerCase();
  if (rawType === "media_creator") return "creator";
  if (rawType === "business" || rawType === "creator" || rawType === "personal") return rawType;
  throw new PublicApiError("PROVIDER_UNAVAILABLE");
}

function expiryFromPositiveSeconds(seconds: number): string {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) throw new PublicApiError("PROVIDER_UNAVAILABLE");
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function providerIdFromCode(code: string): string {
  const suffix = code.startsWith("user_") ? code.slice("user_".length) : code;
  return suffix === "bigint" ? "9223372036854775806" : `ig_${suffix}`;
}

async function readBoundedResponseText(response: Response, limitBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new PublicApiError("PROVIDER_UNAVAILABLE");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}
