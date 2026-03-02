/**
 * Auth module tests
 *
 * Tests token generation, validation, revocation, and the
 * Express bearer auth middleware.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { jest } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { TokenManager, bearerAuthMiddleware, validateWsToken } from '../src/gateway/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a TokenManager backed by a unique temp file per test. */
function makeTempManager(): { manager: TokenManager; filePath: string } {
  const filePath = path.join(os.tmpdir(), `openclaw-test-tokens-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const manager = new TokenManager(filePath);
  return { manager, filePath };
}

/** Build a mock Express request with optional Authorization header. */
function mockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

/** Build a mock Express response that captures status/json calls. */
function mockRes(): {
  res: Partial<Response>;
  statusCode: number | null;
  body: unknown;
} {
  const state = { statusCode: null as number | null, body: null as unknown };
  const res: Partial<Response> = {
    status(code: number) {
      state.statusCode = code;
      return this as Response;
    },
    json(obj: unknown) {
      state.body = obj;
      return this as Response;
    },
  };
  return { res, ...state };
}

// ── TokenManager ──────────────────────────────────────────────────────────────

describe('TokenManager', () => {
  afterEach(() => {
    // Clean up temp files
  });

  test('Creates a default-dev token on first init', () => {
    const { manager, filePath } = makeTempManager();
    const devToken = manager.getDefaultDevToken();
    expect(typeof devToken).toBe('string');
    expect(devToken!.length).toBe(64); // 32 bytes hex
    fs.unlinkSync(filePath);
  });

  test('Generated token validates successfully', () => {
    const { manager, filePath } = makeTempManager();
    const token = manager.generate('test-label');
    expect(manager.validate(token)).toBe(true);
    fs.unlinkSync(filePath);
  });

  test('Invalid token fails validation', () => {
    const { manager, filePath } = makeTempManager();
    expect(manager.validate('not-a-real-token')).toBe(false);
    fs.unlinkSync(filePath);
  });

  test('Revoked token fails validation', () => {
    const { manager, filePath } = makeTempManager();
    const token = manager.generate('revoke-test');
    manager.revoke(token);
    expect(manager.validate(token)).toBe(false);
    fs.unlinkSync(filePath);
  });

  test('Revoking non-existent token returns false', () => {
    const { manager, filePath } = makeTempManager();
    expect(manager.revoke('ghost-token')).toBe(false);
    fs.unlinkSync(filePath);
  });

  test('list() redacts token values', () => {
    const { manager, filePath } = makeTempManager();
    manager.generate('listed-token');
    const list = manager.list();
    for (const entry of list) {
      expect(entry.token_hint.endsWith('…')).toBe(true);
    }
    fs.unlinkSync(filePath);
  });

  test('Persists tokens across instances (same file)', () => {
    const { manager: m1, filePath } = makeTempManager();
    const token = m1.generate('persistent');

    const m2 = new TokenManager(filePath);
    expect(m2.validate(token)).toBe(true);
    fs.unlinkSync(filePath);
  });

  test('State is loaded even if file has no default-dev token', () => {
    const filePath = path.join(os.tmpdir(), `openclaw-test-custom-${Date.now()}.json`);
    const custom = { tokens: [{ token: 'abc123def456abc123def456abc123def456abc123def456abc123def456abcd', label: 'custom', created_at: new Date().toISOString(), last_used: null, revoked: false }] };
    fs.writeFileSync(filePath, JSON.stringify(custom));
    const manager = new TokenManager(filePath);
    expect(manager.validate('abc123def456abc123def456abc123def456abc123def456abc123def456abcd')).toBe(true);
    expect(manager.getDefaultDevToken()).toBeUndefined();
    fs.unlinkSync(filePath);
  });
});

// ── bearerAuthMiddleware ──────────────────────────────────────────────────────

describe('bearerAuthMiddleware', () => {
  test('Passes valid token to next()', () => {
    const { manager, filePath } = makeTempManager();
    const token = manager.generate('middleware-test');
    const middleware = bearerAuthMiddleware(manager);

    const req = mockReq(`Bearer ${token}`);
    const { res, statusCode } = mockRes();
    const next = jest.fn();

    middleware(req as Request, res as Response, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(statusCode).toBeNull();
    fs.unlinkSync(filePath);
  });

  test('Rejects missing Authorization header with 401', () => {
    const { manager, filePath } = makeTempManager();
    const middleware = bearerAuthMiddleware(manager);

    const req = mockReq(); // no header
    let capturedStatus = 0;
    let capturedBody: unknown = null;
    const res2 = {
      status(code: number) { capturedStatus = code; return this; },
      json(body: unknown) { capturedBody = body; return this; },
    };
    const next = jest.fn();

    middleware(req as Request, res2 as unknown as Response, next as NextFunction);
    expect(capturedStatus).toBe(401);
    expect(capturedBody).toBeTruthy();
    expect(next).not.toHaveBeenCalled();
    fs.unlinkSync(filePath);
  });

  test('Rejects invalid token with 401', () => {
    const { manager, filePath } = makeTempManager();
    const middleware = bearerAuthMiddleware(manager);

    let capturedStatus = 0;
    const res2 = {
      status(code: number) { capturedStatus = code; return this; },
      json(_body: unknown) { return this; },
    };
    const req = mockReq('Bearer invalidtoken000000000000000000000');
    const next = jest.fn();

    middleware(req as Request, res2 as unknown as Response, next as NextFunction);
    expect(capturedStatus).toBe(401);
    expect(next).not.toHaveBeenCalled();
    fs.unlinkSync(filePath);
  });

  test('Rejects Bearer prefix without token with 401', () => {
    const { manager, filePath } = makeTempManager();
    const middleware = bearerAuthMiddleware(manager);

    let capturedStatus = 0;
    const res2 = {
      status(code: number) { capturedStatus = code; return this; },
      json(_body: unknown) { return this; },
    };
    const req = mockReq('Token abc');
    const next = jest.fn();

    middleware(req as Request, res2 as unknown as Response, next as NextFunction);
    expect(capturedStatus).toBe(401);
    expect(next).not.toHaveBeenCalled();
    fs.unlinkSync(filePath);
  });
});

// ── validateWsToken ───────────────────────────────────────────────────────────

describe('validateWsToken', () => {
  test('Returns token string for valid token in query', () => {
    const { manager, filePath } = makeTempManager();
    const token = manager.generate('ws-test');
    const result = validateWsToken(manager, { token });
    expect(result).toBe(token);
    fs.unlinkSync(filePath);
  });

  test('Returns null when query token is missing', () => {
    const { manager, filePath } = makeTempManager();
    expect(validateWsToken(manager, {})).toBeNull();
    fs.unlinkSync(filePath);
  });

  test('Returns null for invalid token', () => {
    const { manager, filePath } = makeTempManager();
    expect(validateWsToken(manager, { token: 'bad' })).toBeNull();
    fs.unlinkSync(filePath);
  });

  test('Handles array token param by using first element', () => {
    const { manager, filePath } = makeTempManager();
    const token = manager.generate('ws-array-test');
    const result = validateWsToken(manager, { token: [token, 'other'] });
    expect(result).toBe(token);
    fs.unlinkSync(filePath);
  });
});
