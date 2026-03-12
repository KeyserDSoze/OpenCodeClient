import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import type {
  AgentSummary,
  ComposerSelectOption,
  PromptMode,
  ServerConfig,
  SessionMessage,
  SessionSummary,
} from "../types/opencode";
import { ApiTools } from "./ApiTools";
import { Message } from "./Message";

interface ChatProps {
  agents: AgentSummary[];
  config: ServerConfig;
  deliveryMode: PromptMode;
  modelOptions: ComposerSelectOption[];
  toolOptions: ComposerSelectOption[];
  selectedAgent: string;
  selectedModel: string;
  selectedTools: string[];
  onDeliveryModeChange: (mode: PromptMode) => void;
  onSelectedAgentChange: (agentId: string) => void;
  onSelectedModelChange: (modelId: string) => void;
  onSelectedToolsChange: (toolIds: string[]) => void;
  session: SessionSummary | null;
  messages: SessionMessage[];
  isLoading: boolean;
  isSending: boolean;
  onReload: () => void;
  onAbort?: () => void;
  onSend: (text: string) => Promise<void> | void;
}

export function Chat({
  agents,
  config,
  deliveryMode,
  modelOptions,
  toolOptions,
  selectedAgent,
  selectedModel,
  selectedTools,
  onDeliveryModeChange,
  onSelectedAgentChange,
  onSelectedModelChange,
  onSelectedToolsChange,
  session,
  messages,
  isLoading,
  isSending,
  onReload,
  onAbort,
  onSend,
}: ChatProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const disabled = isSending || draft.trim().length === 0;
  const hasSelectedAgentOption = !selectedAgent || agents.some((agent) => agent.id === selectedAgent);
  const hasSelectedModelOption =
    !selectedModel || modelOptions.some((option) => option.value === selectedModel);

  const toggleTool = (toolId: string) => {
    if (selectedTools.includes(toolId)) {
      onSelectedToolsChange(selectedTools.filter((value) => value !== toolId));
      return;
    }

    onSelectedToolsChange([...selectedTools, toolId]);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const title = useMemo(() => session?.title ?? "Seleziona una sessione", [session]);

  const submitDraft = async () => {
    if (!draft.trim()) {
      return;
    }

    const nextValue = draft.trim();
    setDraft("");
    await onSend(nextValue);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitDraft();
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      await submitDraft();
    }
  };

  return (
    <section className="panel panel-chat">
      <div className="panel-head panel-head-chat">
        <div>
          <span className="eyebrow">Conversation</span>
          <h2>{title}</h2>
          <p>{session ? `Status: ${session.status}` : "Apri o crea una sessione per iniziare."}</p>
        </div>

        <div className="panel-actions">
          {session && onAbort ? (
            <button className="button button-secondary" type="button" onClick={onAbort}>
              Abort
            </button>
          ) : null}
          <button className="icon-button" type="button" onClick={onReload} title="Ricarica messaggi">
            ↻
          </button>
        </div>
      </div>

      <div className="chat-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <strong>Pronto per il primo prompt</strong>
            <span>
              La risposta del server apparira qui e verra aggiornata quando arrivano eventi SSE.
            </span>
          </div>
        ) : (
          messages.map((message) => <Message key={message.info.id} message={message} />)
        )}

        {isLoading ? <div className="inline-status">Caricamento messaggi...</div> : null}
        <div ref={endRef} />
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <div className="composer-toolbar">
          <div className="mode-toggle">
            <span>Delivery</span>
            <div className="mode-toggle-buttons">
              <button
                className={`mode-toggle-button ${deliveryMode === "reply" ? "mode-toggle-button-active" : ""}`}
                type="button"
                onClick={() => onDeliveryModeChange("reply")}
              >
                Sync reply
              </button>
              <button
                className={`mode-toggle-button ${deliveryMode === "async" ? "mode-toggle-button-active" : ""}`}
                type="button"
                onClick={() => onDeliveryModeChange("async")}
              >
                Async SSE
              </button>
            </div>
          </div>
          <span className="status-chip">
            {deliveryMode === "async" ? "POST /prompt_async" : "POST /message"}
          </span>
        </div>

        <div className="composer-selectors">
          <label className="field field-compact">
            <span>Agent</span>
            <select
              value={selectedAgent}
              onChange={(event) => onSelectedAgentChange(event.target.value)}
            >
              <option value="">Server default</option>
              {!hasSelectedAgentOption ? (
                <option value={selectedAgent}>{selectedAgent} (saved)</option>
              ) : null}
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.id}
                </option>
              ))}
            </select>
          </label>

          <label className="field field-compact">
            <span>Model</span>
            <select
              value={selectedModel}
              onChange={(event) => onSelectedModelChange(event.target.value)}
            >
              <option value="">Server default</option>
              {!hasSelectedModelOption ? (
                <option value={selectedModel}>{selectedModel} (saved)</option>
              ) : null}
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="tools-selector">
          <div className="tools-selector-head">
            <span>Tools</span>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => onSelectedToolsChange([])}
              disabled={selectedTools.length === 0}
            >
              Use server default
            </button>
          </div>

          <div className="tool-chip-grid">
            {toolOptions.map((option) => {
              const isActive = selectedTools.includes(option.value);

              return (
                <button
                  key={option.value}
                  className={`tool-chip ${isActive ? "tool-chip-active" : ""}`}
                  type="button"
                  onClick={() => toggleTool(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          <span className="tools-selector-copy">
            {selectedTools.length > 0
              ? `${selectedTools.length} tool selezionati per questo prompt.`
              : "Nessun override: il server decide l'insieme tool disponibile."}
          </span>
        </div>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Scrivi un prompt per OpenCode..."
          rows={4}
        />

        <div className="composer-actions">
          <span>
            {deliveryMode === "async"
              ? "Il prompt viene accodato e la risposta arriva via SSE."
              : "Invio rapido: Ctrl/Cmd + Enter"}
          </span>
          <button className="button button-primary" type="submit" disabled={disabled}>
            {isSending ? (deliveryMode === "async" ? "Queueing..." : "Sending...") : deliveryMode === "async" ? "Queue async" : "Send"}
          </button>
        </div>
      </form>

      <ApiTools agents={agents} config={config} sessionId={session?.id ?? null} />
    </section>
  );
}
