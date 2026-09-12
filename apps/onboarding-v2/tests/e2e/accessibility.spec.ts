import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const attemptId = "a33717b1-8009-40e4-a9a9-5d4e4ed4906d";
const wcagAAndAaTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectNoWcagAOrAaViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(wcagAAndAaTags).analyze();
  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.route("**/api/onboarding/bootstrap", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "csrf-test", policyBundleId: "bundle-test" }),
    });
  });
});

test("A11Y01 @a11y intro page has no WCAG A or AA violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /반응을 읽고,\s*선택의 기준을 만듭니다\./ })).toBeVisible();

  await expectNoWcagAOrAaViolations(page);
});

test("A11Y02 @a11y apply page has no WCAG A or AA violations", async ({ page }) => {
  await page.goto("/apply");
  await expect(page.getByRole("heading", { name: "먼저, 셀럽님을 알려주세요." })).toBeVisible();

  await expectNoWcagAOrAaViolations(page);
});

test("A11Y03 @a11y completed receipt has no WCAG A or AA violations", async ({ page }) => {
  await page.route("**/api/onboarding/status?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        attemptId,
        revision: 5,
        result: {
          kind: "v2",
          requestId: "b1c9a751-283b-4e88-97cc-8229c74059d4",
          receivedAt: "2026-09-10T06:00:30Z",
          fullName: "김셀럽",
          email: "creator@example.com",
          phone: "+821000000000",
          instagramUsername: "celeblife_demo",
          connectionKind: "new",
          analysisRequested: true,
          reviewStatus: "pending_review",
        },
      }),
    });
  });

  await page.goto(`/complete?attemptId=${attemptId}`);
  await expect(page.getByRole("heading", { name: "연동이 완료되었습니다." })).toBeVisible();

  await expectNoWcagAOrAaViolations(page);
});
