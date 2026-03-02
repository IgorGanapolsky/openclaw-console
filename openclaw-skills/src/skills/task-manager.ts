/**
 * Task Manager Skill
 *
 * Provides a high-level API for other skills to create, update,
 * and annotate tasks. Wraps StateManager with task-specific helpers.
 */

import type { Task, TaskStatus, TaskStep, StepType, ResourceLink } from '../types/protocol.js';
import type { StateManager } from '../gateway/state.js';

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
  constructor(private readonly state: StateManager) {}

  /**
   * Create a new task associated with an agent.
   * Optionally set its initial status (defaults to 'queued').
   */
  public createTask(options: CreateTaskOptions): Task {
    const task = this.state.createTask({
      agent_id: options.agentId,
      title: options.title,
      description: options.description,
      links: options.links,
    });

    if (options.initialStatus && options.initialStatus !== 'queued') {
      return this.state.updateTaskStatus(task.id, options.initialStatus) ?? task;
    }

    return task;
  }

  /**
   * Transition a task to a new status.
   */
  public setStatus(taskId: string, status: TaskStatus): Task | null {
    return this.state.updateTaskStatus(taskId, status);
  }

  /**
   * Append a step to a task's timeline.
   */
  public addStep(options: AddStepOptions): TaskStep | null {
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
  public log(taskId: string, content: string, metadata?: Record<string, unknown>): TaskStep | null {
    return this.addStep({ taskId, type: 'log', content, metadata });
  }

  /**
   * Convenience: record a tool call on a task.
   */
  public recordToolCall(
    taskId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): TaskStep | null {
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
  public recordError(taskId: string, message: string): void {
    this.addStep({ taskId, type: 'error', content: message });
    this.state.updateTaskStatus(taskId, 'failed');
  }

  /**
   * Convenience: mark task done with an optional output message.
   */
  public complete(taskId: string, output?: string): void {
    if (output) {
      this.addStep({ taskId, type: 'output', content: output });
    }
    this.state.updateTaskStatus(taskId, 'done');
  }

  /** Retrieve a task by ID. */
  public getTask(taskId: string): Task | undefined {
    return this.state.getTask(taskId);
  }

  /** List all tasks for an agent. */
  public listForAgent(agentId: string): Task[] {
    return this.state.listTasksForAgent(agentId);
  }
}
