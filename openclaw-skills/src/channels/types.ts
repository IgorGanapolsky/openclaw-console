/**
 * Channel management types and interfaces for OpenClaw dashboard
 */

export type ChannelProvider =
  | "telegram"
  | "discord"
  | "whatsapp"
  | "signal"
  | "google-chat"
  | "slack"
  | "teams"
  | "webhook";

export type ChannelState =
  | "not-configured"
  | "configuring"
  | "running"
  | "healthy"
  | "error"
  | "stopped";

export type ActionType = "config" | "session" | "diagnostics";

export interface ChannelConfig {
  id: string;
  name: string;
  provider: ChannelProvider;
  state: ChannelState;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastHealthCheck?: string;
  lastMessageAt?: string;
  config: ProviderConfig;
  metrics: ChannelMetrics;
  errors: ChannelError[];
}

export interface ProviderConfig {
  [key: string]: any;
  // Telegram
  botToken?: string;
  chatId?: string;
  webhookUrl?: string;

  // Discord
  guildId?: string;
  channelId?: string;
  botToken?: string;
  intents?: string[];

  // WhatsApp
  phoneNumber?: string;
  apiKey?: string;
  webhookSecret?: string;

  // Signal
  phoneNumber?: string;
  signalToken?: string;
  pairingQrCode?: string;

  // Google Chat
  spaces?: string[];
  serviceAccountKey?: string;

  // Slack
  workspaceId?: string;
  accessToken?: string;

  // Teams
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;

  // Generic webhook
  url?: string;
  method?: "GET" | "POST" | "PUT";
  headers?: { [key: string]: string };
  secret?: string;
}

export interface ChannelMetrics {
  messagesSent: number;
  messagesReceived: number;
  messagesPerMinute: number;
  errorCount: number;
  lastErrorAt?: string;
  uptime: number;
  avgResponseTime: number;
}

export interface ChannelError {
  id: string;
  timestamp: string;
  message: string;
  code?: string;
  severity: "low" | "medium" | "high" | "critical";
  resolved: boolean;
  resolvedAt?: string;
}

export interface ChannelSchema {
  provider: ChannelProvider;
  name: string;
  description: string;
  configSchema: {
    [key: string]: {
      type:
        | "string"
        | "number"
        | "boolean"
        | "select"
        | "multiselect"
        | "textarea";
      required: boolean;
      label: string;
      placeholder?: string;
      options?: string[];
      sensitive?: boolean; // For token masking
      validation?: {
        pattern?: string;
        min?: number;
        max?: number;
      };
    };
  };
  setupInstructions: string[];
  capabilities: string[];
}

export interface ChannelSummary {
  total: number;
  byState: Record<ChannelState, number>;
  totalMessages: number;
  totalErrors: number;
  activeChannels: number;
}

export interface ChannelCreateRequest {
  name: string;
  provider: ChannelProvider;
  config: ProviderConfig;
  enabled?: boolean;
}

export interface ChannelUpdateRequest {
  name?: string;
  config?: Partial<ProviderConfig>;
  enabled?: boolean;
}

export interface ChannelActionRequest {
  action: ActionType;
  parameters?: { [key: string]: any };
}

export interface ChannelActionResponse {
  success: boolean;
  message: string;
  data?: any;
  logs?: string[];
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  channelId: string;
  provider: ChannelProvider;
  metadata?: { [key: string]: any };
}
