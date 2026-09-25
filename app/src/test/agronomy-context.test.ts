import { describe, expect, it, vi } from "vitest";

vi.mock("../infra/supabase/client", () => ({
  supabase: null
}));

import { createSetupAgronomyAttempt } from "../application/agronomy/agronomy-context-service";

describe("agronomy context setup", () => {
  it("generates stable client-owned identities for a retryable setup", () => {
    const attempt = createSetupAgronomyAttempt({
      organizationId: "org-1",
      deviceId: "device-1",
      establishmentName: " Campo Norte ",
      fieldName: " Lote 7 ",
      nominalAreaHa: 180,
      campaignName: " 2026/27 ",
      campaignStartsOn: "2026-07-01",
      campaignEndsOn: "2027-06-30"
    });

    expect(attempt.establishment.name).toBe("Campo Norte");
    expect(attempt.field.name).toBe("Lote 7");
    expect(attempt.field.nominalAreaHa).toBe(180);
    expect(attempt.campaign.name).toBe("2026/27");
    expect(attempt.establishment.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(attempt.field.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(attempt.campaign.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
