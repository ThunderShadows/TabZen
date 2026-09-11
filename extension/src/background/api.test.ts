import { describe, it, expect, vi, afterEach } from "vitest";
import { callGroupApi, callCreateCheckout, callLicenseCheck } from "./api";

const WORKER_BASE_URL = "https://tabzen-worker.example.workers.dev";

describe("worker API client", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts tabs to /api/group and returns groups", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [{ name: "Docs", tabs: [] }] }),
    }) as any;
    const groups = await callGroupApi([{ title: "t", url: "https://x.com" }]);
    expect(groups).toEqual([{ name: "Docs", tabs: [] }]);
    expect(global.fetch).toHaveBeenCalledWith(
      `${WORKER_BASE_URL}/api/group`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts to /api/create-checkout and returns the URL", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/x" }),
    }) as any;
    const url = await callCreateCheckout();
    expect(url).toBe("https://checkout.stripe.com/x");
  });

  it("posts to /api/license/check and returns the status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "paid" }),
    }) as any;
    const status = await callLicenseCheck("buyer@example.com");
    expect(status).toBe("paid");
  });
});
