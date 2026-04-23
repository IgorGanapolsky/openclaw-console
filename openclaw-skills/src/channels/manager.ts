/**
 * Channel Manager - Core service for managing communication channels
 */

import crypto from "crypto";
import type {
  ChannelConfig,
  ChannelProvider,
  ChannelState,
  ChannelCreateRequest,
  ChannelUpdateRequest,
  ChannelMetrics,
  ChannelError,
  ChannelSummary,
  ChannelSchema,
  LogEntry,
  LogsResponse,
  ProviderConfig,
} from "./types.js";
import { getChannelSchemas } from "./schemas.js";

export class ChannelManager {
  private channels = new Map<string, ChannelConfig>();
  private logs: LogEntry[] = [];
  private readonly maxLogs = 10000;

  constructor() {
    // Initialize with some demo data
    this.initializeDemo();
  }

  private initializeDemo(): void {
    const demoChannels: ChannelConfig[] = [
      {
        id: "telegram-ops",
        name: "DevOps Alerts",
        provider: "telegram",
        state: "healthy",
        enabled: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        lastHealthCheck: new Date().toISOString(),
        lastMessageAt: new Date(Date.now() - 300000).toISOString(),
        config: {
          botToken: "bot123456789:XXXXXXXXXXXXXXXXXXXXXXXXX",
          chatId: "-1001234567890",
          webhookUrl:
            "https://api.telegram.org/bot123456789:XXXXXXXXXXXXXXXXXXXXXXXXX/setWebhook",
        },
        metrics: {
          messagesSent: 247,
          messagesReceived: 12,
          messagesPerMinute: 2.3,
          errorCount: 0,
          uptime: 99.8,
          avgResponseTime: 120,
        },
        errors: [],
      },
      {
        id: "discord-alerts",
        name: "Team Notifications",
        provider: "discord",
        state: "running",
        enabled: true,
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date(Date.now() - 3600000).toISOString(),
        lastHealthCheck: new Date(Date.now() - 60000).toISOString(),
        lastMessageAt: new Date(Date.now() - 1800000).toISOString(),
        config: {
          guildId: "123456789012345678",
          channelId: "987654321098765432",
          botToken:
            "MTIzNDU2Nzg5MDEyMzQ1Njc4.XXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXX",
          intents: ["GUILDS", "GUILD_MESSAGES"],
        },
        metrics: {
          messagesSent: 156,
          messagesReceived: 8,
          messagesPerMinute: 1.1,
          errorCount: 2,
          lastErrorAt: new Date(Date.now() - 7200000).toISOString(),
          uptime: 97.5,
          avgResponseTime: 89,
        },
        errors: [
          {
            id: "err-1",
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            message: "Rate limit exceeded: 429 Too Many Requests",
            code: "RATE_LIMIT",
            severity: "medium",
            resolved: true,
            resolvedAt: new Date(Date.now() - 7000000).toISOString(),
          },
        ],
      },
      {
        id: "whatsapp-support",
        name: "Customer Support",
        provider: "whatsapp",
        state: "error",
        enabled: false,
        createdAt: new Date(Date.now() - 259200000).toISOString(),
        updatedAt: new Date(Date.now() - 1800000).toISOString(),
        lastHealthCheck: new Date(Date.now() - 300000).toISOString(),
        config: {
          phoneNumber: "+1234567890",
          apiKey: "wa_XXXXXXXXXXXXXXXXXXXXXXX",
          webhookSecret: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        },
        metrics: {
          messagesSent: 89,
          messagesReceived: 45,
          messagesPerMinute: 0,
          errorCount: 15,
          lastErrorAt: new Date(Date.now() - 1800000).toISOString(),
          uptime: 12.3,
          avgResponseTime: 0,
        },
        errors: [
          {
            id: "err-2",
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            message: "Authentication failed: Invalid API key",
            code: "AUTH_ERROR",
            severity: "critical",
            resolved: false,
          },
          {
            id: "err-3",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            message: "Connection timeout after 30 seconds",
            code: "TIMEOUT",
            severity: "high",
            resolved: false,
          },
        ],
      },
      {
        id: "signal-secure",
        name: "Secure Communications",
        provider: "signal",
        state: "not-configured",
        enabled: false,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        config: {
          phoneNumber: "",
          signalToken: "",
          pairingQrCode: "",
        },
        metrics: {
          messagesSent: 0,
          messagesReceived: 0,
          messagesPerMinute: 0,
          errorCount: 0,
          uptime: 0,
          avgResponseTime: 0,
        },
        errors: [],
      },
    ];

    demoChannels.forEach((channel) => {
      this.channels.set(channel.id, channel);
    });

    // Add some demo logs
    this.addLog("telegram-ops", "info", "Channel started successfully");
    this.addLog(
      "discord-alerts",
      "warn",
      "Rate limit warning: 80% of quota used",
    );
    this.addLog(
      "whatsapp-support",
      "error",
      "Authentication failed: Invalid API key",
    );
  }

