import type { Express, Request, Response } from 'express';
import type { StateManager } from './state.js';
import type { AgentStatus, TaskStatus, StepType } from '../types/protocol.js';

/**
 * remoteApi — Express router to expose StateManager for remote/containerized skills.
 */
export function registerRemoteApi(app: Express, state: StateManager): void {
  
  // Update Agent Status
  app.post('/api/remote/agents/:id/status', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { status } = req.body as { status: AgentStatus };
    const agent = state.updateAgentStatus(id, status);
    res.json(agent);
  });

  // Create Task
  app.post('/api/remote/tasks', (req: Request, res: Response) => {
    const task = state.createTask(req.body);
    res.json(task);
  });

  // Update Task Status
  app.post('/api/remote/tasks/:id/status', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { status } = req.body as { status: TaskStatus };
    const task = state.updateTaskStatus(id, status);
    res.json(task);
  });

  // Add Task Step
  app.post('/api/remote/tasks/:id/steps', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { type, content, metadata } = req.body as { type: StepType; content: string; metadata?: Record<string, unknown> };
    const step = state.addTaskStep({ task_id: id, type, content, metadata });
    res.json(step);
  });

  // Create Incident
  app.post('/api/remote/incidents', (req: Request, res: Response) => {
    const incident = state.createIncident(req.body);
    res.json(incident);
  });

  // Update Incident Status
  app.post('/api/remote/incidents/:id/status', (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { status } = req.body;
    const incident = state.updateIncidentStatus(id, status);
    res.json(incident);
  });

  console.info('[remote-api] Registered routes for isolated skills');
}
