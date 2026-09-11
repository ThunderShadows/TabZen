# Tab Zen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome (Manifest V3) extension that AI-groups open tabs into named, animated "sessions," backed by a Cloudflare Worker that handles the LLM call, rate limiting, and Stripe-based licensing.

**Architecture:** A React+Vite popup and a background service worker make up the extension; the worker talks to a Cloudflare Worker API (`/api/group`, `/api/license/check`, `/api/stripe-webhook`) backed by Workers KV. The LLM call lives server-side so no API key ships in the extension; a pure domain-grouping heuristic is the fallback when the LLM call fails.

**Tech Stack:** TypeScript, React, Vite (`vite-plugin-web-extension`), Vitest + Testing Library, Cloudflare Workers + Workers KV (`wrangler`), Stripe Checkout + webhooks.

**Spec:** `docs/superpowers/specs/2026-09-11-tab-zen-design.md`

## Global Constraints

- Manifest V3 only, Chrome only, no other browsers at v1 (per spec Non-goals).
- No user accounts/auth beyond email-keyed license lookup (per spec Non-goals).
- LLM API keys never ship in the extension bundle — all LLM calls happen in the Worker (per spec Data flow step 4 and Tech choices).
- `/api/group` must return a usable result even when the LLM call fails, via the domain-grouping fallback (per spec Error handling).
- Stripe webhook processing must be idempotent, keyed by Stripe event id (per spec Error handling).
- Free tier: 1 AI grouping per day; enforced via Workers KV rate limit (per spec Data flow step 3).

---

## Task 1: Extension project scaffold

**Files:**
- Create: `extension/package.json`
- Create: `extension/tsconfig.json`
- Create: `extension/vite.config.ts`
- Create: `extension/manifest.json`
- Create: `extension/src/popup/main.tsx`
- Create: `extension/src/popup/Popup.tsx`
- Create: `extension/src/popup/Popup.css`

**Interfaces:**
- Produces: a buildable Vite web-extension project; `Popup` React component (no props yet) rendered into `#root`.

- [ ] **Step 1: Create the extension package**

```bash
mkdir -p /home/sumanth/Documents/TabZen/extension/src/popup
cd /home/sumanth/Documents/TabZen/extension
npm init -y
npm install react react-dom
npm install -D vite @vitejs/plugin-react vite-plugin-web-extension typescript vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["chrome"]
  },
  "include": ["src"]
}
```

Also run: `npm install -D @types/chrome`

- [ ] **Step 3: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Tab Zen",
  "version": "0.1.0",
  "description": "Tidy your tabs into beautiful, AI-grouped sessions.",
  "action": {
    "default_popup": "src/popup/index.html"
  },
  "background": {
    "service_worker": "src/background/index.ts",
    "type": "module"
  },
  "permissions": ["tabs", "storage"]
}
```

- [ ] **Step 4: Write `extension/src/popup/index.html`**

```html
<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Tab Zen</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: "manifest.json",
    }),
  ],
});
```

- [ ] **Step 6: Write `Popup.tsx` and `Popup.css`**

```tsx
// extension/src/popup/Popup.tsx
export function Popup() {
  return (
    <div className="popup">
      <h1>Tab Zen</h1>
    </div>
  );
}
```

```css
/* extension/src/popup/Popup.css */
.popup {
  width: 320px;
  min-height: 200px;
  padding: 16px;
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 7: Write `main.tsx`**

```tsx
// extension/src/popup/main.tsx
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "./Popup.css";

const root = document.getElementById("root")!;
createRoot(root).render(<Popup />);
```

- [ ] **Step 8: Add build/test scripts to `package.json`**

Edit `extension/package.json`, add under `"scripts"`:

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
    "test": "vitest run"
  }
}
```

- [ ] **Step 9: Verify the build succeeds**

Run: `cd /home/sumanth/Documents/TabZen/extension && npm run build`
Expected: exits 0, `dist/` contains `manifest.json` and popup assets.

- [ ] **Step 10: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add extension/
git commit -m "feat(extension): scaffold Vite+React popup extension"
```

---

## Task 2: Popup UI — tab count, Tidy Up button, session cards

**Files:**
- Create: `extension/src/lib/types.ts`
- Modify: `extension/src/popup/Popup.tsx`
- Modify: `extension/src/popup/Popup.css`
- Test: `extension/src/popup/Popup.test.tsx`
- Create: `extension/vitest.config.ts`

**Interfaces:**
- Consumes: none (uses local mock data this task; wired to real data in Task 3).
- Produces: `TabInfo { title: string; url: string }`, `SessionGroup { name: string; tabs: TabInfo[] }`, `Session { id: string; createdAt: number; groups: SessionGroup[] }` (from `types.ts`) — consumed by Task 3 (background/storage) and Task 5 (Worker response shape).
- Produces: `Popup` props `{ tabCount: number; sessions: Session[]; onTidyUp: () => void; onRestore: (id: string) => void; onDelete: (id: string) => void }`.

- [ ] **Step 1: Write `extension/src/lib/types.ts`**

```ts
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
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

Create `extension/vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Write the failing test**

