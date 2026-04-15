import { describe, expect, jest, test } from '@jest/globals';
import DEFAULT_CONFIG from '../src/config/default.js';
import { getConfiguredLocalModel, probeLocalModelProvider } from '../src/gateway/model-provider.js';
import type { GatewayConfig } from '../src/config/default.js';

function config(overrides: Partial<GatewayConfig>): GatewayConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('local model provider', () => {
  test('reports disabled when endpoint or model is missing', () => {
    const status = getConfiguredLocalModel(config({ localModelBaseUrl: null, localModelName: null }));

    expect(status.enabled).toBe(false);
    expect(status.base_url).toBeNull();
    expect(status.model).toBeNull();
  });

  test('probes /v1/models for OpenAI-compatible local servers', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const status = await probeLocalModelProvider(
      config({
        localModelBaseUrl: 'http://127.0.0.1:8000',
        localModelName: 'local/nemotron',
      }),
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('http://127.0.0.1:8000/v1/models');
    expect(status.enabled).toBe(true);
    expect(status.reachable).toBe(true);
    expect(status.error).toBeNull();
  });

  test('returns degraded status on failed probe', async () => {
    const fetchImpl = jest.fn<typeof fetch>().mockRejectedValue(new Error('connection refused'));

    const status = await probeLocalModelProvider(
      config({
        localModelBaseUrl: 'http://127.0.0.1:8000',
        localModelName: 'local/nemotron',
      }),
      fetchImpl,
    );

    expect(status.enabled).toBe(true);
    expect(status.reachable).toBe(false);
    expect(status.error).toContain('connection refused');
  });
});
