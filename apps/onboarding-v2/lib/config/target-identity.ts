import { PublicApiError } from "@/lib/domain/errors";

export type AppEnvironment = "local" | "test" | "staging" | "production";

export type SupabaseTargetIdentity = {
  url: string;
  serviceRoleKey: string;
  projectRef: string;
  vercelProjectId: string;
};

type SupabaseTargetInput = {
  appEnv: AppEnvironment;
  repository: string | undefined;
  supabaseUrl: string | undefined;
  supabaseSecretKey: string | undefined;
  supabaseServiceRoleKey: string | undefined;
  expectedProjectRef: string | undefined;
  vercelProjectId: string | undefined;
  expectedVercelProjectId: string | undefined;
};

export function isExternalSupabaseMode(appEnv: AppEnvironment, repository: string | undefined): boolean {
  return appEnv === "production" || (appEnv === "staging" && repository === "supabase");
}

export function validateSupabaseTargetIdentity(input: SupabaseTargetInput): SupabaseTargetIdentity | undefined {
  if (!isExternalSupabaseMode(input.appEnv, input.repository)) return undefined;

  const expectedProjectRef = required(input.expectedProjectRef);
  if (!/^[a-z0-9-]+$/.test(expectedProjectRef)) throw new PublicApiError("CONFIGURATION_ERROR");

  const url = required(input.supabaseUrl);
  assertExactSupabaseUrl(input.supabaseUrl, expectedProjectRef);

  const expectedVercelProjectId = required(input.expectedVercelProjectId);
  const vercelProjectId = required(input.vercelProjectId);
  if (vercelProjectId !== expectedVercelProjectId) throw new PublicApiError("CONFIGURATION_ERROR");

  const serviceRoleKey = input.supabaseSecretKey || input.supabaseServiceRoleKey || "";
  if (!isServerSupabaseKey(serviceRoleKey)) throw new PublicApiError("CONFIGURATION_ERROR");

  return {
    url,
    serviceRoleKey,
    projectRef: expectedProjectRef,
    vercelProjectId,
  };
}

export function assertExactSupabaseUrl(raw: string | undefined, expectedProjectRef: string): void {
  if (!raw) throw new PublicApiError("CONFIGURATION_ERROR");
  const canonical = `https://${expectedProjectRef}.supabase.co`;
  if (raw !== canonical && raw !== `${canonical}/`) throw new PublicApiError("CONFIGURATION_ERROR");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PublicApiError("CONFIGURATION_ERROR");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== `${expectedProjectRef}.supabase.co` ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new PublicApiError("CONFIGURATION_ERROR");
  }
}

export function isServerSupabaseKey(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("sb_secret_")) return true;
  if (value.startsWith("sb_publishable_") || value.startsWith("sb_anon_")) return false;

  const jwtRole = readJwtRole(value);
  if (jwtRole === "service_role") return true;
  if (jwtRole === "anon" || jwtRole === "authenticated") return false;

  return false;
}

function readJwtRole(value: string): string | undefined {
  const [, payload] = value.split(".");
  if (!payload) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || !("role" in decoded)) return undefined;
    const role = (decoded as { role?: unknown }).role;
    return typeof role === "string" ? role : undefined;
  } catch {
    return undefined;
  }
}

function required(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new PublicApiError("CONFIGURATION_ERROR");
  return trimmed;
}
