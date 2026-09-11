import { getSessions, saveSession, deleteSession, type Storage } from "./sessions";
import type { Session } from "../lib/types";
import { groupTabsFallback } from "./local-fallback";
import { callGroupApi, callCreateCheckout, callLicenseCheck } from "./api";

const storage: Storage = {
  get: (key) => chrome.storage.local.get(key),
  set: (items) => chrome.storage.local.set(items),
};

const LICENSE_KEY_STORAGE = "tabzen_license_email";

async function getLicenseStatus(): Promise<"paid" | "free"> {
  const { [LICENSE_KEY_STORAGE]: email } = await storage.get(LICENSE_KEY_STORAGE);
  if (!email) return "free";
  try {
    return await callLicenseCheck(email);
  } catch {
    return "free"; // network failure: don't silently upgrade; caller can retry
  }
}

async function getState() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const sessions = await getSessions(storage);
  const licenseStatus = await getLicenseStatus();
  return { tabCount: tabs.length, sessions, licenseStatus };
}

async function tidyUp(): Promise<Session> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const tabInfos = tabs.map((t) => ({ title: t.title ?? "", url: t.url ?? "" }));

  let groups;
  try {
    groups = await callGroupApi(tabInfos);
  } catch {
    groups = groupTabsFallback(tabInfos);
  }

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

async function upgrade(): Promise<string> {
  return callCreateCheckout();
}

async function activateLicense(email: string) {
  await storage.set({ [LICENSE_KEY_STORAGE]: email });
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
      case "UPGRADE":
        sendResponse({ url: await upgrade() });
        break;
      case "ACTIVATE_LICENSE":
        await activateLicense(message.email);
        sendResponse({ ok: true });
        break;
    }
  })();
  return true;
});
