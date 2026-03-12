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

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? (value as UnknownRecord) : {};
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function pickBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return undefined;
}

function pickNested(record: UnknownRecord, ...paths: string[][]): unknown {
  for (const path of paths) {
    let current: unknown = record;

    for (const key of path) {
      current = asRecord(current)[key];
    }

    if (current !== undefined) {
      return current;
    }
  }

  return undefined;
}

function buildQuery(path: string, params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  });

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

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

function buildUrl(config: ServerConfig, path: string) {
  return `${normalizeBaseUrl(config.serverUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function createHeaders(config: ServerConfig, extraHeaders?: HeadersInit) {
  return {
    Authorization: toBasicAuth(config.username, config.password),
    ...(extraHeaders ?? {}),
  };
}

async function responseText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

const HEALTH_TIMEOUT_MS = 5_000;
const API_TIMEOUT_MS = 10_000;

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const existingSignal = init.signal as AbortSignal | undefined;

  // Forward any existing abort signal
  if (existingSignal) {
    if (existingSignal.aborted) {
      controller.abort(existingSignal.reason);
    } else {
      existingSignal.addEventListener("abort", () => controller.abort(existingSignal.reason), { once: true });
    }
  }

  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);

  return fetch(url, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function requestRaw(config: ServerConfig, path: string, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS) {
  const response = await fetchWithTimeout(buildUrl(config, path), {
    ...init,
    headers: createHeaders(config, init.headers),
  }, timeoutMs);

  if (!response.ok) {
    const details = await responseText(response);
    throw new ApiError(
      response.status,
      details || `${response.status} ${response.statusText}`,
    );
  }

  return response;
}

async function requestJson<T>(config: ServerConfig, path: string, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS) {
  const response = await requestRaw(config, path, init, timeoutMs);
  const text = await responseText(response);

  if (!text) {
    return null as T;
  }

  return JSON.parse(text) as T;
}

async function requestMaybeJson<T>(config: ServerConfig, path: string, init: RequestInit = {}, timeoutMs = API_TIMEOUT_MS) {
  const response = await requestRaw(config, path, init, timeoutMs);
  const text = await responseText(response);

  if (!text) {
    return null as T | null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

async function withFallback<T>(strategies: Array<() => Promise<T>>) {
  let lastError: unknown;

  for (const strategy of strategies) {
    try {
      return await strategy();
    } catch (error) {
      lastError = error;

      if (!isNotFound(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Richiesta non riuscita");
}

function sortByName<T extends { name?: string; id: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    const leftLabel = left.name ?? left.id;
    const rightLabel = right.name ?? right.id;
    return leftLabel.localeCompare(rightLabel);
  });
}

function normalizeSession(input: unknown): SessionSummary {
  const record = asRecord(input);
  const id =
    pickString(record.id, record.sessionID, record.sessionId, record.session_id) ??
    crypto.randomUUID();

  return {
    id,
    title: pickString(record.title, record.name) ?? `Session ${id.slice(0, 8)}`,
    status: pickString(record.status, record.state) ?? "unknown",
    updatedAt: pickString(
      record.updatedAt,
      record.updated_at,
      pickNested(record, ["time", "updated"]),
      record.createdAt,
      record.created_at,
    ),
    raw: record,
  };
}

function normalizeProject(input: unknown): ProjectSummary {
  const record = asRecord(input);
  const id = pickString(record.id, record.projectID, record.projectId, record.name) ?? crypto.randomUUID();

  return {
    id,
    name: pickString(record.name, record.title, id) ?? id,
    path: pickString(record.path, record.root),
    raw: record,
  };
}

function normalizePathInfo(input: unknown): PathInfo {
  const record = asRecord(input);

  return {
    root: pickString(record.root, record.path, record.cwd),
    raw: record,
  };
}

function normalizeVcsInfo(input: unknown): VcsInfo {
  const record = asRecord(input);

  return {
    branch: pickString(record.branch, record.currentBranch, record.head),
    dirty: pickBoolean(record.dirty, record.isDirty),
    raw: record,
  };
}

function normalizeAgent(input: unknown): AgentSummary {
  const record = asRecord(input);
  const id = pickString(record.id, record.name) ?? crypto.randomUUID();

  return {
    id,
    description: pickString(record.description, record.prompt),
    raw: record,
  };
}

function normalizePart(input: unknown): MessagePart {
  const record = asRecord(input);

  return {
    ...(record as MessagePart),
    type: pickString(record.type) ?? "unknown",
  };
}

function normalizeMessageInfo(record: UnknownRecord): MessageInfo {
  const id =
    pickString(record.id, record.messageID, record.messageId, record.message_id) ??
    crypto.randomUUID();

  return {
    id,
    role: pickString(record.role, record.author, record.type, record.kind) ?? "message",
    createdAt: pickString(record.createdAt, record.created_at),
    updatedAt: pickString(record.updatedAt, record.updated_at),
    status: pickString(record.status, record.state),
    sessionID: pickString(record.sessionID, record.sessionId, record.session_id),
    raw: record,
  };
}

function normalizeMessage(input: unknown): SessionMessage {
  const record = asRecord(input);
  const infoRecord = asRecord(record.info);
  const rawInfo = Object.keys(infoRecord).length > 0 ? infoRecord : record;

  return {
    info: normalizeMessageInfo(rawInfo),
    parts: Array.isArray(record.parts) ? record.parts.map(normalizePart) : [],
    requestMeta: normalizeMessageRequestMeta(record, rawInfo),
  };
}

function normalizeModelValue(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  const record = asRecord(value);
  const providerID = pickString(record.providerID, record.providerId, record.provider_id);
  const modelID = pickString(record.modelID, record.modelId, record.model_id, record.id, record.name);

  if (providerID && modelID) {
    return `${providerID}/${modelID}`;
  }

  return modelID;
}

function normalizeToolList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tools = value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }

      const record = asRecord(entry);
      return pickString(record.id, record.name, record.tool, record.toolID, record.toolId);
    })
    .filter((entry): entry is string => Boolean(entry));

  return tools.length > 0 ? tools : undefined;
}

function normalizeMessageRequestMeta(...records: UnknownRecord[]): MessageRequestMeta | undefined {
  const agent = pickString(...records.map((record) => record.agent));
  const model = records.map((record) => normalizeModelValue(record.model)).find(Boolean);
  const tools = records.map((record) => normalizeToolList(record.tools)).find((entry) => Boolean(entry?.length));

  if (!agent && !model && !tools?.length) {
    return undefined;
  }

  return {
    agent,
    model,
    tools,
  };
}

function normalizeProviderEntry(input: unknown, fallbackId?: string): ProviderSummary {
  const record = asRecord(input);
  const modelsValue = record.models;
  let models: string[] = [];

  if (Array.isArray(modelsValue)) {
    models = modelsValue
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        const modelRecord = asRecord(entry);
        return pickString(modelRecord.id, modelRecord.modelID, modelRecord.name);
      })
      .filter((value): value is string => Boolean(value));
  } else {
    models = Object.keys(asRecord(modelsValue));
  }

  const id = pickString(record.id, fallbackId) ?? crypto.randomUUID();

  return {
    id,
    name: pickString(record.name, record.label, id) ?? id,
    connected: Boolean(record.connected ?? record.authenticated ?? record.authorized),
    authType: pickString(
      record.authType,
      pickNested(record, ["auth", "type"]),
      record.oauth ? "oauth" : undefined,
    ),
    authMethods: [],
    models,
    defaultModel: pickString(record.defaultModel, record.default),
    raw: record,
  };
}

function normalizeProviders(payload: unknown): ProviderSummary[] {
  const root = asRecord(payload);
  const providers = root.providers ?? payload;

  if (Array.isArray(providers)) {
    return providers.map((provider) => normalizeProviderEntry(provider));
  }

  return Object.entries(asRecord(providers)).map(([id, provider]) =>
    normalizeProviderEntry(provider, id),
  );
}

function normalizeProviderCatalog(payload: unknown): ProviderCatalog {
  const record = asRecord(payload);
  const defaultModels = Object.fromEntries(
    Object.entries(asRecord(record.default)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  return {
    all: Array.isArray(record.all) ? record.all.filter((value): value is string => typeof value === "string") : [],
    connected: Array.isArray(record.connected)
      ? record.connected.filter((value): value is string => typeof value === "string")
      : [],
    defaultModels,
    raw: record,
  };
}

function normalizeProviderAuthMethods(payload: unknown): ProviderAuthMethods {
  return Object.fromEntries(
    Object.entries(asRecord(payload)).map(([providerId, methods]) => [
      providerId,
      Array.isArray(methods) ? methods.filter((value): value is string => typeof value === "string") : [],
    ]),
  );
}

function normalizeSearchResult(input: unknown): FileSearchResult {
  const record = asRecord(input);

  return {
    path: pickString(record.path, record.file) ?? "",
    lineNumber:
      typeof record.line_number === "number"
        ? record.line_number
        : typeof record.lineNumber === "number"
          ? record.lineNumber
          : undefined,
    lines: pickString(record.lines, record.content, record.text),
    raw: record,
  };
}

function textFromPart(part: MessagePart) {
  const record = asRecord(part);
  const type = pickString(record.type) ?? "part";

  return (
    pickString(record.text, record.summary, record.reasoning, record.content) ??
    (type.includes("tool")
      ? `[${type}] ${pickString(record.name, record.tool, record.command) ?? "evento tool"}`
      : undefined) ??
    ""
  );
}

function parseEventBlock(block: string): StreamEvent | null {
  const lines = block.split(/\r?\n/);
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) {
      continue;
    }

    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (!dataLines.length) {
    return null;
  }

  const rawData = dataLines.join("\n");
  let data: unknown = rawData;

  try {
    data = JSON.parse(rawData) as unknown;
  } catch {
    data = rawData;
  }

  const dataRecord = asRecord(data);
  const typedEvent = pickString(dataRecord.type);

  return {
    type: eventName === "message" && typedEvent ? typedEvent : eventName,
    data,
    receivedAt: Date.now(),
  };
}

function createMessageBody(input: SendMessageInput | string) {
  if (typeof input === "string") {
    return {
      parts: [{ type: "text", text: input }],
    };
  }

  const payload: UnknownRecord = {
    parts: [{ type: "text", text: input.text }],
  };

  if (input.model) {
    payload.model = input.model;
  }

  if (input.agent) {
    payload.agent = input.agent;
  }

  if (input.tools) {
    payload.tools = input.tools;
  }

  return payload;
}

async function requestConfigProviderSnapshot(config: ServerConfig) {
  const payload = await requestJson<unknown>(config, "/config/providers", {
    headers: { Accept: "application/json" },
  });
  const record = asRecord(payload);
  const defaultModels = Object.fromEntries(
    Object.entries(asRecord(record.default)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );

  return {
    providers: normalizeProviders(payload),
    defaultModels,
  };
}

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

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Errore sconosciuto";
}

export async function getHealth(config: ServerConfig): Promise<HealthResponse> {
  const payload = await requestJson<HealthResponse>(config, "/global/health", {
    headers: { Accept: "application/json" },
  }, HEALTH_TIMEOUT_MS);

  return payload ?? { healthy: false };
}

export async function getProjects(config: ServerConfig): Promise<ProjectSummary[]> {
  const payload = await requestJson<unknown[]>(config, "/project", {
    headers: { Accept: "application/json" },
  });

  return Array.isArray(payload) ? sortByName(payload.map(normalizeProject)) : [];
}

export async function getCurrentProject(config: ServerConfig): Promise<ProjectSummary | null> {
  const payload = await requestJson<unknown>(config, "/project/current", {
    headers: { Accept: "application/json" },
  });

  return payload ? normalizeProject(payload) : null;
}

export async function getPathInfo(config: ServerConfig): Promise<PathInfo | null> {
  const payload = await requestJson<unknown>(config, "/path", {
    headers: { Accept: "application/json" },
  });

  return payload ? normalizePathInfo(payload) : null;
}

export async function getVcsInfo(config: ServerConfig): Promise<VcsInfo | null> {
  const payload = await requestJson<unknown>(config, "/vcs", {
    headers: { Accept: "application/json" },
  });

  return payload ? normalizeVcsInfo(payload) : null;
}

export async function getConfig(config: ServerConfig): Promise<UnknownRecord> {
  const payload = await requestJson<unknown>(config, "/config", {
    headers: { Accept: "application/json" },
  });

  return asRecord(payload);
}

export async function updateConfig(config: ServerConfig, patch: UnknownRecord) {
  const payload = await requestJson<unknown>(config, "/config", {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  return asRecord(payload);
}

export async function getProviderCatalog(config: ServerConfig): Promise<ProviderCatalog> {
  const payload = await requestJson<unknown>(config, "/provider", {
    headers: { Accept: "application/json" },
  });

  return normalizeProviderCatalog(payload);
}

export async function getProviderAuthMethods(config: ServerConfig): Promise<ProviderAuthMethods> {
  const payload = await requestJson<unknown>(config, "/provider/auth", {
    headers: { Accept: "application/json" },
  });

  return normalizeProviderAuthMethods(payload);
}

export async function getProviders(config: ServerConfig): Promise<ProviderSummary[]> {
  const [configSnapshot, providerCatalog, providerAuthMethods] = await Promise.allSettled([
    requestConfigProviderSnapshot(config),
    getProviderCatalog(config),
    getProviderAuthMethods(config),
  ]);

  const defaultModelsFromConfig =
    configSnapshot.status === "fulfilled" ? configSnapshot.value.defaultModels : {};
  const providersFromConfig =
    configSnapshot.status === "fulfilled" ? configSnapshot.value.providers : [];
  const catalog =
    providerCatalog.status === "fulfilled"
      ? providerCatalog.value
      : { all: [], connected: [], defaultModels: {}, raw: {} };
  const authMethods = providerAuthMethods.status === "fulfilled" ? providerAuthMethods.value : {};

  const providerMap = new Map<string, ProviderSummary>();

  providersFromConfig.forEach((provider) => {
    providerMap.set(provider.id, provider);
  });

  const providerIds = new Set<string>([
    ...providerMap.keys(),
    ...catalog.all,
    ...catalog.connected,
    ...Object.keys(authMethods),
    ...Object.keys(catalog.defaultModels),
    ...Object.keys(defaultModelsFromConfig),
  ]);

  providerIds.forEach((providerId) => {
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
        catalog.defaultModels[providerId] ?? defaultModelsFromConfig[providerId] ?? current?.defaultModel,
      raw: current?.raw ?? { id: providerId },
    });
  });

  return sortByName(Array.from(providerMap.values()));
}

export async function authorizeProviderOAuth(config: ServerConfig, providerId: string) {
  const payload = await requestJson<{ url?: string }>(
    config,
    `/provider/${providerId}/oauth/authorize`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    },
  );

  return payload?.url ?? "";
}

export async function completeProviderOAuth(config: ServerConfig, providerId: string, body: UnknownRecord = {}) {
  const payload = await requestJson<boolean>(config, `/provider/${providerId}/oauth/callback`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return Boolean(payload);
}

export async function getAgents(config: ServerConfig): Promise<AgentSummary[]> {
  const payload = await requestJson<unknown[]>(config, "/agent", {
    headers: { Accept: "application/json" },
  });

  return Array.isArray(payload) ? sortByName(payload.map(normalizeAgent)) : [];
}

export async function getToolIds(config: ServerConfig): Promise<string[]> {
  const payload = await requestJson<unknown>(config, "/experimental/tool/ids", {
    headers: { Accept: "application/json" },
  }).catch(() => null);

  if (Array.isArray(payload)) {
    return payload.filter((value): value is string => typeof value === "string").sort((left, right) => left.localeCompare(right));
  }

  const record = asRecord(payload);
  const values = Array.isArray(record.tools)
    ? record.tools
    : Array.isArray(record.ids)
      ? record.ids
      : Array.isArray(record.items)
        ? record.items
        : null;

  if (values) {
    return values
      .map((value) => (typeof value === "string" ? value : pickString(asRecord(value).id, asRecord(value).name)))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right));
  }

  return FALLBACK_TOOL_IDS;
}

export async function getSessionStatus(config: ServerConfig): Promise<SessionStatusMap> {
  const payload = await requestJson<unknown>(config, "/session/status", {
    headers: { Accept: "application/json" },
  });
  const record = asRecord(payload);

  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

export async function getSessions(config: ServerConfig): Promise<SessionSummary[]> {
  const [payload, statusMap] = await Promise.all([
    requestJson<unknown[]>(config, "/session", {
      headers: { Accept: "application/json" },
    }),
    getSessionStatus(config).catch((): SessionStatusMap => ({})),
  ]);

  return Array.isArray(payload)
    ? payload.map((entry) => {
        const normalized = normalizeSession(entry);
        return {
          ...normalized,
          status: statusMap[normalized.id] ?? normalized.status,
        };
      })
    : [];
}

export async function getSession(config: ServerConfig, sessionId: string): Promise<SessionSummary> {
  const payload = await requestJson<unknown>(config, `/session/${sessionId}`, {
    headers: { Accept: "application/json" },
  });

  return normalizeSession(payload ?? {});
}

export async function createSession(
  config: ServerConfig,
  input: { title: string },
): Promise<SessionSummary> {
  const payload = await requestJson<unknown>(config, "/session", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return normalizeSession(payload ?? {});
}

export async function deleteSession(config: ServerConfig, sessionId: string) {
  const payload = await requestMaybeJson<boolean>(config, `/session/${sessionId}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });

  return payload ?? true;
}

