import { expect, test } from "@playwright/test";

const attemptId = "a33717b1-8009-40e4-a9a9-5d4e4ed4906d";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/onboarding/bootstrap", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "csrf-test", policyBundleId: "bundle-test" }),
    });
  });
});

test("UI01 AUDIT production intro has approved shell without preview toolbar or hash success", async ({ page }) => {
  await page.goto("/#success");
  await expect(page.getByRole("heading", { name: /셀럽님의 다음 기회/ })).toBeVisible();
  await expect(page.getByText("V2 UI PREVIEW")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "인스타그램 연결 시작하기" })).toHaveAttribute("href", "/apply");
});

test("UI01 loading preview renders without onboarding API calls", async ({ page }) => {
  let apiCalls = 0;
  await page.route("**/api/onboarding/**", async (route) => {
    apiCalls += 1;
    await route.fulfill({ status: 500, body: "preview must not call onboarding APIs" });
  });

  await page.goto("/connecting?preview=loading");
  await expect(page.getByRole("heading", { name: "셀럽님과 연결하고 있어요." })).toBeVisible();
  await expect(page.getByText("인스타그램 계정을 확인하고 있어요.")).toBeVisible();
  await expect(page.getByLabel("연동 진행 상황")).toBeVisible();
  expect(apiCalls).toBe(0);
});

test("UI02 apply validates fields, syncs consent indeterminate, and posts real start API", async ({ page }) => {
  let posted: unknown;
  await page.route("**/api/onboarding/start", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ action: "authorize", attemptId, revision: 0, authorizeUrl: "/mock-instagram", expiresAt: "2026-09-10T06:10:00Z" }),
    });
  });
  await page.goto("/apply");
  await page.getByRole("button", { name: /동의하고 Instagram 연결/ }).click();
  await expect(page.getByText("이름을 입력해 주세요.")).toBeVisible();

  await page.getByLabel("이름 *").fill("김");
  await page.getByLabel("연락처 *").fill("+821012345678");
  await page.getByLabel("이메일 *").fill("creator@example.com");
  await page.getByLabel("셀럽 ID *").fill("@Celeb.Life_01");
  await page.getByLabel("[필수] 만 14세 이상입니다.").check();
  await expect(page.locator("label.all-agree input")).toHaveJSProperty("indeterminate", true);
  await page.getByLabel("필수 항목 전체 동의").check();
  await page.getByRole("button", { name: /동의하고 Instagram 연결/ }).click();
  await page.waitForURL("**/mock-instagram");
  expect(posted).toMatchObject({
    fullName: "김",
    phone: "+821012345678",
    email: "creator@example.com",
    instagramUsername: "celeb.life_01",
    consents: { age: true, terms: true, privacy: true, instagramData: true },
  });
});

