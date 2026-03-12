import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { ServerConfig as ServerConfigShape } from "../types/opencode";
import { loadRememberConnection, saveRememberConnection } from "../storage/config";

interface ServerConfigProps {
  initialValue: ServerConfigShape;
  isBusy: boolean;
  error?: string | null;
  onSubmit: (config: ServerConfigShape, remember: boolean) => void;
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
  const [remember, setRemember] = useState(() => loadRememberConnection());

  useEffect(() => {
    setServerUrl(initialValue.serverUrl);
    setUsername(initialValue.username);
    setPassword(initialValue.password);
  }, [initialValue]);

  const isValid = serverUrl.trim() && username.trim() && password.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    saveRememberConnection(remember);
    onSubmit(
      {
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password,
      },
      remember,
    );
  };

  return (
    <form className="login-card" onSubmit={handleSubmit}>
      <div className="login-header">
        <div className="login-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="var(--accent)" opacity="0.15" />
            <path d="M8 16C8 11.582 11.582 8 16 8s8 3.582 8 8-3.582 8-8 8-8-3.582-8-8z" stroke="var(--accent)" strokeWidth="2" fill="none" />
            <path d="M13 16l2 2 4-4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="login-title">OpenCode</h1>
          <p className="login-subtitle">Connect to your server</p>
        </div>
      </div>

      <div className="login-fields">
        <label className="login-field">
          <span className="login-label">Server URL</span>
          <input
            className="login-input"
            type="url"
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
            placeholder="https://ai.example.com"
            autoComplete="url"
            autoFocus
          />
        </label>

        <label className="login-field">
          <span className="login-label">Username</span>
          <input
            className="login-input"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="opencode"
            autoComplete="username"
          />
        </label>

        <label className="login-field">
          <span className="login-label">Password</span>
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Server password"
            autoComplete="current-password"
          />
        </label>
      </div>

      <label className="login-remember">
        <input
          type="checkbox"
          className="login-checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <span>Remember this connection</span>
      </label>

      {error ? <div className="login-error">{error}</div> : null}

      <div className="login-actions">
        <button className="login-btn-primary" type="submit" disabled={!isValid || isBusy}>
          {isBusy ? (
            <>
              <span className="login-spinner" />
              Connecting...
            </>
          ) : (
            "Connect"
          )}
        </button>

        {onCancel ? (
          <button className="login-btn-secondary" type="button" onClick={onCancel}>
            Back to chat
          </button>
        ) : null}
      </div>
    </form>
  );
}