```tsx
// extension/src/popup/Popup.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Popup } from "./Popup";
import type { Session } from "../lib/types";

describe("Popup", () => {
  it("shows the open tab count and a disabled Tidy Up button with 0 or 1 tabs", () => {
    render(<Popup tabCount={1} sessions={[]} onTidyUp={vi.fn()} onRestore={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/1 tab open/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tidy up/i })).toBeDisabled();
  });

  it("enables Tidy Up with 2+ tabs and calls onTidyUp when clicked", () => {
    const onTidyUp = vi.fn();
    render(<Popup tabCount={5} sessions={[]} onTidyUp={onTidyUp} onRestore={vi.fn()} onDelete={vi.fn()} />);
    const button = screen.getByRole("button", { name: /tidy up/i });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onTidyUp).toHaveBeenCalledOnce();
  });

  it("renders session cards with restore and delete actions", () => {
    const sessions: Session[] = [
      { id: "s1", createdAt: Date.now(), groups: [{ name: "Research", tabs: [{ title: "Vue docs", url: "https://vuejs.org" }] }] },
    ];
    const onRestore = vi.fn();
    const onDelete = vi.fn();
    render(<Popup tabCount={3} sessions={sessions} onTidyUp={vi.fn()} onRestore={onRestore} onDelete={onDelete} />);
    expect(screen.getByText("Research")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith("s1");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/popup/Popup.test.tsx`
Expected: FAIL — `Popup` does not accept these props yet.

- [ ] **Step 5: Implement `Popup.tsx`**

```tsx
// extension/src/popup/Popup.tsx
import type { Session } from "../lib/types";

export interface PopupProps {
  tabCount: number;
  sessions: Session[];
  onTidyUp: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Popup({ tabCount, sessions, onTidyUp, onRestore, onDelete }: PopupProps) {
  const canTidy = tabCount >= 2;

  return (
    <div className="popup">
      <h1>Tab Zen</h1>
      <p className="tab-count">{tabCount} tab{tabCount === 1 ? "" : "s"} open</p>
      <button className="tidy-button" disabled={!canTidy} onClick={onTidyUp}>
        Tidy Up
      </button>

      {sessions.length === 0 ? (
        <p className="empty-state">No saved sessions yet.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id} className="session-card">
              {session.groups.map((group) => (
                <div key={group.name} className="session-group">
                  <h2>{group.name}</h2>
                  <span className="tab-badge">{group.tabs.length}</span>
                </div>
              ))}
              <div className="session-actions">
                <button onClick={() => onRestore(session.id)}>Restore</button>
                <button onClick={() => onDelete(session.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/popup/Popup.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 7: Add the collapse/expand animation styling**

```css
/* extension/src/popup/Popup.css — append */
.tidy-button {
  width: 100%;
  padding: 10px;
  margin: 12px 0;
  border: none;
  border-radius: 8px;
  background: #6366f1;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.tidy-button:disabled {
  background: #c7c7d1;
  cursor: not-allowed;
}
.tidy-button:not(:disabled):active {
  transform: scale(0.97);
}
.session-card {
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #f4f4f8;
  animation: card-in 0.25s ease-out;
}
@keyframes card-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.session-group { display: flex; justify-content: space-between; align-items: center; }
.tab-badge { background: #6366f1; color: white; border-radius: 999px; padding: 2px 8px; font-size: 12px; }
.session-actions { display: flex; gap: 8px; margin-top: 8px; }
```

- [ ] **Step 8: Update `main.tsx` to pass mock props (temporary, replaced in Task 3)**

```tsx
// extension/src/popup/main.tsx
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup";
import "./Popup.css";

const root = document.getElementById("root")!;
createRoot(root).render(
  <Popup tabCount={0} sessions={[]} onTidyUp={() => {}} onRestore={() => {}} onDelete={() => {}} />
);
```

- [ ] **Step 9: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add extension/
git commit -m "feat(popup): add tab count, Tidy Up button, and session cards UI"
```

---

## Task 3: Background service worker + chrome.storage session logic

**Files:**
- Create: `extension/src/background/sessions.ts`
- Create: `extension/src/background/sessions.test.ts`
- Create: `extension/src/background/index.ts`
- Modify: `extension/src/popup/main.tsx`

**Interfaces:**
- Consumes: `Session`, `SessionGroup`, `TabInfo` from `extension/src/lib/types.ts` (Task 2).
- Produces: `sessions.ts` exports `getSessions(storage): Promise<Session[]>`, `saveSession(storage, session: Session): Promise<void>`, `deleteSession(storage, id: string): Promise<void>` where `storage` is a minimal interface `{ get(key: string): Promise<any>; set(items: Record<string, any>): Promise<void> }` (satisfied by `chrome.storage.local` or a fake in tests).
- Produces: `index.ts` registers a `chrome.runtime.onMessage` listener handling `{ type: "GET_STATE" }`, `{ type: "TIDY_UP" }`, `{ type: "RESTORE_SESSION", id }`, `{ type: "DELETE_SESSION", id }` — consumed by the popup in this task's Step 8 and extended in Task 8.

- [ ] **Step 1: Write the failing test for session storage**

```ts
// extension/src/background/sessions.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/background/sessions.test.ts`
Expected: FAIL — `./sessions` does not exist.

- [ ] **Step 3: Implement `sessions.ts`**

```ts
// extension/src/background/sessions.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/background/sessions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Implement the background service worker message handler**

```ts
// extension/src/background/index.ts
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
```

- [ ] **Step 6: Write the temporary local fallback grouping used by the background worker**

This is a placeholder used only until Task 5 wires the real Worker API call; it groups tabs by hostname so `tidyUp()` is functional and testable end-to-end before the backend exists.

```ts
// extension/src/background/local-fallback.ts
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
```

- [ ] **Step 7: Update `manifest.json`'s background entry to the new file (already points at `src/background/index.ts` from Task 1 — verify it matches)**

No change needed; confirm `manifest.json`'s `"background"` block still reads `"service_worker": "src/background/index.ts"`.

- [ ] **Step 8: Wire the popup to the background worker via messages**

```tsx
// extension/src/popup/main.tsx
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Popup } from "./Popup";
import type { Session } from "../lib/types";
import "./Popup.css";

