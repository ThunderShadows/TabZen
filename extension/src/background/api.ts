import type { TabInfo, SessionGroup } from "../lib/types";

const WORKER_BASE_URL = "https://tabzen-worker.example.workers.dev";

export async function callGroupApi(tabs: TabInfo[], licenseKey?: string): Promise<SessionGroup[]> {
  const response = await fetch(`${WORKER_BASE_URL}/api/group`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tabs, licenseKey }),
  });
  const data = (await response.json()) as { groups: SessionGroup[] };
  return data.groups;
}

export async function callCreateCheckout(): Promise<string> {
  const response = await fetch(`${WORKER_BASE_URL}/api/create-checkout`, { method: "POST" });
  const data = (await response.json()) as { url: string };
  return data.url;
}

export async function callLicenseCheck(email: string): Promise<"paid" | "free"> {
  const response = await fetch(`${WORKER_BASE_URL}/api/license/check`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await response.json()) as { status: "paid" | "free" };
  return data.status;
}
