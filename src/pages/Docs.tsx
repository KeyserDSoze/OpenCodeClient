interface DocsPageProps {
  onBack: () => void;
}

export function DocsPage({ onBack }: DocsPageProps) {
  return (
    <main className="docs-shell">
      <button className="docs-back-btn" type="button" onClick={onBack}>
        ← Back
      </button>

      <div>
        <h1 className="docs-title">How to create the OpenCode server and connect the client</h1>
        <p>
          Quick guide to start <code>opencode serve</code>, protect access with a username and
          password, and correctly configure CORS for the <code>opencode.zone</code> origin or
          your local environment.
        </p>
      </div>

      <section className="docs-section">
        <h2 className="docs-section-title">1. Installation</h2>
        <p>Install OpenCode globally on the server or PC that will host the backend.</p>
        <div className="docs-code-block"><pre><code>{`npm install -g opencode`}</code></pre></div>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">2. Key concepts</h2>
        <article className="docs-note">
          <strong>Web app</strong> — <code>https://opencode.zone</code> is the frontend published on GitHub Pages.
        </article>
        <article className="docs-note">
          <strong>OpenCode server</strong> — <code>https://ai.example.com</code> or <code>https://api.opencode.zone</code> is the real backend.
        </article>
        <article className="docs-note">
          <strong>CORS</strong> — The server must allow the origin <code>https://opencode.zone</code>.
        </article>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">3. Start with username, password and CORS</h2>
        <p>
          The client connects via HTTP Basic Auth. The default username is <code>opencode</code>, but
          you can set a custom one with <code>OPENCODE_SERVER_USERNAME</code>.
        </p>
        <div className="docs-code-block"><pre><code>{`OPENCODE_SERVER_USERNAME=opencode \\
OPENCODE_SERVER_PASSWORD=a-strong-password \\
opencode serve \\
  --hostname 0.0.0.0 \\
  --port 4096 \\
  --cors https://opencode.zone \\
  --cors http://localhost:5173`}</code></pre></div>
        <p>
          In production keep <code>https://opencode.zone</code> among the allowed origins. During
          development also keep <code>http://localhost:5173</code> if you use Vite locally.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">4. Windows PowerShell example</h2>
        <div className="docs-code-block"><pre><code>{`$env:OPENCODE_SERVER_USERNAME = "opencode"
$env:OPENCODE_SERVER_PASSWORD = "a-strong-password"
opencode serve --hostname 0.0.0.0 --port 4096 --cors https://opencode.zone --cors http://localhost:5173`}</code></pre></div>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">5. How to fill in the connection form</h2>
        <article className="docs-note">
          <strong>Server URL</strong> — <code>https://ai.example.com</code>, <code>https://api.opencode.zone</code> or <code>http://IP:4096</code>
        </article>
        <article className="docs-note">
          <strong>Username</strong> — Same value as <code>OPENCODE_SERVER_USERNAME</code> or <code>opencode</code>
        </article>
        <article className="docs-note">
          <strong>Password</strong> — Same value as <code>OPENCODE_SERVER_PASSWORD</code>
        </article>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">6. Useful checks</h2>
        <p>Verify the server is responding before opening the client.</p>
        <div className="docs-code-block"><pre><code>{`GET /global/health
GET /doc
GET /event`}</code></pre></div>
        <p>
          Open <code>/doc</code> to see the OpenAPI spec and <code>/global/health</code> to check
          if the server is healthy.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">7. Important CORS notes</h2>
        <article className="docs-note">
          The browser blocks requests if the client domain is not listed in <code>--cors</code>.
          Always add every real origin from which you will use the client.
        </article>
        <article className="docs-note">
          For this app: <code>https://opencode.zone</code> in production and{" "}
          <code>http://localhost:5173</code> in development.
        </article>
        <article className="docs-note">
          If you use a separate subdomain for the backend (e.g. <code>https://api.opencode.zone</code>),
          the <strong>Server URL</strong> in the form must be that, not <code>https://opencode.zone</code>.
        </article>
      </section>

      <section className="docs-section">
        <h2 className="docs-section-title">8. Public access</h2>
        <p>
          If the server runs at home or on a private network, you must expose it securely: HTTPS
          reverse proxy, tunnel, or a private network like Tailscale. Avoid publishing the server
          without a strong password and TLS.
        </p>
      </section>
    </main>
  );
}
