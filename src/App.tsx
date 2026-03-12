import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  abortSession,
  authorizeProviderOAuth,
  createSession,
  deleteSession,
  extractEventSessionId,
  extractMessageText,
  getAgents,
  getCurrentProject,
  getHealth,
  getPathInfo,
  getProviders,
  getProjects,
  getSessionMessages,
  getSessions,
  getToolIds,
  getVcsInfo,
  sendAsyncMessage,
  sendMessage,
  subscribeToEvents,
  toErrorMessage,
} from "./api/opencode";
import { ChatPage } from "./pages/Chat";
import { SessionsPage } from "./pages/Sessions";
import { SetupPage } from "./pages/Setup";
import {
  DEFAULT_SERVER_CONFIG,
  loadLastSession,
  loadPromptMode,
  loadSelectedAgent,
  loadSelectedModel,
  loadSelectedTools,
  loadServerConfig,
  loadSessionsCache,
  saveLastSession,
  savePromptMode,
  saveSelectedAgent,
  saveSelectedModel,
  saveSelectedTools,
  saveServerConfig,
  saveSessionsCache,
} from "./storage/config";
import type {
  AgentSummary,
  ComposerSelectOption,
  MessageRequestMeta,
  PathInfo,
  PromptMode,
  ProjectSummary,
  ProviderSummary,
  ServerConfig,
  SessionMessage,
  SessionSummary,
  StreamEvent,
  VcsInfo,
} from "./types/opencode";

type HealthState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "connected"; version?: string }
  | { status: "error"; error: string };

type StreamState = "offline" | "connecting" | "online" | "error";

function toModelValue(providerId: string, model: string) {
  return model.includes("/") ? model : `${providerId}/${model}`;
}

function toModelLabel(providerName: string, model: string, isDefault?: boolean) {
  const shortModel = model.includes("/") ? model.split("/").pop() ?? model : model;
  return `${providerName} / ${shortModel}${isDefault ? " (default)" : ""}`;
}

