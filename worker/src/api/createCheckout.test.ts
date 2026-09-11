import { describe, it, expect, vi } from "vitest";
import { handleCreateCheckout } from "./createCheckout";
import type { Env } from "../index";

vi.mock("stripe", () => {
  const MockStripe: any = vi.fn().mockImplementation(function () {
    return {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/test" }),
        },
      },
    };
  });
  MockStripe.createFetchHttpClient = vi.fn();
  return { default: MockStripe };
});

function makeEnv(): Env {
  return {
    TABZEN_KV: {} as any,
    ANTHROPIC_API_KEY: "test-key",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  };
}

describe("handleCreateCheckout", () => {
  it("returns a Stripe Checkout URL", async () => {
    const request = new Request("https://worker.test/api/create-checkout", { method: "POST" });
    const response = await handleCreateCheckout(request, makeEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/session/test" });
  });
});
