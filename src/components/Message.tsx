import { memo, useMemo, useState } from "react";
import { extractMessageText } from "../api/opencode";
import { highlightCode, parseMarkdown } from "../lib/markdown";
import type { SessionMessage } from "../types/opencode";

interface MessageProps {
  message: SessionMessage;
  /** When true, renders a pulsing cursor at the end (streaming) */
  isStreaming?: boolean;
  /** Called when user clicks "Retry" on a failed optimistic message */
  onRetry?: (text: string) => void;
}

function roleLabel(role: string) {
  switch (role.toLowerCase()) {
    case "assistant": return "Assistant";
    case "user":      return "You";
    case "system":    return "System";
    default:          return role;
  }
}

function roleTone(role: string) {
  const lower = role.toLowerCase();
  if (lower.includes("assistant")) return "assistant";
  if (lower.includes("user"))      return "user";
  return "system";
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function AssistantAvatar() {
  return (
    <div className="msg-avatar msg-avatar-assistant" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
      </svg>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="msg-avatar msg-avatar-user" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <button
      className={`code-copy-btn ${copied ? "code-copy-btn-success" : ""}`}
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy code"}
      aria-label={copied ? "Copied!" : "Copy code"}
    >
      {copied ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

interface CodeBlockProps {
  code: string;
  lang: string;
}

function CodeBlock({ code, lang }: CodeBlockProps) {
  const highlighted = useMemo(() => highlightCode(code, lang), [code, lang]);
  const displayLang = lang && lang !== "plaintext" ? lang : null;

  return (
    <div className="code-block">
      <div className="code-block-header">
        {displayLang && <span className="code-block-lang">{displayLang}</span>}
        <CopyButton text={code} />
      </div>
      <pre
        className="code-block-pre"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
}

function MarkdownBody({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  if (isStreaming) {
    return (
      <div className="md-body">
        <pre className="msg-user-text">{text}</pre>
        <span className="msg-stream-cursor" aria-hidden="true" />
      </div>
    );
  }

  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className="md-body">
      {blocks.map((block, index) => {
        if (block.type === "code" && block.code !== undefined) {
          return <CodeBlock key={index} code={block.code} lang={block.lang ?? "plaintext"} />;
        }
        return (
          <div
            key={index}
            className="md-prose"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: block.html ?? "" }}
          />
        );
      })}
    </div>
  );
}

export const Message = memo(function Message({ message, isStreaming, onRetry }: MessageProps) {
  const tone = roleTone(message.info.role);
  // Memoize text extraction — only recomputes when parts or streamingText change
  const text = useMemo(() => extractMessageText(message), [message.parts, message.streamingText]); // eslint-disable-line react-hooks/exhaustive-deps
  const time = formatTime(message.info.updatedAt ?? message.info.createdAt);
  const metaItems = [
    message.requestMeta?.agent ?? null,
    message.requestMeta?.model
      ? (message.requestMeta.model.split("/").pop() ?? message.requestMeta.model)
      : null,
  ].filter(Boolean) as string[];

  if (tone === "system") {
    return (
      <div className="msg-system">
        <span className="msg-system-label">System</span>
        <div className="md-body">
          <pre className="msg-system-pre">{text}</pre>
        </div>
      </div>
    );
  }

  const isUser = tone === "user";

  return (
    <div className={`msg-row ${isUser ? "msg-row-user" : "msg-row-assistant"}`}>
      {!isUser && <AssistantAvatar />}

      <div className={`msg-bubble ${isUser ? "msg-bubble-user" : "msg-bubble-assistant"}`}>
        {metaItems.length > 0 && (
          <div className="msg-meta-chips">
            {metaItems.map((item) => (
              <span key={item} className="msg-meta-chip">{item}</span>
            ))}
          </div>
        )}

        {isUser ? (
          // User messages: plain pre (no markdown parsing needed)
          <pre className="msg-user-text">{text}</pre>
        ) : (
          <MarkdownBody text={text} isStreaming={isStreaming} />
        )}

        <div className="msg-footer">
          {message.optimistic && !message.failed && (
            <span className="msg-status-sending">
              <span className="msg-status-dot" />
              sending
            </span>
          )}
          {message.failed && (
            <span className="msg-status-failed">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Failed
              {onRetry && (
                <button
                  className="msg-retry-btn"
                  type="button"
                  onClick={() => onRetry(text)}
                >
                  Retry
                </button>
              )}
            </span>
          )}
          <CopyButton text={text} />
          {time && <span className="msg-time">{time}</span>}
        </div>
      </div>

      {isUser && <UserAvatar />}
    </div>
  );
});
