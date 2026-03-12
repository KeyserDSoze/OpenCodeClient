import { SessionList } from "../components/SessionList";
import type {
  AgentSummary,
  PathInfo,
  ProjectSummary,
  ProviderSummary,
  SessionSummary,
  StreamEvent,
  VcsInfo,
} from "../types/opencode";

interface SessionsPageProps {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  pathInfo: PathInfo | null;
  vcsInfo: VcsInfo | null;
  agents: AgentSummary[];
  sessions: SessionSummary[];
  providers: ProviderSummary[];
  events: StreamEvent[];
  selectedSessionId: string | null;
  streamState: "offline" | "connecting" | "online" | "error";
  isLoading: boolean;
  onCreate: () => void;
  onRefresh: () => void;
  onSelect: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRename?: (sessionId: string, newTitle: string) => void;
  onProviderLogin: (providerId: string) => void;
}

export function SessionsPage(props: SessionsPageProps) {
  return <SessionList {...props} />;
}
