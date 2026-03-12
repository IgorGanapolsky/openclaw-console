/**
 * Rubric-Based Reward Engine
 *
 * Composable rubric evaluation framework for RL reward signals.
 * Replaces scalar scoring with structured, multi-dimensional rubrics.
 */

// ---------------------------------------------------------------------------
// Built-in Rubric Definitions
// ---------------------------------------------------------------------------

const AGENT_PERFORMANCE_RUBRIC = {
  name: 'agent-performance',
  version: '1.0.0',
  description: 'Evaluate AI agent task execution quality',
  dimensions: [
    {
      name: 'taskCompletion',
      description: 'Did the agent complete the requested task?',
      weight: 0.3,
      scale: { min: 1, max: 5 },
      nonVerifiable: false,
      criteria: [
        { score: 1, description: 'Task not attempted or completely wrong' },
        { score: 2, description: 'Partial attempt, major requirements missed' },
        { score: 3, description: 'Core task done but secondary requirements missed' },
        { score: 4, description: 'Task completed with minor gaps' },
        { score: 5, description: 'All requirements fully satisfied' },
      ],
    },
    {
      name: 'minimalDiff',
      description: 'Did it touch only necessary code?',
      weight: 0.2,
      scale: { min: 1, max: 5 },
      nonVerifiable: false,
      criteria: [
        { score: 1, description: 'Rewrote unrelated files, massive unnecessary changes' },
        { score: 2, description: 'Significant unrelated changes mixed in' },
        { score: 3, description: 'Some unnecessary changes but mostly focused' },
        { score: 4, description: 'Tight diff with minor extra touches' },
        { score: 5, description: 'Surgical — only necessary lines changed' },
      ],
    },
    {
      name: 'conventionAdherence',
      description: 'Did it follow project patterns?',
      weight: 0.2,
      scale: { min: 1, max: 5 },
      nonVerifiable: true,
      criteria: [
        { score: 1, description: 'Ignored all project conventions' },
        { score: 2, description: 'Some conventions followed, major violations' },
        { score: 3, description: 'Mostly follows conventions with notable gaps' },
        { score: 4, description: 'Consistent with project patterns' },
        { score: 5, description: 'Perfectly matches existing style and patterns' },
      ],
    },
    {
      name: 'verification',
      description: 'Did it verify its work (run tests, check output)?',
      weight: 0.15,
      scale: { min: 1, max: 5 },
      nonVerifiable: false,
      criteria: [
        { score: 1, description: 'No verification at all' },
        { score: 2, description: 'Claimed success without evidence' },
        { score: 3, description: 'Basic verification (syntax check only)' },
        { score: 4, description: 'Ran tests and checked output' },
        { score: 5, description: 'Full verification with evidence (logs, diffs, test output)' },
      ],
    },
    {
      name: 'communication',
      description: 'Was the response clear and appropriately concise?',
      weight: 0.15,
      scale: { min: 1, max: 5 },
      nonVerifiable: true,
      criteria: [
        { score: 1, description: 'Incomprehensible or massively over-explained' },
        { score: 2, description: 'Confusing or unnecessarily verbose' },
        { score: 3, description: 'Understandable but could be more concise' },
        { score: 4, description: 'Clear and well-structured response' },
        { score: 5, description: 'Concise, precise, and well-organized' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

function normalizeScore(rawScore, scale) {
  const clamped = Math.max(scale.min, Math.min(scale.max, rawScore));
  return (clamped - scale.min) / (scale.max - scale.min);
}

function evaluateWithRubric(rubric, scores) {
  let aggregate = 0;
  let nonVerifiableWeight = 0;
  const dimensionResults = [];

  for (const dim of rubric.dimensions) {
    const rawScore = scores[dim.name] || dim.scale.min;
    const normalized = normalizeScore(rawScore, dim.scale);
    const weighted = normalized * dim.weight;

    aggregate += weighted;

    if (dim.nonVerifiable) {
      nonVerifiableWeight += dim.weight;
    }

    dimensionResults.push({
      name: dim.name,
      rawScore,
      normalizedScore: normalized,
      weightedScore: weighted,
      weight: dim.weight,
      nonVerifiable: !!dim.nonVerifiable,
    });
  }

  return {
    aggregate,
    dimensions: dimensionResults,
    nonVerifiableWeight,
  };
}

function formatRubricReport(rubric, scores, result) {
  const lines = [];
  lines.push(`Rubric: ${rubric.name} v${rubric.version}`);
  lines.push('─'.repeat(50));

  for (const dimResult of result.dimensions) {
    const dim = rubric.dimensions.find((d) => d.name === dimResult.name);
    const pct = (dimResult.weight * 100).toFixed(0);
    lines.push(`${dimResult.name} (${pct}%): ${dimResult.rawScore}/${dim.scale.max}`);
  }

  lines.push('─'.repeat(50));
  lines.push(`Aggregate Score: ${result.aggregate.toFixed(3)} / 1.000`);
  return lines.join('\n');
}

module.exports = {
  normalizeScore,
  evaluateWithRubric,
  formatRubricReport,
  AGENT_PERFORMANCE_RUBRIC,
};