export async function renameSession(
  config: ServerConfig,
  sessionId: string,
  title: string,
): Promise<SessionSummary> {
  // Try PATCH first; fall back to POST with a title update body
  const payload = await requestJson<unknown>(config, `/session/${sessionId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  return normalizeSession(payload ?? {});
}

export async function forkSession(config: ServerConfig, sessionId: string, messageID?: string) {
  const payload = await requestJson<unknown>(config, `/session/${sessionId}/fork`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messageID ? { messageID } : {}),
  });

  return normalizeSession(payload ?? {});
}

export async function abortSession(config: ServerConfig, sessionId: string) {
  const payload = await requestMaybeJson<boolean>(config, `/session/${sessionId}/abort`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });

  return payload ?? true;
}

export async function getSessionMessages(
  config: ServerConfig,
  sessionId: string,
): Promise<SessionMessage[]> {
  const payload = await withFallback([
    () =>
      requestJson<unknown[]>(config, `/session/${sessionId}/message`, {
        headers: { Accept: "application/json" },
      }),
    () =>
      requestJson<unknown[]>(config, `/session/${sessionId}/messages`, {
        headers: { Accept: "application/json" },
      }),
  ]);

  return Array.isArray(payload) ? payload.map(normalizeMessage) : [];
}

export async function sendMessage(
  config: ServerConfig,
  sessionId: string,
  input: SendMessageInput | string,
) {
  const body = JSON.stringify(createMessageBody(input));
  const payload = await withFallback([
    () =>
      requestMaybeJson<unknown>(config, `/session/${sessionId}/message`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body,
      }),
    () =>
      requestMaybeJson<unknown>(config, `/session/${sessionId}/prompt`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body,
      }),
  ]);

  return payload ? normalizeMessage(payload) : null;
}

export async function sendAsyncMessage(
  config: ServerConfig,
  sessionId: string,
  input: SendMessageInput | string,
) {
  const body = JSON.stringify(createMessageBody(input));

  await requestRaw(config, `/session/${sessionId}/prompt_async`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });
}

export async function executeSessionCommand(
  config: ServerConfig,
  sessionId: string,
  input: { command: string; arguments?: string[] },
) {
  const payload = await requestMaybeJson<unknown>(config, `/session/${sessionId}/command`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      command: input.command,
      arguments: input.arguments ?? [],
    }),
  });

  return payload ? normalizeMessage(payload) : null;
}

export async function runShellCommand(
  config: ServerConfig,
  sessionId: string,
  input: { command: string; agent?: string },
) {
  const body: UnknownRecord = { command: input.command };

  if (input.agent) {
    body.agent = input.agent;
  }

  const payload = await requestMaybeJson<unknown>(config, `/session/${sessionId}/shell`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return payload ? normalizeMessage(payload) : null;
}

export async function searchInFiles(config: ServerConfig, pattern: string): Promise<FileSearchResult[]> {
  const payload = await requestJson<unknown[]>(config, buildQuery("/find", { pattern }), {
    headers: { Accept: "application/json" },
  });

  return Array.isArray(payload) ? payload.map(normalizeSearchResult) : [];
}

export async function findFiles(config: ServerConfig, query: string): Promise<string[]> {
  const payload = await requestJson<unknown[]>(config, buildQuery("/find/file", { query }), {
    headers: { Accept: "application/json" },
  });

  return Array.isArray(payload) ? payload.filter((value): value is string => typeof value === "string") : [];
}

export async function readFileContent(config: ServerConfig, path: string) {
  const payload = await requestJson<{ content?: string }>(config, buildQuery("/file/content", { path }), {
    headers: { Accept: "application/json" },
  });

  return payload?.content ?? "";
}

export async function writeLog(
  config: ServerConfig,
  input: { service: string; level: string; message: string },
) {
  const payload = await requestMaybeJson<boolean>(config, "/log", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return payload ?? true;
}

export async function getDocSpec(config: ServerConfig) {
  const response = await requestRaw(config, "/doc", {
    headers: { Accept: "application/json, text/plain, text/html" },
  });
  const text = await responseText(response);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function requestEventStream(config: ServerConfig, path: string, signal: AbortSignal) {
  const response = await fetch(buildUrl(config, path), {
    method: "GET",
    signal,
    headers: createHeaders(config, {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    }),
  });

  if (!response.ok) {
    const details = await responseText(response);
    throw new ApiError(response.status, details || `${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Lo stream SSE non espone un body leggibile");
  }

  return response;
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
      const response = await withFallback([
        () => requestEventStream(config, "/event", controller.signal),
        () => requestEventStream(config, "/global/event", controller.signal),
      ]);

      handlers.onOpen?.();

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        return;
      }

      while (true) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";

        blocks.forEach((block) => {
          const parsed = parseEventBlock(block);

          if (parsed) {
            handlers.onEvent(parsed);
          }
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }

      handlers.onError?.(error instanceof Error ? error : new Error("Errore SSE"));
    }
  })();

  return () => controller.abort();
}

