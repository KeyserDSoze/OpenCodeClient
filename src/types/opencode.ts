export type UnknownRecord = Record<string, unknown>;

export interface ServerConfig {
  serverUrl: string;
  username: string;
  password: string;
}

export interface KnownServerProfile extends ServerConfig {
  id: string;
  label: string;
  sourceKey?: string;
  lastUsedAt?: number;
  detected: boolean;
}

export type PromptMode = "reply" | "async";

export interface ComposerSelectOption {
  value: string;
  label: string;
}

export interface HealthResponse {
  healthy: boolean;
  version?: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path?: string;
  raw: UnknownRecord;
}

export interface PathInfo {
  root?: string;
  raw: UnknownRecord;
}

export interface VcsInfo {
  branch?: string;
  dirty?: boolean;
  raw: UnknownRecord;
}

export interface SessionSummary {
  id: string;
  title: string;
  status: string;
  updatedAt?: string;
  raw: UnknownRecord;
}

export type SessionStatusMap = Record<string, string>;

export interface MessagePart {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface MessageInfo {
  id: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  sessionID?: string;
  raw: UnknownRecord;
}

export interface MessageRequestMeta {
  agent?: string;
  model?: string;
  tools?: string[];
}

export interface SessionMessage {
  info: MessageInfo;
  parts: MessagePart[];
  requestMeta?: MessageRequestMeta;
  optimistic?: boolean;
  /** Set during streaming — accumulated text so far */
  streamingText?: string;
  /** True while this message is still receiving tokens */
  isStreaming?: boolean;
}

export interface SendMessageInput {
  text: string;
  model?: string;
  agent?: string;
  tools?: unknown[];
}

export interface ProviderCatalog {
  all: string[];
  connected: string[];
  defaultModels: Record<string, string>;
  raw: UnknownRecord;
}

export type ProviderAuthMethods = Record<string, string[]>;

export interface ProviderSummary {
  id: string;
  name: string;
  connected: boolean;
  authType?: string;
  authMethods: string[];
  models: string[];
  defaultModel?: string;
  raw: UnknownRecord;
}

export interface AgentSummary {
  id: string;
  description?: string;
  raw: UnknownRecord;
}

export interface FileSearchResult {
  path: string;
  lineNumber?: number;
  lines?: string;
  raw: UnknownRecord;
}

export interface StreamEvent {
  type: string;
  data: unknown;
  receivedAt: number;
}
