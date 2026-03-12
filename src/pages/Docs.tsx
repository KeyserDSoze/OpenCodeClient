interface DocsPageProps {
  onBack: () => void;
}

export function DocsPage({ onBack }: DocsPageProps) {
  return (
    <main className="docs-shell">
      <section className="docs-page">
        <div className="panel-head docs-page-head">
          <div>
            <span className="eyebrow">Documentation</span>
            <h1>Come creare il server OpenCode e collegarlo al client</h1>
            <p>
              Guida rapida per avviare `opencode serve`, proteggere l'accesso con username e
              password e configurare correttamente il CORS per l'origine web `opencode.zone` o per
              l'ambiente locale.
            </p>
          </div>

          <button className="button button-secondary" type="button" onClick={onBack}>
            Torna indietro
          </button>
        </div>

        <section className="docs-section">
          <h2>1. Installazione</h2>
          <p>Installa OpenCode globalmente sul server o sul PC che terra il backend.</p>
          <pre className="docs-code"><code>{`npm install -g opencode`}</code></pre>
        </section>

        <section className="docs-section">
          <h2>2. Prima distinzione importante</h2>
          <div className="docs-grid">
            <article className="docs-note">
              <strong>App web</strong>
              <span>`https://opencode.zone` e il frontend pubblicato su GitHub Pages</span>
            </article>
            <article className="docs-note">
              <strong>Server OpenCode</strong>
              <span>`https://ai.example.com` o `https://api.opencode.zone` e il backend reale</span>
            </article>
            <article className="docs-note">
              <strong>CORS</strong>
              <span>Il server deve consentire l'origine `https://opencode.zone`</span>
            </article>
          </div>
        </section>

        <section className="docs-section">
          <h2>3. Avvio con username, password e CORS</h2>
          <p>
            Il client si connette via HTTP Basic Auth. Di default lo username e `opencode`, ma
            puoi impostarne uno personalizzato con `OPENCODE_SERVER_USERNAME`.
          </p>
          <pre className="docs-code"><code>{`OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=una-password-forte \
opencode serve \
  --hostname 0.0.0.0 \
  --port 4096 \
  --cors https://opencode.zone \
  --cors http://localhost:5173`}</code></pre>
          <p>
            In produzione tieni `https://opencode.zone` tra gli origin consentiti. Durante lo
            sviluppo tieni anche `http://localhost:5173` se usi Vite in locale.
          </p>
        </section>

        <section className="docs-section">
          <h2>4. Esempio Windows PowerShell</h2>
          <pre className="docs-code"><code>{`$env:OPENCODE_SERVER_USERNAME = "opencode"
$env:OPENCODE_SERVER_PASSWORD = "una-password-forte"
opencode serve --hostname 0.0.0.0 --port 4096 --cors https://opencode.zone --cors http://localhost:5173`}</code></pre>
        </section>

        <section className="docs-section">
          <h2>5. Come compili i campi nel client</h2>
          <div className="docs-grid">
            <article className="docs-note">
              <strong>Server URL</strong>
              <span>`https://ai.example.com`, `https://api.opencode.zone` oppure `http://IP:4096`</span>
            </article>
            <article className="docs-note">
              <strong>Username</strong>
              <span>Lo stesso valore di `OPENCODE_SERVER_USERNAME` o `opencode`</span>
            </article>
            <article className="docs-note">
              <strong>Password</strong>
              <span>Lo stesso valore di `OPENCODE_SERVER_PASSWORD`</span>
            </article>
          </div>
        </section>

        <section className="docs-section">
          <h2>6. Verifiche utili</h2>
          <p>Controlla che il server risponda prima di aprire il client.</p>
          <pre className="docs-code"><code>{`GET /global/health
GET /doc
GET /event`}</code></pre>
          <p>
            In pratica puoi aprire `https://ai.example.com/doc` per vedere la spec OpenAPI e usare
            `https://ai.example.com/global/health` per controllare se il server e healthy.
          </p>
        </section>

        <section className="docs-section">
          <h2>7. Note CORS importanti</h2>
          <ul className="docs-list">
            <li>Il browser blocca le chiamate se il dominio del client non e tra i `--cors`.</li>
            <li>Aggiungi sempre tutti gli origin reali da cui userai il client.</li>
            <li>
              Per questa app: `https://opencode.zone` in produzione e `http://localhost:5173` in
              sviluppo.
            </li>
            <li>
              Se usi un sottodominio separato per il backend, per esempio `https://api.opencode.zone`,
              il `Server URL` nel form deve essere quello, non `https://opencode.zone`.
            </li>
          </ul>
        </section>

        <section className="docs-section">
          <h2>8. Accesso pubblico</h2>
          <p>
            Se il server gira in casa o su una rete privata, devi esporlo in modo sicuro: reverse
            proxy HTTPS, tunnel o rete privata tipo Tailscale. Evita di pubblicare il server senza
            password forte e TLS.
          </p>
        </section>
      </section>
    </main>
  );
}
