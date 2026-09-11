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