  /**
   * Get all channels with optional filtering
   */
  public listChannels(
    state?: ChannelState,
    provider?: ChannelProvider,
  ): ChannelConfig[] {
    let channels = Array.from(this.channels.values());

    if (state) {
      channels = channels.filter((c) => c.state === state);
    }

    if (provider) {
      channels = channels.filter((c) => c.provider === provider);
    }

    return channels.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  /**
   * Get channel by ID
   */
  public getChannel(id: string): ChannelConfig | null {
    return this.channels.get(id) || null;
  }

  /**
   * Create a new channel
   */
  public async createChannel(
    request: ChannelCreateRequest,
  ): Promise<ChannelConfig> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Mask sensitive tokens before storing
    const maskedConfig = this.maskSensitiveData(request.config);

    const channel: ChannelConfig = {
      id,
      name: request.name,
      provider: request.provider,
      state: "not-configured",
      enabled: request.enabled ?? true,
      createdAt: now,
      updatedAt: now,
      config: maskedConfig,
      metrics: {
        messagesSent: 0,
        messagesReceived: 0,
        messagesPerMinute: 0,
        errorCount: 0,
        uptime: 0,
        avgResponseTime: 0,
      },
      errors: [],
    };

    this.channels.set(id, channel);
    this.addLog(id, "info", `Channel '${request.name}' created`);

    // Start configuration process
    await this.configureChannel(id);

    return channel;
  }

  /**
   * Update channel configuration
   */
  public async updateChannel(
    id: string,
    request: ChannelUpdateRequest,
  ): Promise<ChannelConfig | null> {
    const channel = this.channels.get(id);
    if (!channel) return null;

    const now = new Date().toISOString();

    if (request.name) {
      channel.name = request.name;
    }

    if (request.config) {
      const maskedConfig = this.maskSensitiveData(request.config);
      channel.config = { ...channel.config, ...maskedConfig };
    }

    if (request.enabled !== undefined) {
      channel.enabled = request.enabled;
    }

    channel.updatedAt = now;

    this.channels.set(id, channel);
    this.addLog(id, "info", `Channel '${channel.name}' updated`);

    // Reconfigure if config changed
    if (request.config) {
      await this.configureChannel(id);
    }

    return channel;
  }

  /**
   * Delete a channel
   */
  public async deleteChannel(id: string): Promise<boolean> {
    const channel = this.channels.get(id);
    if (!channel) return false;

    await this.stopChannel(id);
    this.channels.delete(id);
    this.addLog(id, "info", `Channel '${channel.name}' deleted`);

    return true;
  }

  /**
   * Get channel summary statistics
   */
  public getSummary(): ChannelSummary {
    const channels = Array.from(this.channels.values());

    const byState: Record<ChannelState, number> = {
      "not-configured": 0,
      configuring: 0,
      running: 0,
      healthy: 0,
      error: 0,
      stopped: 0,
    };

    let totalMessages = 0;
    let totalErrors = 0;

    channels.forEach((channel) => {
      byState[channel.state]++;
      totalMessages +=
        channel.metrics.messagesSent + channel.metrics.messagesReceived;
      totalErrors += channel.metrics.errorCount;
    });

    return {
      total: channels.length,
      byState,
      totalMessages,
      totalErrors,
      activeChannels: byState.healthy + byState.running,
    };
  }

  /**
   * Get available channel schemas
   */
  public getSchemas(): ChannelSchema[] {
    return getChannelSchemas();
  }

  /**
   * Get schema for specific provider
   */
  public getSchema(provider: ChannelProvider): ChannelSchema | null {
    return getChannelSchemas().find((s) => s.provider === provider) || null;
  }

  /**
   * Configure/start a channel
   */
  public async configureChannel(id: string): Promise<boolean> {
    const channel = this.channels.get(id);
    if (!channel) return false;

    try {
      channel.state = "configuring";
      this.channels.set(id, channel);
      this.addLog(id, "info", `Configuring channel '${channel.name}'...`);

      // Simulate configuration process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Validate configuration
      const isValid = await this.validateChannelConfig(channel);

      if (isValid) {
        channel.state = "running";
        channel.lastHealthCheck = new Date().toISOString();
        this.addLog(
          id,
          "info",
          `Channel '${channel.name}' started successfully`,
        );

        // Start health monitoring
        this.startHealthMonitoring(id);
      } else {
        channel.state = "error";
        this.addError(
          id,
          "Configuration validation failed",
          "CONFIG_ERROR",
          "high",
        );
      }

      this.channels.set(id, channel);
      return isValid;
    } catch (error) {
      channel.state = "error";
      this.channels.set(id, channel);
      this.addError(
        id,
        error instanceof Error ? error.message : "Unknown error",
        "CONFIG_ERROR",
        "critical",
      );
      return false;
    }
  }

  /**
   * Stop a channel
   */
  public async stopChannel(id: string): Promise<boolean> {
    const channel = this.channels.get(id);
    if (!channel) return false;

    channel.state = "stopped";
    channel.enabled = false;
    this.channels.set(id, channel);
    this.addLog(id, "info", `Channel '${channel.name}' stopped`);

    return true;
  }