test("MOB06 apply form fields and footer geometry remain stable", async ({ page }) => {
  for (const { width, height } of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
    { width: 320, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/apply");

    const geometry = await page.locator("#onboarding-form").evaluate((form) => {
      const grid = form.querySelector<HTMLElement>(".form-grid");
      const footer = document.querySelector<HTMLElement>(".panel-footer");
      const primary = form.querySelector<HTMLElement>(".primary");
      if (!grid || !footer || !primary) throw new Error("Apply form geometry target missing");

      const gridBox = grid.getBoundingClientRect();
      const footerBox = footer.getBoundingClientRect();
      const primaryBox = primary.getBoundingClientRect();

      const fields = ["email", "instagram"].map((id) => {
        const input = form.querySelector<HTMLInputElement>(`#${id}`);
        const field = input?.closest<HTMLElement>(".field");
        const wrap = field?.querySelector<HTMLElement>(".input-wrap");
        if (!input || !field || !wrap) throw new Error(`${id} field geometry target missing`);

        const inputBox = input.getBoundingClientRect();
        const fieldBox = field.getBoundingClientRect();
        const wrapBox = wrap.getBoundingClientRect();
        return {
          id,
          fieldWidth: fieldBox.width,
          inputBottom: inputBox.bottom,
          inputWidth: inputBox.width,
          wrapWidth: wrapBox.width,
        };
      });

      const hint = form.querySelector<HTMLElement>("#instagram-hint");
      const instagram = form.querySelector<HTMLInputElement>("#instagram");
      if (!hint || !instagram) throw new Error("Instagram hint geometry target missing");

      const hintBox = hint.getBoundingClientRect();
      const instagramBox = instagram.getBoundingClientRect();

      return {
        fields,
        footerBottom: footerBox.bottom,
        gridWidth: gridBox.width,
        hintLeft: hintBox.left,
        hintRight: hintBox.right,
        hintTop: hintBox.top,
        instagramBottom: instagramBox.bottom,
        primaryBottom: primaryBox.bottom,
        primaryTop: primaryBox.top,
        viewportHeight: window.innerHeight,
      };
    });

    for (const field of geometry.fields) {
      expect(field.fieldWidth, `${field.id} field uses full form grid width at ${width}`).toBeGreaterThanOrEqual(geometry.gridWidth - 1);
      expect(field.inputWidth, `${field.id} input uses its full field wrapper width at ${width}`).toBeGreaterThanOrEqual(field.wrapWidth - 1);
    }
    expect(geometry.hintTop).toBeGreaterThanOrEqual(geometry.instagramBottom);
    expect(geometry.hintLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.hintRight).toBeLessThanOrEqual(width);

    if (width === 1440) {
      expect(geometry.primaryTop).toBeGreaterThanOrEqual(0);
      expect(geometry.primaryBottom).toBeLessThanOrEqual(geometry.viewportHeight);
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewportHeight);
    }
  }
});

test("UI07 restored cancellation draft starts fresh OAuth with replacement attempt id", async ({ page }) => {
  let posted: unknown;
  await page.unroute("**/api/onboarding/bootstrap");
  await page.route("**/api/onboarding/bootstrap", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        csrfToken: "csrf-test",
        policyBundleId: "bundle-test",
        activeAttempt: { attemptId, revision: 2, nextPath: "/apply" },
        draft: { attemptId, fullName: "김셀럽", phone: "+821012345678", email: "creator@example.com", instagramUsername: "restored_user" },
      }),
    });
  });
  await page.route("**/api/onboarding/start", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ action: "authorize", attemptId: "b33717b1-8009-40e4-a9a9-5d4e4ed4906d", revision: 0, authorizeUrl: "/mock-instagram-restored", expiresAt: "2026-09-10T06:10:00Z" }),
    });
  });

  await page.goto("/apply");
  await expect(page.getByLabel("이름 *")).toHaveValue("김셀럽");
  await expect(page.getByLabel("셀럽 ID *")).toHaveValue("restored_user");
  await page.getByLabel("필수 항목 전체 동의").check();
  await page.getByRole("button", { name: /동의하고 Instagram 연결/ }).click();
  await page.waitForURL("**/mock-instagram-restored");

  expect(posted).toMatchObject({
    replaceAttemptId: attemptId,
    fullName: "김셀럽",
    phone: "+821012345678",
    email: "creator@example.com",
    instagramUsername: "restored_user",
    consents: { age: true, terms: true, privacy: true, instagramData: true },
  });
  expect((posted as { requestKey: string }).requestKey).toMatch(/[0-9a-f-]{36}/);
});

test("UI04 account mismatch accepts server candidate with expected revision", async ({ page }) => {
  let confirmed: unknown;
  await page.route("**/api/onboarding/complete", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "account_confirmation_required", attemptId, revision: 3, enteredUsername: "aaa", connectedUsername: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
    });
  });
  await page.route("**/api/onboarding/confirm-account", async (route) => {
    confirmed = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "completed",
        attemptId,
        revision: 4,
        result: {
          kind: "v2",
          requestId: "b1c9a751-283b-4e88-97cc-8229c74059d4",
          receivedAt: "2026-09-10T06:00:30Z",
          fullName: "김셀럽",
          email: "creator@example.com",
          phone: "+821000000000",
          instagramUsername: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          connectionKind: "reconnection",
          analysisRequested: false,
          reviewStatus: "not_requested",
          initialRequestId: "c1c9a751-283b-4e88-97cc-8229c74059d4",
        },
      }),
    });
  });
  await page.goto(`/connecting?attemptId=${attemptId}`);
  await expect(page.getByRole("heading", { name: "연결된 계정을 확인해 주세요." })).toBeVisible();
  await page.getByRole("button", { name: /bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb으로 연결/ }).click();
  await expect.poll(() => confirmed).toMatchObject({ attemptId, expectedRevision: 3, accept: true });
});

