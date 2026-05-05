import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type { Request } from 'express';
import DEFAULT_CONFIG from '../src/config/default';
import type { GatewayConfig } from '../src/config/default';
import { TokenManager } from '../src/gateway/auth';
import { createGatewayServer, type GatewayServer } from '../src/gateway/server';
import { StateManager } from '../src/gateway/state';
import {
  buildGatewayPairingPayload,
  inferGatewayBaseUrl,
  isLocalPairingRequest,
  pairingUri,
  renderPairingPage,
  renderTerminalPairingQr,
} from '../src/gateway/pairing';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {
      host: '192.168.1.5:18789',
      ...overrides.headers,
    },
    protocol: 'http',
    socket: {
      remoteAddress: '127.0.0.1',
    },
    ...overrides,
  } as Request;
}

function makeTokenManager(): { manager: TokenManager; filePath: string } {
  const filePath = path.join(os.tmpdir(), `openclaw-pairing-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  return { manager: new TokenManager(filePath), filePath };
}

const servers: GatewayServer[] = [];

afterEach(async () => {
  while (servers.length > 0) {
    await servers.pop()?.stop();
  }
});

function tempConfig(): GatewayConfig {
  return {
    ...DEFAULT_CONFIG,
    host: '127.0.0.1',
    port: 0,
    tokenStorePath: path.join(os.tmpdir(), `openclaw-pairing-server-${Date.now()}-${Math.random().toString(36).slice(2)}.json`),
    loadSeedData: false,
    simulateBridges: false,
  };
}

async function startPairingServer(): Promise<string> {
  const server = createGatewayServer(tempConfig(), new StateManager());
  servers.push(server);
  await server.start();
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

describe('gateway pairing', () => {
  afterEach(() => {
    delete process.env['OPENCLAW_PUBLIC_URL'];
    delete process.env['OPENCLAW_GATEWAY_NAME'];
    delete process.env['OPENCLAW_ALLOW_REMOTE_PAIRING'];
  });

  test('infers gateway base URL from request host', () => {
    expect(inferGatewayBaseUrl(mockReq(), DEFAULT_CONFIG)).toBe('http://192.168.1.5:18789');
  });

  test('OPENCLAW_PUBLIC_URL overrides inferred URL', () => {
    process.env['OPENCLAW_PUBLIC_URL'] = 'https://gateway.example.com/';

    expect(inferGatewayBaseUrl(mockReq(), DEFAULT_CONFIG)).toBe('https://gateway.example.com');
  });

  test('builds stable mobile pairing payload and URI', () => {
    const { manager, filePath } = makeTokenManager();
    process.env['OPENCLAW_GATEWAY_NAME'] = 'Mac Mini';

    const payload = buildGatewayPairingPayload(mockReq(), DEFAULT_CONFIG, manager);
    const refreshedPayload = buildGatewayPairingPayload(mockReq(), DEFAULT_CONFIG, manager);
    const uri = pairingUri(payload);

    expect(payload.type).toBe('openclaw.gateway.pairing.v1');
    expect(payload.name).toBe('Mac Mini');
    expect(payload.base_url).toBe('http://192.168.1.5:18789');
    expect(payload.token).toHaveLength(64);
    expect(refreshedPayload.token).toBe(payload.token);
    expect(uri).toContain('openclaw://pair?');
    expect(uri).toContain('base_url=http%3A%2F%2F192.168.1.5%3A18789');
    fs.unlinkSync(filePath);
  });

  test('rejects non-local pairing requests by default', () => {
    const req = mockReq({
      headers: { 'x-forwarded-for': '203.0.113.10' },
      socket: { remoteAddress: '203.0.113.10' },
    } as unknown as Partial<Request>);

    expect(isLocalPairingRequest(req)).toBe(false);
  });

  test('renders QR pairing page', async () => {
    const { manager, filePath } = makeTokenManager();
    const payload = buildGatewayPairingPayload(mockReq(), DEFAULT_CONFIG, manager);

    const html = await renderPairingPage(payload);

    expect(html).toContain('<svg');
    expect(html).toContain('Pair OpenClaw Console');
    fs.unlinkSync(filePath);
  });

  test('renders terminal QR pairing code', async () => {
    const { manager, filePath } = makeTokenManager();
    const payload = buildGatewayPairingPayload(mockReq(), DEFAULT_CONFIG, manager);

    const terminalQr = await renderTerminalPairingQr(payload);

    expect(terminalQr).toContain('\u001B[');
    expect(terminalQr.length).toBeGreaterThan(100);
    fs.unlinkSync(filePath);
  });

  test('serves local pairing JSON and QR page', async () => {
    const baseUrl = await startPairingServer();

    const jsonResponse = await fetch(`${baseUrl}/api/pairing`);
    const jsonBody = await jsonResponse.json() as Record<string, unknown>;
    const pageResponse = await fetch(`${baseUrl}/pair`);
    const html = await pageResponse.text();

    expect(jsonResponse.status).toBe(200);
    expect(jsonBody['type']).toBe('openclaw.gateway.pairing.v1');
    expect(String(jsonBody['pairing_uri'])).toContain('openclaw://pair?');
    expect(pageResponse.status).toBe(200);
    expect(html).toContain('<svg');
  });
});
