import { expect, test } from "@playwright/test";

test("SE04 OP05 pages send a per-request nonce and the app security boundary headers", async ({ request }) => {
  const response = await request.get("/", { maxRedirects: 0 });
  expect(response.ok()).toBe(true);

  const headers = response.headers();
  const policy = headers["content-security-policy"] ?? "";
  const scriptDirective = policy.split(";").find((value) => value.trim().startsWith("script-src")) ?? "";
  const nonce = scriptDirective.match(/'nonce-([^']+)'/)?.[1];
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("form-action 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(scriptDirective).toContain("'strict-dynamic'");
  expect(scriptDirective).not.toContain("'unsafe-inline'");
  expect(nonce).toBeTruthy();
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");

  const secondPolicy = (await request.get("/", { maxRedirects: 0 })).headers()["content-security-policy"] ?? "";
  expect(secondPolicy).toContain("'strict-dynamic'");
  expect(secondPolicy).not.toContain(`'nonce-${nonce}'`);
});

test("AU13 invalid callback removes OAuth query values with a no-store clean redirect", async ({ request }) => {
  const response = await request.get("/auth/callback?code=raw-test-code&state=raw-test-state", {
    maxRedirects: 0,
  });

  expect(response.status()).toBe(303);
  expect(response.headers()["location"]).toBe("/connection-error");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  const body = await response.text();
  expect(body).not.toContain("raw-test-code");
  expect(body).not.toContain("raw-test-state");
});

test("SE05 onboarding pages do not persist application data in browser storage", async ({ page }) => {
  await page.goto("/apply");
  await expect(page.getByRole("heading", { name: "먼저, 셀럽님을 알려주세요." })).toBeVisible();

  const browserStorage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  expect(browserStorage).toEqual({ local: [], session: [] });
});
