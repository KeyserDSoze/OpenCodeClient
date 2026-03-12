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

function formatDate(value?: string) {
  if (!value) {
    return "adesso";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function providerSubtitle(provider: ProviderSummary) {
  if (provider.defaultModel) {
    return `default ${provider.defaultModel}`;
  }

  if (provider.models.length === 0) {
    return provider.authType ? provider.authType.toUpperCase() : "modelli non esposti";
  }

  return provider.models.slice(0, 2).join(" • ");
}

function projectPath(currentProject: ProjectSummary | null, pathInfo: PathInfo | null) {
  return pathInfo?.root ?? currentProject?.path ?? "path non disponibile";
}

function vcsLabel(vcsInfo: VcsInfo | null) {
  if (!vcsInfo) {
    return "VCS non disponibile";
  }

  if (vcsInfo.dirty === undefined) {
    return vcsInfo.branch ?? "stato VCS non disponibile";
  }

  return vcsInfo.dirty ? "working tree dirty" : "working tree clean";
}

export function SessionList({
  projects,
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
  onRefresh,
  onSelect,
  onDelete,
  onProviderLogin,
}: SessionListProps) {
  return (
    <aside className="panel panel-sidebar">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Workspace</span>
          <h2>Sessioni</h2>
        </div>

        <div className="panel-actions">
          <button className="icon-button" type="button" onClick={onRefresh} title="Ricarica">
            ↻
          </button>
          <button className="button button-primary" type="button" onClick={onCreate}>
            New session
          </button>
        </div>
      </div>

      <div className="stream-banner">
        <span className={`status-dot status-dot-${streamState}`} />
        <strong>Stream</strong>
        <span>{streamState}</span>
      </div>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <h3>Workspace</h3>
          <span>{projects.length || (currentProject ? 1 : 0)}</span>
        </div>

        <div className="meta-grid">
          <article className="meta-card">
            <strong>{currentProject?.name ?? "Nessun progetto"}</strong>
            <span>{projectPath(currentProject, pathInfo)}</span>
          </article>

          <article className="meta-card">
            <strong>{vcsInfo?.branch ?? "Repo non rilevata"}</strong>
            <span>{vcsLabel(vcsInfo)}</span>
          </article>
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <h3>Agents</h3>
          <span>{agents.length}</span>
        </div>

        <div className="agent-list">
          {agents.length === 0 ? (
            <div className="empty-inline">Nessun agent pubblicato dal server.</div>
          ) : (
            agents.slice(0, 6).map((agent) => (
              <article key={agent.id} className="agent-card">
                <strong>{agent.id}</strong>
                <span>{agent.description ?? "Agent disponibile via API"}</span>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-card">
            <strong>Nessuna sessione</strong>
            <span>Crea una nuova sessione per iniziare a parlare con l'agente.</span>
          </div>
        ) : (
          sessions.map((session) => {
            const isActive = session.id === selectedSessionId;

            return (
              <article
                key={session.id}
                className={`session-card ${isActive ? "session-card-active" : ""}`}
              >
                <button className="session-trigger" type="button" onClick={() => onSelect(session.id)}>
                  <span className="session-title">{session.title}</span>
                  <span className="session-meta">
                    <span>{session.status}</span>
                    <span>{formatDate(session.updatedAt)}</span>
                  </span>
                </button>

                <button
                  className="session-delete"
                  type="button"
                  onClick={() => onDelete(session.id)}
                  title="Elimina sessione"
                >
                  ×
                </button>
              </article>
            );
          })
        )}
      </div>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <h3>Providers</h3>
          <span>{providers.length}</span>
        </div>

        <div className="provider-list">
          {providers.length === 0 ? (
            <div className="empty-inline">Nessun provider visibile dal server.</div>
          ) : (
            providers.slice(0, 6).map((provider) => {
              const canStartOAuth =
                provider.authMethods.length === 0 || provider.authMethods.includes("oauth");

              return (
                <article key={provider.id} className="provider-card">
                  <div className="provider-copy">
                    <strong>{provider.name}</strong>
                    <span>{providerSubtitle(provider)}</span>
                    <span>
                      {provider.authMethods.length > 0
                        ? provider.authMethods.join(" • ")
                        : provider.connected
                          ? "connected"
                          : "auth methods n/d"}
                    </span>
                  </div>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => onProviderLogin(provider.id)}
                    disabled={!canStartOAuth}
                    title={canStartOAuth ? "Avvia login OAuth" : "Provider senza OAuth esposto"}
                  >
                    {canStartOAuth ? "OAuth" : "API key"}
                  </button>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <h3>Ultimi eventi</h3>
          <span>{isLoading ? "sync" : "live"}</span>
        </div>

        <div className="event-list">
          {events.length === 0 ? (
            <div className="empty-inline">Lo stream mostrerà qui gli eventi in arrivo.</div>
          ) : (
            events.slice(0, 6).map((event) => (
              <div key={`${event.type}-${event.receivedAt}`} className="event-row">
                <strong>{event.type}</strong>
                <span>{formatDate(new Date(event.receivedAt).toISOString())}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}
