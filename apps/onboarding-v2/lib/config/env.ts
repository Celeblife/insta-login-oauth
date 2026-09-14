import { PublicApiError } from "@/lib/domain/errors";
import type { KeyRing } from "@/lib/security/crypto";
import { resolveSupabaseServerKey, validateSupabaseTargetIdentity } from "./target-identity";

export type AppConfig = {
  nodeEnv: string;
  appEnv: "local" | "test" | "staging" | "production";
  appBaseUrl: string;
  appOrigin: string;
  cookieName: string;
  cookieSecure: boolean;
  publicContactEmail: string;
  policyBundleId: string;
  policyBundleVersion: string;
  policyBundleHash: string;
  policyDocuments: {
    termsVersion: string;
    privacyVersion: string;
    instagramTermsVersion: string;
    collectionConsentVersion: string;
  };
  browserSecretKey: Buffer;
  payloadHashKey: Buffer;
  encryptionKeys: KeyRing;
  providerMode: "mock" | "instagram";
  instagram: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    oauthAuthorizeBaseUrl: string;
    oauthTokenUrl: string;
    graphBaseUrl: string;
    graphApiVersion: string;
    requiredPermissions: readonly string[];
    allowedHosts: readonly string[];
    requestTimeoutMs: number;
    responseSizeLimitBytes: number;
  };
  supabase?: {
    url: string;
    serviceRoleKey: string;
  };
};

const DEFAULT_TEST_KEY = Buffer.from("0".repeat(64), "hex");
const DEFAULT_PAYLOAD_HASH_TEST_KEY = Buffer.from("1".repeat(64), "hex");
const V1_INSTAGRAM_REQUIRED_PERMISSIONS = ["instagram_business_basic", "instagram_business_manage_insights"] as const;
const INTERNAL_NOTIFICATION_EMAIL = "dkssud374@celeblife.co.kr";

export function getConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const appEnv = parseAppEnv(process.env.APP_ENV ?? appEnvFromNodeEnv(nodeEnv));
  const appBaseUrl = process.env.APP_BASE_URL ?? process.env.ONBOARDING_APP_BASE_URL ?? "http://localhost:3000";
  const appOrigin = parseHttpsOrLocalOrigin(appBaseUrl, appEnv);
  const cookieSecure = appOrigin.startsWith("https:");
  const providerMode = parseProviderMode(process.env.ONBOARDING_PROVIDER ?? process.env.ONBOARDING_PROVIDER_MODE ?? "mock");

  if (appEnv === "production" && providerMode === "mock") {
    throw new PublicApiError("CONFIGURATION_ERROR");
  }

  const config: AppConfig = {
    nodeEnv,
    appEnv,
    appBaseUrl,
    appOrigin,
    cookieName: cookieSecure ? "__Host-cl-onboarding" : "cl-onboarding",
    cookieSecure,
    publicContactEmail: publicContactEmail(appEnv),
    policyBundleId: policyValue("ONBOARDING_POLICY_BUNDLE_ID", appEnv, "approved-bundle"),
    policyBundleVersion: policyValue("POLICY_BUNDLE_VERSION", appEnv, "local-v1"),
    policyBundleHash: policyValue("POLICY_BUNDLE_HASH", appEnv, "0".repeat(64)),
    policyDocuments: {
      termsVersion: policyValue("POLICY_TERMS_VERSION", appEnv, "local-terms-v1"),
      privacyVersion: policyValue("POLICY_PRIVACY_VERSION", appEnv, "local-privacy-v1"),
      instagramTermsVersion: policyValue("POLICY_INSTAGRAM_TERMS_VERSION", appEnv, "local-instagram-v1"),
      collectionConsentVersion: policyValue("POLICY_COLLECTION_CONSENT_VERSION", appEnv, "local-collection-v1"),
    },
    browserSecretKey: keyFromEnv("BROWSER_SECRET_PEPPER", appEnv, process.env.ONBOARDING_BROWSER_SECRET_KEY),
    payloadHashKey: payloadHashKeyFromEnv(appEnv),
    encryptionKeys: {
      activeVersion: checkpointKeyRing(appEnv).activeVersion,
      keys: checkpointKeyRing(appEnv).keys,
    },
    providerMode,
    instagram: {
      clientId: process.env.INSTAGRAM_APP_ID ?? process.env.INSTAGRAM_CLIENT_ID ?? "mock-client-id",
      clientSecret: process.env.INSTAGRAM_APP_SECRET ?? process.env.INSTAGRAM_CLIENT_SECRET ?? "mock-client-secret",
      redirectUri:
        process.env.INSTAGRAM_REDIRECT_URI ??
        process.env.OAUTH_REDIRECT_URI ??
        `${appOrigin}/auth/callback`,
      oauthAuthorizeBaseUrl:
        process.env.INSTAGRAM_AUTHORIZE_URL ??
        "https://www.instagram.com/oauth/authorize",
      oauthTokenUrl:
        process.env.INSTAGRAM_TOKEN_URL ??
        "https://api.instagram.com/oauth/access_token",
      graphBaseUrl:
        process.env.INSTAGRAM_GRAPH_BASE_URL ?? "https://graph.instagram.com",
      graphApiVersion: graphApiVersion(appEnv),
      requiredPermissions: V1_INSTAGRAM_REQUIRED_PERMISSIONS,
      allowedHosts: ["www.instagram.com", "api.instagram.com", "graph.instagram.com"],
      requestTimeoutMs: positiveInteger(process.env.PROVIDER_TIMEOUT_MS ?? process.env.INSTAGRAM_REQUEST_TIMEOUT_MS ?? "10000"),
      responseSizeLimitBytes: positiveInteger(process.env.INSTAGRAM_RESPONSE_LIMIT_BYTES ?? "32768"),
    },
  };
  const supabaseIdentity = validateSupabaseTargetIdentity({
    appEnv,
    repository: process.env.ONBOARDING_REPOSITORY,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseKey: process.env.SUPABASE_KEY,
    expectedProjectRef: process.env.SUPABASE_EXPECTED_PROJECT_REF,
    productionProjectRef: process.env.SUPABASE_PRODUCTION_PROJECT_REF,
    vercelProjectId: process.env.VERCEL_PROJECT_ID,
    expectedVercelProjectId: process.env.VERCEL_PROJECT_ID_EXPECTED,
  });
  if (supabaseIdentity) {
    config.supabase = {
      url: supabaseIdentity.url,
      serviceRoleKey: supabaseIdentity.serviceRoleKey,
    };
  } else if (process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)) {
    config.supabase = {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: resolveSupabaseServerKey({
        supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
        supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        supabaseKey: process.env.SUPABASE_KEY,
        failOnConflict: false,
      }),
    };
  }
  if (config.providerMode === "instagram") validateInstagramConfig(config);
  validatePolicyConfig(config);
  return config;
}

