import type { Request, Response } from 'express';
import { toString as qrToString } from 'qrcode';
import type { GatewayConfig } from '../config/default.js';
import type { TokenManager } from './auth.js';

export interface GatewayPairingPayload {
  type: 'openclaw.gateway.pairing.v1';
  name: string;
  base_url: string;
  token: string;
  issued_at: string;
}

const PAIRING_TOKEN_LABEL = 'mobile-pairing';
const LOOPBACK_ADDRESSES = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

export function isLocalPairingRequest(req: Request): boolean {
  if (process.env['OPENCLAW_ALLOW_REMOTE_PAIRING'] === 'true') {
    return true;
  }

  const forwardedFor = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
  if (forwardedFor && !LOOPBACK_ADDRESSES.has(forwardedFor)) {
    return false;
  }

  const remoteAddress = req.socket.remoteAddress ?? req.ip ?? '';
  return LOOPBACK_ADDRESSES.has(remoteAddress);
}

export function inferGatewayBaseUrl(req: Request, config: GatewayConfig): string {
  const explicit = process.env['OPENCLAW_PUBLIC_URL']?.trim();
  if (explicit && isUsableBaseUrl(explicit)) {
    return trimTrailingSlashes(explicit);
  }

  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? `${config.host}:${config.port}`);
  const proto = String(req.headers['x-forwarded-proto'] ?? req.protocol ?? 'http').split(',')[0]?.trim() || 'http';
  return trimTrailingSlashes(`${proto}://${host}`);
}

function isUsableBaseUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

export function buildGatewayPairingPayload(
  req: Request,
  config: GatewayConfig,
  tokenManager: TokenManager,
): GatewayPairingPayload {
  return {
    type: 'openclaw.gateway.pairing.v1',
    name: process.env['OPENCLAW_GATEWAY_NAME']?.trim() || 'OpenClaw Gateway',
    base_url: inferGatewayBaseUrl(req, config),
    token: tokenManager.getOrCreateToken(PAIRING_TOKEN_LABEL),
    issued_at: new Date().toISOString(),
  };
}

export function pairingUri(payload: GatewayPairingPayload): string {
  const query = new URLSearchParams({
    name: payload.name,
    base_url: payload.base_url,
    token: payload.token,
  });
  return `openclaw://pair?${query.toString()}`;
}

export async function renderPairingPage(payload: GatewayPairingPayload): Promise<string> {
  const uri = pairingUri(payload);
  const svg = await qrToString(uri, {
    type: 'svg',
    margin: 1,
    width: 280,
    errorCorrectionLevel: 'M',
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenClaw Gateway Pairing</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e5e7eb; }
    main { width: min(92vw, 520px); padding: 32px; }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    p { color: #cbd5e1; line-height: 1.5; }
    .qr { display: grid; place-items: center; background: white; border-radius: 8px; padding: 18px; margin: 24px 0; }
    code { display: block; overflow-wrap: anywhere; padding: 14px; border: 1px solid #334155; border-radius: 8px; color: #dbeafe; background: #111827; }
    .meta { color: #94a3b8; font-size: 14px; }
  </style>
</head>
<body>
  <main>
    <h1>Pair OpenClaw Console</h1>
    <p>Scan this QR code with the phone camera. The app will open with this gateway configured.</p>
    <div class="qr">${svg}</div>
    <p class="meta">Gateway URL encoded in QR:</p>
    <code>${escapeHtml(payload.base_url)}</code>
  </main>
</body>
</html>`;
}

export async function renderTerminalPairingQr(payload: GatewayPairingPayload): Promise<string> {
  return qrToString(pairingUri(payload), {
    type: 'terminal',
    small: true,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
}

export function rejectNonLocalPairing(req: Request, res: Response): boolean {
  if (isLocalPairingRequest(req)) {
    return false;
  }

  res.status(403).json({
    error: {
      code: 4030,
      message: 'Pairing page is local-only. Set OPENCLAW_ALLOW_REMOTE_PAIRING=true only for a trusted private network.',
    },
  });
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}
