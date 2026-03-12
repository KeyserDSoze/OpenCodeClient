import { Chat } from "../components/Chat";
import type {
  AgentSummary,
  ComposerSelectOption,
  PromptMode,
  ServerConfig,
  SessionMessage,
  SessionSummary,
} from "../types/opencode";

interface ChatPageProps {
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
  onRemoveMessage?: (messageId: string) => void;
}

export function ChatPage(props: ChatPageProps) {
  return <Chat {...props} />;
}
