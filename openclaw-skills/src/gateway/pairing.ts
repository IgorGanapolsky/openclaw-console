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

  const safeJsonForHtml = (value: string): string => {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  };

  const isLocal = payload.base_url.includes('localhost') ||
                  payload.base_url.includes('127.0.0.1') ||
                  payload.base_url.includes('192.168.') ||
                  payload.base_url.includes('10.') ||
                  payload.base_url.includes('172.');

  const statusBadge = isLocal 
    ? `<span class="badge badge-local">● LOCAL NETWORK ONLY</span>`
    : `<span class="badge badge-remote">● SECURE REMOTE TUNNEL</span>`;

  const banner = isLocal
    ? `<div class="banner banner-warning">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        <div>
          <strong>Local Network Mode:</strong> If your phone is on cellular data (LTE/5G) or a different Wi-Fi network, pairing will fail with a host resolution error. Start the Cloudflare tunnel or configure a public URL to pair remotely.
        </div>
      </div>`
    : `<div class="banner banner-success">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
        </svg>
        <div>
          <strong>Remote Access Active:</strong> Your phone can connect securely from any network worldwide (including cell data).
        </div>
      </div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pair OpenClaw Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: dark;
      --bg-gradient: radial-gradient(circle at center, #0f172a 0%, #020617 100%);
      --card-bg: rgba(15, 23, 42, 0.65);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --brand-primary: #6366f1;
      --brand-glow: rgba(99, 102, 241, 0.15);
      --success: #10b981;
      --warning: #f59e0b;
    }
    
    * { box-sizing: border-box; }
    
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: var(--bg-gradient);
      color: var(--text-main);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      padding: 20px;
    }
    
    main {
      width: min(96vw, 480px);
      background: var(--card-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 24px;
      padding: 36px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
      position: relative;
      overflow: hidden;
      animation: fadeIn 0.6s ease-out;
    }
    
    main::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #6366f1, #a855f7);
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    h1 {
      margin: 0 0 6px;
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
      margin: 0 auto 24px;
      max-width: 360px;
    }
    
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 6px 12px;
      border-radius: 9999px;
      margin-bottom: 24px;
    }
    
    .badge-local {
      background: rgba(245, 158, 11, 0.1);
      color: var(--warning);
      border: 1px solid rgba(245, 158, 11, 0.2);
    }
    
    .badge-remote {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success);
      border: 1px solid rgba(16, 185, 129, 0.2);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.1);
    }
    
    .qr-container {
      position: relative;
      display: inline-block;
      margin-bottom: 24px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 20px;
      border: 1px solid var(--border-color);
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    
    .qr-container:hover {
      transform: scale(1.02);
      box-shadow: 0 0 25px var(--brand-glow);
    }
    
    .qr {
      display: grid;
      place-items: center;
      background: white;
      border-radius: 16px;
      padding: 16px;
    }
    
    .qr svg {
      display: block;
      width: 240px;
      height: 240px;
    }
    
    .banner {
      display: flex;
      gap: 12px;
      text-align: left;
      font-size: 13px;
      line-height: 1.45;
      padding: 16px;
      border-radius: 16px;
      margin-bottom: 24px;
    }
    
    .banner svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }
    
    .banner-warning {
      background: rgba(245, 158, 11, 0.08);
      color: #fcd34d;
      border: 1px solid rgba(245, 158, 11, 0.15);
    }
    
    .banner-warning svg { color: var(--warning); }
    
    .banner-success {
      background: rgba(16, 185, 129, 0.08);
      color: #a7f3d0;
      border: 1px solid rgba(16, 185, 129, 0.15);
    }
    
    .banner-success svg { color: var(--success); }
    
    .meta-box {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 16px;
      text-align: left;
    }
    
    .meta-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }
    
    code {
      display: block;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      color: #38bdf8;
      overflow-wrap: anywhere;
      word-break: break-all;
      background: rgba(0, 0, 0, 0.2);
      padding: 8px 12px;
      border-radius: 8px;
    }
    
    .footer {
      margin-top: 24px;
      font-size: 11px;
      color: var(--text-muted);
    }
  </style>
</head>
<body>
  <main>
    ${statusBadge}
    <h1>Pair with Gateway</h1>
    <div class="subtitle">Scan this QR code with your phone camera or the OpenClaw mobile app Setup Wizard.</div>
    
    <div class="qr-container">
      <div class="qr">${svg}</div>
    </div>
    
    ${banner}
    
    <div class="meta-box">
      <div class="meta-title">Gateway Base URL</div>
      <code>${escapeHtml(payload.base_url)}</code>
    </div>
    
    <div class="footer">
      Live Polling Active • Auto-updates when network configuration changes
    </div>
  </main>

  <script>
    // Live Polling Mechanism
    // Monitors the pairing API and dynamically reloads the page 
    // if the server changes network configurations (e.g. starting a tunnel)
    const currentBaseUrl = ${safeJsonForHtml(payload.base_url)};
    const currentToken = ${safeJsonForHtml(payload.token)};
    
    async function checkPairingStatus() {
      try {
        const response = await fetch('/api/pairing');
        if (response.ok) {
          const data = await response.json();
          if (data.base_url !== currentBaseUrl || data.token !== currentToken) {
            console.log('Network environment change detected. Refreshing QR pairing page...');
            window.location.reload();
          }
        }
      } catch (err) {
        console.warn('Pairing api check failed:', err);
      }
    }
    
    // Poll every 2.5 seconds
    setInterval(checkPairingStatus, 2500);
  </script>
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
