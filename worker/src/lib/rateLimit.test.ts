import { describe, it, expect } from "vitest";
import { checkAndIncrementRateLimit } from "./rateLimit";

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

describe("checkAndIncrementRateLimit", () => {
  it("allows the first N calls up to the limit", async () => {
    const kv = makeFakeKV();
    expect(await checkAndIncrementRateLimit(kv, "user1", 2)).toBe(true);
    expect(await checkAndIncrementRateLimit(kv, "user1", 2)).toBe(true);
  });

  it("rejects calls once the limit is reached", async () => {
    const kv = makeFakeKV();
    await checkAndIncrementRateLimit(kv, "user1", 1);
    expect(await checkAndIncrementRateLimit(kv, "user1", 1)).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const kv = makeFakeKV();
    await checkAndIncrementRateLimit(kv, "user1", 1);
    expect(await checkAndIncrementRateLimit(kv, "user2", 1)).toBe(true);
  });
});
