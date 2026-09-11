import { getSessions, saveSession, deleteSession, type Storage } from "./sessions";
import type { Session } from "../lib/types";
import { groupTabsFallback } from "./local-fallback";

const storage: Storage = {
  get: (key) => chrome.storage.local.get(key),
  set: (items) => chrome.storage.local.set(items),
};

async function getState() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const sessions = await getSessions(storage);
  return { tabCount: tabs.length, sessions };
}

async function tidyUp(): Promise<Session> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tabInfos = tabs.map((t) => ({ title: t.title ?? "", url: t.url ?? "" }));
  const groups = groupTabsFallback(tabInfos);
  const session: Session = { id: crypto.randomUUID(), createdAt: Date.now(), groups };
  await saveSession(storage, session);
  return session;
}

async function restoreSession(id: string) {
  const sessions = await getSessions(storage);
  const session = sessions.find((s) => s.id === id);
  if (!session) return;
  for (const group of session.groups) {
    for (const tab of group.tabs) {
      await chrome.tabs.create({ url: tab.url });
    }
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "GET_STATE":
        sendResponse(await getState());
        break;
      case "TIDY_UP":
        sendResponse(await tidyUp());
        break;
      case "RESTORE_SESSION":
        await restoreSession(message.id);
        sendResponse({ ok: true });
        break;
      case "DELETE_SESSION":
        await deleteSession(storage, message.id);
        sendResponse({ ok: true });
        break;
    }
  })();
  return true; // keep the message channel open for the async response
});
