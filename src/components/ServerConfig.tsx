import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ServerConfig as ServerConfigShape } from "../types/opencode";

interface ServerConfigProps {
  initialValue: ServerConfigShape;
  isBusy: boolean;
  error?: string | null;
  onSubmit: (config: ServerConfigShape) => void;
  onCancel?: () => void;
}

export function ServerConfig({
  initialValue,
  isBusy,
  error,
  onSubmit,
  onCancel,
}: ServerConfigProps) {
  const [serverUrl, setServerUrl] = useState(initialValue.serverUrl);
  const [username, setUsername] = useState(initialValue.username);
  const [password, setPassword] = useState(initialValue.password);

  useEffect(() => {
    setServerUrl(initialValue.serverUrl);
    setUsername(initialValue.username);
    setPassword(initialValue.password);
  }, [initialValue]);

  const isValid = serverUrl.trim() && username.trim() && password.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    onSubmit({
      serverUrl: serverUrl.trim(),
      username: username.trim(),
      password,
    });
  };

  return (
    <form className="setup-card" onSubmit={handleSubmit}>
      <div className="setup-copy">
        <span className="eyebrow">Remote OpenCode</span>
        <h1>Collega il browser al tuo server agent.</h1>
        <p>
          La web app salva le credenziali in locale, verifica la salute del server e apre
          sessioni e streaming eventi senza backend intermedio.
        </p>
      </div>

      <label className="field">
        <span>Server URL</span>
        <input
          type="url"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
          placeholder="https://ai.example.com"
          autoComplete="url"
        />
      </label>

      <label className="field">
        <span>Username</span>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="opencode"
          autoComplete="username"
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Inserisci la password del server"
          autoComplete="current-password"
        />
      </label>

      <div className="setup-tips">
        <div>
          <strong>Health check</strong>
          <span>`GET /global/health`</span>
        </div>
        <div>
          <strong>Event stream</strong>
          <span>SSE via `fetch` con Basic Auth</span>
        </div>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={!isValid || isBusy}>
          {isBusy ? "Connessione..." : "Connect"}
        </button>

        {onCancel ? (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Torna alla chat
          </button>
        ) : null}
      </div>
    </form>
  );
}
