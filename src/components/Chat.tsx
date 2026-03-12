import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, FormEvent, KeyboardEvent, SyntheticEvent } from "react";
import type {
  AgentSummary,
  ComposerSelectOption,
  PromptMode,
  ServerConfig,
  SessionMessage,
  SessionSummary,
} from "../types/opencode";
import { extractMessageText } from "../api/opencode";
import { useSpeechRecognition, useTts } from "../hooks/useSpeech";
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
  onMarkFailed?: (messageId: string) => void;
  onRemoveMessage?: (messageId: string) => void;
}

// ── Export helpers ────────────────────────────────────────────────────────────

function messagesToPlainText(messages: SessionMessage[]): string {
  return messages
    .map((m) => {
      const role = m.info.role.toLowerCase().includes("user") ? "User" : "Assistant";
      const text = extractMessageText(m);
      return `[${role}]\n${text}`;
    })
    .join("\n\n---\n\n");
}

function messagesToMarkdown(messages: SessionMessage[], title?: string): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`, "");
  messages.forEach((m) => {
    const isUser = m.info.role.toLowerCase().includes("user");
    const role = isUser ? "**User**" : "**Assistant**";
    const text = extractMessageText(m);
    lines.push(`${role}`, "", text, "", "---", "");
  });
  return lines.join("\n");
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

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
  onRemoveMessage,
}: ChatProps) {
  const [draft, setDraft] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showApiTools, setShowApiTools] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  // STT auto-send: default true → send immediately; false → append to draft
  const [sttAutoSend, setSttAutoSend] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  // Keep a ref so the STT onEnd callback always sees the latest value
  const sttAutoSendRef = useRef(sttAutoSend);
  const draftRef = useRef(draft);

  useEffect(() => { sttAutoSendRef.current = sttAutoSend; }, [sttAutoSend]);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  // ── TTS: track which assistant message ids have already been spoken ──────
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const tts = useTts({ lang: "it-IT", rate: 1.05 });

  // ── STT ──────────────────────────────────────────────────────────────────
  const resizeTextarea = () => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 240)}px`;
  };

  const stt = useSpeechRecognition({
    lang: "it-IT",
    onEnd: (transcript) => {
      if (!transcript.trim()) return;
      if (sttAutoSendRef.current) {
        setDraft("");
        if (textareaRef.current) textareaRef.current.style.height = "auto";
        void onSend(transcript.trim());
      } else {
        setDraft((prev) => {
          const base = prev.trimEnd();
          const next = base ? `${base} ${transcript.trim()}` : transcript.trim();
          return next;
        });
        setTimeout(resizeTextarea, 0);
      }
    },
  });

  // ── TTS: speak new assistant messages ────────────────────────────────────
  useEffect(() => {
    if (!tts.enabled) return;
    messages.forEach((msg) => {
      const role = msg.info.role.toLowerCase();
      if (!role.includes("assistant")) return;
      if (msg.optimistic) return;
      const id = msg.info.id;
      // Check Set before calling extractMessageText to avoid work on already-spoken messages
      if (spokenIdsRef.current.has(id)) return;
      const text = extractMessageText(msg);
      if (!text) return;
      spokenIdsRef.current.add(id);
      tts.enqueue(text);
    });
  }, [messages, tts]);

  // ── Stop TTS when TTS is disabled ────────────────────────────────────────
  useEffect(() => {
    if (!tts.enabled) {
      spokenIdsRef.current.clear();
    }
  }, [tts.enabled]);

  // ── Close export menu on outside click ───────────────────────────────────
  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const disabled = isSending || draft.trim().length === 0;
  const hasSelectedAgentOption = !selectedAgent || agents.some((agent) => agent.id === selectedAgent);
  const hasSelectedModelOption =
    !selectedModel || modelOptions.some((option) => option.value === selectedModel);

  const activeControlsCount = [
    selectedAgent ? 1 : 0,
    selectedModel ? 1 : 0,
    selectedTools.length > 0 ? 1 : 0,
    deliveryMode === "async" ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Show typing indicator when sending but no streaming placeholder yet
  const hasStreamingMessage = messages.some((m) => m.isStreaming);
  const showTypingIndicator = isSending && !hasStreamingMessage;

  const toggleTool = (toolId: string) => {
    if (selectedTools.includes(toolId)) {
      onSelectedToolsChange(selectedTools.filter((value) => value !== toolId));
      return;
    }
    onSelectedToolsChange([...selectedTools, toolId]);
  };

  useEffect(() => {
    // Use 'auto' (instant) instead of 'smooth' to avoid layout thrashing
    // when messages update rapidly from SSE events.
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages, showTypingIndicator]);

  const title = useMemo(() => session?.title ?? "New conversation", [session]);

  const handleRetry = async (messageId: string, text: string) => {
    // Remove the failed message then re-send
    onRemoveMessage?.(messageId);
    await onSend(text);
  };

  const submitDraft = async () => {
    if (!draft.trim()) return;
    const nextValue = draft.trim();
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSend(nextValue);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitDraft();
  };

  // Ctrl+Enter / Cmd+Enter → send; Enter alone → newline
  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      await submitDraft();
    }
  };

  const handleTextareaInput = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  };

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Append file names / paths as text references
    const filePaths = files.map((f) => f.name).join(", ");
    setDraft((prev) => {
      const base = prev.trimEnd();
      return base ? `${base}\n${filePaths}` : filePaths;
    });
    setTimeout(resizeTextarea, 0);
    textareaRef.current?.focus();
  };

  // ── Export handlers ───────────────────────────────────────────────────────
  const handleExportCopy = async () => {
    setShowExportMenu(false);
    await navigator.clipboard.writeText(messagesToPlainText(messages));
  };

  const handleExportMarkdown = () => {
    setShowExportMenu(false);
    const filename = `${session?.title ?? "conversation"}.md`.replace(/[/\\?%*:|"<>]/g, "-");
    downloadText(messagesToMarkdown(messages, session?.title), filename, "text/markdown");
  };

  const handleExportJson = () => {
    setShowExportMenu(false);
    const filename = `${session?.title ?? "conversation"}.json`.replace(/[/\\?%*:|"<>]/g, "-");
    downloadText(JSON.stringify(messages, null, 2), filename, "application/json");
  };

  return (
    <div className="chat-panel">
      {/* Chat toolbar (export, reload) */}
      {messages.length > 0 && (
        <div className="chat-toolbar">
          <button
            className="icon-btn"
            type="button"
            onClick={onReload}
            title="Reload messages"
            aria-label="Reload messages"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3" />
            </svg>
          </button>

          <div className="export-menu" ref={exportMenuRef}>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setShowExportMenu((v) => !v)}
              title="Export conversation"
              aria-label="Export conversation"
              aria-expanded={showExportMenu}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>

            {showExportMenu && (
              <div className="export-dropdown">
                <button className="export-item" type="button" onClick={() => void handleExportCopy()}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy text
                </button>
                <button className="export-item" type="button" onClick={handleExportMarkdown}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Download .md
                </button>
                <button className="export-item" type="button" onClick={handleExportJson}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Download .json
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="chat-messages">
        {messages.length === 0 && !isLoading ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="chat-empty-title">{title}</p>
            <p className="chat-empty-hint">
              {session
                ? "No messages yet. Start the conversation below."
                : "Select or create a session from the sidebar."}
            </p>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((message) => (
              <Message
                key={message.info.id}
                message={message}
                isStreaming={message.isStreaming}
                onRetry={message.failed ? (text) => void handleRetry(message.info.id, text) : undefined}
              />
            ))}
            {showTypingIndicator && (
              <div className="msg-row">
                <div className="msg-avatar msg-avatar-assistant" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <path d="M8 16C8 11.582 11.582 8 16 8s8 3.582 8 8-3.582 8-8 8-8-3.582-8-8z" stroke="var(--accent)" strokeWidth="2" fill="none" />
                  </svg>
                </div>
                <div className="typing-indicator">
                  <span className="typing-dots">
                    <span /><span /><span />
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="chat-loading">
            <span className="loading-dots">
              <span /><span /><span />
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="composer-area">
        {/* Advanced controls panel */}
        {showAdvanced && (
          <div className="composer-advanced">
            <div className="composer-advanced-row">
              <label className="composer-field">
                <span className="composer-field-label">Agent</span>
                <select
                  className="composer-select"
                  value={selectedAgent}
                  onChange={(event) => onSelectedAgentChange(event.target.value)}
                >
                  <option value="">Default</option>
                  {!hasSelectedAgentOption && (
                    <option value={selectedAgent}>{selectedAgent} (saved)</option>
                  )}
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="composer-field">
                <span className="composer-field-label">Model</span>
                <select
                  className="composer-select"
                  value={selectedModel}
                  onChange={(event) => onSelectedModelChange(event.target.value)}
                >
                  <option value="">Default</option>
                  {!hasSelectedModelOption && (
                    <option value={selectedModel}>{selectedModel} (saved)</option>
                  )}
                  {modelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="composer-field">
                <span className="composer-field-label">Mode</span>
                <select
                  className="composer-select"
                  value={deliveryMode}
                  onChange={(event) => onDeliveryModeChange(event.target.value as PromptMode)}
                >
                  <option value="reply">Sync reply</option>
                  <option value="async">Async SSE</option>
                </select>
              </label>
            </div>

            {toolOptions.length > 0 && (
              <div className="composer-tools-row">
                <span className="composer-field-label">Tools</span>
                <div className="tools-chips">
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
                  {selectedTools.length > 0 && (
                    <button
                      className="tool-chip-clear"
                      type="button"
                      onClick={() => onSelectedToolsChange([])}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <form className="composer-form" onSubmit={handleSubmit}>
          {/* Drag & drop wrapper */}
          <div
            className={`composer-drop-zone ${isDragOver ? "drag-over" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <textarea
              ref={textareaRef}
              className="composer-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleTextareaInput}
              placeholder={
                stt.status === "listening"
                  ? sttAutoSend
                    ? "Listening... (will send automatically)"
                    : "Listening... (will append to draft)"
                  : "Message OpenCode... (Ctrl+Enter to send)"
              }
              rows={1}
            />
            <div className="composer-drop-overlay">Drop files to attach</div>
          </div>

          <div className="composer-footer">
            <div className="composer-footer-left">
              {/* Advanced options toggle */}
              <button
                className={`composer-btn-icon ${showAdvanced ? "active" : ""}`}
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                title="Advanced options"
                aria-label="Toggle advanced options"
                aria-expanded={showAdvanced}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                  <line x1="1" y1="14" x2="7" y2="14" />
                  <line x1="9" y1="8" x2="15" y2="8" />
                  <line x1="17" y1="16" x2="23" y2="16" />
                </svg>
                {activeControlsCount > 0 && (
                  <span className="composer-badge">{activeControlsCount}</span>
                )}
              </button>

              {/* API tools toggle */}
              <button
                className={`composer-btn-icon ${showApiTools ? "active" : ""}`}
                type="button"
                onClick={() => setShowApiTools((v) => !v)}
                title="API tools"
                aria-label="Toggle API tools"
                aria-expanded={showApiTools}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </button>

              {/* Abort button */}
              {session && onAbort && isSending && (
                <button
                  className="composer-btn-abort"
                  type="button"
                  onClick={onAbort}
                  title="Stop generation"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Stop
                </button>
              )}

              {/* STT mic button + auto-send toggle */}
              {stt.status !== "unsupported" && (
                <>
                  <button
                    className={`composer-btn-icon composer-btn-mic ${stt.status === "listening" ? "mic-active" : ""} ${stt.status === "error" ? "mic-error" : ""}`}
                    type="button"
                    onClick={() => {
                      if (stt.status === "listening") {
                        stt.stop();
                      } else {
                        stt.start();
                      }
                    }}
                    title={
                      stt.status === "listening"
                        ? "Stop listening"
                        : sttAutoSend
                          ? "Voice input (auto-send on)"
                          : "Voice input (auto-send off — will append)"
                    }
                    aria-label={stt.status === "listening" ? "Stop listening" : "Voice input"}
                  >
                    {stt.status === "listening" ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="12" y1="1" x2="12" y2="23" />
                        <line x1="8" y1="5" x2="8" y2="19" />
                        <line x1="4" y1="9" x2="4" y2="15" />
                        <line x1="16" y1="5" x2="16" y2="19" />
                        <line x1="20" y1="9" x2="20" y2="15" />
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    )}
                  </button>

                  <button
                    className={`stt-autosend-toggle ${sttAutoSend ? "stt-autosend-on" : "stt-autosend-off"}`}
                    type="button"
                    onClick={() => setSttAutoSend((v) => !v)}
                    title={sttAutoSend ? "Auto-send ON" : "Auto-send OFF"}
                    aria-label={sttAutoSend ? "Auto-send enabled" : "Auto-send disabled"}
                    aria-pressed={sttAutoSend}
                  >
                    {sttAutoSend ? "auto-send" : "append"}
                  </button>
                </>
              )}

              {/* TTS toggle */}
              {tts.status !== "unsupported" && (
                <button
                  className={`composer-btn-icon composer-btn-tts ${tts.enabled ? "tts-active" : ""} ${tts.status === "speaking" ? "tts-speaking" : ""}`}
                  type="button"
                  onClick={tts.toggle}
                  title={tts.enabled ? "Disable read-aloud" : "Enable read-aloud"}
                  aria-label={tts.enabled ? "Disable text-to-speech" : "Enable text-to-speech"}
                  aria-pressed={tts.enabled}
                >
                  {tts.status === "speaking" ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      {tts.enabled ? (
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      ) : (
                        <>
                          <line x1="23" y1="9" x2="17" y2="15" />
                          <line x1="17" y1="9" x2="23" y2="15" />
                        </>
                      )}
                    </svg>
                  )}
                </button>
              )}

              <span className="composer-hint">↵ newline · ⌃↵ send</span>
            </div>

            <button
              className="composer-send"
              type="submit"
              disabled={disabled}
              aria-label="Send message"
            >
              {isSending ? (
                <span className="composer-sending-dots">
                  <span /><span /><span />
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {showApiTools && (
          <div className="api-tools-panel">
            <ApiTools agents={agents} config={config} sessionId={session?.id ?? null} />
          </div>
        )}
      </div>
    </div>
  );
}
