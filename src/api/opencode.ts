import { createOpencodeClient } from "@opencode-ai/sdk";
import type { OpencodeClient, Event as SdkEvent, Session as SdkSession, Provider as SdkProvider } from "@opencode-ai/sdk";
import type {
  AgentSummary,
  FileSearchResult,
  HealthResponse,
  MessageInfo,
  MessagePart,
  MessageRequestMeta,
  PathInfo,
  ProjectSummary,
  ProviderAuthMethods,
  ProviderCatalog,
  ProviderSummary,
  SendMessageInput,
  ServerConfig,
  SessionMessage,
  SessionStatusMap,
  SessionSummary,
  StreamEvent,
  UnknownRecord,
  VcsInfo,
} from "../types/opencode";

// ---------------------------------------------------------------------------
// Client factory — one SDK client per ServerConfig
// ---------------------------------------------------------------------------

function normalizeBaseUrl(serverUrl: string) {
  return serverUrl.trim().replace(/\/+$/, "");
}

function toBasicAuth(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `Basic ${btoa(binary)}`;
}

function createClient(config: ServerConfig): OpencodeClient {
  const authHeader = toBasicAuth(config.username, config.password);
  return createOpencodeClient({
    baseUrl: normalizeBaseUrl(config.serverUrl),
    headers: {
      Authorization: authHeader,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function sortByName<T extends { name?: string; id: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftLabel = left.name ?? left.id;
    const rightLabel = right.name ?? right.id;
    return leftLabel.localeCompare(rightLabel);
  });
}

// ---------------------------------------------------------------------------
// Type mapping — SDK types → our internal types
// ---------------------------------------------------------------------------

function sdkSessionToSummary(session: SdkSession): SessionSummary {
  return {
    id: session.id,
    title: session.title || `Session ${session.id.slice(0, 8)}`,
    status: "unknown",
    updatedAt: session.time.updated ? new Date(session.time.updated).toISOString() : undefined,
    raw: session as unknown as UnknownRecord,
  };
}

function sdkMessageToSessionMessage(raw: {
  info: { id: string; sessionID: string; role: string; time: { created: number; completed?: number }; [key: string]: unknown };
  parts: Array<{ type: string; [key: string]: unknown }>;
}): SessionMessage {
  return {
    info: {
      id: raw.info.id,
      role: raw.info.role,
      sessionID: raw.info.sessionID,
      createdAt: raw.info.time?.created ? new Date(raw.info.time.created as number).toISOString() : undefined,
      updatedAt: (raw.info.time as { completed?: number })?.completed
        ? new Date((raw.info.time as { completed: number }).completed).toISOString()
        : undefined,
      raw: raw.info as unknown as UnknownRecord,
    },
    parts: (raw.parts ?? []) as MessagePart[],
    requestMeta: extractRequestMetaFromMessage(raw),
  };
}

function extractRequestMetaFromMessage(raw: {
  info: { agent?: string; model?: { providerID?: string; modelID?: string }; tools?: unknown; [key: string]: unknown };
  parts?: unknown[];
}): MessageRequestMeta | undefined {
  const info = raw.info;
  const agent = typeof info.agent === "string" && info.agent ? info.agent : undefined;
  let model: string | undefined;
  if (info.model && typeof info.model === "object") {
    const m = info.model as { providerID?: string; modelID?: string };
    if (m.providerID && m.modelID) {
      model = `${m.providerID}/${m.modelID}`;
    } else if (m.modelID) {
      model = m.modelID;
    }
  }
  let tools: string[] | undefined;
  if (info.tools && typeof info.tools === "object" && !Array.isArray(info.tools)) {
    const toolsObj = info.tools as Record<string, boolean>;
    const enabled = Object.entries(toolsObj)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    if (enabled.length > 0) tools = enabled;
  } else if (Array.isArray(info.tools)) {
    const arr = (info.tools as unknown[]).filter((t): t is string => typeof t === "string");
    if (arr.length > 0) tools = arr;
  }

  if (!agent && !model && !tools) return undefined;
  return { agent, model, tools };
}

// ---------------------------------------------------------------------------
// Health (raw fetch — no SDK endpoint)
// ---------------------------------------------------------------------------

const HEALTH_TIMEOUT_MS = 5_000;

function buildUrl(config: ServerConfig, path: string) {
  return `${normalizeBaseUrl(config.serverUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const existingSignal = init.signal as AbortSignal | undefined;
  if (existingSignal) {
    if (existingSignal.aborted) {
      controller.abort(existingSignal.reason);
    } else {
      existingSignal.addEventListener("abort", () => controller.abort(existingSignal.reason), { once: true });
    }
  }
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------
// Public exports — error utility
// ---------------------------------------------------------------------------

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

// ---------------------------------------------------------------------------
// textFromPart — kept for UI usage (extractMessageText)
// ---------------------------------------------------------------------------

function textFromPart(part: MessagePart) {
  const record = asRecord(part);
  const type = (typeof record.type === "string" ? record.type : "part");
  return (
    (typeof record.text === "string" ? record.text : undefined) ??
    (typeof record.summary === "string" ? record.summary : undefined) ??
    (typeof record.reasoning === "string" ? record.reasoning : undefined) ??
    (typeof record.content === "string" ? record.content : undefined) ??
    (type.includes("tool")
      ? `[${type}] ${
          (typeof record.name === "string" ? record.name : undefined) ??
          (typeof record.tool === "string" ? record.tool : undefined) ??
          (typeof record.command === "string" ? record.command : undefined) ??
          "tool event"
        }`
      : undefined) ??
    ""
  );
}

export function extractMessageText(message: SessionMessage) {
  if (message.streamingText) return message.streamingText;
  const content = message.parts.map(textFromPart).filter(Boolean).join("\n\n").trim();
  return content || "Message has no text content.";
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export async function getHealth(config: ServerConfig): Promise<HealthResponse> {
  const authHeader = toBasicAuth(config.username, config.password);
  const response = await fetchWithTimeout(
    buildUrl(config, "/global/health"),
    {
      headers: {
        Authorization: authHeader,
        Accept: "application/json",
      },
    },
    HEALTH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as HealthResponse) : { healthy: false };
  } catch {
    return { healthy: false };
  }
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function getProjects(config: ServerConfig): Promise<ProjectSummary[]> {
  const client = createClient(config);
  const { data, error } = await client.project.list({ throwOnError: false });
  if (error || !data) return [];
  return sortByName(
    (data as unknown as Array<{ id: string; worktree: string; time: unknown }>).map((p) => ({
      id: p.id,
      name: p.id,
      path: p.worktree,
      raw: p as unknown as UnknownRecord,
    })),
  );
}

export async function getCurrentProject(config: ServerConfig): Promise<ProjectSummary | null> {
  const client = createClient(config);
  const { data, error } = await client.project.current({ throwOnError: false });
  if (error || !data) return null;
  const p = data as unknown as { id: string; worktree: string };
  return {
    id: p.id,
    name: p.id,
    path: p.worktree,
    raw: p as unknown as UnknownRecord,
  };
}

// ---------------------------------------------------------------------------
// Path / VCS
// ---------------------------------------------------------------------------

export async function getPathInfo(config: ServerConfig): Promise<PathInfo | null> {
  const client = createClient(config);
  const { data, error } = await client.path.get({ throwOnError: false });
  if (error || !data) return null;
  return {
    root: data.worktree || data.directory || data.config,
    raw: data as unknown as UnknownRecord,
  };
}

export async function getVcsInfo(config: ServerConfig): Promise<VcsInfo | null> {
  const client = createClient(config);
  const { data, error } = await client.vcs.get({ throwOnError: false });
  if (error || !data) return null;
  return {
    branch: (data as { branch: string }).branch,
    // dirty is not available in SDK VcsInfo
    raw: data as unknown as UnknownRecord,
  };
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export async function getConfig(config: ServerConfig): Promise<UnknownRecord> {
  const client = createClient(config);
  const { data, error } = await client.config.get({ throwOnError: false });
  if (error || !data) return {};
  return data as unknown as UnknownRecord;
}

export async function updateConfig(config: ServerConfig, patch: UnknownRecord) {
  const client = createClient(config);
  const { data, error } = await client.config.update({ body: patch as never, throwOnError: false });
  if (error || !data) return {};
  return data as unknown as UnknownRecord;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export async function getProviderCatalog(config: ServerConfig): Promise<ProviderCatalog> {
  const client = createClient(config);
  const { data, error } = await client.provider.list({ throwOnError: false });
  if (error || !data) return { all: [], connected: [], defaultModels: {}, raw: {} };
  const listData = data as { all: Array<{ id: string }>; default: Record<string, string>; connected: string[] };
  return {
    all: listData.all.map((p) => p.id),
    connected: listData.connected ?? [],
    defaultModels: listData.default ?? {},
    raw: listData as unknown as UnknownRecord,
  };
}

export async function getProviderAuthMethods(config: ServerConfig): Promise<ProviderAuthMethods> {
  const client = createClient(config);
  const { data, error } = await client.provider.auth({ throwOnError: false });
  if (error || !data) return {};
  // data is { [providerId]: ProviderAuthMethod[] }
  // ProviderAuthMethod = { type: "oauth" | "api", label: string }
  const result: ProviderAuthMethods = {};
  for (const [id, methods] of Object.entries(data as Record<string, Array<{ type: string; label: string }>>)) {
    result[id] = methods.map((m) => m.type);
  }
  return result;
}

async function getConfigProviderSnapshot(config: ServerConfig) {
  const client = createClient(config);
  const { data, error } = await client.config.providers({ throwOnError: false });
  if (error || !data) return { providers: [] as SdkProvider[], defaultModels: {} as Record<string, string> };
  const d = data as { providers: SdkProvider[]; default: Record<string, string> };
  return {
    providers: d.providers ?? [],
    defaultModels: d.default ?? {},
  };
}

export async function getProviders(config: ServerConfig): Promise<ProviderSummary[]> {
  const [configSnapshotResult, providerCatalogResult, providerAuthMethodsResult] = await Promise.allSettled([
    getConfigProviderSnapshot(config),
    getProviderCatalog(config),
    getProviderAuthMethods(config),
  ]);

  const configSnapshot =
    configSnapshotResult.status === "fulfilled"
      ? configSnapshotResult.value
      : { providers: [] as SdkProvider[], defaultModels: {} as Record<string, string> };
  const catalog =
    providerCatalogResult.status === "fulfilled"
      ? providerCatalogResult.value
      : { all: [] as string[], connected: [] as string[], defaultModels: {} as Record<string, string>, raw: {} as UnknownRecord };
  const authMethods =
    providerAuthMethodsResult.status === "fulfilled" ? providerAuthMethodsResult.value : {};

  const providerMap = new Map<string, ProviderSummary>();

  // Seed from config providers (these have model lists)
  for (const p of configSnapshot.providers) {
    providerMap.set(p.id, {
      id: p.id,
      name: p.name,
      connected: false,
      authType: undefined,
      authMethods: [],
      models: Object.keys(p.models ?? {}),
      defaultModel: configSnapshot.defaultModels[p.id],
      raw: p as unknown as UnknownRecord,
    });
  }

  // Collect all known provider IDs
  const providerIds = new Set<string>([
    ...providerMap.keys(),
    ...catalog.all,
    ...catalog.connected,
    ...Object.keys(authMethods),
    ...Object.keys(catalog.defaultModels),
    ...Object.keys(configSnapshot.defaultModels),
  ]);

  for (const providerId of providerIds) {
    const current = providerMap.get(providerId);
    const methods = authMethods[providerId] ?? current?.authMethods ?? [];
    providerMap.set(providerId, {
      id: providerId,
      name: current?.name ?? providerId,
      connected: catalog.connected.includes(providerId) || current?.connected || false,
      authType: current?.authType ?? methods[0],
      authMethods: methods,
      models: current?.models ?? [],
      defaultModel:
        catalog.defaultModels[providerId] ??
        configSnapshot.defaultModels[providerId] ??
        current?.defaultModel,
      raw: current?.raw ?? { id: providerId },
    });
  }

  return sortByName(Array.from(providerMap.values()));
}

export async function authorizeProviderOAuth(config: ServerConfig, providerId: string) {
  const client = createClient(config);
  const { data, error } = await client.provider.oauth.authorize({
    path: { id: providerId },
    body: { method: 0 },
    throwOnError: false,
  });
  if (error || !data) return "";
  return (data as { url?: string }).url ?? "";
}

export async function completeProviderOAuth(config: ServerConfig, providerId: string, body: UnknownRecord = {}) {
  const client = createClient(config);
  const { error } = await client.provider.oauth.callback({
    path: { id: providerId },
    body: body as { method: number; code?: string },
    throwOnError: false,
  });
  return !error;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export async function getAgents(config: ServerConfig): Promise<AgentSummary[]> {
  const client = createClient(config);
  const { data, error } = await client.app.agents({ throwOnError: false });
  if (error || !data) return [];
  return sortByName(
    (data as Array<{ name: string; description?: string }>).map((agent) => ({
      id: agent.name,
      description: agent.description,
      raw: agent as unknown as UnknownRecord,
    })),
  );
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const FALLBACK_TOOL_IDS = [
  "bash",
  "edit",
  "write",
  "read",
  "glob",
  "grep",
  "webfetch",
  "task",
  "question",
  "todowrite",
  "patch",
];

export async function getToolIds(config: ServerConfig): Promise<string[]> {
  const client = createClient(config);
  const { data, error } = await client.tool.ids({ throwOnError: false });
  if (error || !data) return FALLBACK_TOOL_IDS;
  if (Array.isArray(data)) {
    const ids = (data as unknown[]).filter((v): v is string => typeof v === "string");
    return ids.length > 0 ? ids.sort((a, b) => a.localeCompare(b)) : FALLBACK_TOOL_IDS;
  }
  return FALLBACK_TOOL_IDS;
}

// ---------------------------------------------------------------------------
// Find / File content
// ---------------------------------------------------------------------------

export async function searchInFiles(config: ServerConfig, pattern: string): Promise<FileSearchResult[]> {
  const client = createClient(config);
  const { data, error } = await client.find.text({ query: { pattern }, throwOnError: false });
  if (error || !data) return [];
  return (data as Array<{ path: { text: string }; lines: { text: string }; line_number: number }>).map((item) => ({
    path: item.path.text,
    lineNumber: item.line_number,
    lines: item.lines.text,
    raw: item as unknown as UnknownRecord,
  }));
}

export async function findFiles(config: ServerConfig, query: string): Promise<string[]> {
  const client = createClient(config);
  const { data, error } = await client.find.files({ query: { query }, throwOnError: false });
  if (error || !data) return [];
  if (Array.isArray(data)) {
    return (data as string[]);
  }
  return [];
}

export async function readFileContent(config: ServerConfig, path: string): Promise<string> {
  const client = createClient(config);
  const { data, error } = await client.file.read({ query: { path }, throwOnError: false });
  if (error || !data) return "";
  const record = asRecord(data as unknown);
  return typeof record.content === "string" ? record.content : JSON.stringify(data);
}

// ---------------------------------------------------------------------------
// Session commands / shell
// ---------------------------------------------------------------------------

export async function executeSessionCommand(
  config: ServerConfig,
  sessionId: string,
  input: { command: string; arguments?: string[] },
): Promise<SessionMessage | null> {
  const client = createClient(config);
  const { data, error } = await client.session.command({
    path: { id: sessionId },
    // arguments is a single string in the SDK (space-joined)
    body: { command: input.command, arguments: (input.arguments ?? []).join(" ") } as never,
    throwOnError: false,
  });
  if (error || !data) return null;
  // SessionCommandResponses[200] = { info: AssistantMessage; parts: Part[] }
  const raw = data as { info: unknown; parts: unknown[] };
  return sdkMessageToSessionMessage(raw as Parameters<typeof sdkMessageToSessionMessage>[0]);
}

export async function runShellCommand(
  config: ServerConfig,
  sessionId: string,
  input: { command: string; agent?: string },
): Promise<SessionMessage | null> {
  const client = createClient(config);
  // SessionShellResponses[200] = AssistantMessage (no info/parts wrapper)
  const body: { command: string; agent: string } = {
    command: input.command,
    agent: input.agent ?? "coder",
  };
  const { data, error } = await client.session.shell({
    path: { id: sessionId },
    body: body as never,
    throwOnError: false,
  });
  if (error || !data) return null;
  // Wrap the bare AssistantMessage into the { info, parts } shape expected by sdkMessageToSessionMessage
  const msg = data as Record<string, unknown>;
  const wrapped = {
    info: msg,
    parts: Array.isArray(msg.parts) ? (msg.parts as unknown[]) : [],
  };
  return sdkMessageToSessionMessage(wrapped as Parameters<typeof sdkMessageToSessionMessage>[0]);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function getSessionStatus(config: ServerConfig): Promise<SessionStatusMap> {
  const client = createClient(config);
  const { data, error } = await client.session.status({ throwOnError: false });
  if (error || !data) return {};
  // data is { [sessionId]: SessionStatus } where SessionStatus = { type: "idle" | "busy" | "retry" }
  return Object.fromEntries(
    Object.entries(data as Record<string, { type: string }>).map(([id, status]) => [id, status.type]),
  );
}

export async function getSessions(config: ServerConfig): Promise<SessionSummary[]> {
  const client = createClient(config);
  const [sessionsResult, statusResult] = await Promise.all([
    client.session.list({ throwOnError: false }),
    getSessionStatus(config).catch((): SessionStatusMap => ({})),
  ]);

  if (sessionsResult.error || !sessionsResult.data) return [];
  const statusMap = statusResult instanceof Object && !(statusResult instanceof Error) ? statusResult as SessionStatusMap : {};

  return (sessionsResult.data as SdkSession[]).map((session) => {
    const summary = sdkSessionToSummary(session);
    return {
      ...summary,
      status: statusMap[session.id] ?? summary.status,
    };
  });
}

export async function getSession(config: ServerConfig, sessionId: string): Promise<SessionSummary> {
  const client = createClient(config);
  const { data, error } = await client.session.get({ path: { id: sessionId }, throwOnError: false });
  if (error || !data) return { id: sessionId, title: `Session ${sessionId.slice(0, 8)}`, status: "unknown", raw: {} };
  return sdkSessionToSummary(data as SdkSession);
}

export async function createSession(
  config: ServerConfig,
  input: { title: string },
): Promise<SessionSummary> {
  const client = createClient(config);
  const { data, error } = await client.session.create({
    body: { title: input.title },
    throwOnError: false,
  });
  if (error || !data) throw new Error(toErrorMessage(error));
  return sdkSessionToSummary(data as SdkSession);
}

export async function deleteSession(config: ServerConfig, sessionId: string) {
  const client = createClient(config);
  const { error } = await client.session.delete({ path: { id: sessionId }, throwOnError: false });
  return !error;
}

export async function renameSession(
  config: ServerConfig,
  sessionId: string,
  title: string,
): Promise<SessionSummary> {
  const client = createClient(config);
  const { data, error } = await client.session.update({
    path: { id: sessionId },
    body: { title },
    throwOnError: false,
  });
  if (error || !data) throw new Error(toErrorMessage(error));
  return sdkSessionToSummary(data as SdkSession);
}

export async function forkSession(config: ServerConfig, sessionId: string, messageID?: string) {
  const client = createClient(config);
  const { data, error } = await client.session.fork({
    path: { id: sessionId },
    body: messageID ? { messageID } : {},
    throwOnError: false,
  });
  if (error || !data) throw new Error(toErrorMessage(error));
  return sdkSessionToSummary(data as SdkSession);
}

export async function abortSession(config: ServerConfig, sessionId: string) {
  const client = createClient(config);
  const { error } = await client.session.abort({ path: { id: sessionId }, throwOnError: false });
  return !error;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function getSessionMessages(
  config: ServerConfig,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionMessage[]> {
  const client = createClient(config);
  const { data, error } = await client.session.messages({
    path: { id: sessionId },
    signal,
    throwOnError: false,
  });
  if (error || !data) return [];
  return (data as Array<{ info: unknown; parts: unknown[] }>).map(
    (raw) => sdkMessageToSessionMessage(raw as Parameters<typeof sdkMessageToSessionMessage>[0]),
  );
}

// ---------------------------------------------------------------------------
// Send message helpers
// ---------------------------------------------------------------------------

function createPromptBody(input: SendMessageInput | string) {
  if (typeof input === "string") {
    return {
      parts: [{ type: "text" as const, text: input }] as Array<{ type: "text"; text: string }>,
    };
  }

  const parts: Array<{ type: "text"; text: string }> = [{ type: "text", text: input.text }];
  const body: {
    parts: typeof parts;
    model?: { providerID: string; modelID: string };
    agent?: string;
    tools?: Record<string, boolean>;
  } = { parts };

  if (input.model) {
    const [providerID, ...rest] = input.model.split("/");
    const modelID = rest.join("/") || providerID;
    body.model = { providerID: rest.length ? providerID : "", modelID };
  }

  if (input.agent) {
    body.agent = input.agent;
  }

  if (input.tools && Array.isArray(input.tools)) {
    const toolsObj: Record<string, boolean> = {};
    for (const tool of input.tools) {
      if (typeof tool === "string") toolsObj[tool] = true;
    }
    if (Object.keys(toolsObj).length > 0) body.tools = toolsObj;
  }

  return body;
}

export async function sendMessage(
  config: ServerConfig,
  sessionId: string,
  input: SendMessageInput | string,
) {
  const client = createClient(config);
  const body = createPromptBody(input);
  const { data, error } = await client.session.prompt({
    path: { id: sessionId },
    body: body as never,
    throwOnError: false,
  });
  if (error || !data) return null;
  return sdkMessageToSessionMessage(data as Parameters<typeof sdkMessageToSessionMessage>[0]);
}

export async function sendAsyncMessage(
  config: ServerConfig,
  sessionId: string,
  input: SendMessageInput | string,
) {
  const client = createClient(config);
  const body = createPromptBody(input);
  const { error } = await client.session.promptAsync({
    path: { id: sessionId },
    body: body as never,
    throwOnError: false,
  });
  if (error) throw new Error(toErrorMessage(error));
}

// ---------------------------------------------------------------------------
// SSE — subscribeToEvents
// ---------------------------------------------------------------------------

function sdkEventToStreamEvent(event: SdkEvent): StreamEvent {
  return {
    type: event.type,
    data: event,
    receivedAt: Date.now(),
  };
}

export function subscribeToEvents(
  config: ServerConfig,
  handlers: {
    onOpen?: () => void;
    onEvent: (event: StreamEvent) => void;
    onError?: (error: Error) => void;
  },
) {
  const controller = new AbortController();

  void (async () => {
    try {
      const client = createClient(config);
      const result = await client.event.subscribe({
        signal: controller.signal,
        throwOnError: false,
      });

      handlers.onOpen?.();

      for await (const event of result.stream) {
        if (controller.signal.aborted) break;
        handlers.onEvent(sdkEventToStreamEvent(event as SdkEvent));
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      handlers.onError?.(error instanceof Error ? error : new Error("SSE error"));
    }
  })();

  return () => controller.abort();
}

// ---------------------------------------------------------------------------
// extractEventSessionId — for existing App.tsx event routing
// ---------------------------------------------------------------------------

export function extractEventSessionId(event: StreamEvent): string | null {
  const data = event.data as SdkEvent;
  if (!data || typeof data !== "object") return null;

  // Most events carry sessionID in properties
  if ("properties" in data) {
    const props = (data as { properties: Record<string, unknown> }).properties;
    if (props && typeof props === "object") {
      if (typeof props.sessionID === "string") return props.sessionID;
      // session.created / session.updated / session.deleted have properties.info.id
      if (props.info && typeof props.info === "object") {
        const info = props.info as { id?: string; sessionID?: string };
        return info.id ?? info.sessionID ?? null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// streamMessage — SDK-backed: promptAsync + event SSE
// ---------------------------------------------------------------------------

export function streamMessage(
  config: ServerConfig,
  sessionId: string,
  input: SendMessageInput | string,
  handlers: {
    onToken: (delta: string) => void;
    onDone: () => void;
    onError?: (err: Error) => void;
  },
): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const client = createClient(config);
      const body = createPromptBody(input);

      // Fire the prompt asynchronously — server will stream response via SSE
      const { error: promptError } = await client.session.promptAsync({
        path: { id: sessionId },
        body: body as never,
        signal: controller.signal,
        throwOnError: false,
      });

      if (promptError) {
        handlers.onError?.(new Error(toErrorMessage(promptError)));
        handlers.onDone();
        return;
      }

      // Now listen on the SSE event stream for tokens and completion
      const result = await client.event.subscribe({
        signal: controller.signal,
        throwOnError: false,
      });

      for await (const rawEvent of result.stream) {
        if (controller.signal.aborted) break;

        const event = rawEvent as SdkEvent;

        // Text delta from message part updates
        if (event.type === "message.part.updated") {
          const props = (event as { type: "message.part.updated"; properties: { part: unknown; delta?: string } }).properties;
          const partSessionId =
            props.part &&
            typeof props.part === "object" &&
            "sessionID" in props.part
              ? (props.part as { sessionID: string }).sessionID
              : undefined;

          if (!partSessionId || partSessionId === sessionId) {
            if (props.delta) {
              handlers.onToken(props.delta);
            }
          }
        }

        // Session idle = assistant finished
        if (event.type === "session.idle") {
          const props = (event as { type: "session.idle"; properties: { sessionID: string } }).properties;
          if (props.sessionID === sessionId) {
            handlers.onDone();
            return;
          }
        }

        // Session error
        if (event.type === "session.error") {
          const props = (event as { type: "session.error"; properties: { sessionID?: string; error?: unknown } }).properties;
          if (!props.sessionID || props.sessionID === sessionId) {
            handlers.onError?.(new Error(String(props.error ?? "Session error")));
            handlers.onDone();
            return;
          }
        }
      }

      // Stream ended without explicit idle event
      handlers.onDone();
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        handlers.onDone();
        return;
      }
      handlers.onError?.(error instanceof Error ? error : new Error(String(error)));
      handlers.onDone();
    }
  })();

  return () => controller.abort();
}