function keyFromEnv(name: string, appEnv: AppConfig["appEnv"], fallback?: string): Buffer {
  const raw = process.env[name] || fallback;
  if (!raw && appEnv !== "production") return DEFAULT_TEST_KEY;
  if (!raw) throw new PublicApiError("CONFIGURATION_ERROR");
  return parseKey(raw);
}

function payloadHashKeyFromEnv(appEnv: AppConfig["appEnv"]): Buffer {
  const raw = process.env.ONBOARDING_PAYLOAD_HASH_KEY;
  if (!raw && (appEnv === "staging" || appEnv === "production")) throw new PublicApiError("CONFIGURATION_ERROR");
  const key = raw ? parseKey(raw) : DEFAULT_PAYLOAD_HASH_TEST_KEY;
  const browserSecret = process.env.BROWSER_SECRET_PEPPER || process.env.ONBOARDING_BROWSER_SECRET_KEY;
  const browserSecretKey = browserSecret ? parseKey(browserSecret) : DEFAULT_TEST_KEY;
  if (key.equals(browserSecretKey)) throw new PublicApiError("CONFIGURATION_ERROR");
  return key;
}

function checkpointKeyRing(appEnv: AppConfig["appEnv"]): KeyRing {
  const raw = process.env.CHECKPOINT_ENCRYPTION_KEYS || process.env.ONBOARDING_ENCRYPTION_KEY;
  if (!raw && appEnv !== "production") return { activeVersion: "test-v1", keys: { "test-v1": DEFAULT_TEST_KEY } };
  if (!raw) throw new PublicApiError("CONFIGURATION_ERROR");
  const keys: Record<string, Buffer> = {};
  let activeVersion = process.env.ONBOARDING_ENCRYPTION_KEY_VERSION ?? "";
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(":");
    const version = separator > 0 ? trimmed.slice(0, separator) : activeVersion || "v1";
    const value = separator > 0 ? trimmed.slice(separator + 1) : trimmed;
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(version)) throw new PublicApiError("CONFIGURATION_ERROR");
    keys[version] = parseKey(value);
    if (!activeVersion) activeVersion = version;
  }
  if (!activeVersion || !keys[activeVersion]) throw new PublicApiError("CONFIGURATION_ERROR");
  return { activeVersion, keys };
}

function parseAppEnv(value: string): AppConfig["appEnv"] {
  if (value === "local" || value === "test" || value === "staging" || value === "production") return value;
  throw new PublicApiError("CONFIGURATION_ERROR");
}

function appEnvFromNodeEnv(value: string): AppConfig["appEnv"] {
  if (value === "test") return "test";
  if (value === "production") return "production";
  return "local";
}

