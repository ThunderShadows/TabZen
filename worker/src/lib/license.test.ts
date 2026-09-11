import { describe, it, expect } from "vitest";
import { getLicenseStatus, setLicensePaid } from "./license";

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

describe("license status", () => {
  it("defaults to 'free' for an unknown email", async () => {
    const kv = makeFakeKV();
    expect(await getLicenseStatus(kv, "nobody@example.com")).toBe("free");
  });

  it("returns 'paid' after setLicensePaid is called", async () => {
    const kv = makeFakeKV();
    await setLicensePaid(kv, "buyer@example.com");
    expect(await getLicenseStatus(kv, "buyer@example.com")).toBe("paid");
  });

  it("normalizes email case when looking up status", async () => {
    const kv = makeFakeKV();
    await setLicensePaid(kv, "Buyer@Example.com");
    expect(await getLicenseStatus(kv, "buyer@example.com")).toBe("paid");
  });
});
