import { ServerConfig } from "../components/ServerConfig";
import type { KnownServerProfile, ServerConfig as ServerConfigShape } from "../types/opencode";

interface SetupPageProps {
  initialValue: ServerConfigShape;
  knownProfiles: KnownServerProfile[];
  isBusy: boolean;
  error?: string | null;
  onSubmit: (config: ServerConfigShape, remember: boolean) => void;
  onConnectKnownProfile: (profile: KnownServerProfile) => void;
  onSelectKnownProfile: (profile: KnownServerProfile) => void;
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

export function SetupPage({
  knownProfiles,
  onConnectKnownProfile,
  onOpenDocs,
  onSelectKnownProfile,
  ...props
}: SetupPageProps) {
  return (
    <div className="login-shell">
      <div className="login-bg-gradient" aria-hidden="true" />

      <div className="login-container">
        {/* Left panel: recent connections */}
        {knownProfiles.length > 0 && (
          <aside className="login-recent">
            <div className="login-recent-header">
              <span className="login-recent-title">Recent connections</span>
            </div>
            <div className="login-recent-list">
              {knownProfiles.slice(0, 8).map((profile) => (
                <button
                  key={profile.id}
                  className="login-profile-row"
                  type="button"
                  onClick={() => {
                    onSelectKnownProfile(profile);
                    onConnectKnownProfile(profile);
                  }}
                >
                  <div className="login-profile-avatar">
                    {profile.label.charAt(0).toUpperCase()}
                  </div>
                  <div className="login-profile-info">
                    <span className="login-profile-label">{profile.label}</span>
                    <span className="login-profile-url">{profile.serverUrl}</span>
                  </div>
                  {profile.lastUsedAt && (
                    <span className="login-profile-time">{timeAgo(profile.lastUsedAt)}</span>
                  )}
                </button>
              ))}
            </div>
            <button className="login-docs-link" type="button" onClick={onOpenDocs}>
              Server setup guide
            </button>
          </aside>
        )}

        {/* Right panel: login form */}
        <main className="login-main">
          <ServerConfig {...props} />
        </main>
      </div>
    </div>
  );
}
