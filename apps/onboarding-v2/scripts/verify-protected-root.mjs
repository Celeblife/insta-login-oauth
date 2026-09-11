#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(appRoot, "../..");
const allowedPrefixes = ["apps/onboarding-v2/", "handoff/celeblife-v2/"];

function git(args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function lines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const committedAndWorking = new Set([
  ...lines(git(["diff", "--name-only", "origin/main", "--"])),
  ...lines(git(["ls-files", "--others", "--exclude-standard"])),
]);

const violations = [...committedAndWorking].filter(
  (file) => !allowedPrefixes.some((prefix) => file.startsWith(prefix)),
);

if (violations.length > 0) {
  console.error("Protected root paths changed outside the onboarding v2 boundary:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log(
  `Protected-root check passed (${committedAndWorking.size} changed/untracked paths, all within allowed prefixes).`,
);

