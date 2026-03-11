import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GitOperation } from "../types/protocol.js";

export interface GitMcpTools {
  git_status: Tool;
  git_commit: Tool;
  git_push: Tool;
  git_merge: Tool;
  git_branch: Tool;
  git_log: Tool;
  git_diff: Tool;
}

export interface GitMcpResult {
  success: boolean;
  output: string;
  error?: string;
  operation?: GitOperation;
}

/**
 * McpManager — Connects the OpenClaw Gateway to the MCP ecosystem.
 * Enhanced with git-specific MCP tools for repository operations.
 */
export class McpManager {
  private clients: Map<string, Client> = new Map();
  private gitServerName: string | null = null;

  constructor() {}

  /**
   * Connect to an external MCP server via Stdio.
   */
  public async connectServer(name: string, command: string, args: string[] = []): Promise<void> {
    console.info(`[mcp] Connecting to server: ${name}...`);

    const transport = new StdioClientTransport({
      command,
      args,
    });

    const client = new Client(
      {
        name: "openclaw-gateway",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
    this.clients.set(name, client);
    console.info(`[mcp] Connected to ${name}. Tools available.`);

    // Check if this is a git-specific server
    const tools = await client.listTools();
    const gitTools = tools.tools.filter(tool =>
      tool.name.startsWith('git_') || tool.name.includes('git')
    );

    if (gitTools.length > 0) {
      this.gitServerName = name;
      console.info(`[mcp] Detected git tools in server ${name}: ${gitTools.map(t => t.name).join(', ')}`);
    }
  }

  /**
   * Connect to a git-specific MCP server for repository operations.
   */
  public async connectGitServer(repositoryPath: string): Promise<void> {
    await this.connectServer('git-mcp', 'git-mcp-server', ['--repository', repositoryPath]);
  }

  /**
   * List all available tools across all connected servers.
   */
  public async listAllTools(): Promise<{ server: string; tool: Tool }[]> {
    const allTools: { server: string; tool: Tool }[] = [];

    for (const [name, client] of this.clients.entries()) {
      const response = await client.listTools();
      for (const tool of response.tools) {
        allTools.push({ server: name, tool });
      }
    }

    return allTools;
  }

  /**
   * Get available git tools from the connected git MCP server.
   */
  public async getGitTools(): Promise<{ server: string; tool: Tool }[]> {
    if (!this.gitServerName) {
      return [];
    }

    const client = this.clients.get(this.gitServerName);
    if (!client) {
      return [];
    }

    const response = await client.listTools();
    const gitTools = response.tools.filter(tool =>
      tool.name.startsWith('git_') || tool.name.includes('git')
    );

    return gitTools.map(tool => ({ server: this.gitServerName!, tool }));
  }

  /**
   * Call a specific tool on a specific server.
   */
  public async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP Server ${serverName} not connected`);

    return await client.callTool({
      name: toolName,
      arguments: args,
    });
  }

  /**
   * Execute a git operation using the connected git MCP server.
   */
  public async executeGitOperation(
    operation: string,
    args: Record<string, unknown> = {}
  ): Promise<GitMcpResult> {
    if (!this.gitServerName) {
      throw new Error('No git MCP server connected');
    }

    try {
      const result = await this.callTool(this.gitServerName, `git_${operation}`, args);

      const resultData = result as CallToolResult;
      const firstContent = resultData.content?.[0];
      const outputText = firstContent && 'text' in firstContent ? firstContent.text : JSON.stringify(resultData);

      return {
        success: true,
        output: outputText,
        operation: this.extractGitOperation(operation, args, resultData),
      };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get git repository status using MCP.
   */
  public async getGitStatus(repositoryPath?: string): Promise<GitMcpResult> {
    return this.executeGitOperation('status', { path: repositoryPath });
  }

  /**
   * Commit changes using MCP git tools.
   */
  public async commitChanges(
    message: string,
    files?: string[],
    repositoryPath?: string
  ): Promise<GitMcpResult> {
    return this.executeGitOperation('commit', {
      message,
      files,
      path: repositoryPath,
    });
  }

  /**
   * Push changes using MCP git tools.
   */
  public async pushChanges(
    branch?: string,
    remote: string = 'origin',
    repositoryPath?: string
  ): Promise<GitMcpResult> {
    return this.executeGitOperation('push', {
      branch,
      remote,
      path: repositoryPath,
    });
  }

  /**
   * Merge branches using MCP git tools.
   */
  public async mergeBranches(
    sourceBranch: string,
    targetBranch?: string,
    repositoryPath?: string
  ): Promise<GitMcpResult> {
    return this.executeGitOperation('merge', {
      source: sourceBranch,
      target: targetBranch,
      path: repositoryPath,
    });
  }

  /**
   * Get git log using MCP git tools.
   */
  public async getGitLog(
    maxCount: number = 10,
    branch?: string,
    repositoryPath?: string
  ): Promise<GitMcpResult> {
    return this.executeGitOperation('log', {
      maxCount,
      branch,
      path: repositoryPath,
    });
  }

  /**
   * Get git diff using MCP git tools.
   */
  public async getGitDiff(
    commit1?: string,
    commit2?: string,
    repositoryPath?: string
  ): Promise<GitMcpResult> {
    return this.executeGitOperation('diff', {
      commit1,
      commit2,
      path: repositoryPath,
    });
  }

  /**
   * Check if git MCP server is connected and available.
   */
  public get hasGitServer(): boolean {
    return this.gitServerName !== null && this.clients.has(this.gitServerName);
  }

  public async shutdown(): Promise<void> {
    // for (const client of this.clients.values()) {
    //   await client.close();
    // }
    this.clients.clear();
    this.gitServerName = null;
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  private extractGitOperation(
    operation: string,
    args: Record<string, unknown>,
    _result: CallToolResult
  ): GitOperation | undefined {
    switch (operation) {
      case 'commit':
        return {
          operation_type: 'commit',
          commit_message: typeof args.message === 'string' ? args.message : undefined,
          file_changes: Array.isArray(args.files) ? args.files as string[] : undefined,
        };
      case 'push':
        return {
          operation_type: 'push',
          branch_to: typeof args.branch === 'string' ? args.branch : undefined,
        };
      case 'merge':
        return {
          operation_type: 'merge',
          branch_from: typeof args.source === 'string' ? args.source : undefined,
          branch_to: typeof args.target === 'string' ? args.target : undefined,
        };
      default:
        return undefined;
    }
  }
}
