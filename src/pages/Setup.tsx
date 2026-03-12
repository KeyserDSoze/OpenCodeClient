import { useRef, useState } from "react";
import { ServerConfig } from "../components/ServerConfig";
import type { KnownServerProfile, ServerConfig as ServerConfigShape } from "../types/opencode";

interface SetupPageProps {
  initialValue: ServerConfigShape;
  knownProfiles: KnownServerProfile[];
  isBusy: boolean;
  error?: string | null;
  reconnectCountdown?: number | null;
  onSubmit: (config: ServerConfigShape, remember: boolean, connectionName?: string) => void;
  onConnectKnownProfile: (profile: KnownServerProfile) => void;
  onSelectKnownProfile: (profile: KnownServerProfile) => void;
  onDeleteProfile: (profileId: string) => void;
  onRenameProfile: (profileId: string, newLabel: string) => void;
  onOpenDocs: () => void;
  onCancel?: () => void;
}

function timeAgo(ts?: number) {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  return (
    <div className="qs-code-row">
      <code className="qs-code">{code}</code>
      <button
        className={`qs-copy-btn ${copied ? "qs-copy-btn-ok" : ""}`}
        type="button"
        onClick={handle}
        title={copied ? "Copied!" : "Copy"}
        aria-label={copied ? "Copied!" : "Copy command"}
      >
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

function QuickStartGuide({ onOpenDocs }: { onOpenDocs: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="qs-guide">
      <div className="qs-header">
        <div className="qs-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="qs-header-title">Don't have a server yet?</span>
        </div>
        <button
          className="qs-toggle"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? "Hide" : "Show setup"}
          <svg
            className={`qs-chevron ${open ? "qs-chevron-open" : ""}`}
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="qs-body">
          {/* Step 1 */}
          <div className="qs-step">
            <span className="qs-step-num">1</span>
            <div className="qs-step-content">
              <span className="qs-step-label">Install OpenCode</span>
              <CopyableCode code="npm install -g opencode" />
            </div>
          </div>

          {/* Step 2 Linux */}
          <div className="qs-step">
            <span className="qs-step-num">2</span>
            <div className="qs-step-content">
              <span className="qs-step-label">Start the server (Linux / macOS)</span>
              <CopyableCode code={`OPENCODE_SERVER_USERNAME=opencode OPENCODE_SERVER_PASSWORD=changeme opencode serve --hostname 0.0.0.0 --port 4096 --cors https://opencode.zone`} />
            </div>
          </div>

          {/* Step 2 Windows */}
          <div className="qs-step">
            <span className="qs-step-num">2</span>
            <div className="qs-step-content">
              <span className="qs-step-label">Start the server (Windows PowerShell)</span>
              <CopyableCode code={`$env:OPENCODE_SERVER_USERNAME="opencode"; $env:OPENCODE_SERVER_PASSWORD="changeme"; opencode serve --hostname 0.0.0.0 --port 4096 --cors https://opencode.zone`} />
            </div>
          </div>

          {/* Step 3 */}
          <div className="qs-step">
            <span className="qs-step-num">3</span>
            <div className="qs-step-content">
              <span className="qs-step-label">Fill in the form above</span>
              <ul className="qs-list">
                <li><strong>Server URL</strong> — <code>http://YOUR-IP:4096</code> (or your public domain)</li>
                <li><strong>Username</strong> — <code>opencode</code></li>
                <li><strong>Password</strong> — the value you set above</li>
              </ul>
            </div>
          </div>

          {/* Step 4 — Cloud / Azure */}
          <div className="qs-step">
            <span className="qs-step-num">4</span>
            <div className="qs-step-content">
              <span className="qs-step-label">Running on a cloud VM? (Azure / AWS / GCP)</span>
              <ul className="qs-list">
                <li>Open inbound port <strong>4096</strong> (or 443 for HTTPS) in your VM firewall / NSG.</li>
                <li>Put nginx or Caddy in front as a reverse proxy and terminate TLS there.</li>
                <li>Set <code>--hostname 0.0.0.0</code> so the server binds on all interfaces.</li>
                <li>Use <code>http://localhost:4096</code> as the upstream in the proxy config.</li>
              </ul>
              <p className="qs-note" style={{ marginTop: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                See the <button className="qs-full-docs-btn" style={{ display: "inline", padding: "0 4px", fontSize: 11 }} type="button" onClick={onOpenDocs}>full Azure setup guide</button> for copy-paste nginx config, NSG rules, and a Caddy example.
              </p>
            </div>
          </div>

          <div className="qs-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            If accessing from <code>https://opencode.zone</code>, make sure the server includes that origin in <code>--cors</code>. For local dev also add <code>http://localhost:5173</code>.
          </div>

          <button className="qs-full-docs-btn" type="button" onClick={onOpenDocs}>
            Full setup guide →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Saved profile row with inline rename ──────────────────────────────────────
interface ProfileRowProps {
  profile: KnownServerProfile;
  isActive: boolean;
  onConnect: () => void;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (newLabel: string) => void;
}

function ProfileRow({ profile, isActive, onConnect, onSelect, onDelete, onRename }: ProfileRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(profile.label);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== profile.label) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(profile.label);
    setEditing(false);
  };

  return (
    <div
      className={`pm-row ${isActive ? "pm-row-active" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
    >
      <div className="pm-avatar">{profile.label.charAt(0).toUpperCase()}</div>

      <div className="pm-info">
        {editing ? (
          <input
            ref={inputRef}
            className="pm-rename-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={commitEdit}
            aria-label="Connection name"
            maxLength={60}
          />
        ) : (
          <span className="pm-label">{profile.label}</span>
        )}
        <span className="pm-url">{profile.serverUrl}</span>
        {profile.lastUsedAt && (
          <span className="pm-time">{timeAgo(profile.lastUsedAt)}</span>
        )}
      </div>

      <div className="pm-actions" onClick={(e) => e.stopPropagation()}>
        {/* Connect */}
        <button
          className="pm-btn pm-btn-connect"
          type="button"
          title="Connect"
          aria-label={`Connect to ${profile.label}`}
          onClick={(e) => { e.stopPropagation(); onConnect(); }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {/* Rename */}
        {!editing && (
          <button
            className="pm-btn"
            type="button"
            title="Rename"
            aria-label={`Rename ${profile.label}`}
            onClick={startEdit}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}

        {/* Delete */}
        <button
          className="pm-btn pm-btn-delete"
          type="button"
          title="Delete"
          aria-label={`Delete ${profile.label}`}
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Remove saved connection "${profile.label}"?`)) {
              onDelete();
            }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function SetupPage({
  initialValue,
  knownProfiles,
  isBusy,
  error,
  reconnectCountdown,
  onSubmit,
  onConnectKnownProfile,
  onSelectKnownProfile,
  onDeleteProfile,
  onRenameProfile,
  onOpenDocs,
  onCancel,
}: SetupPageProps) {
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  // Derive whether we're in "new connection" mode vs a saved one
  const handleSelectProfile = (profile: KnownServerProfile) => {
    setActiveProfileId(profile.id);
    onSelectKnownProfile(profile);
  };

  const handleNewConnection = () => {
    setActiveProfileId(null);
    onSelectKnownProfile({ id: "", label: "", serverUrl: "", username: "", password: "", detected: false });
  };

  return (
    <div className="login-shell">
      <div className="login-bg-gradient" aria-hidden="true" />

      <div className="login-container">
        {/* Left panel: saved connections manager */}
        <aside className="login-recent">
          <div className="login-recent-header">
            <span className="login-recent-title">Saved connections</span>
            <button
              className="pm-new-btn"
              type="button"
              title="New connection"
              aria-label="New connection"
              onClick={handleNewConnection}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New
            </button>
          </div>

          {knownProfiles.length === 0 ? (
            <div className="pm-empty">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <p>No saved connections yet.<br />Fill in the form and connect — it will be saved automatically.</p>
            </div>
          ) : (
            <div className="pm-list">
              {knownProfiles.map((profile) => (
                <ProfileRow
                  key={profile.id}
                  profile={profile}
                  isActive={activeProfileId === profile.id}
                  onConnect={() => onConnectKnownProfile(profile)}
                  onSelect={() => handleSelectProfile(profile)}
                  onDelete={() => onDeleteProfile(profile.id)}
                  onRename={(newLabel) => onRenameProfile(profile.id, newLabel)}
                />
              ))}
            </div>
          )}

          <button className="login-docs-link" type="button" onClick={onOpenDocs}>
            Server setup guide
          </button>
        </aside>

        {/* Right panel: connection form + quick-start guide */}
        <main className="login-main">
          <ServerConfig
            initialValue={initialValue}
            isBusy={isBusy}
            error={error}
            reconnectCountdown={reconnectCountdown}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
          <QuickStartGuide onOpenDocs={onOpenDocs} />
        </main>
      </div>
    </div>
  );
}