test("UI04 complete 202 processing keeps the user on connecting", async ({ page }) => {
  await page.route("**/api/onboarding/complete", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ status: "processing", attemptId, revision: 2, stage: "storage", retryAfterMs: 60_000, submissionIntent: "unknown" }),
    });
  });
  await page.goto(`/connecting?attemptId=${attemptId}`);
  await expect(page).toHaveURL(new RegExp(`/connecting\\?attemptId=${attemptId}`));
  await expect(page.getByText("신청 정보를 안전하게 저장하고 있어요.")).toBeVisible();
});

test("UI04 restart_oauth posts requestKey idempotently from mismatch secondary action", async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route("**/api/onboarding/complete", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "account_confirmation_required", attemptId, revision: 3, enteredUsername: "aaa", connectedUsername: "bbb" }),
    });
  });
  await page.route("**/api/onboarding/restart", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ action: "resume", attemptId, revision: 4, nextPath: "/connecting" }),
    });
  });
  await page.goto(`/connecting?attemptId=${attemptId}`);
  await page.getByRole("button", { name: "다른 계정으로 다시 연결" }).click();
  await page.waitForURL(`**/connecting?attemptId=${attemptId}`);
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ attemptId });
  expect((bodies[0] as { requestKey: string }).requestKey).toMatch(/[0-9a-f-]{36}/);
});

test("AUDIT03 connecting restart releases button after abort and retries same requestKey", async ({ page }) => {
  const bodies: Array<{ attemptId: string; requestKey: string }> = [];
  let restartCalls = 0;
  await page.route("**/api/onboarding/complete", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "account_confirmation_required", attemptId, revision: 3, enteredUsername: "aaa", connectedUsername: "bbb" }),
    });
  });
  await page.route("**/api/onboarding/restart", async (route) => {
    bodies.push(route.request().postDataJSON());
    restartCalls += 1;
    if (restartCalls === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ action: "resume", attemptId, revision: 4, nextPath: "/connecting" }),
    });
  });

  await page.goto(`/connecting?attemptId=${attemptId}`);
  const retry = page.getByRole("button", { name: "다른 계정으로 다시 연결" });
  await retry.click();
  await expect(retry).toBeEnabled();
  await expect(page.getByText("최종 실패로 단정하지 않고 현재 상태를 다시 확인할 수 있습니다.")).toBeVisible();
  await retry.click();
  await page.waitForURL(`**/connecting?attemptId=${attemptId}`);

  expect(bodies).toHaveLength(2);
  const first = bodies[0]!;
  expect(first).toMatchObject({ attemptId });
  expect(bodies[1]).toMatchObject({ attemptId, requestKey: first.requestKey });
});

test("UI07 cancellation copy respects draftAvailable true and false", async ({ page }) => {
  await page.route("**/api/onboarding/status?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "failed", attemptId, revision: 2, code: "OAUTH_CANCELLED", retryAction: "restart_oauth", draftAvailable: true }),
    });
  });
  await page.goto(`/connection-error?attemptId=${attemptId}&code=OAUTH_CANCELLED`);
  await expect(page.getByText("입력한 정보가 남아 있어요")).toBeVisible();

  await page.route("**/api/onboarding/status?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "failed", attemptId, revision: 3, code: "OAUTH_CANCELLED", retryAction: "restart_oauth", draftAvailable: false }),
    });
  });
  await page.goto(`/connection-error?attemptId=${attemptId}&code=OAUTH_CANCELLED`);
  await expect(page.getByText("취소된 인증은 재사용하지 않고 새 인증을 시작해야 합니다.")).toBeVisible();
});

