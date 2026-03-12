import { ServerConfig } from "../components/ServerConfig";
import type { KnownServerProfile, ServerConfig as ServerConfigShape } from "../types/opencode";

interface SetupPageProps {
  initialValue: ServerConfigShape;
  knownProfiles: KnownServerProfile[];
  isBusy: boolean;
  error?: string | null;
  onSubmit: (config: ServerConfigShape) => void;
  onConnectKnownProfile: (profile: KnownServerProfile) => void;
  onSelectKnownProfile: (profile: KnownServerProfile) => void;
  onOpenDocs: () => void;
  onCancel?: () => void;
}

function profileOrigin(profile: KnownServerProfile) {
  if (!profile.sourceKey) {
    return "profilo salvato";
  }

  return `rilevato da ${profile.sourceKey}`;
}

export function SetupPage({
  knownProfiles,
  onConnectKnownProfile,
  onOpenDocs,
  onSelectKnownProfile,
  ...props
}: SetupPageProps) {
  return (
    <main className="setup-shell">
      <div className="setup-hero">
        <div className="hero-card">
          <span className="eyebrow">GitHub Pages Ready</span>
          <h2>Client web per sessioni, provider e stream live.</h2>
          <p>
            Pensato per collegarsi a `opencode serve` da desktop, tablet o telefono con un
            layout adattivo e uno stato locale persistente.
          </p>
          <div className="hero-actions">
            <button className="button button-secondary" type="button" onClick={onOpenDocs}>
              Guida server OpenCode
            </button>
          </div>
        </div>

        <section className="known-profiles-card">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Local Storage</span>
              <h2>Server preconfigurati</h2>
            </div>
            <span className="status-chip">{knownProfiles.length}</span>
          </div>

          {knownProfiles.length === 0 ? (
            <div className="empty-card">
              <strong>Nessun server trovato</strong>
              <span>
                Appena salvi o usi una connessione OpenCode, comparira qui come scorciatoia.
              </span>
            </div>
          ) : (
            <div className="known-profile-list">
              {knownProfiles.map((profile) => (
                <article key={profile.id} className="known-profile-row">
                  <div>
                    <strong>{profile.label}</strong>
                    <span>{profile.serverUrl}</span>
                    <span>{profileOrigin(profile)}</span>
                  </div>

                  <div className="panel-actions">
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() => onSelectKnownProfile(profile)}
                    >
                      Usa dati
                    </button>
                    <button
                      className="button button-primary button-small"
                      type="button"
                      onClick={() => onConnectKnownProfile(profile)}
                    >
                      Connetti
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <ServerConfig {...props} />
    </main>
  );
}
