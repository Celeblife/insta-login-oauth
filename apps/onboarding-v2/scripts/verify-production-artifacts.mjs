#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(appRoot, ".next");
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
];
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

const violations = [];
for (const root of scanRoots) {
  for (const file of await walk(root)) {
    const content = await readFile(file, "utf8");
    for (const marker of forbidden) {
      if (content.includes(marker)) violations.push({ file: path.relative(appRoot, file), marker });
    }
  }
}

if (violations.length > 0) {
  console.error("Production artifact contains preview/demo behavior:");
  for (const item of violations) console.error(`- ${item.file}: ${JSON.stringify(item.marker)}`);
  process.exit(1);
}

console.log("Production artifact scan passed: no preview/demo markers found.");

