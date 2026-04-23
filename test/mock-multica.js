#!/usr/bin/env node

/**
 * Mock Multica Service for Testing OpenClaw Integration
 * Implements basic API endpoints to validate the bridge functionality
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json());

// Mock data storage
let issues = [];
let agents = [
  { id: 'github-ops', name: 'GitHub Ops', status: 'online' },
  { id: 'deploy-manager', name: 'Deploy Manager', status: 'online' },
  { id: 'trading-bot', name: 'Trading Bot', status: 'busy' }
];

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'mock-multica', version: '1.0.0' });
});

// Agents endpoints
app.get('/api/agents', (req, res) => {
  res.json(agents);
});

app.get('/api/agents/:id', (req, res) => {
  const agent = agents.find(a => a.id === req.params.id);
  if (agent) {
    res.json(agent);
  } else {
    res.status(404).json({ error: 'Agent not found' });
  }
});

// Issues endpoints (core functionality)
app.post('/api/issues', (req, res) => {
  console.log('Creating issue:', JSON.stringify(req.body, null, 2));

  const issue = {
    id: `issue-${Date.now()}`,
    title: req.body.title,
    description: req.body.description,
    status: 'Todo',
    priority: req.body.priority || 'Medium',
    assignee: req.body.agent_id,
    labels: req.body.labels || [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    comments: []
  };

  issues.push(issue);

  // Simulate webhook after creating issue
  setTimeout(() => {
    console.log('Sending webhook for issue creation...');
    // In real implementation, this would send to webhook URL
  }, 1000);

  res.json({ ok: true, issue });
});

app.get('/api/issues', (req, res) => {
  res.json({ issues, total: issues.length });
});

app.get('/api/issues/:id', (req, res) => {
  const issue = issues.find(i => i.id === req.params.id);
  if (issue) {
    res.json(issue);
  } else {
    res.status(404).json({ error: 'Issue not found' });
  }
});

app.patch('/api/issues/:id', (req, res) => {
  const issue = issues.find(i => i.id === req.params.id);
  if (issue) {
    Object.assign(issue, req.body, { updated_at: new Date().toISOString() });
    console.log('Updated issue:', JSON.stringify(issue, null, 2));
    res.json(issue);
  } else {
    res.status(404).json({ error: 'Issue not found' });
  }
});

// Issue comments
app.post('/api/issues/:id/comments', (req, res) => {
  const issue = issues.find(i => i.id === req.params.id);
  if (issue) {
    const comment = {
      id: `comment-${Date.now()}`,
      issue_id: req.params.id,
      content: req.body.content,
      author: req.body.author || 'unknown',
      created_at: new Date().toISOString()
    };

    issue.comments = issue.comments || [];
    issue.comments.push(comment);

    console.log('Added comment to issue:', comment);
    res.json({ ok: true, comment });
  } else {
    res.status(404).json({ error: 'Issue not found' });
  }
});

// Executions endpoints (for testing approval workflows)
app.post('/api/issues/:id/execute', (req, res) => {
  const issue = issues.find(i => i.id === req.params.id);
  if (issue) {
    const execution = {
      id: `exec-${Date.now()}`,
      issue_id: req.params.id,
      agent_id: issue.assignee,
      status: 'pending',
      tool_calls: [
        {
          id: `tool-${Date.now()}`,
          tool_name: 'shell_command',
          parameters: { command: 'echo "test dangerous action"' },
          timestamp: new Date().toISOString()
        }
      ],
      started_at: new Date().toISOString()
    };

    console.log('Created execution:', JSON.stringify(execution, null, 2));

    // Simulate webhook for execution started
    setTimeout(() => {
      console.log('Would send execution.started webhook');
    }, 500);

    res.json(execution);
  } else {
    res.status(404).json({ error: 'Issue not found' });
  }
});

// Autopilot endpoints
app.post('/api/autopilot', (req, res) => {
  const autopilotRun = {
    id: `autopilot-${Date.now()}`,
    name: req.body.name,
    agent_id: req.body.agent_id,
    schedule: req.body.schedule,
    prompt: req.body.prompt,
    enabled: req.body.enabled,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  console.log('Created autopilot run:', JSON.stringify(autopilotRun, null, 2));
  res.json(autopilotRun);
});

app.get('/api/autopilot', (req, res) => {
  res.json([]); // Empty for now
});

// Catch-all for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body);
  res.status(404).json({
    error: 'Endpoint not implemented in mock',
    method: req.method,
    path: req.path,
    available_endpoints: [
      'GET /api/health',
      'GET /api/agents',
      'POST /api/issues',
      'GET /api/issues',
      'PATCH /api/issues/:id',
      'POST /api/issues/:id/comments',
      'POST /api/issues/:id/execute'
    ]
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🧪 Mock Multica Service running on port ${PORT}`);
  console.log('Available endpoints:');
  console.log('  GET  /api/health');
  console.log('  GET  /api/agents');
  console.log('  POST /api/issues');
  console.log('  GET  /api/issues');
  console.log('  And more...');
});