function buildComposerModelOptions(providers: ProviderSummary[]): ComposerSelectOption[] {
  const options = new Map<string, ComposerSelectOption>();

  providers.forEach((provider) => {
    if (provider.defaultModel) {
      const value = toModelValue(provider.id, provider.defaultModel);
      options.set(value, {
        value,
        label: toModelLabel(provider.name, provider.defaultModel, true),
      });
    }

    provider.models.forEach((model) => {
      const value = toModelValue(provider.id, model);

      if (!options.has(value)) {
        options.set(value, {
          value,
          label: toModelLabel(provider.name, model),
        });
      }
    });
  });

  return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function buildToolOptions(toolIds: string[]): ComposerSelectOption[] {
  return toolIds.map((toolId) => ({ value: toolId, label: toolId })).sort((left, right) => left.label.localeCompare(right.label));
}

function attachLocalRequestMeta(
  fetchedMessages: SessionMessage[],
  previousMessages: SessionMessage[],
) {
  const previousUserMessages = previousMessages.filter(
    (message) => message.info.role.toLowerCase().includes("user") && message.requestMeta,
  );

  return fetchedMessages.map((message) => {
    if (message.requestMeta || !message.info.role.toLowerCase().includes("user")) {
      return message;
    }

    const text = extractMessageText(message);
    const match = previousUserMessages.find(
      (candidate) => extractMessageText(candidate) === text && candidate.requestMeta,
    );

    if (!match?.requestMeta) {
      return message;
    }

    return {
      ...message,
      requestMeta: match.requestMeta,
    };
  });
}

function sessionTimestampTitle() {
  return `Remote session ${new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date())}`;
}

function makeOptimisticMessage(text: string, requestMeta?: MessageRequestMeta): SessionMessage {
  return {
    info: {
      id: `local-${Date.now()}`,
      role: "user",
      createdAt: new Date().toISOString(),
      raw: {},
    },
    parts: [{ type: "text", text }],
    requestMeta,
    optimistic: true,
  };
}

export default function App() {
  const [bootstrap] = useState(() => ({
    config: loadServerConfig(),
    sessions: loadSessionsCache(),
    lastSessionId: loadLastSession(),
    promptMode: loadPromptMode(),
    selectedAgent: loadSelectedAgent(),
    selectedModel: loadSelectedModel(),
    selectedTools: loadSelectedTools(),
  }));
  const [config, setConfig] = useState<ServerConfig | null>(bootstrap.config);
  const [showSetup, setShowSetup] = useState(!bootstrap.config);
  const [health, setHealth] = useState<HealthState>(
    bootstrap.config ? { status: "checking" } : { status: "idle" },
  );
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentProject, setCurrentProject] = useState<ProjectSummary | null>(null);
  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null);
  const [vcsInfo, setVcsInfo] = useState<VcsInfo | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>(bootstrap.sessions);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(bootstrap.lastSessionId);
  const [promptMode, setPromptMode] = useState<PromptMode>(bootstrap.promptMode);
  const [selectedAgent, setSelectedAgent] = useState(bootstrap.selectedAgent);
  const [selectedModel, setSelectedModel] = useState(bootstrap.selectedModel);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>(bootstrap.selectedTools);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(bootstrap.config ? "connecting" : "offline");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  const configRef = useRef<ServerConfig | null>(bootstrap.config);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const sessionsRefreshTimerRef = useRef<number | null>(null);
  const messagesRefreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    return () => {
      streamCleanupRef.current?.();

      if (sessionsRefreshTimerRef.current) {
        window.clearTimeout(sessionsRefreshTimerRef.current);
      }

      if (messagesRefreshTimerRef.current) {
        window.clearTimeout(messagesRefreshTimerRef.current);
      }
    };
  }, []);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );
  const composerModelOptions = useMemo(() => buildComposerModelOptions(providers), [providers]);
  const composerToolOptions = useMemo(() => buildToolOptions(availableTools), [availableTools]);

  useEffect(() => {
    if (selectedAgent && agents.length > 0 && !agents.some((agent) => agent.id === selectedAgent)) {
      setSelectedAgent("");
      saveSelectedAgent("");
    }
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (
      selectedModel &&
      composerModelOptions.length > 0 &&
      !composerModelOptions.some((option) => option.value === selectedModel)
    ) {
      setSelectedModel("");
      saveSelectedModel("");
    }
  }, [composerModelOptions, selectedModel]);

  useEffect(() => {
    if (selectedTools.length > 0 && availableTools.length > 0) {
      const filtered = selectedTools.filter((toolId) => availableTools.includes(toolId));

      if (filtered.length !== selectedTools.length) {
        setSelectedTools(filtered);
        saveSelectedTools(filtered);
      }
    }
  }, [availableTools, selectedTools]);

  const fetchWorkspaceMeta = useCallback(async (activeConfig: ServerConfig) => {
    const [projectsResult, currentProjectResult, pathInfoResult, vcsInfoResult, agentsResult, toolsResult] =
      await Promise.allSettled([
        getProjects(activeConfig),
        getCurrentProject(activeConfig),
        getPathInfo(activeConfig),
        getVcsInfo(activeConfig),
        getAgents(activeConfig),
        getToolIds(activeConfig),
      ]);

    const nextProjects = projectsResult.status === "fulfilled" ? projectsResult.value : [];
    const nextCurrentProject =
      currentProjectResult.status === "fulfilled" ? currentProjectResult.value : null;

    return {
      projects: nextProjects,
      currentProject: nextCurrentProject ?? nextProjects[0] ?? null,
      pathInfo: pathInfoResult.status === "fulfilled" ? pathInfoResult.value : null,
      vcsInfo: vcsInfoResult.status === "fulfilled" ? vcsInfoResult.value : null,
      agents: agentsResult.status === "fulfilled" ? agentsResult.value : [],
      tools: toolsResult.status === "fulfilled" ? toolsResult.value : [],
    };
  }, []);

  const loadMessages = useCallback(async (activeConfig: ServerConfig, sessionId: string) => {
    setIsLoadingMessages(true);

    try {
      const nextMessages = await getSessionMessages(activeConfig, sessionId);

      if (selectedSessionIdRef.current === sessionId) {
        setMessages((current) => attachLocalRequestMeta(nextMessages, current));
      }
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  const loadSessions = useCallback(
    async (activeConfig: ServerConfig, preferredSessionId?: string | null) => {
      setIsLoadingSessions(true);

      try {
        const nextSessions = await getSessions(activeConfig);
        setSessions(nextSessions);
        saveSessionsCache(nextSessions);

        const desiredSessionId =
          preferredSessionId ??
          (nextSessions.some((session) => session.id === selectedSessionIdRef.current)
            ? selectedSessionIdRef.current
            : null) ??
          nextSessions[0]?.id ??
          null;

        selectedSessionIdRef.current = desiredSessionId;
        setSelectedSessionId(desiredSessionId);
        saveLastSession(desiredSessionId);

        if (!desiredSessionId) {
          setMessages([]);
        }

        return desiredSessionId;
      } finally {
        setIsLoadingSessions(false);
      }
    },
    [],
  );

  const scheduleSessionsRefresh = useCallback(
    (activeConfig: ServerConfig) => {
      if (sessionsRefreshTimerRef.current) {
        window.clearTimeout(sessionsRefreshTimerRef.current);
      }

      sessionsRefreshTimerRef.current = window.setTimeout(() => {
        void loadSessions(activeConfig);
      }, 280);
    },
    [loadSessions],
  );

  const scheduleMessagesRefresh = useCallback(
    (activeConfig: ServerConfig, sessionId: string) => {
      if (messagesRefreshTimerRef.current) {
        window.clearTimeout(messagesRefreshTimerRef.current);
      }

      messagesRefreshTimerRef.current = window.setTimeout(() => {
        void loadMessages(activeConfig, sessionId);
      }, 220);
    },
    [loadMessages],
  );

  const startEventStream = useCallback(
    (activeConfig: ServerConfig) => {
      streamCleanupRef.current?.();
      setStreamState("connecting");

      streamCleanupRef.current = subscribeToEvents(activeConfig, {
        onOpen: () => setStreamState("online"),
        onEvent: (event) => {
          setStreamState("online");
          setEvents((current) => [event, ...current].slice(0, 10));

          const currentSessionId = selectedSessionIdRef.current;
          const eventSessionId = extractEventSessionId(event);

          if (
            event.type === "server.connected" ||
            event.type.startsWith("session") ||
            event.type.startsWith("message") ||
            event.type.startsWith("tool")
          ) {
            scheduleSessionsRefresh(activeConfig);
          }

          if (
            currentSessionId &&
            (!eventSessionId || eventSessionId === currentSessionId) &&
            (event.type.startsWith("session") ||
              event.type.startsWith("message") ||
              event.type.startsWith("tool"))
          ) {
            scheduleMessagesRefresh(activeConfig, currentSessionId);
          }
        },
        onError: (error) => {
          setStreamState("error");
          setNotice(`Stream SSE interrotto: ${toErrorMessage(error)}`);
        },
      });
    },
    [scheduleMessagesRefresh, scheduleSessionsRefresh],
  );

  const connectToServer = useCallback(
    async (nextConfig: ServerConfig) => {
      setIsConnecting(true);
      setErrorMessage(null);
      setNotice(null);
      setHealth({ status: "checking" });

      try {
        const healthResponse = await getHealth(nextConfig);

        if (!healthResponse.healthy) {
          throw new Error("Il server ha risposto ma non risulta healthy");
        }

        const [nextProviders, nextSessions, workspaceMeta] = await Promise.all([
          getProviders(nextConfig).catch(() => []),
          getSessions(nextConfig),
          fetchWorkspaceMeta(nextConfig),
        ]);

        const storedLastSessionId = loadLastSession();
        const preferredSessionId =
          nextSessions.find((session) => session.id === storedLastSessionId)?.id ??
          nextSessions[0]?.id ??
          null;

        setConfig(nextConfig);
        saveServerConfig(nextConfig);
        setProviders(nextProviders);
        setProjects(workspaceMeta.projects);
        setCurrentProject(workspaceMeta.currentProject);
        setPathInfo(workspaceMeta.pathInfo);
        setVcsInfo(workspaceMeta.vcsInfo);
        setAgents(workspaceMeta.agents);
        setAvailableTools(workspaceMeta.tools);
        setSessions(nextSessions);
        saveSessionsCache(nextSessions);
        selectedSessionIdRef.current = preferredSessionId;
        setSelectedSessionId(preferredSessionId);
        saveLastSession(preferredSessionId);
        setHealth({ status: "connected", version: healthResponse.version });
        setShowSetup(false);

        if (preferredSessionId) {
          const nextMessages = await getSessionMessages(nextConfig, preferredSessionId);
          setMessages(nextMessages);
        } else {
          setMessages([]);
        }

        startEventStream(nextConfig);
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
        setHealth({ status: "error", error: toErrorMessage(error) });
        setStreamState("offline");
        setShowSetup(true);
      } finally {
        setIsConnecting(false);
      }
    },
    [fetchWorkspaceMeta, startEventStream],
  );

  useEffect(() => {
    if (bootstrap.config) {
      void connectToServer(bootstrap.config);
    }
  }, [bootstrap.config, connectToServer]);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const activeConfig = configRef.current;

      if (!activeConfig) {
        return;
      }

      setErrorMessage(null);
      selectedSessionIdRef.current = sessionId;
      setSelectedSessionId(sessionId);
      saveLastSession(sessionId);
      await loadMessages(activeConfig, sessionId);
    },
    [loadMessages],
  );

  const handleRefresh = useCallback(async () => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      return;
    }

    setErrorMessage(null);
    const [refreshedSessionId, nextProviders, workspaceMeta] = await Promise.all([
      loadSessions(activeConfig),
      getProviders(activeConfig).catch(() => []),
      fetchWorkspaceMeta(activeConfig),
    ]);

    if (refreshedSessionId) {
      await loadMessages(activeConfig, refreshedSessionId);
    }

    setProviders(nextProviders);
    setProjects(workspaceMeta.projects);
    setCurrentProject(workspaceMeta.currentProject);
    setPathInfo(workspaceMeta.pathInfo);
    setVcsInfo(workspaceMeta.vcsInfo);
    setAgents(workspaceMeta.agents);
    setAvailableTools(workspaceMeta.tools);
    startEventStream(activeConfig);
  }, [fetchWorkspaceMeta, loadMessages, loadSessions, startEventStream]);

  const handleCreateSession = useCallback(async () => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      return;
    }

    setErrorMessage(null);

    try {
      const nextSession = await createSession(activeConfig, { title: sessionTimestampTitle() });
      const nextSessions = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)];
      setSessions(nextSessions);
      saveSessionsCache(nextSessions);
      selectedSessionIdRef.current = nextSession.id;
      setSelectedSessionId(nextSession.id);
      saveLastSession(nextSession.id);
      setMessages([]);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }, [sessions]);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      const activeConfig = configRef.current;

      if (!activeConfig) {
        return;
      }

      const targetSession = sessions.find((session) => session.id === sessionId);

      if (!targetSession) {
        return;
      }

      const confirmed = window.confirm(`Eliminare la sessione "${targetSession.title}"?`);

      if (!confirmed) {
        return;
      }

      try {
        await deleteSession(activeConfig, sessionId);
        const remainingSessions = sessions.filter((session) => session.id !== sessionId);
        setSessions(remainingSessions);
        saveSessionsCache(remainingSessions);

        if (selectedSessionIdRef.current === sessionId) {
          const nextSelected = remainingSessions[0]?.id ?? null;
          selectedSessionIdRef.current = nextSelected;
          setSelectedSessionId(nextSelected);
          saveLastSession(nextSelected);

          if (nextSelected) {
            await loadMessages(activeConfig, nextSelected);
          } else {
            setMessages([]);
          }
        }
      } catch (error) {
        setErrorMessage(toErrorMessage(error));
      }
    },
    [loadMessages, sessions],
  );

  const ensureSession = useCallback(async () => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      throw new Error("Config server non disponibile");
    }

    if (selectedSessionIdRef.current) {
      return { sessionId: selectedSessionIdRef.current, config: activeConfig };
    }

    const nextSession = await createSession(activeConfig, { title: sessionTimestampTitle() });
    const nextSessions = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)];
    setSessions(nextSessions);
    saveSessionsCache(nextSessions);
    selectedSessionIdRef.current = nextSession.id;
    setSelectedSessionId(nextSession.id);
    saveLastSession(nextSession.id);
    setMessages([]);

    return { sessionId: nextSession.id, config: activeConfig };
  }, [sessions]);

  const handleSend = useCallback(async (text: string) => {
    setErrorMessage(null);
    setNotice(null);
    setIsSending(true);

    try {
      const { sessionId, config: activeConfig } = await ensureSession();
      const requestMeta: MessageRequestMeta = {
        agent: selectedAgent || undefined,
        model: selectedModel || undefined,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
      };

      setMessages((current) => [...current, makeOptimisticMessage(text, requestMeta)]);
      const payload = {
        text,
        agent: selectedAgent || undefined,
        model: selectedModel || undefined,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
      };

      if (promptMode === "async") {
        await sendAsyncMessage(activeConfig, sessionId, payload);
        setNotice("Prompt inviato in modalita async. Attendo risposta via stream SSE...");
      } else {
        await sendMessage(activeConfig, sessionId, payload);
      }
      await loadMessages(activeConfig, sessionId);
      await loadSessions(activeConfig, sessionId);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }, [ensureSession, loadMessages, loadSessions, promptMode, selectedAgent, selectedModel, selectedTools]);

  const handleProviderLogin = useCallback(async (providerId: string) => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      return;
    }

    try {
      const url = await authorizeProviderOAuth(activeConfig, providerId);

      if (!url) {
        throw new Error("Il server non ha restituito un URL OAuth");
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }, []);

  const handleAbortSession = useCallback(async () => {
    const activeConfig = configRef.current;
    const sessionId = selectedSessionIdRef.current;

    if (!activeConfig || !sessionId) {
      return;
    }

    try {
      await abortSession(activeConfig, sessionId);
      setNotice("Sessione interrotta. Ricarico stato e messaggi...");
      await loadSessions(activeConfig, sessionId);
      await loadMessages(activeConfig, sessionId);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }, [loadMessages, loadSessions]);

  const setupValue = config ?? DEFAULT_SERVER_CONFIG;

  if (showSetup || !config) {
    return (
      <SetupPage
        initialValue={setupValue}
        isBusy={isConnecting}
        error={errorMessage}
        onSubmit={(nextConfig) => {
          void connectToServer(nextConfig);
        }}
        onCancel={config ? () => setShowSetup(false) : undefined}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">OpenCode Remote Client</span>
          <h1>Browser console per sessioni, stream e provider.</h1>
        </div>

        <div className="topbar-actions">
          <div className="status-cluster">
            <span className="status-chip">
              Server: {health.status === "connected" ? "online" : health.status}
            </span>
            <span className="status-chip">
              Versione: {health.status === "connected" ? health.version ?? "n/d" : "-"}
            </span>
            <span className="status-chip">SSE: {streamState}</span>
            <span className="status-chip">Project: {currentProject?.name ?? "n/d"}</span>
            <span className="status-chip">
              Branch: {vcsInfo?.branch ?? "n/d"}
              {vcsInfo?.dirty ? " *" : ""}
            </span>
            <span className="status-chip">Agents: {agents.length}</span>
          </div>

          <button className="button button-secondary" type="button" onClick={handleRefresh}>
            Refresh
          </button>
          <button className="button button-secondary" type="button" onClick={() => setShowSetup(true)}>
            Settings
          </button>
        </div>
      </header>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMessage ? <div className="notice notice-error">{errorMessage}</div> : null}

      <main className="workspace-grid">
        <SessionsPage
          projects={projects}
          currentProject={currentProject}
          pathInfo={pathInfo}
          vcsInfo={vcsInfo}
          agents={agents}
          sessions={sessions}
          providers={providers}
          events={events}
          selectedSessionId={selectedSessionId}
          streamState={streamState}
          isLoading={isLoadingSessions}
          onCreate={() => {
            void handleCreateSession();
          }}
          onRefresh={() => {
            void handleRefresh();
          }}
          onSelect={(sessionId) => {
            void handleSelectSession(sessionId);
          }}
          onDelete={(sessionId) => {
            void handleDeleteSession(sessionId);
          }}
          onProviderLogin={(providerId) => {
            void handleProviderLogin(providerId);
          }}
        />

        <ChatPage
          agents={agents}
          config={config}
          deliveryMode={promptMode}
          onDeliveryModeChange={(mode) => {
            setPromptMode(mode);
            savePromptMode(mode);
          }}
          modelOptions={composerModelOptions}
          toolOptions={composerToolOptions}
          selectedAgent={selectedAgent}
          selectedModel={selectedModel}
          selectedTools={selectedTools}
          onSelectedAgentChange={(agentId) => {
            setSelectedAgent(agentId);
            saveSelectedAgent(agentId);
          }}
          onSelectedModelChange={(modelId) => {
            setSelectedModel(modelId);
            saveSelectedModel(modelId);
          }}
          onSelectedToolsChange={(toolIds) => {
            setSelectedTools(toolIds);
            saveSelectedTools(toolIds);
          }}
          session={currentSession}
          messages={messages}
          isLoading={isLoadingMessages}
          isSending={isSending}
          onAbort={() => {
            void handleAbortSession();
          }}
          onReload={() => {
            const activeConfig = configRef.current;
            const currentSessionId = selectedSessionIdRef.current;

            if (!activeConfig || !currentSessionId) {
              return;
            }

            void loadMessages(activeConfig, currentSessionId);
          }}
          onSend={handleSend}
        />
      </main>
    </div>
  );
}
