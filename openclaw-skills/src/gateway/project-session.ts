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
    metadata,
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
