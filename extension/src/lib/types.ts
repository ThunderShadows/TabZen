export interface TabInfo {
  title: string;
  url: string;
}

export interface SessionGroup {
  name: string;
  tabs: TabInfo[];
}

export interface Session {
  id: string;
  createdAt: number;
  groups: SessionGroup[];
}
