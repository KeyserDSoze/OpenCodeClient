import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  sendMessage,
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
  deleteServerProfile,
  detectKnownServerProfiles,
  loadLastSession,
  loadPromptMode,
  loadRememberConnection,
  loadSelectedAgent,
  loadSelectedModel,
  loadSelectedTools,
  loadServerConfig,
  loadSidebarCollapsed,
  loadTheme,
  renameServerProfile,
  saveLastSession,
  savePromptMode,
  saveRememberConnection,
  saveSelectedAgent,
  saveSelectedModel,
  saveSelectedTools,
  saveServerConfig,
  saveServerProfile,
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

const RECONNECT_DELAY_MS = 30_000;
const MESSAGE_WINDOW_SIZE = 15;

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

  return Array.from(options.values()).sort((left, right) =>
    left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
  );
}

function buildToolOptions(toolIds: string[]): ComposerSelectOption[] {
  return toolIds
    .map((toolId) => ({ value: toolId, label: toolId }))
    .sort((left, right) => (left.label < right.label ? -1 : left.label > right.label ? 1 : 0));
}

function attachLocalRequestMeta(
  fetchedMessages: SessionMessage[],
  previousMessages: SessionMessage[],
) {
  // Build a Map keyed by message text for O(1) lookups instead of O(n²) nested find
  const previousMetaByText = new Map<string, SessionMessage["requestMeta"]>();
  for (const message of previousMessages) {
    if (message.info.role.toLowerCase().includes("user") && message.requestMeta) {
      const text = extractMessageText(message);
      if (!previousMetaByText.has(text)) {
        previousMetaByText.set(text, message.requestMeta);
      }
    }
  }

  return fetchedMessages.map((message) => {
    if (message.requestMeta || !message.info.role.toLowerCase().includes("user")) {
      return message;
    }

    const text = extractMessageText(message);
    const meta = previousMetaByText.get(text);

    if (!meta) {
      return message;
    }

    return {
      ...message,
      requestMeta: meta,
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

function isUiRelevantEvent(event: StreamEvent) {
  return event.type !== "message.part.updated";
}

function shouldRefreshSessionsFromEvent(event: StreamEvent) {
  return ["session.created", "session.updated", "session.deleted", "session.idle", "session.error"].includes(event.type);
}

function shouldRefreshMessagesFromEvent(event: StreamEvent) {
  return ["message.created", "message.updated", "message.deleted", "session.idle", "session.error"].includes(event.type);
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function App() {
  const [bootstrap] = useState(() => ({
    config: loadServerConfig(),
    knownProfiles: detectKnownServerProfiles(),
    sessions: [],
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
  const [messageWindowStart, setMessageWindowStart] = useState(0);
  const [messageTotalCount, setMessageTotalCount] = useState(0);
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

  const [reconnectCountdown, setReconnectCountdown] = useState<number | null>(null);

  const selectedSessionIdRef = useRef<string | null>(selectedSessionId);
  const configRef = useRef<ServerConfig | null>(bootstrap.config);
  const isConnectedRef = useRef<boolean>(false);
  // True while connectToServer is loading data after health — SSE-triggered refreshes must wait
  const isInitialLoadingRef = useRef<boolean>(false);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  // AbortController for the current loadMessages fetch — aborted when switching session
  const loadMessagesAbortRef = useRef<AbortController | null>(null);
  const loadMessagesRequestRef = useRef(0);
  const messageStoreRef = useRef<SessionMessage[]>([]);
  const messageStoreSessionIdRef = useRef<string | null>(null);
  const messageWindowStartRef = useRef(0);
  const backgroundHydrationRunRef = useRef(0);
  const sessionsRefreshTimerRef = useRef<number | null>(null);
  const messagesRefreshTimerRef = useRef<number | null>(null);
  const streamingAbortRef = useRef<(() => void) | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectCountdownTimerRef = useRef<number | null>(null);
  const reconnectConfigRef = useRef<ServerConfig | null>(bootstrap.config ?? null);

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Dynamic document title
  useEffect(() => {
    const currentSession = sessions.find((s) => s.id === selectedSessionId);
    if (currentSession?.title) {
      document.title = `${currentSession.title} · OpenCode`;
    } else {
      document.title = "OpenCode";
    }
  }, [selectedSessionId, sessions]);

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
    messageWindowStartRef.current = messageWindowStart;
  }, [messageWindowStart]);

  useEffect(() => {
    isConnectedRef.current = health.status === "connected";
  }, [health]);

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
      loadMessagesAbortRef.current?.abort();
      streamCleanupRef.current?.();

      if (sessionsRefreshTimerRef.current) {
        window.clearTimeout(sessionsRefreshTimerRef.current);
      }

      if (messagesRefreshTimerRef.current) {
        window.clearTimeout(messagesRefreshTimerRef.current);
      }

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      if (reconnectCountdownTimerRef.current) {
        window.clearInterval(reconnectCountdownTimerRef.current);
      }
    };
  }, []);

  const currentSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );
  const usePlainMessages = messageTotalCount > messages.length;
  const hasOlderMessages = messageWindowStart > 0;
  const hasNewerMessages = messageWindowStart + messages.length < messageTotalCount;
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
      const availableSet = new Set(availableTools);
      const filtered = selectedTools.filter((toolId) => availableSet.has(toolId));

      if (filtered.length !== selectedTools.length) {
        setSelectedTools(filtered);
        saveSelectedTools(filtered);
      }
    }
  }, [availableTools, selectedTools]);

  const fetchWorkspaceMeta = useCallback(async (activeConfig: ServerConfig) => {
    const [projectsResult, currentProjectResult, pathInfoResult, vcsInfoResult, toolsResult] =
      await Promise.allSettled([
        getProjects(activeConfig),
        getCurrentProject(activeConfig),
        getPathInfo(activeConfig),
        getVcsInfo(activeConfig),
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
      tools: toolsResult.status === "fulfilled" ? toolsResult.value : [],
    };
  }, []);

  const fetchAgentsCatalog = useCallback(async (activeConfig: ServerConfig) => {
    try {
      return await getAgents(activeConfig);
    } catch {
      return [] as AgentSummary[];
    }
  }, []);

  const resetMessageViewport = useCallback(() => {
    messageStoreRef.current = [];
    messageStoreSessionIdRef.current = null;
    messageWindowStartRef.current = 0;

    startTransition(() => {
      setMessages([]);
      setMessageWindowStart(0);
      setMessageTotalCount(0);
    });
  }, []);

  const applyMessageViewport = useCallback(
    (
      nextAllMessages: SessionMessage[],
      options?: {
        sessionId?: string | null;
        windowStart?: number;
        stickToLatest?: boolean;
      },
    ) => {
      const maxWindowStart = Math.max(0, nextAllMessages.length - MESSAGE_WINDOW_SIZE);
      const requestedWindowStart = options?.stickToLatest
        ? maxWindowStart
        : Math.min(Math.max(0, options?.windowStart ?? messageWindowStartRef.current), maxWindowStart);

      messageStoreRef.current = nextAllMessages;
      if (options && "sessionId" in options) {
        messageStoreSessionIdRef.current = options.sessionId ?? null;
      }
      messageWindowStartRef.current = requestedWindowStart;

      startTransition(() => {
        setMessages(nextAllMessages.slice(requestedWindowStart, requestedWindowStart + MESSAGE_WINDOW_SIZE));
        setMessageWindowStart(requestedWindowStart);
        setMessageTotalCount(nextAllMessages.length);
      });
    },
    [],
  );

  const updateCurrentMessageStore = useCallback(
    (
      updater: (current: SessionMessage[]) => SessionMessage[],
      options?: {
        sessionId?: string | null;
        stickToLatest?: boolean;
      },
    ) => {
      const sessionId = options?.sessionId ?? selectedSessionIdRef.current;
      if (!sessionId) {
        return;
      }

      const currentMessages =
        messageStoreSessionIdRef.current === sessionId ? messageStoreRef.current : [];

      applyMessageViewport(updater(currentMessages), {
        sessionId,
        stickToLatest: options?.stickToLatest,
      });
    },
    [applyMessageViewport],
  );

  const showOlderMessagesWindow = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId || messageStoreSessionIdRef.current !== sessionId) {
      return;
    }

    applyMessageViewport(messageStoreRef.current, {
      sessionId,
      windowStart: messageWindowStartRef.current - MESSAGE_WINDOW_SIZE,
    });
  }, [applyMessageViewport]);

  const showNewerMessagesWindow = useCallback(() => {
    const sessionId = selectedSessionIdRef.current;
    if (!sessionId || messageStoreSessionIdRef.current !== sessionId) {
      return;
    }

    applyMessageViewport(messageStoreRef.current, {
      sessionId,
      windowStart: messageWindowStartRef.current + MESSAGE_WINDOW_SIZE,
    });
  }, [applyMessageViewport]);

  const loadMessages = useCallback(async (
    activeConfig: ServerConfig,
    sessionId: string,
    options?: { clearExisting?: boolean },
  ) => {
    // Abort any in-flight loadMessages for a previous session
    loadMessagesAbortRef.current?.abort();
    const controller = new AbortController();
    loadMessagesAbortRef.current = controller;
    const requestId = loadMessagesRequestRef.current + 1;
    loadMessagesRequestRef.current = requestId;

    setIsLoadingMessages(true);

    if (options?.clearExisting) {
      resetMessageViewport();
    }

    try {
      const nextMessages = await getSessionMessages(activeConfig, sessionId, controller.signal);

      if (controller.signal.aborted || loadMessagesRequestRef.current !== requestId) {
        return;
      }

      if (selectedSessionIdRef.current === sessionId) {
        const previousMessages = messageStoreSessionIdRef.current === sessionId ? messageStoreRef.current : [];
        const hydratedMessages = attachLocalRequestMeta(nextMessages, previousMessages);
        const previousMaxWindowStart = Math.max(0, previousMessages.length - MESSAGE_WINDOW_SIZE);
        const shouldStickToLatest =
          messageStoreSessionIdRef.current !== sessionId ||
          messageWindowStartRef.current >= previousMaxWindowStart;

        if (
          previousMessages.length === hydratedMessages.length &&
          previousMessages.every((message, index) => {
            const nextMessage = hydratedMessages[index];
            return (
              message.info.id === nextMessage.info.id &&
              message.info.updatedAt === nextMessage.info.updatedAt &&
              message.parts.length === nextMessage.parts.length
            );
          })
        ) {
          if (messageStoreSessionIdRef.current !== sessionId) {
            applyMessageViewport(previousMessages, { sessionId, stickToLatest: shouldStickToLatest });
          }
          return;
        }

        applyMessageViewport(hydratedMessages, {
          sessionId,
          stickToLatest: shouldStickToLatest,
        });
      }
    } catch (error) {
      if (controller.signal.aborted || loadMessagesRequestRef.current !== requestId) {
        return;
      }

      if (selectedSessionIdRef.current === sessionId && options?.clearExisting) {
        resetMessageViewport();
      }

      toast.error(toErrorMessage(error));
    } finally {
      if (loadMessagesRequestRef.current === requestId) {
        loadMessagesAbortRef.current = null;
        setIsLoadingMessages(false);
      }
    }
  }, [applyMessageViewport, resetMessageViewport, toast]);

  const loadSessions = useCallback(
    async (activeConfig: ServerConfig, preferredSessionId?: string | null) => {
      setIsLoadingSessions(true);

      try {
        const nextSessions = await getSessions(activeConfig);

        // Skip React re-render if session list hasn't changed
        setSessions((current) => {
          if (
            current.length === nextSessions.length &&
            current.every((s, i) => {
              const n = nextSessions[i];
              return s.id === n.id && s.title === n.title && s.status === n.status;
            })
          ) {
            return current;
          }
          return nextSessions;
        });

        const desiredSessionId =
          preferredSessionId ??
          (nextSessions.some((session) => session.id === selectedSessionIdRef.current)
            ? selectedSessionIdRef.current
            : null) ??
          nextSessions[0]?.id ??
          null;

        // Only update selectedSessionId if it actually changed
        if (selectedSessionIdRef.current !== desiredSessionId) {
          selectedSessionIdRef.current = desiredSessionId;
          setSelectedSessionId(desiredSessionId);
          saveLastSession(desiredSessionId);
        }

        if (!desiredSessionId) {
          resetMessageViewport();
        }

        return desiredSessionId;
      } finally {
        setIsLoadingSessions(false);
      }
    },
    [resetMessageViewport],
  );

  const scheduleSessionsRefresh = useCallback(
    (activeConfig: ServerConfig) => {
      if (!isConnectedRef.current) return;
      if (isInitialLoadingRef.current) return;
      if (sessionsRefreshTimerRef.current) {
        window.clearTimeout(sessionsRefreshTimerRef.current);
      }

      sessionsRefreshTimerRef.current = window.setTimeout(() => {
        if (isConnectedRef.current && !isInitialLoadingRef.current) void loadSessions(activeConfig);
      }, 2000);
    },
    [loadSessions],
  );

  const scheduleMessagesRefresh = useCallback(
    (activeConfig: ServerConfig, sessionId: string) => {
      if (!isConnectedRef.current) return;
      if (isInitialLoadingRef.current) return;
      if (messagesRefreshTimerRef.current) {
        window.clearTimeout(messagesRefreshTimerRef.current);
      }

      messagesRefreshTimerRef.current = window.setTimeout(() => {
        if (isConnectedRef.current && !isInitialLoadingRef.current) void loadMessages(activeConfig, sessionId);
      }, 2000);
    },
    [loadMessages],
  );

  const cancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (reconnectCountdownTimerRef.current) {
      window.clearInterval(reconnectCountdownTimerRef.current);
      reconnectCountdownTimerRef.current = null;
    }
    setReconnectCountdown(null);
  }, []);

  // scheduleReconnect is defined after connectToServer via a ref to avoid circular deps
  const scheduleReconnectRef = useRef<(() => void) | null>(null);

  const startEventStream = useCallback(
    (activeConfig: ServerConfig) => {
      streamCleanupRef.current?.();
      setEvents([]);
      setStreamState("connecting");

      const cleanup = subscribeToEvents(activeConfig, {
        onOpen() {
          setStreamState("online");
        },
        onEvent(event) {
          if (!isConnectedRef.current) return;
          if (isInitialLoadingRef.current) return;
          if (!isUiRelevantEvent(event)) return;

          setEvents((prev) => [...prev.slice(-199), event]);

          const eventSessionId = extractEventSessionId(event);

          if (shouldRefreshSessionsFromEvent(event)) {
            scheduleSessionsRefresh(activeConfig);
          }

          if (
            shouldRefreshMessagesFromEvent(event) &&
            eventSessionId &&
            eventSessionId === selectedSessionIdRef.current
          ) {
            scheduleMessagesRefresh(activeConfig, eventSessionId);
          }
        },
        onError() {
          if (!isConnectedRef.current) return;
          setStreamState("error");
          scheduleReconnectRef.current?.();
        },
      });

      streamCleanupRef.current = cleanup;
    },
    [scheduleSessionsRefresh, scheduleMessagesRefresh],
  );

  const hydrateConnectedData = useCallback((activeConfig: ServerConfig) => {
    const runId = backgroundHydrationRunRef.current;

    window.setTimeout(() => {
      void (async () => {
        const isRunCurrent = () =>
          backgroundHydrationRunRef.current === runId &&
          reconnectConfigRef.current === activeConfig &&
          isConnectedRef.current;

        if (!isRunCurrent()) {
          return;
        }

        startEventStream(activeConfig);

        const [nextProviders, workspaceMeta] = await Promise.all([
          getProviders(activeConfig).catch(() => [] as Awaited<ReturnType<typeof getProviders>>),
          fetchWorkspaceMeta(activeConfig).catch(() => ({
            projects: [] as Awaited<ReturnType<typeof fetchWorkspaceMeta>>["projects"],
            currentProject: null as unknown as Awaited<ReturnType<typeof fetchWorkspaceMeta>>["currentProject"],
            pathInfo: null as Awaited<ReturnType<typeof fetchWorkspaceMeta>>["pathInfo"],
            vcsInfo: null as Awaited<ReturnType<typeof fetchWorkspaceMeta>>["vcsInfo"],
            tools: [] as Awaited<ReturnType<typeof fetchWorkspaceMeta>>["tools"],
          })),
        ]);

        if (!isRunCurrent()) {
          return;
        }

        startTransition(() => {
          setProviders(nextProviders);
          setProjects(workspaceMeta.projects);
          setCurrentProject(workspaceMeta.currentProject);
          setPathInfo(workspaceMeta.pathInfo);
          setVcsInfo(workspaceMeta.vcsInfo);
          setAvailableTools(workspaceMeta.tools);
        });

        const nextAgents = await fetchAgentsCatalog(activeConfig);

        if (!isRunCurrent()) {
          return;
        }

        startTransition(() => {
          setAgents(nextAgents);
        });
      })();
    }, 80);
  }, [fetchAgentsCatalog, fetchWorkspaceMeta, startEventStream]);

  const connectToServer = useCallback(
    async (nextConfig: ServerConfig, remember?: boolean, connectionName?: string) => {
      reconnectConfigRef.current = nextConfig;
      backgroundHydrationRunRef.current += 1;
      cancelReconnect();
      setSetupFormConfig(nextConfig);
      setIsConnecting(true);
      setConnectError(null);
      setHealth({ status: "checking" });

      try {
        // Phase 1: health check only — fast timeout, single connection
        const healthResponse = await getHealth(nextConfig);

        if (!healthResponse.healthy) {
          throw new Error("Server responded but is not healthy");
        }

        // Phase 2: health passed — persist config and show connected UI immediately
        setConfig(nextConfig);
        if (remember !== undefined) {
          saveRememberConnection(remember);
        }
        if (remember || loadRememberConnection()) {
          saveServerConfig(nextConfig);
        }
        saveServerProfile(nextConfig, connectionName);
        setKnownProfiles(detectKnownServerProfiles());
        isConnectedRef.current = true;
        setHealth({ status: "connected", version: healthResponse.version });
        setConnectError(null);
        setShowSetup(false);
        setShowDocs(false);
        setStreamState("offline");
        cancelReconnect();
        setSessions([]);
        selectedSessionIdRef.current = null;
        setSelectedSessionId(null);
        resetMessageViewport();
        setProviders([]);
        setProjects([]);
        setCurrentProject(null);
        setPathInfo(null);
        setVcsInfo(null);
        setAgents([]);
        setAvailableTools([]);
        setEvents([]);

        // Phase 3: load only the session list. Other data is fetched on demand
        // so the UI stays interactive immediately after connect.
        isInitialLoadingRef.current = true;
        const nextSessions = await getSessions(nextConfig).catch(() => [] as Awaited<ReturnType<typeof getSessions>>);
        const storedLastSessionId = loadLastSession();
        const preferredSessionId =
          nextSessions.find((session) => session.id === storedLastSessionId)?.id ??
          nextSessions[0]?.id ??
          null;
        setSessions(nextSessions);
        selectedSessionIdRef.current = preferredSessionId;
        setSelectedSessionId(preferredSessionId);
        saveLastSession(preferredSessionId);
        resetMessageViewport();
        isInitialLoadingRef.current = false;
        hydrateConnectedData(nextConfig);
      } catch (error) {
        isConnectedRef.current = false;
        isInitialLoadingRef.current = false;
        setConnectError(toErrorMessage(error));
        setHealth({ status: "error", error: toErrorMessage(error) });
        setStreamState("offline");
        setShowSetup(true);
        scheduleReconnectRef.current?.();
      } finally {
        setIsConnecting(false);
      }
    },
    [cancelReconnect, hydrateConnectedData, resetMessageViewport],
  );

  // Wire scheduleReconnect after connectToServer is defined (avoids circular useCallback deps)
  useEffect(() => {
    scheduleReconnectRef.current = () => {
      if (!reconnectConfigRef.current) return;
      cancelReconnect();

      let remaining = Math.round(RECONNECT_DELAY_MS / 1000);
      setReconnectCountdown(remaining);

      reconnectCountdownTimerRef.current = window.setInterval(() => {
        remaining -= 1;
        setReconnectCountdown(remaining > 0 ? remaining : null);
        if (remaining <= 0) {
          window.clearInterval(reconnectCountdownTimerRef.current!);
          reconnectCountdownTimerRef.current = null;
        }
      }, 1000);

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        const cfg = reconnectConfigRef.current;
        if (cfg) {
          setTimeout(() => void connectToServer(cfg), 0);
        }
      }, RECONNECT_DELAY_MS);
    };
  }, [cancelReconnect, connectToServer]);

  // Auto-connect if remember was set — defer via setTimeout so the UI renders first
  useEffect(() => {
    if (bootstrap.config && bootstrap.rememberConnection) {
      const id = setTimeout(() => void connectToServer(bootstrap.config!), 0);
      return () => clearTimeout(id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = useCallback(() => {
    reconnectConfigRef.current = null;
    isConnectedRef.current = false;
    isInitialLoadingRef.current = false;
    backgroundHydrationRunRef.current += 1;
    cancelReconnect();
    streamCleanupRef.current?.();
    saveRememberConnection(false);
    setConfig(null);
    setSessions([]);
    resetMessageViewport();
    setProviders([]);
    setAgents([]);
    setEvents([]);
    setHealth({ status: "idle" });
    setStreamState("offline");
    setSetupFormConfig(DEFAULT_SERVER_CONFIG);
    setShowSetup(true);
  }, [cancelReconnect, resetMessageViewport]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const activeConfig = configRef.current;

      // Abort any in-flight message load for the previous session
      loadMessagesAbortRef.current?.abort();
      loadMessagesAbortRef.current = null;

      if (!activeConfig || !isConnectedRef.current) {
        // Just update selection; don't attempt a network call when offline
        selectedSessionIdRef.current = sessionId;
        setSelectedSessionId(sessionId);
        saveLastSession(sessionId);
        if (selectedSessionId !== sessionId) {
          resetMessageViewport();
        }
        return;
      }

      selectedSessionIdRef.current = sessionId;
      setSelectedSessionId(sessionId);
      saveLastSession(sessionId);

      if (selectedSessionId !== sessionId) {
        resetMessageViewport();
      }

      void loadMessages(activeConfig, sessionId, { clearExisting: false });
    },
    [loadMessages, resetMessageViewport, selectedSessionId],
  );

  const handleRefresh = useCallback(async () => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      return;
    }

    setConnectError(null);
    const [refreshedSessionId, nextProviders, workspaceMeta, nextAgents] = await Promise.all([
      loadSessions(activeConfig),
      getProviders(activeConfig).catch(() => []),
      fetchWorkspaceMeta(activeConfig),
      fetchAgentsCatalog(activeConfig),
    ]);

    if (refreshedSessionId) {
      await loadMessages(activeConfig, refreshedSessionId);
    }

    setProviders(nextProviders);
    setProjects(workspaceMeta.projects);
    setCurrentProject(workspaceMeta.currentProject);
    setPathInfo(workspaceMeta.pathInfo);
    setVcsInfo(workspaceMeta.vcsInfo);
    setAgents(nextAgents);
    setAvailableTools(workspaceMeta.tools);
    startEventStream(activeConfig);
  }, [fetchAgentsCatalog, fetchWorkspaceMeta, loadMessages, loadSessions, startEventStream]);

  const handleCreateSession = useCallback(async () => {
    const activeConfig = configRef.current;

    if (!activeConfig) {
      return;
    }

    try {
      const nextSession = await createSession(activeConfig, { title: sessionTimestampTitle() });
      const nextSessions = [nextSession, ...sessions.filter((session) => session.id !== nextSession.id)];
      setSessions(nextSessions);
      selectedSessionIdRef.current = nextSession.id;
      setSelectedSessionId(nextSession.id);
      saveLastSession(nextSession.id);
      resetMessageViewport();
    } catch (error) {
      toast.error(toErrorMessage(error));
    }
  }, [resetMessageViewport, sessions]);

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

        if (selectedSessionIdRef.current === sessionId) {
          const nextSelected = remainingSessions[0]?.id ?? null;
          selectedSessionIdRef.current = nextSelected;
          setSelectedSessionId(nextSelected);
          saveLastSession(nextSelected);

          if (nextSelected) {
            await loadMessages(activeConfig, nextSelected);
          } else {
            resetMessageViewport();
          }
        }
      } catch (error) {
        toast.error(toErrorMessage(error));
      }
    },
    [loadMessages, resetMessageViewport, sessions],
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
    selectedSessionIdRef.current = nextSession.id;
    setSelectedSessionId(nextSession.id);
    saveLastSession(nextSession.id);
    resetMessageViewport();

    return { sessionId: nextSession.id, config: activeConfig };
  }, [resetMessageViewport, sessions]);

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

      updateCurrentMessageStore(
        (current) => [...current, makeOptimisticMessage(text, requestMeta)],
        { sessionId, stickToLatest: true },
      );
      const payload = {
        text,
        agent: selectedAgent || undefined,
        model: selectedModel || undefined,
        tools: selectedTools.length > 0 ? selectedTools : undefined,
      };

      await sendMessage(activeConfig, sessionId, payload);
      setIsSending(false);
      await loadMessages(activeConfig, sessionId);
      await loadSessions(activeConfig, sessionId);
    } catch (error) {
      toast.error(toErrorMessage(error));
      // Mark the last optimistic user message as failed so user can retry
      updateCurrentMessageStore((current) => {
        const lastOptimisticIdx = [...current].reverse().findIndex((message) => message.optimistic && !message.failed);
        if (lastOptimisticIdx === -1) return current;
        const realIdx = current.length - 1 - lastOptimisticIdx;
        return current.map((message, index) => (index === realIdx ? { ...message, failed: true } : message));
      }, { stickToLatest: true });
      setIsSending(false);
    }
  }, [ensureSession, loadMessages, loadSessions, promptMode, selectedAgent, selectedModel, selectedTools, updateCurrentMessageStore]);

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

  const handleDeleteProfile = useCallback((profileId: string) => {
    deleteServerProfile(profileId);
    setKnownProfiles(detectKnownServerProfiles());
  }, []);

  const handleRenameProfile = useCallback((profileId: string, newLabel: string) => {
    renameServerProfile(profileId, newLabel);
    setKnownProfiles(detectKnownServerProfiles());
  }, []);

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
        reconnectCountdown={reconnectCountdown}
        onSubmit={(nextConfig, remember, connectionName) => {
          setTimeout(() => void connectToServer(nextConfig, remember, connectionName), 0);
        }}
        onConnectKnownProfile={(profile) => {
          setTimeout(() => void connectToServer(profile), 0);
        }}
        onSelectKnownProfile={(profile) => {
          setSetupFormConfig(profile);
        }}
        onDeleteProfile={handleDeleteProfile}
        onRenameProfile={handleRenameProfile}
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
        {/* Mobile backdrop — closes sidebar when tapped */}
        {!sidebarCollapsed && (
          <div
            className="sidebar-backdrop"
            role="presentation"
            onClick={handleToggleSidebar}
          />
        )}
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
          usePlainMessages={usePlainMessages}
          hasOlderMessages={hasOlderMessages}
          hasNewerMessages={hasNewerMessages}
          isLoading={isLoadingMessages}
          isSending={isSending}
          onShowOlderMessages={showOlderMessagesWindow}
          onShowNewerMessages={showNewerMessagesWindow}
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
          onRemoveMessage={(messageId) => {
            updateCurrentMessageStore((current) => current.filter((message) => message.info.id !== messageId));
          }}
        />
      </div>
    </div>
  );
}
