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
  renameSession,
  sendAsyncMessage,
  streamMessage,
  subscribeToEvents,
  toErrorMessage,
} from "./api/opencode";
import { ChatPage } from "./pages/Chat";
import { DocsPage } from "./pages/Docs";
import { SessionsPage } from "./pages/Sessions";
import { SetupPage } from "./pages/Setup";
import { ToastContainer } from "./components/ToastContainer";
import { useToast } from "./hooks/useToast";
import {
  DEFAULT_SERVER_CONFIG,
  detectKnownServerProfiles,
  loadLastSession,
  loadPromptMode,
  loadRememberConnection,
  loadSelectedAgent,
  loadSelectedModel,
  loadSelectedTools,
  loadServerConfig,
  loadSessionsCache,
  loadSidebarCollapsed,
  loadTheme,
  saveLastSession,
  savePromptMode,
  saveRememberConnection,
  saveSelectedAgent,
  saveSelectedModel,
  saveSelectedTools,
  saveServerConfig,
  saveServerProfile,
  saveSessionsCache,
  saveSidebarCollapsed,
  saveTheme,
} from "./storage/config";
import type {
  AgentSummary,
  ComposerSelectOption,
  KnownServerProfile,
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
import type { Theme } from "./storage/config";

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
  return `Session ${new Intl.DateTimeFormat("en-GB", {
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

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function App() {
  const [bootstrap] = useState(() => ({
    config: loadServerConfig(),
    knownProfiles: detectKnownServerProfiles(),
    sessions: loadSessionsCache(),
    lastSessionId: loadLastSession(),
    promptMode: loadPromptMode(),
    selectedAgent: loadSelectedAgent(),
    selectedModel: loadSelectedModel(),
    selectedTools: loadSelectedTools(),
    theme: loadTheme(),
    rememberConnection: loadRememberConnection(),
    sidebarCollapsed: loadSidebarCollapsed(),
  }));

  const [theme, setTheme] = useState<Theme>(bootstrap.theme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(bootstrap.sidebarCollapsed);
  const [config, setConfig] = useState<ServerConfig | null>(bootstrap.config);
  const [knownProfiles, setKnownProfiles] = useState<KnownServerProfile[]>(bootstrap.knownProfiles);
  const [setupFormConfig, setSetupFormConfig] = useState<ServerConfig>(
    bootstrap.config ?? DEFAULT_SERVER_CONFIG,
  );
  // If remember was set and we have a config, start connected (auto-connect on mount)
  const [showSetup, setShowSetup] = useState(!bootstrap.config || !bootstrap.rememberConnection);
  const [showDocs, setShowDocs] = useState(false);
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
  const [connectError, setConnectError] = useState<string | null>(null);

  const toast = useToast();

  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  const configRef = useRef<ServerConfig | null>(bootstrap.config);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const sessionsRefreshTimerRef = useRef<number | null>(null);
  const messagesRefreshTimerRef = useRef<number | null>(null);
  const streamingAbortRef = useRef<(() => void) | null>(null);

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
  }, [theme]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      saveSidebarCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId;
  }, [selectedSessionId]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    if (showSetup) {
      setKnownProfiles(detectKnownServerProfiles());
    }
  }, [showSetup]);

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
          toast.warning(`SSE stream interrupted: ${toErrorMessage(error)}`);
        },
      });
    },
    [scheduleMessagesRefresh, scheduleSessionsRefresh],
  );

  const connectToServer = useCallback(
    async (nextConfig: ServerConfig, remember?: boolean) => {
      setSetupFormConfig(nextConfig);
      setIsConnecting(true);
      setConnectError(null);
      setHealth({ status: "checking" });

      try {
        const healthResponse = await getHealth(nextConfig);

        if (!healthResponse.healthy) {
          throw new Error("Server responded but is not healthy");
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
        if (remember !== undefined) {
          saveRememberConnection(remember);
        }
        if (remember || loadRememberConnection()) {
          saveServerConfig(nextConfig);
        }
        saveServerProfile(nextConfig);
        setKnownProfiles(detectKnownServerProfiles());
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
        setShowDocs(false);

        if (preferredSessionId) {
          const nextMessages = await getSessionMessages(nextConfig, preferredSessionId);
          setMessages(nextMessages);
        } else {
          setMessages([]);
        }

        startEventStream(nextConfig);
      } catch (error) {
        setConnectError(toErrorMessage(error));
        setHealth({ status: "error", error: toErrorMessage(error) });
        setStreamState("offline");
        setShowSetup(true);
      } finally {
        setIsConnecting(false);
      }
    },
    [fetchWorkspaceMeta, startEventStream],
  );

  // Auto-connect if remember was set
  useEffect(() => {
    if (bootstrap.config && bootstrap.rememberConnection) {
      void connectToServer(bootstrap.config);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = useCallback(() => {
    streamCleanupRef.current?.();
    saveRememberConnection(false);
    setConfig(null);
    setSessions([]);
    setMessages([]);
    setProviders([]);
    setAgents([]);
    setEvents([]);
    setHealth({ status: "idle" });
    setStreamState("offline");
    setSetupFormConfig(DEFAULT_SERVER_CONFIG);
    setShowSetup(true);
  }, []);

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      const activeConfig = configRef.current;

      if (!activeConfig) {
        return;
      }

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

    setConnectError(null);
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
      toast.error(toErrorMessage(error));
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

      const confirmed = window.confirm(`Delete session "${targetSession.title}"?`);

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
        toast.error(toErrorMessage(error));
      }
    },
    [loadMessages, sessions],
  );

  const ensureSession = useCallback(async () => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      throw new Error("Server config not available");
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
    setIsSending(true);

    // Abort any previous streaming assistant message
    streamingAbortRef.current?.();
    streamingAbortRef.current = null;

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
        setIsSending(false);
        await loadMessages(activeConfig, sessionId);
        await loadSessions(activeConfig, sessionId);
      } else {
        // Streaming mode: add a placeholder assistant message and fill it token by token
        const streamId = `streaming-${Date.now()}`;
        setMessages((current) => [
          ...current,
          {
            info: { id: streamId, role: "assistant", createdAt: new Date().toISOString(), raw: {} },
            parts: [],
            streamingText: "",
            isStreaming: true,
          },
        ]);

        let accumulated = "";
        const abort = streamMessage(activeConfig, sessionId, payload, {
          onToken: (delta) => {
            accumulated += delta;
            const snap = accumulated;
            setMessages((current) =>
              current.map((m) =>
                m.info.id === streamId ? { ...m, streamingText: snap } : m,
              ),
            );
          },
          onDone: () => {
            // Mark streaming message as done, then reload authoritative messages
            setMessages((current) =>
              current.map((m) =>
                m.info.id === streamId ? { ...m, isStreaming: false } : m,
              ),
            );
            setIsSending(false);
            streamingAbortRef.current = null;
            void loadMessages(activeConfig, sessionId);
            void loadSessions(activeConfig, sessionId);
          },
          onError: (err) => {
            setMessages((current) => current.filter((m) => m.info.id !== streamId));
            toast.error(toErrorMessage(err));
            setIsSending(false);
            streamingAbortRef.current = null;
            void loadMessages(activeConfig, sessionId);
          },
        });
        streamingAbortRef.current = abort;
      }
    } catch (error) {
      toast.error(toErrorMessage(error));
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
        throw new Error("Server did not return an OAuth URL");
      }

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(toErrorMessage(error));
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
      await loadSessions(activeConfig, sessionId);
      await loadMessages(activeConfig, sessionId);
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  }, [loadMessages, loadSessions]);

  const handleRenameSession = useCallback(
    async (sessionId: string, newTitle: string) => {
      const activeConfig = configRef.current;

      if (!activeConfig) {
        return;
      }

      try {
        const updated = await renameSession(activeConfig, sessionId, newTitle);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: updated.title || newTitle } : s)),
        );
      } catch {
        // Optimistic update even if server PATCH isn't supported
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title: newTitle } : s)),
        );
      }
    },
    [],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        void handleCreateSession();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShowDocs(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCreateSession]);

  const setupValue = config ?? DEFAULT_SERVER_CONFIG;

  if (showDocs) {
    return <DocsPage onBack={() => setShowDocs(false)} />;
  }

  if (showSetup || !config) {
    return (
      <SetupPage
        initialValue={setupFormConfig ?? setupValue}
        knownProfiles={knownProfiles}
        isBusy={isConnecting}
        error={connectError}
        onSubmit={(nextConfig, remember) => {
          void connectToServer(nextConfig, remember);
        }}
        onConnectKnownProfile={(profile) => {
          void connectToServer(profile);
        }}
        onSelectKnownProfile={(profile) => {
          setSetupFormConfig(profile);
        }}
        onOpenDocs={() => setShowDocs(true)}
        onCancel={config ? () => setShowSetup(false) : undefined}
      />
    );
  }

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-left">
          <button
            className="sidebar-toggle"
            type="button"
            onClick={handleToggleSidebar}
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <span className="sidebar-toggle-icon" />
            <span className="sidebar-toggle-icon" />
            <span className="sidebar-toggle-icon" />
          </button>
          <div className="topbar-brand">
            <span className="topbar-logo">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="var(--accent)" opacity="0.2" />
                <path d="M8 16C8 11.582 11.582 8 16 8s8 3.582 8 8-3.582 8-8 8-8-3.582-8-8z" stroke="var(--accent)" strokeWidth="2" fill="none" />
                <path d="M13 16l2 2 4-4" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="topbar-name">OpenCode</span>
            {health.status === "connected" && health.version && (
              <span className="topbar-version">{health.version}</span>
            )}
          </div>
        </div>

        <div className="topbar-center">
          {currentSession && (
            <span className="topbar-session-title">{currentSession.title}</span>
          )}
        </div>

        <div className="topbar-right">
          <div className="status-indicator">
            <span className={`status-dot status-dot-${streamState}`} title={`SSE: ${streamState}`} />
            <span className="status-label">{streamState}</span>
          </div>

          {currentProject && (
            <span className="topbar-chip">
              {currentProject.name}
              {vcsInfo?.branch ? ` · ${vcsInfo.branch}` : ""}
              {vcsInfo?.dirty ? " *" : ""}
            </span>
          )}

          <button
            className="icon-btn"
            type="button"
            onClick={handleToggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <button
            className="icon-btn"
            type="button"
            onClick={handleRefresh}
            title="Refresh"
            aria-label="Refresh"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3" />
            </svg>
          </button>

          <button
            className="icon-btn"
            type="button"
            onClick={() => {
              setSetupFormConfig(config);
              setShowSetup(true);
            }}
            title="Server settings"
            aria-label="Server settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button
            className="icon-btn icon-btn-danger"
            type="button"
            onClick={handleLogout}
            title="Disconnect"
            aria-label="Disconnect from server"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <ToastContainer toasts={toast.toasts} onDismiss={toast.removeToast} />

      <div className={`workspace ${sidebarCollapsed ? "workspace-sidebar-collapsed" : ""}`}>
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
          onRename={(sessionId, newTitle) => {
            void handleRenameSession(sessionId, newTitle);
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
      </div>
    </div>
  );
}
