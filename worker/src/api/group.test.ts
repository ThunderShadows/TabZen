import { describe, it, expect, vi, afterEach } from "vitest";
import { handleGroup } from "./group";
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

const tabs = [{ title: "Vue docs", url: "https://vuejs.org" }];

describe("handleGroup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns LLM-produced groups when the LLM call succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: JSON.stringify({ groups: [{ name: "Frontend docs", tabs }] }) }],
        }),
      })
    );

    const request = new Request("https://worker.test/api/group", {
      method: "POST",
      body: JSON.stringify({ tabs }),
    });
    const response = await handleGroup(request, makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { groups: any[] };
    expect(body.groups).toEqual([{ name: "Frontend docs", tabs }]);
  });

  it("falls back to domain grouping when the LLM call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const request = new Request("https://worker.test/api/group", {
      method: "POST",
      body: JSON.stringify({ tabs }),
    });
    const response = await handleGroup(request, makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { groups: any[] };
    expect(body.groups).toEqual([{ name: "vuejs.org", tabs }]);
  });

  it("returns a rate_limited error once the free-tier daily limit is hit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ content: [{ text: JSON.stringify({ groups: [] }) }] }),
      })
    );

    const env = makeEnv();
    const request = () =>
      new Request("https://worker.test/api/group", { method: "POST", body: JSON.stringify({ tabs }) });

    await handleGroup(request(), env); // 1st call consumes the free-tier quota of 1
    const second = await handleGroup(request(), env);
    expect(second.status).toBe(429);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });
});
