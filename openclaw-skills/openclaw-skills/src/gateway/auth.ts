/**
 * Token-based authentication for the OpenClaw gateway.
 *
 * Tokens are stored in a plain JSON file for portability.
 * In production, consider a more secure store (e.g. encrypted keyring).
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ERROR_CODES } from '../types/protocol.js';

export interface StoredToken {
  token: string;
  label: string;
  created_at: string;
  last_used: string | null;
  revoked: boolean;
}

interface TokenStore {
  tokens: StoredToken[];
}

/**
 * Manages gateway authentication tokens backed by a JSON file.
 */
export class TokenManager {
  private storePath: string;
  private store: TokenStore;

  constructor(storePath: string) {
    this.storePath = path.resolve(storePath);
    this.store = this.load();
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  private load(): TokenStore {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf-8');
        return JSON.parse(raw) as TokenStore;
      }
    } catch (err) {
      console.warn('[auth] Could not read token store, starting fresh:', (err as Error).message);
    }
    // Bootstrap with one default dev token when no store exists
    const defaultToken = this.buildToken('default-dev');
    const fresh: TokenStore = { tokens: [defaultToken] };
    this.persist(fresh);
    console.info(`[auth] Created default dev token (store: ${this.storePath})`);
    return fresh;
  }

  private persist(store: TokenStore): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.storePath, JSON.stringify(store, null, 2), 'utf-8');
  }

  private save(): void {
    this.persist(this.store);
  }

  // ── Token CRUD ────────────────────────────────────────────────────────────

  private buildToken(label: string): StoredToken {
    return {
      token: randomBytes(32).toString('hex'),
      label,
      created_at: new Date().toISOString(),
      last_used: null,
      revoked: false,
    };
  }

  /**
   * Generate a new token with the given label and persist it.
   * Returns the plain token string (shown once).
   */
  public generate(label: string): string {
    const entry = this.buildToken(label);
    this.store.tokens.push(entry);
    this.save();
    return entry.token;
  }

  /**
   * Validate a token. Returns true if the token is known and not revoked.
   * Updates last_used on success.
   */
  public validate(token: string): boolean {
    const entry = this.store.tokens.find((t) => t.token === token && !t.revoked);
    if (!entry) return false;
    entry.last_used = new Date().toISOString();
    this.save();
    return true;
  }

  /**
   * Revoke a token by its plain value. Returns true if found and revoked.
   */
  public revoke(token: string): boolean {
    const entry = this.store.tokens.find((t) => t.token === token);
    if (!entry) return false;
    entry.revoked = true;
    this.save();
    return true;
  }

  /**
   * List all stored tokens (tokens redacted for safety).
   */
  public list(): Array<Omit<StoredToken, 'token'> & { token_hint: string }> {
    return this.store.tokens.map(({ token, ...rest }) => ({
      ...rest,
      token_hint: `${token.slice(0, 6)}…`,
    }));
  }

  /**
   * Return the default dev token value (first non-revoked token labeled 'default-dev').
   * Useful for bootstrapping local dev sessions.
   */
  public getDefaultDevToken(): string | undefined {
    return this.store.tokens.find((t) => t.label === 'default-dev' && !t.revoked)?.token;
  }
}

// ── Express Middleware ────────────────────────────────────────────────────────

/**
 * Express middleware that validates Bearer tokens from the Authorization header.
 * Attaches nothing to req — just blocks unauthorized requests with 401.
 */
export function bearerAuthMiddleware(
  manager: TokenManager,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers['authorization'];
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({
        error: { code: ERROR_CODES.INVALID_TOKEN, message: 'Missing or malformed Authorization header' },
      });
      return;
    }
    const token = header.slice(7);
    if (!manager.validate(token)) {
      res.status(401).json({
        error: { code: ERROR_CODES.INVALID_TOKEN, message: 'Invalid or revoked token' },
      });
      return;
    }
    next();
  };
}

/**
 * Extract and validate a WebSocket token from a query string.
 * Returns the token string if valid, null otherwise.
 */
export function validateWsToken(manager: TokenManager, query: Record<string, string | string[] | undefined>): string | null {
  const raw = query['token'];
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return null;
  return manager.validate(token) ? token : null;
}
