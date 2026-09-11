import { describe, expect, it } from "vitest";
import { createContentSecurityPolicy } from "../../proxy";

describe("request-scoped CSP", () => {
  it("SE04 uses a strict production nonce without unsafe script or style execution", () => {
    const policy = createContentSecurityPolicy("fixed-nonce", false);

    expect(policy).toContain("script-src 'self' 'nonce-fixed-nonce' 'strict-dynamic'");
    expect(policy).toContain("style-src 'self' 'nonce-fixed-nonce'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("development permits only the eval/style exceptions required by Next tooling", () => {
    const policy = createContentSecurityPolicy("dev-nonce", true);
    const scriptDirective = policy.split(";").find((value) => value.trim().startsWith("script-src"));
    const styleDirective = policy.split(";").find((value) => value.trim().startsWith("style-src"));

    expect(scriptDirective).toContain("'nonce-dev-nonce'");
    expect(scriptDirective).toContain("'unsafe-eval'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(styleDirective).toContain("'unsafe-inline'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });
});
