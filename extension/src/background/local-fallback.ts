import type { TabInfo, SessionGroup } from "../lib/types";

export function groupTabsFallback(tabs: TabInfo[]): SessionGroup[] {
  const byHost = new Map<string, TabInfo[]>();
  for (const tab of tabs) {
    let host = "other";
    try {
      host = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch {
      // leave as "other"
    }
    const list = byHost.get(host) ?? [];
    list.push(tab);
    byHost.set(host, list);
  }
  return Array.from(byHost.entries()).map(([host, tabs]) => ({ name: host, tabs }));
}
