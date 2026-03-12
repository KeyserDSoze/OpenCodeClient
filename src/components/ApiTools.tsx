import { useEffect, useMemo, useState } from "react";
import {
  executeSessionCommand,
  extractMessageText,
  findFiles,
  readFileContent,
  runShellCommand,
  searchInFiles,
  toErrorMessage,
} from "../api/opencode";
import type { AgentSummary, FileSearchResult, ServerConfig, SessionMessage } from "../types/opencode";

interface ApiToolsProps {
  agents: AgentSummary[];
  config: ServerConfig;
  sessionId: string | null;
}

function renderMessageResult(message: SessionMessage | null) {
  if (!message) {
    return "Request completata senza body JSON.";
  }

  return extractMessageText(message);
}

export function ApiTools({ agents, config, sessionId }: ApiToolsProps) {
  const [pattern, setPattern] = useState("");
  const [fileQuery, setFileQuery] = useState("");
  const [readPath, setReadPath] = useState("");
  const [slashCommand, setSlashCommand] = useState("/");
  const [slashArguments, setSlashArguments] = useState("");
  const [shellCommand, setShellCommand] = useState("");
  const [shellAgent, setShellAgent] = useState("");
  const [searchResults, setSearchResults] = useState<FileSearchResult[]>([]);
  const [fileResults, setFileResults] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState("");
  const [commandOutput, setCommandOutput] = useState("");
  const [shellOutput, setShellOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<"find" | "files" | "read" | "command" | "shell" | null>(null);

  const canUseSessionTools = Boolean(sessionId);
  const agentOptions = useMemo(() => agents.map((agent) => agent.id), [agents]);

  useEffect(() => {
    if (!shellAgent && agentOptions.length > 0) {
      setShellAgent(agentOptions[0]);
    }
  }, [agentOptions, shellAgent]);

  const runSearch = async () => {
    if (!pattern.trim()) {
      return;
    }

    setBusyKey("find");
    setError(null);

    try {
      const nextResults = await searchInFiles(config, pattern.trim());
      setSearchResults(nextResults);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  };

  const runFileFind = async () => {
    if (!fileQuery.trim()) {
      return;
    }

    setBusyKey("files");
    setError(null);

    try {
      const nextResults = await findFiles(config, fileQuery.trim());
      setFileResults(nextResults);
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  };

  const runReadFile = async () => {
    if (!readPath.trim()) {
      return;
    }

    setBusyKey("read");
    setError(null);

    try {
      const nextContent = await readFileContent(config, readPath.trim());
      setFileContent(nextContent || "File letto ma senza contenuto testuale.");
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  };

  const runSlashCommand = async () => {
    if (!sessionId || !slashCommand.trim()) {
      return;
    }

    setBusyKey("command");
    setError(null);

    try {
      const nextResult = await executeSessionCommand(config, sessionId, {
        command: slashCommand.trim(),
        arguments: slashArguments
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setCommandOutput(renderMessageResult(nextResult));
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  };

  const runShell = async () => {
    if (!sessionId || !shellCommand.trim()) {
      return;
    }

    setBusyKey("shell");
    setError(null);

    try {
      const nextResult = await runShellCommand(config, sessionId, {
        command: shellCommand.trim(),
        agent: shellAgent.trim() || undefined,
      });
      setShellOutput(renderMessageResult(nextResult));
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section className="api-tools">
      <div className="panel-head panel-head-tools">
        <div>
          <span className="eyebrow">API Tools</span>
          <h3>Find, file content, slash command e shell</h3>
          <p>
            Utility rapide per provare gli endpoint della spec senza uscire dalla web app.
          </p>
        </div>
        <span className="status-chip">Session: {sessionId ?? "none"}</span>
      </div>

      {error ? <div className="notice notice-error">{error}</div> : null}

      <div className="tools-grid">
        <article className="tool-card">
          <div className="tool-head">
            <strong>Find</strong>
            <span>`GET /find` + `GET /find/file`</span>
          </div>

          <div className="tool-stack">
            <label className="field">
              <span>Pattern testo</span>
              <input
                type="text"
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                placeholder="TODO"
              />
            </label>

            <button className="button button-secondary" type="button" onClick={runSearch}>
              {busyKey === "find" ? "Searching..." : "Search text"}
            </button>

            <label className="field">
              <span>Query file</span>
              <input
                type="text"
                value={fileQuery}
                onChange={(event) => setFileQuery(event.target.value)}
                placeholder="app"
              />
            </label>

            <button className="button button-secondary" type="button" onClick={runFileFind}>
              {busyKey === "files" ? "Finding..." : "Find files"}
            </button>
          </div>

          <div className="tool-output">
            {searchResults.length > 0 ? (
              <div className="tool-result-group">
                <strong>Text matches</strong>
                {searchResults.slice(0, 8).map((result) => (
                  <button
                    key={`${result.path}-${result.lineNumber ?? 0}-${result.lines ?? ""}`}
                    className="tool-result-button"
                    type="button"
                    onClick={() => setReadPath(result.path)}
                  >
                    <span>{result.path}{result.lineNumber ? `:${result.lineNumber}` : ""}</span>
                    <small>{result.lines ?? "Apri il file nel pannello file content"}</small>
                  </button>
                ))}
              </div>
            ) : null}

            {fileResults.length > 0 ? (
              <div className="tool-result-group">
                <strong>File matches</strong>
                {fileResults.slice(0, 8).map((result) => (
                  <button
                    key={result}
                    className="tool-result-button"
                    type="button"
                    onClick={() => setReadPath(result)}
                  >
                    <span>{result}</span>
                    <small>Usa questo path in file content</small>
                  </button>
                ))}
              </div>
            ) : null}

            {searchResults.length === 0 && fileResults.length === 0 ? (
              <div className="empty-inline">Nessun risultato ancora.</div>
            ) : null}
          </div>
        </article>

        <article className="tool-card">
          <div className="tool-head">
            <strong>File content</strong>
            <span>`GET /file/content`</span>
          </div>

          <div className="tool-stack">
            <label className="field">
              <span>Path</span>
              <input
                type="text"
                value={readPath}
                onChange={(event) => setReadPath(event.target.value)}
                placeholder="src/app.ts"
              />
            </label>

            <button className="button button-secondary" type="button" onClick={runReadFile}>
              {busyKey === "read" ? "Reading..." : "Read file"}
            </button>
          </div>

          <div className="tool-output tool-output-pre">
            {fileContent ? <pre>{fileContent}</pre> : <div className="empty-inline">Il contenuto letto apparira qui.</div>}
          </div>
        </article>

        <article className="tool-card">
          <div className="tool-head">
            <strong>Slash command</strong>
            <span>`POST /session/{'{id}'}/command`</span>
          </div>

          <div className="tool-stack">
            <label className="field">
              <span>Command</span>
              <input
                type="text"
                value={slashCommand}
                onChange={(event) => setSlashCommand(event.target.value)}
                placeholder="/test"
              />
            </label>

            <label className="field">
              <span>Arguments (comma separated)</span>
              <input
                type="text"
                value={slashArguments}
                onChange={(event) => setSlashArguments(event.target.value)}
                placeholder="arg1, arg2"
              />
            </label>

            <button
              className="button button-secondary"
              type="button"
              onClick={runSlashCommand}
              disabled={!canUseSessionTools}
            >
              {busyKey === "command" ? "Running..." : "Run command"}
            </button>
          </div>

          <div className="tool-output tool-output-pre">
            {canUseSessionTools ? (
              commandOutput ? <pre>{commandOutput}</pre> : <div className="empty-inline">L'output del comando apparira qui.</div>
            ) : (
              <div className="empty-inline">Apri una sessione per usare gli endpoint legati a `/session`.</div>
            )}
          </div>
        </article>

        <article className="tool-card">
          <div className="tool-head">
            <strong>Shell</strong>
            <span>`POST /session/{'{id}'}/shell`</span>
          </div>

          <div className="tool-stack">
            <label className="field">
              <span>Command</span>
              <input
                type="text"
                value={shellCommand}
                onChange={(event) => setShellCommand(event.target.value)}
                placeholder="ls -la"
              />
            </label>

            <label className="field">
              <span>Agent</span>
              <input
                list="api-tools-agent-list"
                type="text"
                value={shellAgent}
                onChange={(event) => setShellAgent(event.target.value)}
                placeholder={agentOptions[0] ?? "coder"}
              />
            </label>

            <button
              className="button button-secondary"
              type="button"
              onClick={runShell}
              disabled={!canUseSessionTools}
            >
              {busyKey === "shell" ? "Executing..." : "Run shell"}
            </button>
          </div>

          <div className="tool-output tool-output-pre">
            {canUseSessionTools ? (
              shellOutput ? <pre>{shellOutput}</pre> : <div className="empty-inline">L'output shell apparira qui.</div>
            ) : (
              <div className="empty-inline">Apri una sessione per eseguire comandi shell.</div>
            )}
          </div>
        </article>
      </div>

      <datalist id="api-tools-agent-list">
        {agentOptions.map((agentId) => (
          <option key={agentId} value={agentId} />
        ))}
      </datalist>
    </section>
  );
}
