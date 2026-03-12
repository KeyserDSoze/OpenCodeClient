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

  if (lower.includes("assistant")) {
    return "assistant";
  }

  if (lower.includes("user")) {
    return "user";
  }

  return "system";
}

function formatTime(value?: string) {
  if (!value) {
    return "ora";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function Message({ message }: MessageProps) {
  const tone = roleTone(message.info.role);
  const metaItems = [
    message.requestMeta?.agent ? `agent ${message.requestMeta.agent}` : null,
    message.requestMeta?.model ? `model ${message.requestMeta.model}` : null,
    message.requestMeta?.tools?.length ? `tools ${message.requestMeta.tools.join(", ")}` : null,
  ].filter(Boolean) as string[];

  return (
    <article className={`message-card message-card-${tone}`}>
      <div className="message-meta">
        <span className="message-role">{roleLabel(message.info.role)}</span>
        <span>{formatTime(message.info.updatedAt ?? message.info.createdAt)}</span>
        {message.optimistic ? <span className="message-pending">sending</span> : null}
      </div>
      {metaItems.length > 0 ? (
        <div className="message-request-meta">
          {metaItems.map((item) => (
            <span key={item} className="message-request-chip">
              {item}
            </span>
          ))}
        </div>
      ) : null}
      <pre className="message-body">{extractMessageText(message)}</pre>
    </article>
  );
}
