import type { GatewayConfig } from '../config/default.js';

export interface LocalModelProviderStatus {
  enabled: boolean;
  base_url: string | null;
  model: string | null;
  reachable: boolean;
  latency_ms: number | null;
  checked_at: string;
  error: string | null;
}

export function getConfiguredLocalModel(config: GatewayConfig): Pick<LocalModelProviderStatus, 'enabled' | 'base_url' | 'model'> {
  return {
    enabled: Boolean(config.localModelBaseUrl && config.localModelName),
    base_url: config.localModelBaseUrl,
    model: config.localModelName,
  };
}

export async function probeLocalModelProvider(
  config: GatewayConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<LocalModelProviderStatus> {
  const configured = getConfiguredLocalModel(config);
  const checkedAt = new Date().toISOString();
  if (!configured.enabled || !configured.base_url) {
    return {
      ...configured,
      reachable: false,
      latency_ms: null,
      checked_at: checkedAt,
      error: 'local model provider is not configured',
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.localModelTimeoutMs);

  try {
    const url = new URL('/v1/models', configured.base_url);
    const response = await fetchImpl(url, { signal: controller.signal });
    return {
      ...configured,
      reachable: response.ok,
      latency_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ...configured,
      reachable: false,
      latency_ms: Date.now() - startedAt,
      checked_at: checkedAt,
      error: error instanceof Error ? error.message : 'unknown local model probe error',
    };
  } finally {
    clearTimeout(timeout);
  }
}
