import { describe, it, expect, beforeEach } from "vitest";
import { getSessions, saveSession, deleteSession } from "./sessions";
import type { Session } from "../lib/types";

function makeFakeStorage() {
  const store: Record<string, any> = {};
  return {
    async get(key: string) {
      return { [key]: store[key] };
    },
    async set(items: Record<string, any>) {
      Object.assign(store, items);
    },
  };
}

describe("session storage", () => {
  let storage: ReturnType<typeof makeFakeStorage>;
  beforeEach(() => {
    storage = makeFakeStorage();
  });

  it("returns an empty array when no sessions are saved", async () => {
    expect(await getSessions(storage)).toEqual([]);
  });

  it("saves and retrieves a session", async () => {
    const session: Session = { id: "s1", createdAt: 1, groups: [] };
    await saveSession(storage, session);
    expect(await getSessions(storage)).toEqual([session]);
  });

  it("deletes a session by id", async () => {
    const s1: Session = { id: "s1", createdAt: 1, groups: [] };
    const s2: Session = { id: "s2", createdAt: 2, groups: [] };
    await saveSession(storage, s1);
    await saveSession(storage, s2);
    await deleteSession(storage, "s1");
    expect(await getSessions(storage)).toEqual([s2]);
  });
});