function parseProviderMode(value: string): AppConfig["providerMode"] {
  if (value === "mock" || value === "instagram") return value;
  throw new PublicApiError("CONFIGURATION_ERROR");
}

function parseHttpsOrLocalOrigin(value: string, appEnv: AppConfig["appEnv"]): string {
  const url = new URL(value);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(appEnv !== "production" && local && url.protocol === "http:")) throw new PublicApiError("CONFIGURATION_ERROR");
  return url.origin;
}

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new PublicApiError("CONFIGURATION_ERROR");
  return parsed;
}

function graphApiVersion(appEnv: AppConfig["appEnv"]): string {
  const value = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim();
  if (!value && (appEnv === "staging" || appEnv === "production")) throw new PublicApiError("CONFIGURATION_ERROR");
  const version = value || "v22.0";
  if (!/^v\d+\.\d+$/.test(version)) throw new PublicApiError("CONFIGURATION_ERROR");
  return version;
}

function validateInstagramConfig(config: AppConfig): void {
  const redirect = new URL(config.instagram.redirectUri);
  parseHttpsOrLocalOrigin(config.instagram.redirectUri, config.appEnv);
  if (redirect.origin !== config.appOrigin || redirect.pathname !== "/auth/callback" || redirect.search || redirect.hash) throw new PublicApiError("CONFIGURATION_ERROR");
  const graph = new URL(config.instagram.graphBaseUrl);
  if (
    graph.protocol !== "https:" ||
    graph.hostname !== "graph.instagram.com" ||
    graph.username ||
    graph.password ||
    graph.port ||
    graph.pathname !== "/" ||
    graph.search ||
    graph.hash
  ) throw new PublicApiError("CONFIGURATION_ERROR");
  if (!config.instagram.clientId || !config.instagram.clientSecret) throw new PublicApiError("CONFIGURATION_ERROR");
  if ((config.appEnv === "staging" || config.appEnv === "production") && isKnownMockInstagramCredential(config.instagram.clientId, config.instagram.clientSecret)) throw new PublicApiError("CONFIGURATION_ERROR");
  if (config.instagram.requiredPermissions !== V1_INSTAGRAM_REQUIRED_PERMISSIONS) throw new PublicApiError("CONFIGURATION_ERROR");
}

function isKnownMockInstagramCredential(clientId: string, clientSecret: string): boolean {
  const known = new Set(["mock", "mock-client-id", "mock-client-secret", "test", "test-client-id", "test-client-secret"]);
  return known.has(clientId.trim()) || known.has(clientSecret.trim());
}

function policyValue(name: string, appEnv: AppConfig["appEnv"], fallback: string): string {
  const value = process.env[name];
  if (value && value.trim()) return value.trim();
  if (appEnv === "production") throw new PublicApiError("CONFIGURATION_ERROR");
  return fallback;
}

function validatePolicyConfig(config: AppConfig): void {
  if (config.appEnv !== "production") return;
  if (process.env.POLICY_DOCUMENTS_APPROVED !== "true") throw new PublicApiError("CONFIGURATION_ERROR");
  if (!/^[0-9a-f]{64}$/i.test(config.policyBundleHash)) throw new PublicApiError("CONFIGURATION_ERROR");
  if (config.policyBundleId === "approved-bundle" || config.policyBundleVersion === "local-v1") throw new PublicApiError("CONFIGURATION_ERROR");
  if (Object.values(config.policyDocuments).some((value) => value.startsWith("local-"))) throw new PublicApiError("CONFIGURATION_ERROR");
}

function publicContactEmail(appEnv: AppConfig["appEnv"]): string {
  const raw = process.env.CONTACT_EMAIL ?? "";
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new PublicApiError("CONFIGURATION_ERROR");
  const value = raw.trim();
  if (!value) {
    if (appEnv === "production") throw new PublicApiError("CONFIGURATION_ERROR");
    return "";
  }
  if (!isValidPublicEmail(value)) throw new PublicApiError("CONFIGURATION_ERROR");
  if (value.toLowerCase() === INTERNAL_NOTIFICATION_EMAIL) {
    if (appEnv === "production") throw new PublicApiError("CONFIGURATION_ERROR");
    return "";
  }
  return value;
}

function isValidPublicEmail(value: string): boolean {
  if (value.length > 254) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return false;
  const [localPart, domain] = value.split("@");
  return Boolean(localPart && domain && localPart.length <= 64 && !domain.startsWith(".") && !domain.endsWith("."));
}

function parseKey(raw: string): Buffer {
  const key = raw.length === 64 && /^[0-9a-f]+$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64url");
  if (key.length !== 32) throw new PublicApiError("CONFIGURATION_ERROR");
  return key;
}