test("UI07 retryAction controls retry_status retry_complete restart_oauth return_form", async ({ page }) => {
  const actions = ["retry_status", "retry_complete", "restart_oauth", "return_form"] as const;
  for (const action of actions) {
    let statusCalls = 0;
    let restartBody: unknown;
    await page.route("**/api/onboarding/status?**", async (route) => {
      statusCalls += 1;
      const body = statusCalls > 1 && action === "retry_status"
        ? { status: "processing", attemptId, revision: 8, stage: "account", retryAfterMs: 2000, submissionIntent: "unknown" }
        : { status: "failed", attemptId, revision: 7, code: "PROVIDER_UNAVAILABLE", retryAction: action, draftAvailable: false };
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.route("**/api/onboarding/restart", async (route) => {
      restartBody = route.request().postDataJSON();
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ action: "authorize", attemptId, revision: 8, authorizeUrl: "/mock-instagram", expiresAt: "2026-09-10T06:10:00Z" }) });
    });
    await page.goto(`/connection-error?attemptId=${attemptId}`);
    await page.getByRole("button", { name: action === "retry_status" ? "상태 다시 확인" : action === "retry_complete" ? "완료 처리 다시 요청" : action === "restart_oauth" ? "다시 연결하기" : "정보 입력으로 돌아가기" }).click();
    if (action === "return_form") await page.waitForURL("**/apply");
    if (action === "retry_complete" || action === "retry_status") await page.waitForURL(`**/connecting?attemptId=${attemptId}`);
    if (action === "restart_oauth") {
      await page.waitForURL("**/mock-instagram");
      expect(restartBody).toMatchObject({ attemptId });
    }
    await page.unroute("**/api/onboarding/status?**");
    await page.unroute("**/api/onboarding/restart");
  }
});

test("FINAL14 error restart releases button after abort and retries same requestKey", async ({ page }) => {
  const bodies: Array<{ attemptId: string; requestKey: string }> = [];
  let restartCalls = 0;
  await page.route("**/api/onboarding/status?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "failed", attemptId, revision: 7, code: "OAUTH_CANCELLED", retryAction: "restart_oauth", draftAvailable: true }),
    });
  });
  await page.route("**/api/onboarding/restart", async (route) => {
    bodies.push(route.request().postDataJSON());
    restartCalls += 1;
    if (restartCalls === 1) {
      await route.abort();
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ action: "authorize", attemptId, revision: 8, authorizeUrl: "/mock-instagram", expiresAt: "2026-09-10T06:10:00Z" }),
    });
  });

  await page.goto(`/connection-error?attemptId=${attemptId}&code=OAUTH_CANCELLED`);
  const retry = page.getByRole("button", { name: "다시 연결하기" });
  await retry.click();
  await expect(retry).toBeEnabled();
  await expect(page.getByText("최종 실패로 단정하지 않고 현재 상태를 다시 확인할 수 있습니다.")).toBeVisible();
  await retry.click();
  await page.waitForURL("**/mock-instagram");

  expect(bodies).toHaveLength(2);
  const first = bodies[0]!;
  expect(first).toMatchObject({ attemptId });
  expect(bodies[1]).toMatchObject({ attemptId, requestKey: first.requestKey });
});

test("UI08 focus loop escape and trigger return use the common dialog", async ({ page }) => {
  await page.goto("/apply");
  const trigger = page.getByRole("button", { name: "서비스 이용약관에 동의합니다. 보기" });
  await trigger.focus();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "서비스 이용약관" })).toBeVisible();
  await expect(page.getByRole("button", { name: "확인했어요" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "닫기" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("MOB01 MOB02 MOB05 reduced motion and responsive overflow matrix stay stable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 768, 860, 861, 1080, 1440]) {
    await page.setViewportSize({ width, height: 900 });
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
            fullName: "김".repeat(50),
            email: `creator-${"x".repeat(60)}@example.com`,
            phone: "+821000000000",
            instagramUsername: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            connectionKind: "new",
            analysisRequested: true,
            reviewStatus: "pending_review",
          },
        }),
      });
    });
    await page.goto(`/complete?attemptId=${attemptId}`);
    await expect(page.getByText("김".repeat(20))).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.unroute("**/api/onboarding/status?**");
  }
  await page.goto("/");
  await expect(page.locator(".ig-tile")).toHaveCSS("animation-name", "none");
});

