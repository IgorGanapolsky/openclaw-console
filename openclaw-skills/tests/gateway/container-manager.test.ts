import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { DockerContainerManager as DockerContainerManagerType } from '../../src/gateway/container-manager.js';

const mockSpawn = jest.fn();

await jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn,
}));

const { DockerContainerManager } = await import('../../src/gateway/container-manager.js');

class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

describe('DockerContainerManager.stopSkill', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  function makeManager(): DockerContainerManagerType {
    return new DockerContainerManager(
      { port: 18789 } as any,
      { getDefaultDevToken: () => 'dev-token' } as any
    );
  }

  it('rejects when docker stop emits an error event', async () => {
    const child = new MockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    const manager = makeManager();
    (manager as any).activeContainers.set('skill-a', 'container-a');

    const stopPromise = manager.stopSkill('skill-a');
    const error = new Error('docker unavailable');
    child.emit('error', error);

    await expect(stopPromise).rejects.toThrow('docker unavailable');
    expect((manager as any).activeContainers.get('skill-a')).toBe('container-a');
  });

  it('clears the active container after a successful stop', async () => {
    const child = new MockChildProcess();
    mockSpawn.mockReturnValue(child as any);

    const manager = makeManager();
    (manager as any).activeContainers.set('skill-b', 'container-b');

    const stopPromise = manager.stopSkill('skill-b');
    child.emit('close', 0);

    await expect(stopPromise).resolves.toBeUndefined();
    expect((manager as any).activeContainers.has('skill-b')).toBe(false);
  });
});
