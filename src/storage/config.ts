import type { KnownServerProfile, PromptMode, ServerConfig, SessionSummary } from "../types/opencode";

export const SERVER_CONFIG_KEY = "opencode_server_config";
export const SERVER_PROFILES_KEY = "opencode_server_profiles";
export const SESSIONS_CACHE_KEY = "opencode_sessions_cache";
export const LAST_SESSION_KEY = "opencode_last_session";
export const PROMPT_MODE_KEY = "opencode_prompt_mode";
export const SELECTED_AGENT_KEY = "opencode_selected_agent";
export const SELECTED_MODEL_KEY = "opencode_selected_model";
export const SELECTED_TOOLS_KEY = "opencode_selected_tools";

const STORAGE_KEYS_TO_IGNORE = new Set([
  SESSIONS_CACHE_KEY,
  LAST_SESSION_KEY,
  PROMPT_MODE_KEY,
  SELECTED_AGENT_KEY,
  SELECTED_MODEL_KEY,
  SELECTED_TOOLS_KEY,
]);

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

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function makeProfileId(config: ServerConfig) {
  return `${normalizeUrl(config.serverUrl)}|${config.username.trim().toLowerCase()}`;
}

function deriveProfileLabel(config: ServerConfig) {
  try {
    const url = new URL(config.serverUrl.trim());
    return `${config.username}@${url.host}`;
  } catch {
    return `${config.username}@${config.serverUrl.trim()}`;
  }
}

function isPlausibleServerConfig(value: unknown): value is ServerConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.serverUrl === "string" &&
    record.serverUrl.trim().length > 0 &&
    typeof record.username === "string" &&
    record.username.trim().length > 0 &&
    typeof record.password === "string"
  );
}

function toProfile(config: ServerConfig, options?: Partial<KnownServerProfile>): KnownServerProfile {
  return {
    id: options?.id ?? makeProfileId(config),
    label: options?.label ?? deriveProfileLabel(config),
    sourceKey: options?.sourceKey,
    lastUsedAt: options?.lastUsedAt,
    detected: options?.detected ?? false,
    serverUrl: config.serverUrl.trim(),
    username: config.username.trim(),
    password: config.password,
  };
}

function extractPlausibleConfigs(value: unknown, sourceKey?: string): KnownServerProfile[] {
  if (isPlausibleServerConfig(value)) {
    return [toProfile(value, { sourceKey, detected: true })];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractPlausibleConfigs(entry, sourceKey));
  }

  return [];
}

export function loadSavedServerProfiles(): KnownServerProfile[] {
  if (!canUseStorage()) {
    return [];
  }

  const parsed = safeParse<KnownServerProfile[]>(window.localStorage.getItem(SERVER_PROFILES_KEY));
  return Array.isArray(parsed)
    ? parsed.filter((profile) => isPlausibleServerConfig(profile)).map((profile) => toProfile(profile, profile))
    : [];
}

export function saveServerProfile(config: ServerConfig) {
  if (!canUseStorage()) {
    return;
  }

  const nextProfile = toProfile(config, {
    lastUsedAt: Date.now(),
    detected: false,
    sourceKey: SERVER_PROFILES_KEY,
  });
  const existing = loadSavedServerProfiles();
  const merged = [nextProfile, ...existing.filter((profile) => profile.id !== nextProfile.id)].slice(0, 12);

  window.localStorage.setItem(SERVER_PROFILES_KEY, JSON.stringify(merged));
}

export function detectKnownServerProfiles(): KnownServerProfile[] {
  if (!canUseStorage()) {
    return [];
  }

  const profiles = new Map<string, KnownServerProfile>();

  loadSavedServerProfiles().forEach((profile) => {
    profiles.set(profile.id, profile);
  });

  const currentConfig = loadServerConfig();

  if (currentConfig) {
    const currentProfile = toProfile(currentConfig, {
      lastUsedAt: Date.now(),
      sourceKey: SERVER_CONFIG_KEY,
      detected: true,
    });
    const existing = profiles.get(currentProfile.id);

    profiles.set(currentProfile.id, {
      ...currentProfile,
      detected: existing?.detected ?? true,
      lastUsedAt: existing?.lastUsedAt ?? currentProfile.lastUsedAt,
      sourceKey: existing?.sourceKey ?? currentProfile.sourceKey,
    });
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);

    if (!key || STORAGE_KEYS_TO_IGNORE.has(key)) {
      continue;
    }

    const value = window.localStorage.getItem(key);
    const parsed = safeParse<unknown>(value);

    if (!parsed) {
      continue;
    }

    extractPlausibleConfigs(parsed, key).forEach((profile) => {
      const existing = profiles.get(profile.id);

      if (existing) {
        profiles.set(profile.id, {
          ...profile,
          ...existing,
          detected: true,
          sourceKey: existing.sourceKey ?? key,
        });
        return;
      }

      profiles.set(profile.id, profile);
    });
  }

  return Array.from(profiles.values()).sort((left, right) => {
    const leftTime = left.lastUsedAt ?? 0;
    const rightTime = right.lastUsedAt ?? 0;

    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }

    return left.label.localeCompare(right.label);
  });
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
