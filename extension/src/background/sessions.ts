import type { Session } from "../lib/types";

export interface Storage {
  get(key: string): Promise<Record<string, any>>;
  set(items: Record<string, any>): Promise<void>;
}

const SESSIONS_KEY = "tabzen_sessions";

export async function getSessions(storage: Storage): Promise<Session[]> {
  const result = await storage.get(SESSIONS_KEY);
  return result[SESSIONS_KEY] ?? [];
}

export async function saveSession(storage: Storage, session: Session): Promise<void> {
  const sessions = await getSessions(storage);
  sessions.push(session);
  await storage.set({ [SESSIONS_KEY]: sessions });
}

export async function deleteSession(storage: Storage, id: string): Promise<void> {
  const sessions = await getSessions(storage);
  await storage.set({ [SESSIONS_KEY]: sessions.filter((s) => s.id !== id) });
}
