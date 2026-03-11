/**
 * Task Manager Skill
 *
 * Provides a high-level API for other skills to create, update,
 * and annotate tasks. Wraps StateManager with task-specific helpers.
 */

import type { Task, TaskStatus, TaskStep, StepType, ResourceLink } from '../types/protocol.js';
import type { IStateManager } from '../gateway/state-interface.js';

export interface CreateTaskOptions {
  agentId: string;
  title: string;
  description: string;
  links?: ResourceLink[];
  /** If set, immediately transition to this status after creation */
  initialStatus?: TaskStatus;
}

export interface AddStepOptions {
  taskId: string;
  type: StepType;
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * High-level task management helpers.
 * Other skills should use this instead of calling StateManager directly.
 */
export class TaskManagerSkill {
  constructor(private readonly state: IStateManager) {}

  /**
   * Create a new task associated with an agent.
   * Optionally set its initial status (defaults to 'queued').
   */
  public async createTask(options: CreateTaskOptions): Promise<Task> {
    const task = await this.state.createTask({
      agent_id: options.agentId,
      title: options.title,
      description: options.description,
      links: options.links,
    });

    if (options.initialStatus && options.initialStatus !== 'queued') {
      const updated = await this.state.updateTaskStatus(task.id, options.initialStatus);
      return updated ?? task;
    }

    return task;
  }

  /**
   * Transition a task to a new status.
   */
  public async setStatus(taskId: string, status: TaskStatus): Promise<Task | null> {
    return this.state.updateTaskStatus(taskId, status);
  }

  /**
   * Append a step to a task's timeline.
   */
  public async addStep(options: AddStepOptions): Promise<TaskStep | null> {
    return this.state.addTaskStep({
      task_id: options.taskId,
      type: options.type,
      content: options.content,
      metadata: options.metadata,
    });
  }

  /**
   * Convenience: log a plain text message to a task.
   */
  public async log(taskId: string, content: string, metadata?: Record<string, unknown>): Promise<TaskStep | null> {
    return this.addStep({ taskId, type: 'log', content, metadata });
  }

  /**
   * Convenience: record a tool call on a task.
   */
  public async recordToolCall(
    taskId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<TaskStep | null> {
    return this.addStep({
      taskId,
      type: 'tool_call',
      content: `Tool: ${toolName}`,
      metadata: { tool: toolName, args },
    });
  }

  /**
   * Convenience: record an error on a task and mark it failed.
   */
  public async recordError(taskId: string, message: string): Promise<void> {
    await this.addStep({ taskId, type: 'error', content: message });
    await this.state.updateTaskStatus(taskId, 'failed');
  }

  /**
   * Convenience: mark task done with an optional output message.
   */
  public async complete(taskId: string, output?: string): Promise<void> {
    if (output) {
      await this.addStep({ taskId, type: 'output', content: output });
    }
    await this.state.updateTaskStatus(taskId, 'done');
  }

  /** Retrieve a task by ID. */
  public async getTask(taskId: string): Promise<Task | undefined> {
    if (!this.state.getTask) return undefined;
    return this.state.getTask(taskId);
  }

  /** List all tasks for an agent. */
  public async listForAgent(agentId: string): Promise<Task[]> {
    if (!this.state.listTasksForAgent) return [];
    return this.state.listTasksForAgent(agentId);
  }
}
