import { spawn } from 'child_process';
import type { GatewayConfig } from '../config/default.js';

export interface ContainerOptions {
  agentId: string;
  skillName: string;
  env?: Record<string, string>;
}

/**
 * DockerContainerManager — Orchestrates isolated "Nanoclaw-style" skills.
 * Each skill runs in its own container with zero knowledge of others.
 */
export class DockerContainerManager {
  private activeContainers: Map<string, string> = new Map(); // skillName -> containerId

  constructor(private config: GatewayConfig) {}

  /**
   * Start a skill in a dedicated Docker container.
   */
  public async startSkill(options: ContainerOptions): Promise<void> {
    const { skillName, agentId, env = {} } = options;
    
    console.info(`[docker] Starting isolated skill: ${skillName} for agent ${agentId}`);

    const containerName = `openclaw-skill-${skillName}`;
    const gatewayUrl = `http://host.docker.internal:${this.config.port}`;

    const args = [
      'run', '-d',
      '--name', containerName,
      '--rm', // Remove container on stop
      '--add-host=host.docker.internal:host-gateway', // Let container reach host
      '-e', `AGENT_ID=${agentId}`,
      '-e', `SKILL_NAME=${skillName}`,
      '-e', `GATEWAY_URL=${gatewayUrl}`,
      ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      'openclaw-skill-base' // We'll need to build this image
    ];

    return new Promise((resolve, reject) => {
      const docker = spawn('docker', args);
      let output = '';
      let error = '';

      docker.stdout.on('data', (data) => { output += data.toString(); });
      docker.stderr.on('data', (data) => { error += data.toString(); });

      docker.on('close', (code) => {
        if (code === 0) {
          const containerId = output.trim();
          this.activeContainers.set(skillName, containerId);
          console.info(`[docker] Skill ${skillName} started in container ${containerId.slice(0, 12)}`);
          resolve();
        } else {
          console.error(`[docker] Failed to start skill ${skillName}: ${error}`);
          reject(new Error(error));
        }
      });
    });
  }

  /**
   * Stop an isolated skill container.
   */
  public async stopSkill(skillName: string): Promise<void> {
    const containerId = this.activeContainers.get(skillName);
    if (!containerId) return;

    console.info(`[docker] Stopping isolated skill: ${skillName}`);

    return new Promise((resolve) => {
      const docker = spawn('docker', ['stop', containerId]);
      docker.on('close', () => {
        this.activeContainers.delete(skillName);
        resolve();
      });
    });
  }

  /**
   * Build the base image for isolated skills.
   */
  public async buildBaseImage(): Promise<void> {
    console.info('[docker] Building base image for isolated skills...');
    
    return new Promise((resolve, reject) => {
      const docker = spawn('docker', ['build', '-t', 'openclaw-skill-base', '-f', 'Dockerfile.skill', '.']);
      
      docker.on('close', (code) => {
        if (code === 0) {
          console.info('[docker] Base image built successfully');
          resolve();
        } else {
          reject(new Error('Failed to build Docker base image'));
        }
      });
    });
  }
}