test("LAST02 complete revalidation ignores processing regression after completed receipt", async ({ page }) => {
  let regressed = false;
  await page.route("**/api/onboarding/status?**", async (route) => {
    if (regressed) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ status: "processing", attemptId, revision: 6, stage: "storage", retryAfterMs: 2000, submissionIntent: "new" }),
      });
      return;
    }
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
  await expect(page.getByText("creator@example.com")).toBeVisible();
  regressed = true;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await expect(page.getByText("creator@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: "접수 결과를 확인하고 있어요." })).toHaveCount(0);
});

test("LAST03 complete pageshow revalidation purges stale receipt after 410", async ({ page }) => {
  let expired = false;
  await page.route("**/api/onboarding/status?**", async (route) => {
    if (expired) {
      await route.fulfill({ status: 410, contentType: "application/json", body: "{}" });
      return;
    }
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
  await expect(page.getByText("creator@example.com")).toBeVisible();
  expired = true;
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await expect(page.getByRole("heading", { name: /연결 시간이 지나/ })).toBeVisible();
  await expect(page.getByText("creator@example.com")).toHaveCount(0);
});

test("LAST04 complete pageshow 5xx or network failures preserve verified receipt", async ({ page }) => {
  let mode: "ok" | "five-hundred" | "network" = "ok";
  await page.route("**/api/onboarding/status?**", async (route) => {
    if (mode === "five-hundred") {
      await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
      return;
    }
    if (mode === "network") {
      await route.abort();
      return;
    }
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
  await expect(page.getByText("creator@example.com")).toBeVisible();
  mode = "five-hundred";
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await expect(page.getByText("creator@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: /연결 시간이 지나/ })).toHaveCount(0);

  mode = "network";
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow")));
  await expect(page.getByText("creator@example.com")).toBeVisible();
  await expect(page.getByRole("heading", { name: /연결 시간이 지나/ })).toHaveCount(0);
});

test("AU13 connection-error unknown code query falls back safely", async ({ page }) => {
  await page.goto(`/connection-error?attemptId=${attemptId}&code=<script>alert(1)</script>`);
  await expect(page.getByRole("heading", { name: "연결을 확인하지 못했어요." })).toBeVisible();
});

test("UI05 contact edit opens public CONTACT_EMAIL modal without internal notification address", async ({ page }) => {
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
  await page.getByRole("button", { name: "입력한 연락처에 수정이 필요한가요?" }).click();
  await expect(page.getByRole("dialog", { name: "연락처 수정 안내" })).toBeVisible();
  await expect(page.getByRole("link", { name: "support@example.com" })).toHaveAttribute("href", "mailto:support@example.com");
  await expect(page.getByText("dkssud374@celeblife.co.kr")).toHaveCount(0);
});

test("G07 public policy pages render configured public contact and never internal notification address", async ({ page }) => {
  for (const path of ["/policies/privacy", "/policies/deletion"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "support@example.com" })).toHaveAttribute("href", "mailto:support@example.com");
    await expect(page.getByText("dkssud374@celeblife.co.kr")).toHaveCount(0);
  }
});

test("UI10 complete direct access does not render success without DB completed status", async ({ page }) => {
  await page.route("**/api/onboarding/status?**", async (route) => {
    await route.fulfill({ status: 410, contentType: "application/json", body: "{}" });
  });
  await page.goto(`/complete?attemptId=${attemptId}`);
  await expect(page.getByRole("heading", { name: /연결 시간이 지나/ })).toBeVisible();
  await expect(page.getByText("연동이 완료되었습니다.")).toHaveCount(0);
  await expect(page.getByText("creator@example.com")).toHaveCount(0);
});
