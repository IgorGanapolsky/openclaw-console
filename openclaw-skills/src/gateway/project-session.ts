import crypto from 'node:crypto';
import path from 'node:path';
import type { BridgeSession } from '../types/protocol.js';

export interface ProjectBridgeSessionMetadata {
  original_session_id: string;
  project_name: string;
  project_root: string;
  project_session_id: string;
  session_scope: 'project';
}

type BridgeSessionControls = NonNullable<BridgeSession['controls']>;

export function normalizeProjectBridgeSession(input: BridgeSession): BridgeSession {
  const cwd = input.cwd || process.cwd();
  const projectName = slugify(path.basename(cwd) || 'workspace');
  const projectHash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 10);
  const projectSessionId = `project:${projectName}:${projectHash}`;
  const originalSessionId = typeof input.metadata?.['original_session_id'] === 'string'
    ? input.metadata['original_session_id']
    : input.id;
  const metadata = {
    ...input.metadata,
    original_session_id: originalSessionId,
    project_name: projectName,
    project_root: cwd,
    project_session_id: projectSessionId,
    session_scope: 'project',
  } satisfies BridgeSession['metadata'] & ProjectBridgeSessionMetadata;

  return {
    ...input,
    id: projectSessionId,
    title: input.title || `OpenClaw: ${projectName}`,
    cwd,
    lifecycle: input.lifecycle ?? (input.closed ? 'completed' : 'running'),
    controls: normalizeBridgeControls(input),
    metadata,
  };
}

export type BridgeSessionControlAction = 'cancel' | 'pause' | 'resume' | 'hibernate' | 'share_readonly';

export function isBridgeSessionControlAction(value: unknown): value is BridgeSessionControlAction {
  return typeof value === 'string' && ['cancel', 'pause', 'resume', 'hibernate', 'share_readonly'].includes(value);
}

export function applyBridgeSessionControl(
  session: BridgeSession,
  action: BridgeSessionControlAction,
  params: { readOnlyShareUrl?: string; actor?: string } = {},
): BridgeSession {
  const now = new Date().toISOString();
  const controls = normalizeBridgeControls(session);
  const metadata = {
    ...session.metadata,
    last_control_action: action,
    last_control_actor: params.actor ?? 'gateway',
    last_control_at: now,
  };

  if (action === 'cancel') {
    if (!controls.can_cancel) return { ...session, controls, metadata };
    return {
      ...session,
      closed: true,
      lifecycle: 'cancelled',
      updated_at: now,
      controls: { ...controls, can_cancel: false, can_pause: false, can_resume: false, can_hibernate: false },
      metadata,
    };
  }

  if (action === 'pause') {
    if (!controls.can_pause) return { ...session, controls, metadata };
    return {
      ...session,
      lifecycle: 'paused',
      updated_at: now,
      controls: { ...controls, can_pause: false, can_resume: true },
      execution: {
        ...session.execution,
        provider: session.execution?.provider ?? 'other',
        sandbox_state: 'paused',
      },
      metadata,
    };
  }

  if (action === 'resume') {
    if (!controls.can_resume) return { ...session, controls, metadata };
    return {
      ...session,
      closed: false,
      lifecycle: 'running',
      updated_at: now,
      controls: { ...controls, can_pause: true, can_resume: false },
      execution: {
        ...session.execution,
        provider: session.execution?.provider ?? 'other',
        sandbox_state: 'running',
      },
      metadata,
    };
  }

  if (action === 'hibernate') {
    if (!controls.can_hibernate) return { ...session, controls, metadata };
    return {
      ...session,
      lifecycle: 'hibernated',
      updated_at: now,
      controls: { ...controls, can_pause: false, can_resume: true },
      execution: {
        ...session.execution,
        provider: session.execution?.provider ?? 'other',
        sandbox_state: 'hibernated',
      },
      metadata,
    };
  }

  if (!controls.can_share_readonly || !params.readOnlyShareUrl) {
    return { ...session, controls, metadata };
  }
  return {
    ...session,
    updated_at: now,
    controls,
    execution: {
      ...session.execution,
      provider: session.execution?.provider ?? 'other',
      read_only_share_url: params.readOnlyShareUrl,
    },
    metadata,
  };
}

function normalizeBridgeControls(session: BridgeSession): BridgeSessionControls {
  const lifecycle = session.lifecycle ?? (session.closed ? 'completed' : 'running');
  const active = !session.closed && !['cancelled', 'failed', 'completed'].includes(lifecycle);
  return {
    can_cancel: session.controls?.can_cancel ?? active,
    can_pause: session.controls?.can_pause ?? (active && lifecycle === 'running'),
    can_resume: session.controls?.can_resume ?? (lifecycle === 'paused' || lifecycle === 'hibernated'),
    can_hibernate: session.controls?.can_hibernate ?? active,
    can_share_readonly: session.controls?.can_share_readonly ?? true,
  };
}

function slugify(value: string): string {
  let slug = '';
  let pendingSeparator = false;

  for (const character of value.toLowerCase()) {
    const code = character.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    const isSafePunctuation = character === '.' || character === '_' || character === '-';

    if (isLowercaseLetter || isDigit || isSafePunctuation) {
      if (pendingSeparator && slug.length > 0 && slug.at(-1) !== '-') {
        slug += '-';
      }
      slug += character;
      pendingSeparator = false;
    } else {
      pendingSeparator = true;
    }
  }

  return trimHyphens(slug) || 'workspace';
}

function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === '-') {
    start += 1;
  }

  while (end > start && value[end - 1] === '-') {
    end -= 1;
  }

  return value.slice(start, end);
}
