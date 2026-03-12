import type { PromptMode, ServerConfig, SessionSummary } from "../types/opencode";

export const SERVER_CONFIG_KEY = "opencode_server_config";
export const SESSIONS_CACHE_KEY = "opencode_sessions_cache";
export const LAST_SESSION_KEY = "opencode_last_session";
export const PROMPT_MODE_KEY = "opencode_prompt_mode";
export const SELECTED_AGENT_KEY = "opencode_selected_agent";
export const SELECTED_MODEL_KEY = "opencode_selected_model";
export const SELECTED_TOOLS_KEY = "opencode_selected_tools";

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  serverUrl: "http://127.0.0.1:4096",
  username: "opencode",
  password: "",
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function safeParse<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function loadServerConfig(): ServerConfig | null {
  if (!canUseStorage()) {
    return null;
  }

  return safeParse<ServerConfig>(window.localStorage.getItem(SERVER_CONFIG_KEY));
}

export function saveServerConfig(config: ServerConfig) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(config));
}

export function loadSessionsCache(): SessionSummary[] {
  if (!canUseStorage()) {
    return [];
  }

  return safeParse<SessionSummary[]>(window.localStorage.getItem(SESSIONS_CACHE_KEY)) ?? [];
}

export function saveSessionsCache(sessions: SessionSummary[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(SESSIONS_CACHE_KEY, JSON.stringify(sessions));
}

export function loadLastSession(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(LAST_SESSION_KEY);
}

export function saveLastSession(sessionId: string | null) {
  if (!canUseStorage()) {
    return;
  }

  if (!sessionId) {
    window.localStorage.removeItem(LAST_SESSION_KEY);
    return;
  }

  window.localStorage.setItem(LAST_SESSION_KEY, sessionId);
}

export function loadPromptMode(): PromptMode {
  if (!canUseStorage()) {
    return "reply";
  }

  const mode = window.localStorage.getItem(PROMPT_MODE_KEY);
  return mode === "async" ? "async" : "reply";
}

export function savePromptMode(mode: PromptMode) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(PROMPT_MODE_KEY, mode);
}

export function loadSelectedAgent(): string {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(SELECTED_AGENT_KEY) ?? "";
}

export function saveSelectedAgent(agentId: string) {
  if (!canUseStorage()) {
    return;
  }

  if (!agentId) {
    window.localStorage.removeItem(SELECTED_AGENT_KEY);
    return;
  }

  window.localStorage.setItem(SELECTED_AGENT_KEY, agentId);
}

export function loadSelectedModel(): string {
  if (!canUseStorage()) {
    return "";
  }

  return window.localStorage.getItem(SELECTED_MODEL_KEY) ?? "";
}

export function saveSelectedModel(modelId: string) {
  if (!canUseStorage()) {
    return;
  }

  if (!modelId) {
    window.localStorage.removeItem(SELECTED_MODEL_KEY);
    return;
  }

  window.localStorage.setItem(SELECTED_MODEL_KEY, modelId);
}

export function loadSelectedTools(): string[] {
  if (!canUseStorage()) {
    return [];
  }

  const parsed = safeParse<string[]>(window.localStorage.getItem(SELECTED_TOOLS_KEY));
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
}

export function saveSelectedTools(toolIds: string[]) {
  if (!canUseStorage()) {
    return;
  }

  if (toolIds.length === 0) {
    window.localStorage.removeItem(SELECTED_TOOLS_KEY);
    return;
  }

  window.localStorage.setItem(SELECTED_TOOLS_KEY, JSON.stringify(toolIds));
}
