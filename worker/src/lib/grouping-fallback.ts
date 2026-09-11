export interface TabInfo {
  title: string;
  url: string;
}

export interface SessionGroup {
  name: string;
  tabs: TabInfo[];
}

export function groupTabsFallback(tabs: TabInfo[]): SessionGroup[] {
  const byHost = new Map<string, TabInfo[]>();
  for (const tab of tabs) {
    let host = "other";
    try {
      host = new URL(tab.url).hostname.replace(/^www\./, "");
    } catch {
      // chrome://, about:, or malformed URLs fall into "other"
    }
    const list = byHost.get(host) ?? [];
    list.push(tab);
    byHost.set(host, list);
  }
  return Array.from(byHost.entries()).map(([name, tabs]) => ({ name, tabs }));
}
