#!/usr/bin/env node

import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(appRoot, ".next");
const stampPath = path.join(buildRoot, "celeblife-build-complete.json");
const action = process.argv[2];

if (action === "clear") {
  await unlink(stampPath).catch((error) => {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") throw error;
  });
  process.exit(0);
}

if (action !== "write") {
  console.error("Usage: production-build-stamp.mjs <clear|write>");
  process.exit(2);
}

const requiredFiles = [
  path.join(buildRoot, "BUILD_ID"),
  path.join(buildRoot, "build-manifest.json"),
  path.join(buildRoot, "server", "app-paths-manifest.json"),
];
await Promise.all(requiredFiles.map((file) => readFile(file)));
const buildId = (await readFile(requiredFiles[0], "utf8")).trim();
if (!buildId) throw new Error("Production build emitted an empty BUILD_ID");

await writeFile(
  stampPath,
  `${JSON.stringify({ buildId, completedAt: new Date().toISOString() }, null, 2)}\n`,
  { encoding: "utf8", mode: 0o600 },
);
