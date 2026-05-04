import { describe, expect, test } from '@jest/globals';
import {
  normalizeSkillWorkflowSystem,
  validateSkillWorkflowSystem,
} from '../src/gateway/skill-workflow.js';

describe('skill workflow systems', () => {
  test('normalizes a modular orchestrator workflow with handoffs and checkpoints', () => {
    const workflow = normalizeSkillWorkflowSystem({
      agent_id: 'agent-skill-system',
      name: 'Video-to-brief orchestrator',
      trigger_prompt: 'Create a strategic brief from a video URL',
      steps: [
        {
          skill_name: 'transcript-extractor',
          input_requirements: ['video_url'],
          output_contract: ['clean transcript markdown'],
          produces: ['transcript_md'],
        },
        {
          skill_name: 'strategy-synthesizer',
          consumes_from: ['transcript_md'],
          input_requirements: ['transcript_md', 'business_goal'],
          output_contract: ['ranked high-ROI item list'],
          produces: ['roi_items'],
          human_checkpoint: true,
        },
      ],
      checkpoints: [
        {
          title: 'Approve high-ROI item list',
          after_step_id: 'step-2',
          required: true,
          approval_action_type: 'propose_fix',
        },
      ],
      artifacts: [
        {
          label: 'Operator dashboard',
          type: 'html',
          path: 'artifacts/operator-dashboard.html',
        },
      ],
    });

    expect(workflow.validation.valid).toBe(true);
    expect(workflow.validation.ordered_step_ids).toEqual(['step-1', 'step-2']);
    expect(workflow.checkpoints[0]?.required).toBe(true);
    expect(workflow.artifacts[0]?.type).toBe('html');
  });

  test('rejects handoffs that consume unavailable outputs', () => {
    const validation = validateSkillWorkflowSystem({
      steps: [
        {
          id: 'step-1',
          order: 1,
          skill_name: 'newsletter-writer',
          title: 'Write newsletter',
          input_requirements: ['transcript_md'],
          consumes_from: ['transcript_md'],
          output_contract: ['newsletter markdown'],
          produces: ['newsletter_md'],
          human_checkpoint: false,
          artifacts: [],
        },
      ],
      checkpoints: [],
      artifacts: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]).toContain('before any earlier step produces');
    expect(validation.warnings).toContain('No required human-in-the-loop checkpoint is declared.');
  });
});
