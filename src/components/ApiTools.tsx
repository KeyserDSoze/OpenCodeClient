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
    return "Request completed without JSON body.";
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
    if (!pattern.trim()) return;
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
    if (!fileQuery.trim()) return;
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
    if (!readPath.trim()) return;
    setBusyKey("read");
    setError(null);
    try {
      const nextContent = await readFileContent(config, readPath.trim());
      setFileContent(nextContent || "File read but no textual content.");
    } catch (requestError) {
      setError(toErrorMessage(requestError));
    } finally {
      setBusyKey(null);
    }
  };

  const runSlashCommand = async () => {
    if (!sessionId || !slashCommand.trim()) return;
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
    if (!sessionId || !shellCommand.trim()) return;
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
      <div className="api-tools-header">
        <span className="api-tools-title">API Tools</span>
        <span style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
          session: {sessionId ?? "none"}
        </span>
      </div>

      {error ? (
        <div className="login-error" style={{ marginBottom: 8 }}>{error}</div>
      ) : null}

      <div className="api-tools-grid">
        {/* Find */}
        <div className="tool-card">
          <div className="tool-card-title">Find</div>
          <div className="tool-card-subtitle">GET /find · GET /find/file</div>

          <div className="tool-input-row">
            <input
              className="tool-input"
              type="text"
              value={pattern}
              onChange={(event) => setPattern(event.target.value)}
              placeholder="TODO"
            />
            <button className="tool-run-btn" type="button" onClick={runSearch}>
              {busyKey === "find" ? "..." : "Text"}
            </button>
          </div>

          <div className="tool-input-row">
            <input
              className="tool-input"
              type="text"
              value={fileQuery}
              onChange={(event) => setFileQuery(event.target.value)}
              placeholder="filename"
            />
            <button className="tool-run-btn" type="button" onClick={runFileFind}>
              {busyKey === "files" ? "..." : "Files"}
            </button>
          </div>

          <div className="tool-output">
            {searchResults.length > 0 ? (
              <div className="tool-result-list">
                {searchResults.slice(0, 6).map((result) => (
                  <button
                    key={`${result.path}-${result.lineNumber ?? 0}`}
                    className="tool-result-item"
                    type="button"
                    onClick={() => setReadPath(result.path)}
                  >
                    <span>{result.path}{result.lineNumber ? `:${result.lineNumber}` : ""}</span>
                    {result.lines && <span style={{ color: "var(--text-3)" }}>{result.lines}</span>}
                  </button>
                ))}
              </div>
            ) : fileResults.length > 0 ? (
              <div className="tool-result-list">
                {fileResults.slice(0, 6).map((result) => (
                  <button
                    key={result}
                    className="tool-result-item"
                    type="button"
                    onClick={() => setReadPath(result)}
                  >
                    {result}
                  </button>
                ))}
              </div>
            ) : (
              <pre style={{ color: "var(--text-3)", fontSize: "12px" }}>No results yet.</pre>
            )}
          </div>
        </div>

        {/* File content */}
        <div className="tool-card">
          <div className="tool-card-title">File content</div>
          <div className="tool-card-subtitle">GET /file/content</div>

          <div className="tool-input-row">
            <input
              className="tool-input"
              type="text"
              value={readPath}
              onChange={(event) => setReadPath(event.target.value)}
              placeholder="src/app.ts"
            />
            <button className="tool-run-btn" type="button" onClick={runReadFile}>
              {busyKey === "read" ? "..." : "Read"}
            </button>
          </div>

          <div className="tool-output">
            {fileContent ? (
              <pre>{fileContent}</pre>
            ) : (
              <pre style={{ color: "var(--text-3)", fontSize: "12px" }}>File content here.</pre>
            )}
          </div>
        </div>

        {/* Slash command */}
        <div className="tool-card">
          <div className="tool-card-title">Slash command</div>
          <div className="tool-card-subtitle">POST /session/&#123;id&#125;/command</div>

          <div className="tool-input-row">
            <input
              className="tool-input"
              type="text"
              value={slashCommand}
              onChange={(event) => setSlashCommand(event.target.value)}
              placeholder="/test"
              style={{ flex: 2 }}
            />
            <input
              className="tool-input"
              type="text"
              value={slashArguments}
              onChange={(event) => setSlashArguments(event.target.value)}
              placeholder="arg1, arg2"
              style={{ flex: 1 }}
            />
          </div>

          <button
            className="tool-run-btn"
            type="button"
            onClick={runSlashCommand}
            disabled={!canUseSessionTools}
            style={{ width: "100%" }}
          >
            {busyKey === "command" ? "Running..." : "Run command"}
          </button>

          <div className="tool-output">
            {canUseSessionTools ? (
              commandOutput ? (
                <pre>{commandOutput}</pre>
              ) : (
                <pre style={{ color: "var(--text-3)", fontSize: "12px" }}>Output here.</pre>
              )
            ) : (
              <pre style={{ color: "var(--text-3)", fontSize: "12px" }}>Open a session first.</pre>
            )}
          </div>
        </div>

        {/* Shell */}
        <div className="tool-card">
          <div className="tool-card-title">Shell</div>
          <div className="tool-card-subtitle">POST /session/&#123;id&#125;/shell</div>

          <div className="tool-input-row">
            <input
              className="tool-input"
              type="text"
              value={shellCommand}
              onChange={(event) => setShellCommand(event.target.value)}
              placeholder="ls -la"
              style={{ flex: 2 }}
            />
            <input
              className="tool-input"
              list="api-tools-agent-list"
              type="text"
              value={shellAgent}
              onChange={(event) => setShellAgent(event.target.value)}
              placeholder={agentOptions[0] ?? "coder"}
              style={{ flex: 1 }}
            />
          </div>

          <button
            className="tool-run-btn"
            type="button"
            onClick={runShell}
            disabled={!canUseSessionTools}
            style={{ width: "100%" }}
          >
            {busyKey === "shell" ? "Executing..." : "Run shell"}
          </button>

          <div className="tool-output">
            {canUseSessionTools ? (
              shellOutput ? (
                <pre>{shellOutput}</pre>
              ) : (
                <pre style={{ color: "var(--text-3)", fontSize: "12px" }}>Output here.</pre>
              )
            ) : (
              <pre style={{ color: "var(--text-3)", fontSize: "12px" }}>Open a session first.</pre>
            )}
          </div>
        </div>
      </div>

      <datalist id="api-tools-agent-list">
        {agentOptions.map((agentId) => (
          <option key={agentId} value={agentId} />
        ))}
      </datalist>
    </section>
  );
}