export function extractMessageText(message: SessionMessage) {
  // If we have live streaming text, prefer it
  if (message.streamingText) return message.streamingText;
  const content = message.parts.map(textFromPart).filter(Boolean).join("\n\n").trim();
  return content || "Messaggio senza contenuto testuale.";
}

/**
 * Send a message and stream the assistant response via SSE.
 * Calls onToken with each new text delta, onDone when the stream ends.
 * Returns an abort function.
 */
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
  const body = JSON.stringify(createMessageBody(input));

  void (async () => {
    // Try the streaming endpoint first, fall back to non-streaming prompt endpoint
    const urls = [
      buildUrl(config, `/session/${sessionId}/message/stream`),
      buildUrl(config, `/session/${sessionId}/prompt_stream`),
      buildUrl(config, `/session/${sessionId}/message`),
      buildUrl(config, `/session/${sessionId}/prompt`),
    ];

    let response: Response | null = null;
    let lastError: Error = new Error("Stream non disponibile");

    for (const url of urls) {
      try {
        const r = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: createHeaders(config, {
            Accept: "text/event-stream, application/json",
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          }),
          body,
        });
        if (r.ok) {
          response = r;
          break;
        }
        if (r.status !== 404 && r.status !== 405) {
          const details = await responseText(r);
          throw new ApiError(r.status, details || `${r.status} ${r.statusText}`);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!response) {
      handlers.onError?.(lastError);
      handlers.onDone();
      return;
    }

    const contentType = response.headers.get("content-type") ?? "";

    // If the server returned plain JSON (non-streaming fallback), emit the whole thing
    if (!contentType.includes("event-stream") && !contentType.includes("stream")) {
      try {
        const text = await responseText(response);
        if (text) {
          const parsed = JSON.parse(text) as unknown;
          const msg = normalizeMessage(parsed);
          const msgText = msg.parts.map(textFromPart).filter(Boolean).join("\n\n").trim();
          if (msgText) handlers.onToken(msgText);
        }
      } catch {
        // ignore
      }
      handlers.onDone();
      return;
    }

    // SSE stream
    const reader = response.body?.getReader();
    if (!reader) { handlers.onDone(); return; }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsed = parseEventBlock(block);
          if (!parsed) continue;

          const data = asRecord(parsed.data);

          // Extract text delta from various event shapes
          const delta =
            pickString(
              data.delta,
              data.text,
              data.content,
              pickNested(data, ["choices", "0", "delta", "content"]) as string | undefined,
              pickNested(data, ["part", "text"]) as string | undefined,
            );

          if (delta) {
            handlers.onToken(delta);
          }

          // Stream done signals
          if (
            parsed.type === "done" ||
            parsed.type === "message.done" ||
            parsed.type === "session.done" ||
            pickString(data.type) === "done" ||
            data.done === true
          ) {
            handlers.onDone();
            reader.cancel();
            return;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      handlers.onDone();
    }
  })();

  return () => controller.abort();
}

export function extractEventSessionId(event: StreamEvent) {
  const record = asRecord(event.data);
  return (
    pickString(
      record.sessionID,
      record.sessionId,
      record.session_id,
      pickNested(record, ["info", "sessionID"]),
      pickNested(record, ["info", "sessionId"]),
      pickNested(record, ["info", "session_id"]),
    ) ?? null
  );
}
