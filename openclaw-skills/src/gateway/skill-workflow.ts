import crypto from 'node:crypto';
import type {
  ActionType,
  SkillWorkflowArtifact,
  SkillWorkflowCheckpoint,
  SkillWorkflowStep,
  SkillWorkflowSystem,
  SkillWorkflowValidation,
} from '../types/protocol.js';

export interface SkillWorkflowUpsertRequest {
  id?: string;
  agent_id: string;
  name: string;
  description?: string;
  version?: string;
  trigger_prompt: string;
  status?: SkillWorkflowSystem['status'];
  steps: Array<Partial<SkillWorkflowStep> & {
    skill_name: string;
    title?: string;
  }>;
  checkpoints?: Array<Partial<SkillWorkflowCheckpoint> & {
    title: string;
    after_step_id: string;
  }>;
  artifacts?: Array<Partial<SkillWorkflowArtifact> & {
    label: string;
    type: SkillWorkflowArtifact['type'];
  }>;
  metadata?: Record<string, unknown>;
}

export function normalizeSkillWorkflowSystem(
  input: SkillWorkflowUpsertRequest,
  existing?: SkillWorkflowSystem,
): SkillWorkflowSystem {
  const now = new Date().toISOString();
  const steps = normalizeSteps(input.steps ?? []);
  const checkpoints = normalizeCheckpoints(input.checkpoints ?? []);
  const artifacts = normalizeArtifacts(input.artifacts ?? []);
  const workflow: SkillWorkflowSystem = {
    id: input.id?.trim() || existing?.id || stableWorkflowId(input.agent_id, input.name),
    agent_id: input.agent_id,
    name: input.name.trim(),
    description: input.description?.trim() || existing?.description || '',
    version: input.version?.trim() || existing?.version || '1.0.0',
    trigger_prompt: input.trigger_prompt.trim(),
    status: input.status ?? existing?.status ?? 'draft',
    steps,
    checkpoints,
    artifacts,
    validation: validateSkillWorkflowSystem({
      steps,
      checkpoints,
      artifacts,
    }),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    metadata: input.metadata ?? existing?.metadata ?? {},
  };
  return workflow;
}

export function validateSkillWorkflowSystem(input: {
  steps: SkillWorkflowStep[];
  checkpoints: SkillWorkflowCheckpoint[];
  artifacts: SkillWorkflowArtifact[];
}): SkillWorkflowValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const orderedSteps = [...input.steps].sort((left, right) => left.order - right.order);
  const stepIds = new Set<string>();
  const producedOutputs = new Set<string>();

  if (orderedSteps.length === 0) {
    errors.push('At least one workflow step is required.');
  }

  for (const step of orderedSteps) {
    if (stepIds.has(step.id)) {
      errors.push(`Duplicate step id: ${step.id}`);
    }
    stepIds.add(step.id);
    if (!step.skill_name.trim()) errors.push(`Step ${step.id} is missing skill_name.`);
    if (step.input_requirements.length === 0) warnings.push(`Step ${step.id} has no input requirements.`);
    if (step.output_contract.length === 0) errors.push(`Step ${step.id} is missing output_contract.`);
    if (step.produces.length === 0) warnings.push(`Step ${step.id} does not declare produced handoff keys.`);
    for (const dependency of step.consumes_from) {
      if (!producedOutputs.has(dependency)) {
        errors.push(`Step ${step.id} consumes "${dependency}" before any earlier step produces it.`);
      }
    }
    for (const output of step.produces) {
      producedOutputs.add(output);
    }
  }

  for (const checkpoint of input.checkpoints) {
    if (!stepIds.has(checkpoint.after_step_id)) {
      errors.push(`Checkpoint ${checkpoint.id} references missing step ${checkpoint.after_step_id}.`);
    }
  }

  if (!input.checkpoints.some((checkpoint) => checkpoint.required)) {
    warnings.push('No required human-in-the-loop checkpoint is declared.');
  }
  if (input.artifacts.length === 0 && !orderedSteps.some((step) => step.artifacts.length > 0)) {
    warnings.push('No visual/result artifact is declared.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    ordered_step_ids: orderedSteps.map((step) => step.id),
  };
}

function normalizeSteps(steps: SkillWorkflowUpsertRequest['steps']): SkillWorkflowStep[] {
  return steps.map((step, index) => ({
    id: step.id?.trim() || `step-${index + 1}`,
    order: Number.isInteger(step.order) ? Number(step.order) : index + 1,
    skill_name: step.skill_name.trim(),
    title: step.title?.trim() || step.skill_name.trim(),
    input_requirements: normalizeStrings(step.input_requirements),
    consumes_from: normalizeStrings(step.consumes_from),
    output_contract: normalizeStrings(step.output_contract),
    produces: normalizeStrings(step.produces),
    human_checkpoint: step.human_checkpoint ?? false,
    artifacts: normalizeArtifacts(step.artifacts ?? []),
  }));
}

function normalizeCheckpoints(checkpoints: SkillWorkflowUpsertRequest['checkpoints']): SkillWorkflowCheckpoint[] {
  return (checkpoints ?? []).map((checkpoint, index) => ({
    id: checkpoint.id?.trim() || `checkpoint-${index + 1}`,
    title: checkpoint.title.trim(),
    after_step_id: checkpoint.after_step_id.trim(),
    required: checkpoint.required ?? true,
    approval_action_type: normalizeActionType(checkpoint.approval_action_type),
  }));
}

function normalizeArtifacts(artifacts: SkillWorkflowUpsertRequest['artifacts']): SkillWorkflowArtifact[] {
  return (artifacts ?? []).map((artifact, index) => ({
    id: artifact.id?.trim() || `artifact-${index + 1}`,
    label: artifact.label.trim(),
    type: artifact.type,
    path: artifact.path?.trim() || undefined,
    url: artifact.url?.trim() || undefined,
  }));
}

function normalizeStrings(values: unknown): string[] {
  return Array.isArray(values)
    ? values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim())
    : [];
}

function normalizeActionType(value: unknown): ActionType | undefined {
  return typeof value === 'string' && [
    'deploy',
    'shell_command',
    'config_change',
    'key_rotation',
    'trade_execution',
    'destructive',
    'ask_root_cause',
    'propose_fix',
    'acknowledge',
    'git_commit',
    'git_merge',
    'git_push',
    'agent_skill_install',
    'agent_rollback',
  ].includes(value) ? value as ActionType : undefined;
}

function stableWorkflowId(agentId: string, name: string): string {
  const hash = crypto.createHash('sha256').update(`${agentId}:${name}`).digest('hex').slice(0, 10);
  return `skill-workflow:${slugify(name)}:${hash}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'workflow';
}