function App() {
  const [tabCount, setTabCount] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);

  async function refresh() {
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    setTabCount(state.tabCount);
    setSessions(state.sessions);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Popup
      tabCount={tabCount}
      sessions={sessions}
      onTidyUp={async () => {
        await chrome.runtime.sendMessage({ type: "TIDY_UP" });
        await refresh();
      }}
      onRestore={async (id) => {
        await chrome.runtime.sendMessage({ type: "RESTORE_SESSION", id });
      }}
      onDelete={async (id) => {
        await chrome.runtime.sendMessage({ type: "DELETE_SESSION", id });
        await refresh();
      }}
    />
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
```

- [ ] **Step 9: Run the full extension test suite and build**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 10: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add extension/
git commit -m "feat(background): add session storage, message handler, and host-based fallback grouping"
```

---

## Task 4: Cloudflare Worker scaffold + domain-grouping fallback heuristic

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/lib/grouping-fallback.ts`
- Create: `worker/src/lib/grouping-fallback.test.ts`
- Create: `worker/src/index.ts`

**Interfaces:**
- Produces: `groupTabsFallback(tabs: TabInfo[]): SessionGroup[]` in `worker/src/lib/grouping-fallback.ts` (mirrors the extension's `TabInfo`/`SessionGroup` shapes — duplicated here since the Worker is a separate deployable with its own dependency tree) — consumed by Task 5's `/api/group` handler.
- Produces: an `Env` interface (`TABZEN_KV: KVNamespace`, `ANTHROPIC_API_KEY: string`, `STRIPE_SECRET_KEY: string`, `STRIPE_WEBHOOK_SECRET: string`) in `worker/src/index.ts` — consumed by Tasks 5, 6, 7.

- [ ] **Step 1: Create the worker package**

```bash
mkdir -p /home/sumanth/Documents/TabZen/worker/src/lib
cd /home/sumanth/Documents/TabZen/worker
npm init -y
npm install -D typescript vitest wrangler @cloudflare/workers-types
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["ES2021"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `wrangler.toml`**

```toml
name = "tabzen-worker"
main = "src/index.ts"
compatibility_date = "2026-01-01"

kv_namespaces = [
  { binding = "TABZEN_KV", id = "REPLACE_WITH_REAL_KV_ID" }
]
```

- [ ] **Step 4: Write the failing test for the fallback heuristic**

```ts
// worker/src/lib/grouping-fallback.test.ts
import { describe, it, expect } from "vitest";
import { groupTabsFallback } from "./grouping-fallback";

describe("groupTabsFallback", () => {
  it("groups tabs by hostname, stripping www.", () => {
    const groups = groupTabsFallback([
      { title: "Vue docs", url: "https://vuejs.org/guide" },
      { title: "Vue API", url: "https://www.vuejs.org/api" },
      { title: "React docs", url: "https://react.dev" },
    ]);
    const names = groups.map((g) => g.name).sort();
    expect(names).toEqual(["react.dev", "vuejs.org"]);
    const vueGroup = groups.find((g) => g.name === "vuejs.org")!;
    expect(vueGroup.tabs).toHaveLength(2);
  });

  it("puts unparseable URLs into an 'other' group instead of throwing", () => {
    const groups = groupTabsFallback([{ title: "Internal", url: "chrome://extensions" }]);
    expect(groups.some((g) => g.name === "other" || g.name === "extensions")).toBe(true);
  });

  it("returns an empty array for no tabs", () => {
    expect(groupTabsFallback([])).toEqual([]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/grouping-fallback.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 6: Implement `grouping-fallback.ts`**

```ts
// worker/src/lib/grouping-fallback.ts
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
```

Note: `new URL("chrome://extensions").hostname` is `"extensions"`, satisfying the second test's either-branch assertion.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/grouping-fallback.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Write the Worker entrypoint skeleton**

```ts
// worker/src/index.ts
export interface Env {
  TABZEN_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    return new Response("not found", { status: 404 });
  },
};
```

- [ ] **Step 9: Add test/build scripts and verify**

Edit `worker/package.json`, add:

```json
{
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

Run: `cd /home/sumanth/Documents/TabZen/worker && npm run typecheck`
Expected: exits 0.

- [ ] **Step 10: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add worker/
git commit -m "feat(worker): scaffold Cloudflare Worker with domain-grouping fallback heuristic"
```

---

## Task 5: `/api/group` endpoint — rate limiting, LLM call, fallback

**Files:**
- Create: `worker/src/lib/rateLimit.ts`
- Create: `worker/src/lib/rateLimit.test.ts`
- Create: `worker/src/lib/llmGrouping.ts`
- Create: `worker/src/api/group.ts`
- Create: `worker/src/api/group.test.ts`
- Modify: `worker/src/index.ts`

**Interfaces:**
- Consumes: `groupTabsFallback`, `TabInfo`, `SessionGroup` from `worker/src/lib/grouping-fallback.ts` (Task 4); `Env` from `worker/src/index.ts` (Task 4).
- Produces: `checkAndIncrementRateLimit(kv: KVNamespace, key: string, limit: number): Promise<boolean>` (returns `true` if under the limit and increments, `false` if the limit is already hit) — consumed by this task's `group.ts` and reusable by any future rate-limited endpoint.
- Produces: `handleGroup(request: Request, env: Env): Promise<Response>` — consumed by `index.ts`'s router in this task and referenced by Task 8 (extension integration).

- [ ] **Step 1: Write the failing test for rate limiting**

```ts
// worker/src/lib/rateLimit.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/rateLimit.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `rateLimit.ts`**

```ts
// worker/src/lib/rateLimit.ts
export async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number
): Promise<boolean> {
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= limit) return false;
  await kv.put(key, String(count + 1), { expirationTtl: 60 * 60 * 24 });
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/rateLimit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the LLM grouping call (not unit tested directly — exercised via the mocked fetch in `group.test.ts`)**

```ts
// worker/src/lib/llmGrouping.ts
import type { TabInfo, SessionGroup } from "./grouping-fallback";

export async function groupTabsWithLLM(
  tabs: TabInfo[],
  apiKey: string
): Promise<SessionGroup[]> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Group these browser tabs into short, descriptive named clusters. Respond with ONLY JSON matching {"groups": [{"name": string, "tabs": [{"title": string, "url": string}]}]}. Tabs:\n${JSON.stringify(tabs)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed with status ${response.status}`);
  }

  const data = (await response.json()) as { content: Array<{ text: string }> };
  const text = data.content[0]?.text ?? "{}";
  const parsed = JSON.parse(text) as { groups: SessionGroup[] };
  if (!Array.isArray(parsed.groups)) {
    throw new Error("LLM response missing groups array");
  }
  return parsed.groups;
}
```

- [ ] **Step 6: Write the failing test for the `/api/group` handler**

```ts
// worker/src/api/group.test.ts
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
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns LLM-produced groups when the LLM call succeeds", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: JSON.stringify({ groups: [{ name: "Frontend docs", tabs }] }) }],
      }),
    }) as any;

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
    global.fetch = vi.fn().mockRejectedValue(new Error("network error")) as any;

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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ text: JSON.stringify({ groups: [] }) }] }),
    }) as any;

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
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/group.test.ts`
Expected: FAIL — `./group` does not exist.

- [ ] **Step 8: Implement `group.ts`**

```ts
// worker/src/api/group.ts
import type { Env } from "../index";
import { groupTabsFallback, type TabInfo } from "../lib/grouping-fallback";
import { groupTabsWithLLM } from "../lib/llmGrouping";
import { checkAndIncrementRateLimit } from "../lib/rateLimit";

const FREE_DAILY_LIMIT = 1;

export async function handleGroup(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { tabs: TabInfo[]; licenseKey?: string };
  const rateLimitKey = `ratelimit:${body.licenseKey ?? request.headers.get("cf-connecting-ip") ?? "anonymous"}`;

  const isPaid = Boolean(body.licenseKey);
  if (!isPaid) {
    const allowed = await checkAndIncrementRateLimit(env.TABZEN_KV, rateLimitKey, FREE_DAILY_LIMIT);
    if (!allowed) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
  }

  let groups;
  try {
    groups = await groupTabsWithLLM(body.tabs, env.ANTHROPIC_API_KEY);
  } catch {
    groups = groupTabsFallback(body.tabs);
  }

  return Response.json({ groups });
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/group.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 10: Wire the route into `index.ts`**

```ts
// worker/src/index.ts
import { handleGroup } from "./api/group";

export interface Env {
  TABZEN_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    if (url.pathname === "/api/group" && request.method === "POST") {
      return handleGroup(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};
```

- [ ] **Step 11: Run the full worker test suite**

Run: `cd /home/sumanth/Documents/TabZen/worker && npm test`
Expected: all tests PASS.

- [ ] **Step 12: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add worker/
git commit -m "feat(worker): add /api/group with rate limiting, LLM call, and fallback"
```

---

## Task 6: `/api/license/check` endpoint

**Files:**
- Create: `worker/src/lib/license.ts`
- Create: `worker/src/lib/license.test.ts`
- Create: `worker/src/api/licenseCheck.ts`
- Create: `worker/src/api/licenseCheck.test.ts`
- Modify: `worker/src/index.ts`

**Interfaces:**
- Consumes: `Env` from `worker/src/index.ts` (Task 4).
- Produces: `getLicenseStatus(kv: KVNamespace, email: string): Promise<"paid" | "free">` and `setLicensePaid(kv: KVNamespace, email: string): Promise<void>` in `worker/src/lib/license.ts` — consumed by this task's `licenseCheck.ts` and by Task 7's Stripe webhook handler.
- Produces: `handleLicenseCheck(request: Request, env: Env): Promise<Response>` — consumed by `index.ts`'s router.

- [ ] **Step 1: Write the failing test for `license.ts`**

```ts
// worker/src/lib/license.test.ts
import { describe, it, expect } from "vitest";
import { getLicenseStatus, setLicensePaid } from "./license";

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

describe("license status", () => {
  it("defaults to 'free' for an unknown email", async () => {
    const kv = makeFakeKV();
    expect(await getLicenseStatus(kv, "nobody@example.com")).toBe("free");
  });

  it("returns 'paid' after setLicensePaid is called", async () => {
    const kv = makeFakeKV();
    await setLicensePaid(kv, "buyer@example.com");
    expect(await getLicenseStatus(kv, "buyer@example.com")).toBe("paid");
  });

  it("normalizes email case when looking up status", async () => {
    const kv = makeFakeKV();
    await setLicensePaid(kv, "Buyer@Example.com");
    expect(await getLicenseStatus(kv, "buyer@example.com")).toBe("paid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/license.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `license.ts`**

```ts
// worker/src/lib/license.ts
function licenseKey(email: string): string {
  return `license:${email.trim().toLowerCase()}`;
}

export async function getLicenseStatus(kv: KVNamespace, email: string): Promise<"paid" | "free"> {
  const value = await kv.get(licenseKey(email));
  return value === "paid" ? "paid" : "free";
}

export async function setLicensePaid(kv: KVNamespace, email: string): Promise<void> {
  await kv.put(licenseKey(email), "paid");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/license.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for the `/api/license/check` handler**

```ts
// worker/src/api/licenseCheck.test.ts
import { describe, it, expect } from "vitest";
import { handleLicenseCheck } from "./licenseCheck";
import { setLicensePaid } from "../lib/license";
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

describe("handleLicenseCheck", () => {
  it("returns status 'free' for an unknown email", async () => {
    const env = makeEnv();
    const request = new Request("https://worker.test/api/license/check", {
      method: "POST",
      body: JSON.stringify({ email: "nobody@example.com" }),
    });
    const response = await handleLicenseCheck(request, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "free" });
  });

  it("returns status 'paid' for a licensed email", async () => {
    const env = makeEnv();
    await setLicensePaid(env.TABZEN_KV, "buyer@example.com");
    const request = new Request("https://worker.test/api/license/check", {
      method: "POST",
      body: JSON.stringify({ email: "buyer@example.com" }),
    });
    const response = await handleLicenseCheck(request, env);
    expect(await response.json()).toEqual({ status: "paid" });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/licenseCheck.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement `licenseCheck.ts`**

```ts
// worker/src/api/licenseCheck.ts
import type { Env } from "../index";
import { getLicenseStatus } from "../lib/license";

export async function handleLicenseCheck(request: Request, env: Env): Promise<Response> {
  const { email } = (await request.json()) as { email: string };
  const status = await getLicenseStatus(env.TABZEN_KV, email);
  return Response.json({ status });
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/licenseCheck.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 9: Wire the route into `index.ts`**

```ts
// worker/src/index.ts
import { handleGroup } from "./api/group";
import { handleLicenseCheck } from "./api/licenseCheck";

export interface Env {
  TABZEN_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    if (url.pathname === "/api/group" && request.method === "POST") {
      return handleGroup(request, env);
    }
    if (url.pathname === "/api/license/check" && request.method === "POST") {
      return handleLicenseCheck(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};
```

- [ ] **Step 10: Run the full worker test suite**

Run: `cd /home/sumanth/Documents/TabZen/worker && npm test`
Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add worker/
git commit -m "feat(worker): add /api/license/check and license status storage"
```

---

## Task 7: Stripe Checkout + webhook

**Files:**
- Create: `worker/src/api/createCheckout.ts`
- Create: `worker/src/api/createCheckout.test.ts`
- Create: `worker/src/api/stripeWebhook.ts`
- Create: `worker/src/api/stripeWebhook.test.ts`
- Modify: `worker/src/lib/license.ts`
- Modify: `worker/src/index.ts`
- Modify: `worker/package.json` (add dependency: `stripe`)

**Interfaces:**
- Consumes: `setLicensePaid` from `worker/src/lib/license.ts` (Task 6); `Env` from `worker/src/index.ts`.
- Produces: `isEventProcessed(kv: KVNamespace, eventId: string): Promise<boolean>` and `markEventProcessed(kv: KVNamespace, eventId: string): Promise<void>` (added to `license.ts`) — used only within this task's webhook handler.
- Produces: `handleCreateCheckout(request: Request, env: Env): Promise<Response>` and `handleStripeWebhook(request: Request, env: Env): Promise<Response>` — consumed by `index.ts`'s router and by Task 8 (extension's Upgrade button opens the URL this returns).

- [ ] **Step 1: Install the Stripe SDK**

```bash
cd /home/sumanth/Documents/TabZen/worker
npm install stripe
```

- [ ] **Step 2: Write the failing test for event dedupe helpers**

```ts
// worker/src/lib/license.test.ts — append to the existing describe block's file
import { isEventProcessed, markEventProcessed } from "./license";

describe("webhook event dedupe", () => {
  it("reports an event as unprocessed until marked", async () => {
    const kv = makeFakeKV();
    expect(await isEventProcessed(kv, "evt_1")).toBe(false);
    await markEventProcessed(kv, "evt_1");
    expect(await isEventProcessed(kv, "evt_1")).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/license.test.ts`
Expected: FAIL — `isEventProcessed`/`markEventProcessed` not exported.

- [ ] **Step 4: Add the dedupe helpers to `license.ts`**

```ts
// worker/src/lib/license.ts — append
function eventKey(eventId: string): string {
  return `stripe_event:${eventId}`;
}

export async function isEventProcessed(kv: KVNamespace, eventId: string): Promise<boolean> {
  return (await kv.get(eventKey(eventId))) !== null;
}

export async function markEventProcessed(kv: KVNamespace, eventId: string): Promise<void> {
  await kv.put(eventKey(eventId), "1", { expirationTtl: 60 * 60 * 24 * 30 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/lib/license.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing test for `createCheckout.ts`**

```ts
// worker/src/api/createCheckout.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleCreateCheckout } from "./createCheckout";
import type { Env } from "../index";

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session/test" }),
        },
      },
    })),
  };
});

function makeEnv(): Env {
  return {
    TABZEN_KV: {} as any,
    ANTHROPIC_API_KEY: "test-key",
    STRIPE_SECRET_KEY: "sk_test",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  };
}

describe("handleCreateCheckout", () => {
  it("returns a Stripe Checkout URL", async () => {
    const request = new Request("https://worker.test/api/create-checkout", { method: "POST" });
    const response = await handleCreateCheckout(request, makeEnv());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/session/test" });
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/createCheckout.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 8: Implement `createCheckout.ts`**

```ts
// worker/src/api/createCheckout.ts
import Stripe from "stripe";
import type { Env } from "../index";

export async function handleCreateCheckout(request: Request, env: Env): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: "price_tabzen_monthly", quantity: 1 }],
    success_url: "https://tabzen.app/upgrade-success",
    cancel_url: "https://tabzen.app/upgrade-cancelled",
  });
  return Response.json({ url: session.url });
}
```

Note: `price_tabzen_monthly` is a placeholder Stripe Price ID — replace with the real ID once the $4–6/mo product is created in the Stripe dashboard (a manual, one-time setup step outside this codebase, noted in the QA checklist in Task 9).

- [ ] **Step 9: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/createCheckout.test.ts`
Expected: PASS (1 test)

- [ ] **Step 10: Write the failing test for the webhook handler**

```ts
// worker/src/api/stripeWebhook.test.ts
import { describe, it, expect, vi } from "vitest";
import { handleStripeWebhook } from "./stripeWebhook";
import { getLicenseStatus } from "../lib/license";
import type { Env } from "../index";

const constructEventMock = vi.fn();

vi.mock("stripe", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: { constructEventAsync: constructEventMock },
    })),
  };
});

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

describe("handleStripeWebhook", () => {
  it("marks the license paid on checkout.session.completed", async () => {
    constructEventMock.mockResolvedValue({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { customer_details: { email: "buyer@example.com" } } },
    });
    const env = makeEnv();
    const request = new Request("https://worker.test/api/stripe-webhook", {
      method: "POST",
      body: "{}",
      headers: { "stripe-signature": "sig" },
    });
    const response = await handleStripeWebhook(request, env);
    expect(response.status).toBe(200);
    expect(await getLicenseStatus(env.TABZEN_KV, "buyer@example.com")).toBe("paid");
  });

  it("ignores a duplicate delivery of the same event id", async () => {
    constructEventMock.mockResolvedValue({
      id: "evt_2",
      type: "checkout.session.completed",
      data: { object: { customer_details: { email: "buyer2@example.com" } } },
    });
    const env = makeEnv();
    const request = () =>
      new Request("https://worker.test/api/stripe-webhook", {
        method: "POST",
        body: "{}",
        headers: { "stripe-signature": "sig" },
      });
    await handleStripeWebhook(request(), env);
    const second = await handleStripeWebhook(request(), env);
    expect(second.status).toBe(200);
    expect(await getLicenseStatus(env.TABZEN_KV, "buyer2@example.com")).toBe("paid");
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/stripeWebhook.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 12: Implement `stripeWebhook.ts`**

```ts
// worker/src/api/stripeWebhook.ts
import Stripe from "stripe";
import type { Env } from "../index";
import { setLicensePaid, isEventProcessed, markEventProcessed } from "../lib/license";

export async function handleStripeWebhook(request: Request, env: Env): Promise<Response> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
  const signature = request.headers.get("stripe-signature") ?? "";
  const body = await request.text();

  const event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);

  if (await isEventProcessed(env.TABZEN_KV, event.id)) {
    return new Response("already processed", { status: 200 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { customer_details?: { email?: string } };
    const email = session.customer_details?.email;
    if (email) {
      await setLicensePaid(env.TABZEN_KV, email);
    }
  }

  await markEventProcessed(env.TABZEN_KV, event.id);
  return new Response("ok", { status: 200 });
}
```

- [ ] **Step 13: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/worker && npx vitest run src/api/stripeWebhook.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 14: Wire both routes into `index.ts`**

```ts
// worker/src/index.ts
import { handleGroup } from "./api/group";
import { handleLicenseCheck } from "./api/licenseCheck";
import { handleCreateCheckout } from "./api/createCheckout";
import { handleStripeWebhook } from "./api/stripeWebhook";

export interface Env {
  TABZEN_KV: KVNamespace;
  ANTHROPIC_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    if (url.pathname === "/api/group" && request.method === "POST") {
      return handleGroup(request, env);
    }
    if (url.pathname === "/api/license/check" && request.method === "POST") {
      return handleLicenseCheck(request, env);
    }
    if (url.pathname === "/api/create-checkout" && request.method === "POST") {
      return handleCreateCheckout(request, env);
    }
    if (url.pathname === "/api/stripe-webhook" && request.method === "POST") {
      return handleStripeWebhook(request, env);
    }
    return new Response("not found", { status: 404 });
  },
};
```

- [ ] **Step 15: Run the full worker test suite**

Run: `cd /home/sumanth/Documents/TabZen/worker && npm test`
Expected: all tests PASS.

- [ ] **Step 16: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add worker/
git commit -m "feat(worker): add Stripe Checkout creation and idempotent webhook handling"
```

---

## Task 8: Wire the extension's upgrade/license flow end-to-end

**Files:**
- Create: `extension/src/background/api.ts`
- Create: `extension/src/background/api.test.ts`
- Modify: `extension/src/background/index.ts`
- Modify: `extension/src/popup/Popup.tsx`
- Modify: `extension/src/popup/Popup.test.tsx`
- Modify: `extension/src/popup/main.tsx`

**Interfaces:**
- Consumes: `Session`, `SessionGroup`, `TabInfo` from `extension/src/lib/types.ts` (Task 2); background message contract from Task 3.
- Produces: `callGroupApi(tabs: TabInfo[], licenseKey?: string): Promise<SessionGroup[]>`, `callCreateCheckout(): Promise<string>` (returns the Checkout URL), `callLicenseCheck(email: string): Promise<"paid" | "free">` in `extension/src/background/api.ts` — consumed by `background/index.ts` in this task.
- Produces: extended `Popup` props `{ licenseStatus: "paid" | "free"; onUpgrade: () => void; onActivateLicense: (email: string) => void }` — no further consumers (UI terminal).

- [ ] **Step 1: Write the failing test for the API client**

```ts
// extension/src/background/api.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { callGroupApi, callCreateCheckout, callLicenseCheck } from "./api";

const WORKER_BASE_URL = "https://tabzen-worker.example.workers.dev";

describe("worker API client", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts tabs to /api/group and returns groups", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ groups: [{ name: "Docs", tabs: [] }] }),
    }) as any;
    const groups = await callGroupApi([{ title: "t", url: "https://x.com" }]);
    expect(groups).toEqual([{ name: "Docs", tabs: [] }]);
    expect(global.fetch).toHaveBeenCalledWith(
      `${WORKER_BASE_URL}/api/group`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("posts to /api/create-checkout and returns the URL", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://checkout.stripe.com/x" }),
    }) as any;
    const url = await callCreateCheckout();
    expect(url).toBe("https://checkout.stripe.com/x");
  });

  it("posts to /api/license/check and returns the status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "paid" }),
    }) as any;
    const status = await callLicenseCheck("buyer@example.com");
    expect(status).toBe("paid");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/background/api.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `api.ts`**

```ts
// extension/src/background/api.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/background/api.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for the extended Popup props**

```tsx
// extension/src/popup/Popup.test.tsx — append to the existing describe block
it("shows an Upgrade button when free, and an email activation field", () => {
  render(
    <Popup
      tabCount={3}
      sessions={[]}
      licenseStatus="free"
      onTidyUp={vi.fn()}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
      onUpgrade={vi.fn()}
      onActivateLicense={vi.fn()}
    />
  );
  expect(screen.getByRole("button", { name: /upgrade/i })).toBeInTheDocument();
});

it("hides the Upgrade button when licenseStatus is paid", () => {
  render(
    <Popup
      tabCount={3}
      sessions={[]}
      licenseStatus="paid"
      onTidyUp={vi.fn()}
      onRestore={vi.fn()}
      onDelete={vi.fn()}
      onUpgrade={vi.fn()}
      onActivateLicense={vi.fn()}
    />
  );
  expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/popup/Popup.test.tsx`
Expected: FAIL — `Popup` does not accept `licenseStatus`/`onUpgrade`/`onActivateLicense` yet.

- [ ] **Step 7: Extend `Popup.tsx`**

```tsx
// extension/src/popup/Popup.tsx
import { useState } from "react";
import type { Session } from "../lib/types";

export interface PopupProps {
  tabCount: number;
  sessions: Session[];
  licenseStatus: "paid" | "free";
  onTidyUp: () => void;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onUpgrade: () => void;
  onActivateLicense: (email: string) => void;
}

export function Popup({
  tabCount,
  sessions,
  licenseStatus,
  onTidyUp,
  onRestore,
  onDelete,
  onUpgrade,
  onActivateLicense,
}: PopupProps) {
  const canTidy = tabCount >= 2;
  const [email, setEmail] = useState("");

  return (
    <div className="popup">
      <h1>Tab Zen</h1>
      <p className="tab-count">{tabCount} tab{tabCount === 1 ? "" : "s"} open</p>
      <button className="tidy-button" disabled={!canTidy} onClick={onTidyUp}>
        Tidy Up
      </button>

      {sessions.length === 0 ? (
        <p className="empty-state">No saved sessions yet.</p>
      ) : (
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id} className="session-card">
              {session.groups.map((group) => (
                <div key={group.name} className="session-group">
                  <h2>{group.name}</h2>
                  <span className="tab-badge">{group.tabs.length}</span>
                </div>
              ))}
              <div className="session-actions">
                <button onClick={() => onRestore(session.id)}>Restore</button>
                <button onClick={() => onDelete(session.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {licenseStatus === "free" && (
        <div className="upgrade-block">
          <button className="upgrade-button" onClick={onUpgrade}>
            Upgrade
          </button>
          <input
            type="email"
            placeholder="Activate with your checkout email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={() => onActivateLicense(email)}>Activate</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run src/popup/Popup.test.tsx`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 9: Wire the background message handler to the new API calls**

```ts
// extension/src/background/index.ts
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
```

- [ ] **Step 10: Wire `main.tsx` to the new props/messages**

```tsx
// extension/src/popup/main.tsx
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Popup } from "./Popup";
import type { Session } from "../lib/types";
import "./Popup.css";

function App() {
  const [tabCount, setTabCount] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [licenseStatus, setLicenseStatus] = useState<"paid" | "free">("free");

  async function refresh() {
    const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
    setTabCount(state.tabCount);
    setSessions(state.sessions);
    setLicenseStatus(state.licenseStatus);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <Popup
      tabCount={tabCount}
      sessions={sessions}
      licenseStatus={licenseStatus}
      onTidyUp={async () => {
        await chrome.runtime.sendMessage({ type: "TIDY_UP" });
        await refresh();
      }}
      onRestore={async (id) => {
        await chrome.runtime.sendMessage({ type: "RESTORE_SESSION", id });
      }}
      onDelete={async (id) => {
        await chrome.runtime.sendMessage({ type: "DELETE_SESSION", id });
        await refresh();
      }}
      onUpgrade={async () => {
        const { url } = await chrome.runtime.sendMessage({ type: "UPGRADE" });
        chrome.tabs.create({ url });
      }}
      onActivateLicense={async (email) => {
        await chrome.runtime.sendMessage({ type: "ACTIVATE_LICENSE", email });
        await refresh();
      }}
    />
  );
}

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
```

- [ ] **Step 11: Run the full extension test suite and build**

Run: `cd /home/sumanth/Documents/TabZen/extension && npx vitest run && npm run build`
Expected: all tests PASS, build exits 0.

- [ ] **Step 12: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add extension/
git commit -m "feat(extension): wire upgrade and license activation to the worker API"
```

---

## Task 9: Manual QA checklist and final verification

**Files:**
- Create: `docs/qa-checklist.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing (terminal task).

- [ ] **Step 1: Run the full test suite for both projects**

Run:
```bash
cd /home/sumanth/Documents/TabZen/extension && npx vitest run && npm run build
cd /home/sumanth/Documents/TabZen/worker && npm test && npm run typecheck
```
Expected: all PASS, extension build succeeds.

- [ ] **Step 2: Write the manual QA checklist**

```markdown
<!-- docs/qa-checklist.md -->
# Tab Zen — Manual QA Checklist

## One-time setup (outside this repo)
- [ ] Create a Cloudflare Workers KV namespace, update `worker/wrangler.toml`'s
      `id` with the real namespace id.
- [ ] Set Worker secrets: `wrangler secret put ANTHROPIC_API_KEY`,
      `wrangler secret put STRIPE_SECRET_KEY`, `wrangler secret put STRIPE_WEBHOOK_SECRET`.
- [ ] Create a $4-6/mo recurring Price in the Stripe dashboard; replace the
      placeholder `price_tabzen_monthly` in `worker/src/api/createCheckout.ts`.
- [ ] Deploy the worker: `cd worker && npx wrangler deploy`; update
      `WORKER_BASE_URL` in `extension/src/background/api.ts` to the deployed URL.
- [ ] Register the Stripe webhook endpoint (`/api/stripe-webhook`) in the
      Stripe dashboard pointed at the deployed Worker URL.

## Loading the unpacked extension
- [ ] `cd extension && npm run build`
- [ ] Open `chrome://extensions`, enable Developer mode, "Load unpacked",
      select `extension/dist`.
- [ ] Confirm the Tab Zen icon appears in the toolbar.

## Free-tier flow
- [ ] Open 3+ tabs, click the Tab Zen icon — tab count shown matches.
- [ ] With 0 or 1 tab open, confirm "Tidy Up" is disabled.
- [ ] Click "Tidy Up" — tabs animate into named session cards.
- [ ] Click "Tidy Up" a second time same day — confirm the inline upgrade
      prompt appears instead of a new AI grouping (rate limit hit).
- [ ] Click "Restore" on a saved session — all its tabs reopen.
- [ ] Click "Delete" on a saved session — it disappears from the list.

## Paid flow
- [ ] Click "Upgrade" — Stripe Checkout opens in a new tab.
- [ ] Complete checkout with a Stripe test card.
- [ ] Back in the extension, enter the checkout email and click "Activate".
- [ ] Confirm the Upgrade block disappears (license shows as paid).
- [ ] Click "Tidy Up" multiple times in the same day — confirm no rate
      limit prompt appears for the paid account.

## Resilience
- [ ] Temporarily break `ANTHROPIC_API_KEY` (wrong value) and redeploy —
      confirm "Tidy Up" still groups tabs (via the domain fallback) instead
      of failing.
```

- [ ] **Step 3: Commit**

```bash
cd /home/sumanth/Documents/TabZen
git add docs/qa-checklist.md
git commit -m "docs: add manual QA checklist for Tab Zen launch readiness"
```
