#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
let output = "";
const child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: appRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    APP_ENV: "test",
    ONBOARDING_PROVIDER: "mock",
    MAIL_ENABLED: "false",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-8_000);
  });
}

try {
  const response = await waitForResponse(origin, child);
  const html = await response.text();
  const policy = response.headers.get("content-security-policy") ?? "";
  const scriptDirective = directive(policy, "script-src");
  const styleDirective = directive(policy, "style-src");
  const nonce = scriptDirective.match(/'nonce-([^']+)'/)?.[1];

  assert(response.ok, `Expected 2xx response, received ${response.status}`);
  assert(nonce, "Production script-src is missing a nonce");
  assert(scriptDirective.includes("'strict-dynamic'"), "Production script-src is missing strict-dynamic");
  assert(!scriptDirective.includes("'unsafe-inline'"), "Production script-src permits unsafe-inline");
  assert(!scriptDirective.includes("'unsafe-eval'"), "Production script-src permits unsafe-eval");
  assert(styleDirective.includes(`'nonce-${nonce}'`), "Production style-src does not share the request nonce");
  assert(!styleDirective.includes("'unsafe-inline'"), "Production style-src permits unsafe-inline");
  assert(response.headers.get("strict-transport-security") === "max-age=63072000; includeSubDomains; preload", "HSTS is missing or unexpected");
  assert(response.headers.get("referrer-policy") === "no-referrer", "Referrer-Policy is missing");
  assert(response.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options is missing");

  const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
  assert(scriptTags.length > 0, "Rendered production HTML contains no Next.js scripts");
  assert(
    scriptTags.every((tag) => tag.includes(`nonce="${nonce}"`)),
    "Every rendered script must use the request CSP nonce",
  );
  console.log("Production header smoke passed: strict request nonce, HSTS, and security headers verified.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (output) console.error(output);
  process.exitCode = 1;
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(5_000)]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function availablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const selected = address && typeof address === "object" ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (!selected) throw new Error("Unable to allocate a production smoke-test port");
  return selected;
}

async function waitForResponse(origin, serverProcess) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`Production server exited with ${serverProcess.exitCode}`);
    try {
      return await fetch(origin, { redirect: "manual" });
    } catch {
      await delay(100);
    }
  }
  throw new Error("Timed out waiting for the production server");
}

function directive(policy, name) {
  return policy
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name} `)) ?? "";
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
