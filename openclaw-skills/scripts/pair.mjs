#!/usr/bin/env node

import os from 'node:os';
import { spawn } from 'node:child_process';

const port = process.env.PORT || '18789';
const publicUrl = process.env.OPENCLAW_PUBLIC_URL || inferPublicUrl(port);
const pairPageUrl = `http://127.0.0.1:${port}/pair`;

if (!publicUrl) {
  console.error('Could not find a LAN IP address for this Mac.');
  console.error('Set OPENCLAW_PUBLIC_URL manually, for example: OPENCLAW_PUBLIC_URL=http://192.168.1.20:18789 npm run pair');
  process.exit(1);
}

const env = {
  ...process.env,
  PORT: port,
  HOST: process.env.HOST || '0.0.0.0',
  OPENCLAW_PUBLIC_URL: publicUrl,
  OPENCLAW_PAIRING_MODE: 'true',
  LOAD_SEED_DATA: 'false',
  SIMULATE_BRIDGES: 'false',
  ENABLED_SKILLS: '',
};

console.log('');
console.log('OpenClaw pairing mode');
console.log(`Gateway URL for phone: ${publicUrl}`);
console.log(`QR page on this Mac: ${pairPageUrl}`);
console.log('');

const child = spawn('npm', ['run', 'pair:server', '--silent'], {
  env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let opened = false;

child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  if (!opened && text.includes('OpenClaw gateway listening')) {
    opened = true;
    openBrowser(pairPageUrl);
  }
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

function inferPublicUrl(listenPort) {
  const interfaces = os.networkInterfaces();
  const preferred = ['en0', 'en1', 'eth0', 'wlan0'];

  for (const name of preferred) {
    const address = firstUsableAddress(interfaces[name]);
    if (address) {
      return `http://${address}:${listenPort}`;
    }
  }

  for (const [name, addresses] of Object.entries(interfaces)) {
    if (/^(lo|utun|awdl|llw|docker|bridge|vbox|vmnet)/.test(name)) {
      continue;
    }
    const address = firstUsableAddress(addresses);
    if (address) {
      return `http://${address}:${listenPort}`;
    }
  }

  return null;
}

function firstUsableAddress(addresses = []) {
  return addresses.find((entry) => {
    return entry.family === 'IPv4' && !entry.internal && isPrivateLanAddress(entry.address);
  })?.address;
}

function isPrivateLanAddress(address) {
  return /^10\./.test(address)
    || /^192\.168\./.test(address)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(address);
}

function openBrowser(url) {
  if (process.env.OPENCLAW_PAIRING_OPEN_BROWSER === 'false') {
    return;
  }

  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const opener = spawn(command, args, { stdio: 'ignore', detached: true });
  opener.unref();
}
