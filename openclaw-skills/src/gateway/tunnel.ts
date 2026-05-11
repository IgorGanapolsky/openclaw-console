import { spawn, type ChildProcess } from 'node:child_process';

export interface TunnelStatus {
  url: string | null;
  isActive: boolean;
}

export class TunnelManager {
  private process: ChildProcess | null = null;
  private publicUrl: string | null = null;
  private readonly localUrl: string;

  constructor(port: number) {
    this.localUrl = `http://localhost:${port}`;
  }

  async start(): Promise<string> {
    if (this.process) {
      return this.publicUrl || '';
    }

    return new Promise((resolve, reject) => {
      console.info(`[tunnel] Starting Cloudflare tunnel for ${this.localUrl}...`);
      
      this.process = spawn('cloudflared', [
        'tunnel',
        '--url', this.localUrl,
        '--no-autoupdate'
      ], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const timeout = setTimeout(() => {
        if (!this.publicUrl) {
          this.stop();
          reject(new Error('Cloudflare tunnel startup timed out after 30s'));
        }
      }, 30000);

      this.process.stderr?.on('data', (data) => {
        const output = data.toString();
        // Cloudflare prints the URL to stderr
        const match = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (match && !this.publicUrl) {
          const url = match[0];
          this.publicUrl = url;
          console.info(`[tunnel] Public URL established: ${url}`);
          clearTimeout(timeout);
          resolve(url);
        }
      });

      this.process.on('error', (err) => {
        console.error('[tunnel] Failed to start cloudflared:', err);
        clearTimeout(timeout);
        reject(err);
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && !this.publicUrl) {
          console.error(`[tunnel] cloudflared exited with code ${code}`);
          clearTimeout(timeout);
          reject(new Error(`cloudflared exited with code ${code}`));
        }
        this.isActive = false;
      });
    });
  }

  private isActive = true;

  getStatus(): TunnelStatus {
    return {
      url: this.publicUrl,
      isActive: this.isActive && !!this.process && this.process.exitCode === null
    };
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.publicUrl = null;
      this.isActive = false;
      console.info('[tunnel] Cloudflare tunnel stopped');
    }
  }
}
