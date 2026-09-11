#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(appRoot, ".next");
const buildIdPath = path.join(buildRoot, "BUILD_ID");
const buildStampPath = path.join(buildRoot, "celeblife-build-complete.json");
const scanRoots = [path.join(buildRoot, "static"), path.join(buildRoot, "server", "app")];
const forbidden = [
  "V2 UI PREVIEW",
  "UI DEMO",
  "celeblife_demo",
  "simulate-btn",
  "simulate-error",
  "sample-btn",
  "예시 채우기",
  "location.hash.slice",
  "streamlit",
  "plotly",
];
const secretEnvironmentNames = [
  "INSTAGRAM_APP_SECRET",
  "INSTAGRAM_CLIENT_SECRET",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_KEY",
  "BROWSER_SECRET_PEPPER",
  "ONBOARDING_BROWSER_SECRET_KEY",
  "ONBOARDING_PAYLOAD_HASH_KEY",
  "SESSION_COOKIE_SECRET",
  "CHECKPOINT_ENCRYPTION_KEYS",
  "ONBOARDING_ENCRYPTION_KEY",
  "ONBOARDING_ENCRYPTION_KEY_B64",
  "ONBOARDING_FINGERPRINT_KEY_B64",
  "SMTP_PASSWORD",
  "CRON_SECRET",
];
const configuredSecrets = secretEnvironmentNames
  .map((name) => ({ name, value: process.env[name] }))
  .filter((item) => typeof item.value === "string" && item.value.length >= 8);
const textualExtensions = new Set([".html", ".js", ".json", ".css", ".txt", ".map"]);

async function walk(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else if (entry.isFile() && textualExtensions.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

const buildStats = await stat(buildRoot).catch(() => null);
if (!buildStats?.isDirectory()) {
  console.error("Missing .next production build. Run `npm run build` first.");
  process.exit(1);
}

let buildId;
let buildStamp;
try {
  buildId = (await readFile(buildIdPath, "utf8")).trim();
  buildStamp = JSON.parse(await readFile(buildStampPath, "utf8"));
  await Promise.all([
    readFile(path.join(buildRoot, "build-manifest.json")),
    readFile(path.join(buildRoot, "server", "app-paths-manifest.json")),
  ]);
} catch {
  console.error("Missing successful-build evidence. Run `npm run build` and do not reuse a partial .next directory.");
  process.exit(1);
}
if (!buildId || buildStamp?.buildId !== buildId) {
  console.error("Production build stamp does not match BUILD_ID. Run `npm run build` again.");
  process.exit(1);
}

const violations = [];
for (const root of scanRoots) {
  for (const file of await walk(root)) {
    const content = await readFile(file, "utf8");
    for (const marker of forbidden) {
      if (content.includes(marker)) violations.push({ file: path.relative(appRoot, file), marker });
    }
    if (root.endsWith(`${path.sep}static`)) {
      for (const secret of configuredSecrets) {
        if (content.includes(secret.value)) {
          violations.push({ file: path.relative(appRoot, file), marker: `secret:${secret.name}` });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Production artifact contains preview/demo behavior:");
  for (const item of violations) console.error(`- ${item.file}: ${JSON.stringify(item.marker)}`);
  process.exit(1);
}

console.log("Production artifact scan passed: no preview/demo markers found.");
