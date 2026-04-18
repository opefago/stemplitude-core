import { describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.fn();

vi.mock("./client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import {
  deleteRateLimitOverride,
  listRateLimitOverrides,
  upsertRateLimitOverride,
} from "./platform";

describe("platform rate limit api helpers", () => {
  it("builds list overrides query", async () => {
    apiFetchMock.mockResolvedValueOnce({ items: [], total: 0, offset: 0, limit: 50 });
    await listRateLimitOverrides({
      scope_type: "tenant",
      profile_key: "strict_auth",
      offset: 20,
      limit: 25,
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/platform/rate-limits/overrides?offset=20&limit=25&scope_type=tenant&profile_key=strict_auth"
    );
  });

  it("sends upsert override payload", async () => {
    apiFetchMock.mockResolvedValueOnce({});
    await upsertRateLimitOverride({
      scope_type: "user",
      scope_id: "u1",
      mode: "profile_plus_custom",
      profile_key: "relaxed",
      custom_limit: 900,
      reason: "manual support action",
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/platform/rate-limits/overrides", {
      method: "PUT",
      body: {
        scope_type: "user",
        scope_id: "u1",
        mode: "profile_plus_custom",
        profile_key: "relaxed",
        custom_limit: 900,
        reason: "manual support action",
      },
    });
  });

  it("formats delete override path", async () => {
    apiFetchMock.mockResolvedValueOnce({ deleted: true });
    await deleteRateLimitOverride("tenant", "tenant id");
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/platform/rate-limits/overrides/tenant/tenant%20id",
      { method: "DELETE" }
    );
  });
});
