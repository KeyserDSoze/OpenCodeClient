import { extractMessageText } from "../api/opencode";
import type { SessionMessage } from "../types/opencode";

interface MessageProps {
  message: SessionMessage;
}

function roleLabel(role: string) {
  switch (role.toLowerCase()) {
    case "assistant":
      return "Assistant";
    case "user":
      return "You";
    case "system":
      return "System";
    default:
      return role;
  }
}

function roleTone(role: string) {
  const lower = role.toLowerCase();
  if (lower.includes("assistant")) return "assistant";
  if (lower.includes("user")) return "user";
  return "system";
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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

export function Message({ message }: MessageProps) {
  const tone = roleTone(message.info.role);
  const text = extractMessageText(message);
  const time = formatTime(message.info.updatedAt ?? message.info.createdAt);
  const metaItems = [
    message.requestMeta?.agent ? message.requestMeta.agent : null,
    message.requestMeta?.model ? message.requestMeta.model.split("/").pop() ?? message.requestMeta.model : null,
  ].filter(Boolean) as string[];

  if (tone === "system") {
    return (
      <div className="msg-system">
        <span className="msg-system-label">System</span>
        <pre className="msg-body">{text}</pre>
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

        <pre className="msg-body">{text}</pre>

        <div className="msg-footer">
          {message.optimistic && (
            <span className="msg-status-sending">
              <span className="msg-status-dot" />
              sending
            </span>
          )}
          {time && <span className="msg-time">{time}</span>}
        </div>
      </div>

      {isUser && <UserAvatar />}
    </div>
  );
}
