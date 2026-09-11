import { describe, it, expect } from "vitest";
import { handleLicenseCheck } from "./licenseCheck";
import { setLicensePaid } from "../lib/license";
import type { Env } from "../index";

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

describe("handleLicenseCheck", () => {
  it("returns status 'free' for an unknown email", async () => {
    const env = makeEnv();
    const request = new Request("https://worker.test/api/license/check", {
      method: "POST",
      body: JSON.stringify({ email: "nobody@example.com" }),
    });
    const response = await handleLicenseCheck(request, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "free" });
  });

  it("returns status 'paid' for a licensed email", async () => {
    const env = makeEnv();
    await setLicensePaid(env.TABZEN_KV, "buyer@example.com");
    const request = new Request("https://worker.test/api/license/check", {
      method: "POST",
      body: JSON.stringify({ email: "buyer@example.com" }),
    });
    const response = await handleLicenseCheck(request, env);
    expect(await response.json()).toEqual({ status: "paid" });
  });
});
