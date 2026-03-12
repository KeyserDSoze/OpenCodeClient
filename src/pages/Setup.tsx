import { ServerConfig } from "../components/ServerConfig";
import type { ServerConfig as ServerConfigShape } from "../types/opencode";

interface SetupPageProps {
  initialValue: ServerConfigShape;
  isBusy: boolean;
  error?: string | null;
  onSubmit: (config: ServerConfigShape) => void;
  onCancel?: () => void;
}

export function SetupPage(props: SetupPageProps) {
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
        </div>
      </div>

      <ServerConfig {...props} />
    </main>
  );
}
