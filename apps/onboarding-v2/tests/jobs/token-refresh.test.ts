import { describe, expect, it } from "vitest";
import { classifyRefreshFailure, expiryFromResponse, instagramRefreshEndpoint } from "@/lib/jobs/token-refresh";

describe("token refresh policy helpers", () => {
  it("TO01 TO04 requires positive expires_in and carries expiry from provider response", () => {
    expect(
      expiryFromResponse(
        { access_token: "new-token", expires_in: 3600 },
        new Date("2026-09-11T00:00:00Z"),
      ),
    ).toEqual({
      accessToken: "new-token",
      expiresAt: "2026-09-11T01:00:00.000Z",
    });

    expect(() => expiryFromResponse({ access_token: "new-token", expires_in: 0 })).toThrow(
      "INVALID_TOKEN_RESPONSE",
    );
    expect(() => expiryFromResponse({ access_token: "", expires_in: 3600 })).toThrow(
      "INVALID_TOKEN_RESPONSE",
    );
  });

  it("TO05 AUDIT07 classifies invalid credentials separately from transient failures", () => {
    expect(classifyRefreshFailure(new Error("INSTAGRAM_REFRESH_HTTP_400"))).toBe(
      "invalid_credentials",
    );
    expect(classifyRefreshFailure(new Error("network timeout"))).toBe("transient");
    expect(
      classifyRefreshFailure(new Error("anything"), { expires_at: "2000-01-01T00:00:00Z" }),
    ).toBe("expired");
  });

  it("TO01 AUDIT07 only allows the official Graph refresh endpoint shape", () => {
    expect(instagramRefreshEndpoint({}).toString()).toBe("https://graph.instagram.com/refresh_access_token");
    expect(
      instagramRefreshEndpoint({
        INSTAGRAM_REFRESH_TOKEN_ENDPOINT: "https://graph.instagram.com/refresh_access_token?ignored=true",
      }).toString(),
    ).toBe("https://graph.instagram.com/refresh_access_token");
    expect(() =>
      instagramRefreshEndpoint({
        INSTAGRAM_REFRESH_TOKEN_ENDPOINT: "https://graph.instagram.com/v22.0/refresh_access_token",
      }),
    ).toThrow("INVALID_INSTAGRAM_REFRESH_ENDPOINT");
    expect(() =>
      instagramRefreshEndpoint({
        INSTAGRAM_REFRESH_TOKEN_ENDPOINT: "https://attacker.example/refresh_access_token",
      }),
    ).toThrow("INVALID_INSTAGRAM_REFRESH_ENDPOINT");
  });
});
