import { useState } from "react";
import type {
  AgentSummary,
  PathInfo,
  ProjectSummary,
  ProviderSummary,
  SessionSummary,
  StreamEvent,
  VcsInfo,
} from "../types/opencode";

interface SessionListProps {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  pathInfo: PathInfo | null;
  vcsInfo: VcsInfo | null;
  agents: AgentSummary[];
  sessions: SessionSummary[];
  providers: ProviderSummary[];
  events: StreamEvent[];
  selectedSessionId: string | null;
  streamState: "offline" | "connecting" | "online" | "error";
  isLoading: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onProviderLogin: (providerId: string) => void;
}

function formatRelative(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function SessionList({
  currentProject,
  pathInfo,
  vcsInfo,
  agents,
  sessions,
  providers,
  events,
  selectedSessionId,
  streamState,
  isLoading,
  onCreate,
  onSelect,
  onDelete,
  onProviderLogin,
}: SessionListProps) {
  const [showAgents, setShowAgents] = useState(false);
  const [showProviders, setShowProviders] = useState(false);
  const [showEvents, setShowEvents] = useState(false);

  return (
    <aside className="sidebar">
      {/* Workspace info */}
      <div className="sidebar-workspace">
        <div className="workspace-info">
          {currentProject && (
            <span className="workspace-name">{currentProject.name}</span>
          )}
          {(vcsInfo?.branch || pathInfo?.root) && (
            <span className="workspace-meta">
              {vcsInfo?.branch && (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="6" y1="3" x2="6" y2="15" />
                    <circle cx="18" cy="6" r="3" />
                    <circle cx="6" cy="18" r="3" />
                    <path d="M18 9a9 9 0 0 1-9 9" />
                  </svg>
                  {vcsInfo.branch}
                  {vcsInfo.dirty ? <span className="workspace-dirty">*</span> : null}
                </>
              )}
            </span>
          )}
        </div>
        <div className={`stream-dot stream-dot-${streamState}`} title={`Stream: ${streamState}`} />
      </div>

      {/* Sessions header + new button */}
      <div className="sidebar-sessions-head">
        <span className="sidebar-section-label">Sessions</span>
        <button
          className="sidebar-new-btn"
          type="button"
          onClick={onCreate}
          title="New session"
          aria-label="New session"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Session list */}
      <div className="sessions-list">
        {isLoading && sessions.length === 0 ? (
          <div className="sidebar-empty">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="sidebar-empty">No sessions yet. Create one to start.</div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === selectedSessionId;
            return (
              <div
                key={session.id}
                className={`session-item ${isActive ? "session-item-active" : ""}`}
              >
                <button
                  className="session-item-trigger"
                  type="button"
                  onClick={() => onSelect(session.id)}
                >
                  <span className="session-item-title">{session.title}</span>
                  <div className="session-item-meta">
                    <span className={`session-status session-status-${session.status}`}>
                      {session.status}
                    </span>
                    <span className="session-time">{formatRelative(session.updatedAt)}</span>
                  </div>
                </button>
                <button
                  className="session-delete-btn"
                  type="button"
                  onClick={() => onDelete(session.id)}
                  title="Delete session"
                  aria-label="Delete session"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Collapsible sections */}
      <div className="sidebar-extras">
        {/* Agents */}
        {agents.length > 0 && (
          <div className="sidebar-extra-section">
            <button
              className="sidebar-extra-toggle"
              type="button"
              onClick={() => setShowAgents((v) => !v)}
            >
              <span>Agents</span>
              <span className="sidebar-extra-count">{agents.length}</span>
              <svg
                className={`sidebar-chevron ${showAgents ? "open" : ""}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showAgents && (
              <div className="sidebar-extra-list">
                {agents.slice(0, 8).map((agent) => (
                  <div key={agent.id} className="sidebar-extra-item">
                    <span className="sidebar-extra-item-name">{agent.id}</span>
                    {agent.description && (
                      <span className="sidebar-extra-item-sub">{agent.description}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Providers */}
        {providers.length > 0 && (
          <div className="sidebar-extra-section">
            <button
              className="sidebar-extra-toggle"
              type="button"
              onClick={() => setShowProviders((v) => !v)}
            >
              <span>Providers</span>
              <span className="sidebar-extra-count">{providers.length}</span>
              <svg
                className={`sidebar-chevron ${showProviders ? "open" : ""}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showProviders && (
              <div className="sidebar-extra-list">
                {providers.slice(0, 8).map((provider) => {
                  const canOAuth =
                    provider.authMethods.length === 0 || provider.authMethods.includes("oauth");
                  return (
                    <div key={provider.id} className="sidebar-provider-item">
                      <div className="sidebar-extra-item">
                        <span className="sidebar-extra-item-name">{provider.name}</span>
                        {provider.defaultModel && (
                          <span className="sidebar-extra-item-sub">{provider.defaultModel}</span>
                        )}
                      </div>
                      {canOAuth && (
                        <button
                          className="sidebar-oauth-btn"
                          type="button"
                          onClick={() => onProviderLogin(provider.id)}
                          title="Connect via OAuth"
                        >
                          Auth
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Events */}
        {events.length > 0 && (
          <div className="sidebar-extra-section">
            <button
              className="sidebar-extra-toggle"
              type="button"
              onClick={() => setShowEvents((v) => !v)}
            >
              <span>Events</span>
              <span className="sidebar-extra-count">{events.length}</span>
              <svg
                className={`sidebar-chevron ${showEvents ? "open" : ""}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showEvents && (
              <div className="sidebar-extra-list">
                {events.slice(0, 8).map((event) => (
                  <div key={`${event.type}-${event.receivedAt}`} className="event-item">
                    <span className="event-type">{event.type}</span>
                    <span className="event-time">
                      {formatRelative(new Date(event.receivedAt).toISOString())}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
