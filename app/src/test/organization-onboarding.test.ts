import { describe, expect, it, vi } from "vitest";

vi.mock("../infra/supabase/client", () => ({
  supabase: null
}));

import { createBootstrapAttempt } from "../application/organizations/organization-service";

describe("organization onboarding", () => {
  it("creates a stable retry envelope with generated ids", () => {
    const attempt = createBootstrapAttempt("  Estancia Sur  ");

    expect(attempt.organizationName).toBe("Estancia Sur");
    expect(attempt.clientOperationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(attempt.organizationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(attempt.schemaVersion).toBe(1);
    expect(new Date(attempt.occurredAtLocal).toString()).not.toBe("Invalid Date");
  });
});
