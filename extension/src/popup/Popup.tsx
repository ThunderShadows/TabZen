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