  /**
   * Get logs for a channel or all channels
   */
  public getLogs(channelId?: string, page = 1, pageSize = 100): LogsResponse {
    let filteredLogs = this.logs;

    if (channelId) {
      filteredLogs = this.logs.filter((log) => log.channelId === channelId);
    }

    const total = filteredLogs.length;
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const logs = filteredLogs.slice(startIndex, endIndex);

    return {
      logs,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Perform health check on all channels
   */
  public async performHealthCheck(): Promise<void> {
    const channels = Array.from(this.channels.values());

    for (const channel of channels) {
      if (
        channel.enabled &&
        (channel.state === "running" || channel.state === "healthy")
      ) {
        await this.checkChannelHealth(channel.id);
      }
    }
  }

  /**
   * Test channel connectivity
   */
  public async testChannel(
    id: string,
  ): Promise<{ success: boolean; message: string; logs: string[] }> {
    const channel = this.channels.get(id);
    if (!channel) {
      return { success: false, message: "Channel not found", logs: [] };
    }

    const logs: string[] = [];
    logs.push(`Testing ${channel.provider} channel '${channel.name}'...`);

    try {
      // Simulate test process
      await new Promise((resolve) => setTimeout(resolve, 1000));

      switch (channel.provider) {
        case "telegram":
          logs.push("Validating bot token...");
          logs.push("Testing webhook URL...");
          logs.push("Checking chat permissions...");
          break;
        case "discord":
          logs.push("Validating bot token...");
          logs.push("Testing guild access...");
          logs.push("Checking channel permissions...");
          break;
        case "whatsapp":
          logs.push("Testing API key...");
          logs.push("Validating phone number...");
          logs.push("Checking webhook configuration...");
          break;
        default:
          logs.push("Running connectivity test...");
      }

      // Simulate success/failure based on current state
      const success = channel.state !== "error";

      if (success) {
        logs.push("✅ Test completed successfully");
        this.addLog(
          id,
          "info",
          `Test completed successfully for '${channel.name}'`,
        );
        return { success: true, message: "Channel test passed", logs };
      } else {
        logs.push("❌ Test failed");
        this.addLog(id, "error", `Test failed for '${channel.name}'`);
        return { success: false, message: "Channel test failed", logs };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logs.push(`❌ Error: ${message}`);
      this.addLog(id, "error", `Test error for '${channel.name}': ${message}`);
      return { success: false, message, logs };
    }
  }

  // Private helper methods

  private maskSensitiveData(config: ProviderConfig): ProviderConfig {
    const masked = { ...config };
    const sensitiveKeys = [
      "botToken",
      "apiKey",
      "accessToken",
      "clientSecret",
      "webhookSecret",
      "signalToken",
    ];

    for (const key of sensitiveKeys) {
      if (masked[key] && typeof masked[key] === "string") {
        const value = masked[key] as string;
        if (value.length > 8) {
          masked[key] =
            value.substring(0, 4) +
            "*".repeat(value.length - 8) +
            value.substring(value.length - 4);
        }
      }
    }

    return masked;
  }

  private async validateChannelConfig(
    channel: ChannelConfig,
  ): Promise<boolean> {
    const schema = this.getSchema(channel.provider);
    if (!schema) return false;

    // Check required fields
    for (const [key, field] of Object.entries(schema.configSchema)) {
      if (field.required && !channel.config[key]) {
        return false;
      }
    }

    return true;
  }

  private async checkChannelHealth(id: string): Promise<void> {
    const channel = this.channels.get(id);
    if (!channel) return;

    const now = new Date().toISOString();

    // Simulate health check
    const isHealthy = Math.random() > 0.1; // 90% health rate

    if (isHealthy) {
      channel.state = "healthy";
      channel.metrics.uptime = Math.min(100, channel.metrics.uptime + 0.1);
    } else {
      channel.state = "error";
      channel.metrics.uptime = Math.max(0, channel.metrics.uptime - 1);
      this.addError(id, "Health check failed", "HEALTH_CHECK", "medium");
    }

    channel.lastHealthCheck = now;
    this.channels.set(id, channel);
  }

  private startHealthMonitoring(id: string): void {
    // In a real implementation, this would set up periodic health checks
    // For now, we'll just update the channel state
    setTimeout(async () => {
      await this.checkChannelHealth(id);
    }, 5000);
  }

  private addLog(
    channelId: string,
    level: "debug" | "info" | "warn" | "error",
    message: string,
    metadata?: any,
  ): void {
    const channel = this.channels.get(channelId);

    const log: LogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      channelId,
      provider: channel?.provider || "unknown",
      metadata,
    };

    this.logs.unshift(log);

    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }
  }

  private addError(
    channelId: string,
    message: string,
    code: string,
    severity: "low" | "medium" | "high" | "critical",
  ): void {
    const channel = this.channels.get(channelId);
    if (!channel) return;

    const error: ChannelError = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      message,
      code,
      severity,
      resolved: false,
    };

    channel.errors.unshift(error);
    channel.metrics.errorCount++;
    channel.metrics.lastErrorAt = error.timestamp;

    this.channels.set(channelId, channel);
    this.addLog(channelId, "error", message, { code, severity });
  }
}
