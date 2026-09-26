import { describe, expect, it } from "vitest";
import { buildAuthRedirectUrl } from "../application/auth/auth-service";

describe("auth confirmation redirect", () => {
  it("targets the deployed SURKARA preview instead of localhost", () => {
    expect(
      buildAuthRedirectUrl(
        "https://spuklab.github.io",
        "/AgroPro-/preview/"
      )
    ).toBe("https://spuklab.github.io/AgroPro-/preview/");
  });

  it("keeps local development on the current origin", () => {
    expect(buildAuthRedirectUrl("http://localhost:5173", "/")).toBe(
      "http://localhost:5173/"
    );
  });
});
