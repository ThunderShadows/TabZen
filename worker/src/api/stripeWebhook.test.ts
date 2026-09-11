import { describe, it, expect, vi } from "vitest";
import { handleStripeWebhook } from "./stripeWebhook";
import { getLicenseStatus } from "../lib/license";
import type { Env } from "../index";

const constructEventMock = vi.fn();

vi.mock("stripe", () => {
  const MockStripe: any = vi.fn().mockImplementation(function () {
    return {
      webhooks: { constructEventAsync: constructEventMock },
    };
  });
  MockStripe.createFetchHttpClient = vi.fn();
  return { default: MockStripe };
});

function makeFakeKV() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  } as unknown as KVNamespace;
}

function makeEnv(): Env {
  return {
    TABZEN_KV: makeFakeKV(),
    ANTHROPIC_API_KEY: "test-key",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  };
}

describe("handleStripeWebhook", () => {
  it("marks the license paid on checkout.session.completed", async () => {
    constructEventMock.mockResolvedValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { customer_details: { email: "buyer@example.com" } } },
    });
    const env = makeEnv();
    const request = new Request("https://worker.test/api/stripe-webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig" },
    });
    const response = await handleStripeWebhook(request, env);
    expect(response.status).toBe(200);
    expect(await getLicenseStatus(env.TABZEN_KV, "buyer@example.com")).toBe("paid");
  });

  it("ignores a duplicate delivery of the same event id", async () => {
    constructEventMock.mockResolvedValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { customer_details: { email: "buyer2@example.com" } } },
    });
    const env = makeEnv();
    const request = () =>
      new Request("https://worker.test/api/stripe-webhook", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "sig" },
      });
    await handleStripeWebhook(request(), env);
    const second = await handleStripeWebhook(request(), env);
    expect(second.status).toBe(200);
    expect(await getLicenseStatus(env.TABZEN_KV, "buyer2@example.com")).toBe("paid");
  });
});
