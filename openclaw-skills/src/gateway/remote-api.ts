import type { Express, Request, RequestHandler, Response } from 'express';
import type { StateManager } from './state.js';
import type { AgentStatus, TaskStatus, StepType } from '../types/protocol.js';

/**
 * remoteApi — Express router to expose StateManager for remote/containerized skills.
 */
export function registerRemoteApi(app: Express, state: StateManager, auth: RequestHandler): void {
  
  // Update Agent Status
  app.post('/api/remote/agents/:id/status', auth, async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { status } = req.body as { status: AgentStatus };
    const agent = await state.updateAgentStatus(id, status);
    res.json(agent);
  });

  // Create Task
  app.post('/api/remote/tasks', auth, async (req: Request, res: Response) => {
    const task = await state.createTask(req.body);
    res.json(task);
  });

  // Update Task Status
  app.post('/api/remote/tasks/:id/status', auth, async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { status } = req.body as { status: TaskStatus };
    const task = await state.updateTaskStatus(id, status);
    res.json(task);
  });

  // Add Task Step
  app.post('/api/remote/tasks/:id/steps', auth, async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { type, content, metadata } = req.body as { type: StepType; content: string; metadata?: Record<string, unknown> };
    const step = await state.addTaskStep({ task_id: id, type, content, metadata });
    res.json(step);
  });

  // Create Incident
  app.post('/api/remote/incidents', auth, async (req: Request, res: Response) => {
    const incident = await state.createIncident(req.body);
    res.json(incident);
  });

  // Update Incident Status
  app.post('/api/remote/incidents/:id/status', auth, async (req: Request, res: Response) => {
    const id = String(req.params['id'] ?? '');
    const { status } = req.body;
    const incident = await state.updateIncidentStatus(id, status);
    res.json(incident);
  });

  // Queue Approval (Long-polling)
  app.post('/api/remote/approvals/queue', auth, async (req: Request, res: Response) => {
    try {
      const { request, timeoutMs } = req.body;
      const response = await state.queueApproval(request, timeoutMs);
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approval request timed out';
      res.status(408).json({ error: message });
    }
  });

  console.info('[remote-api] Registered routes for isolated skills');
}
