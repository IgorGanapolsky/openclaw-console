/**
 * Channels API Router - Express routes for channel management
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { ChannelManager } from "./manager.js";
import type {
  ChannelCreateRequest,
  ChannelUpdateRequest,
  ChannelActionRequest,
  ChannelState,
  ChannelProvider,
} from "./types.js";

// Global channel manager instance
const channelManager = new ChannelManager();

export function createChannelsRouter(): Router {
  const router = Router();

  // ── Channel CRUD Operations ─────────────────────────────────────────────

  /**
   * GET /channels - List all channels with optional filtering
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      const state = req.query.state as ChannelState | undefined;
      const provider = req.query.provider as ChannelProvider | undefined;
      const channels = channelManager.listChannels(state, provider);

      res.json({
        success: true,
        channels,
        total: channels.length,
      });
    } catch (error) {
      console.error("[Channels] List channels error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  /**
   * GET /channels/summary - Get summary statistics
   */
  router.get("/summary", (req: Request, res: Response) => {
    try {
      const summary = channelManager.getSummary();
      res.json({
        success: true,
        summary,
      });
    } catch (error) {
      console.error("[Channels] Summary error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  /**
   * GET /channels/:id - Get channel by ID
   */
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const channel = channelManager.getChannel(id);

      if (!channel) {
        return res.status(404).json({
          success: false,
          error: "Channel not found",
        });
      }

      res.json({
        success: true,
        channel,
      });
    } catch (error) {
      console.error("[Channels] Get channel error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  });

  /**
   * POST /channels - Create a new channel
   */
  router.post("/", async (req: Request, res: Response) => {
    try {
      const request = req.body as ChannelCreateRequest;

      // Validate required fields
      if (!request.name || !request.provider || !request.config) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: name, provider, config",
        });
      }

      const channel = await channelManager.createChannel(request);

      res.status(201).json({
        success: true,
        channel,
      });
    } catch (error) {
      console.error("[Channels] Create channel error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create channel",
      });
    }
  });

  /**
   * PUT /channels/:id - Update channel
   */
  router.put("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const request = req.body as ChannelUpdateRequest;

      const channel = await channelManager.updateChannel(id, request);

      if (!channel) {
        return res.status(404).json({
          success: false,
          error: "Channel not found",
        });
      }

      res.json({
        success: true,
        channel,
      });
    } catch (error) {
      console.error("[Channels] Update channel error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to update channel",
      });
    }
  });

  /**
   * DELETE /channels/:id - Delete channel
   */
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await channelManager.deleteChannel(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Channel not found",
        });
      }

      res.json({
        success: true,
        message: "Channel deleted successfully",
      });
    } catch (error) {
      console.error("[Channels] Delete channel error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete channel",
      });
    }
  });

  // ── Channel Actions ─────────────────────────────────────────────────────

  /**
   * POST /channels/:id/configure - Configure/start channel
   */
  router.post("/:id/configure", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await channelManager.configureChannel(id);

      res.json({
        success,
        message: success
          ? "Channel configured successfully"
          : "Failed to configure channel",
      });
    } catch (error) {
      console.error("[Channels] Configure channel error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Configuration failed",
      });
    }
  });

  /**
   * POST /channels/:id/stop - Stop channel
   */
  router.post("/:id/stop", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const success = await channelManager.stopChannel(id);

      if (!success) {
        return res.status(404).json({
          success: false,
          error: "Channel not found",
        });
      }

      res.json({
        success: true,
        message: "Channel stopped successfully",
      });
    } catch (error) {
      console.error("[Channels] Stop channel error:", error);
      res.status(500).json({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to stop channel",
      });
    }
  });

  /**
   * POST /channels/:id/test - Test channel connectivity
   */
  router.post("/:id/test", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await channelManager.testChannel(id);

      res.json({
        success: result.success,
        message: result.message,
        logs: result.logs,
      });
    } catch (error) {
      console.error("[Channels] Test channel error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Test failed",
      });
    }
  });

  /**
   * POST /channels/:id/actions - Perform channel actions
   */
  router.post("/:id/actions", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const actionRequest = req.body as ChannelActionRequest;

      let result;

      switch (actionRequest.action) {
        case "config":
          const configSuccess = await channelManager.configureChannel(id);
          result = {
            success: configSuccess,
            message: configSuccess
              ? "Channel configured"
              : "Configuration failed",
            logs: [`Configuration ${configSuccess ? "completed" : "failed"}`],
          };
          break;

        case "session":
          // Get current channel session info
          const channel = channelManager.getChannel(id);
          result = {
            success: !!channel,
            message: channel ? "Session active" : "No active session",
            data: channel
              ? {
                  state: channel.state,
                  lastHealthCheck: channel.lastHealthCheck,
                  metrics: channel.metrics,
                }
              : null,
          };
          break;

        case "diagnostics":
          const testResult = await channelManager.testChannel(id);
          const logs = channelManager.getLogs(id, 1, 10);
          result = {
            success: testResult.success,
            message: `Diagnostics ${testResult.success ? "passed" : "failed"}`,
            data: { testLogs: testResult.logs, recentLogs: logs.logs },
            logs: testResult.logs,
          };
          break;

        default:
          return res.status(400).json({
            success: false,
            error: "Invalid action type",
          });
      }

      res.json(result);
    } catch (error) {
      console.error("[Channels] Action error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Action failed",
      });
    }
  });

  // ── Health & Monitoring ─────────────────────────────────────────────────

  /**
   * POST /channels/health-check - Perform health check on all channels
   */
  router.post("/health-check", async (req: Request, res: Response) => {
    try {
      await channelManager.performHealthCheck();
      res.json({
        success: true,
        message: "Health check completed",
      });
    } catch (error) {
      console.error("[Channels] Health check error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Health check failed",
      });
    }
  });

  /**
   * GET /channels/:id/logs - Get channel logs
   */
  router.get("/:id/logs", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;

      const logs = channelManager.getLogs(id, page, pageSize);

      res.json({
        success: true,
        ...logs,
      });
    } catch (error) {
      console.error("[Channels] Get logs error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to get logs",
      });
    }
  });

  /**
   * GET /logs - Get all channel logs
   */
  router.get("/logs", (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;

      const logs = channelManager.getLogs(undefined, page, pageSize);

      res.json({
        success: true,
        ...logs,
      });
    } catch (error) {
      console.error("[Channels] Get all logs error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to get logs",
      });
    }
  });

  // ── Schemas & Configuration ─────────────────────────────────────────────

  /**
   * GET /channels/schemas - Get all channel provider schemas
   */
  router.get("/schemas", (req: Request, res: Response) => {
    try {
      const schemas = channelManager.getSchemas();
      res.json({
        success: true,
        schemas,
      });
    } catch (error) {
      console.error("[Channels] Get schemas error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to get schemas",
      });
    }
  });

  /**
   * GET /channels/schemas/:provider - Get schema for specific provider
   */
  router.get("/schemas/:provider", (req: Request, res: Response) => {
    try {
      const { provider } = req.params;
      const schema = channelManager.getSchema(provider as ChannelProvider);

      if (!schema) {
        return res.status(404).json({
          success: false,
          error: "Schema not found for provider",
        });
      }

      res.json({
        success: true,
        schema,
      });
    } catch (error) {
      console.error("[Channels] Get schema error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Failed to get schema",
      });
    }
  });

  // ── Bulk Operations ─────────────────────────────────────────────────────

  /**
   * POST /channels/bulk/enable - Enable multiple channels
   */
  router.post("/bulk/enable", async (req: Request, res: Response) => {
    try {
      const { channelIds } = req.body;

      if (!Array.isArray(channelIds)) {
        return res.status(400).json({
          success: false,
          error: "channelIds must be an array",
        });
      }

      const results = [];

      for (const id of channelIds) {
        try {
          const channel = await channelManager.updateChannel(id, {
            enabled: true,
          });
          results.push({ id, success: !!channel });
        } catch (error) {
          results.push({
            id,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error("[Channels] Bulk enable error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Bulk operation failed",
      });
    }
  });

  /**
   * POST /channels/bulk/disable - Disable multiple channels
   */
  router.post("/bulk/disable", async (req: Request, res: Response) => {
    try {
      const { channelIds } = req.body;

      if (!Array.isArray(channelIds)) {
        return res.status(400).json({
          success: false,
          error: "channelIds must be an array",
        });
      }

      const results = [];

      for (const id of channelIds) {
        try {
          const channel = await channelManager.updateChannel(id, {
            enabled: false,
          });
          results.push({ id, success: !!channel });
        } catch (error) {
          results.push({
            id,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error("[Channels] Bulk disable error:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Bulk operation failed",
      });
    }
  });

  return router;
}

export { channelManager };
