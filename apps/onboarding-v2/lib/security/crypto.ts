import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto";

export type KeyRing = {
  activeVersion: string;
  keys: Record<string, Buffer>;
};

export type SealedValue = {
  keyVersion: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export function uuid(): string {
  return randomUUID();
}

export function randomUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hmac(secret: Buffer | string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function keyedPayloadHash(secret: Buffer | string, value: unknown): string {
  return sha256Hmac(secret, stableJson(value));
}

export function sealJson(keyRing: KeyRing, value: unknown, aad: string): SealedValue {
  const key = keyRing.keys[keyRing.activeVersion];
  if (!key) throw new Error("ACTIVE_ENCRYPTION_KEY_MISSING");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    keyVersion: keyRing.activeVersion,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

export function openJson<T>(keyRing: KeyRing, sealed: SealedValue, aad: string): T {
  const key = keyRing.keys[sealed.keyVersion];
  if (!key) throw new Error("ENCRYPTION_KEY_VERSION_MISSING");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}
