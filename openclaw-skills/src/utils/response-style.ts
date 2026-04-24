import type { GatewayConfig } from '../config/default.js';
import type {
  ResponseProfile,
  ResponseVerbosity,
  Task,
  TaskOperatorView,
  TaskStep,
  TaskUpdate,
} from '../types/protocol.js';

const IMPORTANT_STEP_PATTERN =
  /\b(approval|approved|denied|failed|error|complete|completed|success|blocked|timed out|rejected|deploy|merged|pushed|committed|rollback|incident|warning)\b/i;
const MARKDOWN_PREFIX_PATTERN = /^[*\-#>\s`]+/g;
const EMOJI_PREFIX_PATTERN = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/gu;

function visibleStepLimit(verbosity: ResponseVerbosity): number {
  switch (verbosity) {
    case 'terse':
      return 3;
    case 'normal':
      return 6;
    case 'detailed':
      return Number.MAX_SAFE_INTEGER;
  }
}

function sentenceLimit(verbosity: ResponseVerbosity): number {
  switch (verbosity) {
    case 'terse':
      return 1;
    case 'normal':
      return 2;
    case 'detailed':
      return 4;
  }
}

function trimSentenceCount(input: string, maxSentences: number): string {
  const segments = input
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length <= maxSentences) {
    return segments.join(' ');
  }
  return segments.slice(0, maxSentences).join(' ');
}

function sentenceCase(input: string): string {
  if (!input) return input;
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export function normalizeOperatorText(
  input: string,
  profile: ResponseProfile,
  verbosity: ResponseVerbosity,
): string {
  const flattened = input
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(MARKDOWN_PREFIX_PATTERN, ''))
    .join(' ');
  const withoutEmoji = flattened.replace(EMOJI_PREFIX_PATTERN, '');
  const normalizedSpace = withoutEmoji.replace(/\s+/g, ' ').trim();
  if (!normalizedSpace) return input.trim();

  if (profile === 'verbose' || profile === 'debug') {
    return trimSentenceCount(normalizedSpace, sentenceLimit(verbosity));
  }

  const loweredHeader = normalizedSpace.replace(/\b([A-Z][A-Z0-9_ -]{4,})\b/g, (value) => {
    return value.toLowerCase();
  });
  return sentenceCase(trimSentenceCount(loweredHeader, sentenceLimit(verbosity)));
}

function isImportantStep(step: TaskStep): boolean {
  if (step.type === 'error' || step.type === 'output' || step.type === 'tool_call') {
    return true;
  }
  const metadata = step.metadata ?? {};
  if (metadata['requires_approval'] === true || metadata['presentation'] === 'highlight') {
    return true;
  }
  return IMPORTANT_STEP_PATTERN.test(step.content);
}

function buildOperatorSummary(task: Task, steps: TaskStep[]): string {
  const latestImportant = [...steps].reverse().find((step) => isImportantStep(step));
  const latest = latestImportant ?? steps.at(-1);

  if (latest) {
    return latest.content;
  }

  switch (task.status) {
    case 'queued':
      return `${task.title} is queued.`;
    case 'running':
      return `${task.title} is in progress.`;
    case 'done':
      return `${task.title} completed.`;
    case 'failed':
      return `${task.title} failed.`;
  }
}

function buildNextStep(task: Task): string | null {
  switch (task.status) {
    case 'queued':
      return 'Waiting for execution.';
    case 'running':
      return null;
    case 'done':
      return null;
    case 'failed':
      return 'Review the latest error and retry with more detail if needed.';
  }
}

function selectVisibleSteps(steps: TaskStep[], verbosity: ResponseVerbosity): TaskStep[] {
  if (verbosity === 'detailed') {
    return steps;
  }

  const limit = visibleStepLimit(verbosity);
  const selected = new Map<string, TaskStep>();
  const importantSteps = steps.filter((step) => isImportantStep(step));
  const recentImportant = importantSteps.slice(-limit);
  for (const step of recentImportant) {
    selected.set(step.id, step);
  }

  const remaining = limit - selected.size;
  if (remaining > 0) {
    for (const step of steps.slice(-remaining)) {
      selected.set(step.id, step);
    }
  }

  return steps.filter((step) => selected.has(step.id));
}

function buildOperatorView(task: Task, config: GatewayConfig, rawStepCount: number, hiddenStepCount: number): TaskOperatorView {
  return {
    profile: config.responseProfile,
    verbosity: config.responseVerbosity,
    summary: normalizeOperatorText(buildOperatorSummary(task, task.steps), config.responseProfile, config.responseVerbosity),
    next_step: buildNextStep(task),
    hidden_step_count: hiddenStepCount,
    raw_step_count: rawStepCount,
  };
}

export function presentTaskForOperator(task: Task, config: GatewayConfig): Task {
  const normalizedSteps = task.steps.map((step) => ({
    ...step,
    content: normalizeOperatorText(step.content, config.responseProfile, config.responseVerbosity),
  }));
  const visibleSteps = selectVisibleSteps(normalizedSteps, config.responseVerbosity);
  const rawStepCount = normalizedSteps.length;
  const hiddenStepCount = Math.max(0, rawStepCount - visibleSteps.length);
  const visibleTask: Task = {
    ...task,
    steps: visibleSteps,
  };

  return {
    ...visibleTask,
    operator_view: buildOperatorView(
      { ...visibleTask, steps: normalizedSteps },
      config,
      rawStepCount,
      hiddenStepCount,
    ),
  };
}

export function buildTaskUpdate(task: Task, config: GatewayConfig): TaskUpdate {
  const presented = presentTaskForOperator(task, config);
  return {
    id: task.id,
    agent_id: task.agent_id,
    status: task.status,
    title: task.title,
    updated_at: task.updated_at,
    operator_view: presented.operator_view,
  };
}

export function presentTaskStepForOperator(step: TaskStep, config: GatewayConfig): TaskStep {
  return {
    ...step,
    content: normalizeOperatorText(step.content, config.responseProfile, config.responseVerbosity),
  };
}

export function shouldBroadcastTaskStep(step: TaskStep, config: GatewayConfig): boolean {
  if (config.responseVerbosity === 'detailed' || config.responseProfile === 'debug') {
    return true;
  }
  return isImportantStep(step);
}
