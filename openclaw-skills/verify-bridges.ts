import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import fetch from 'node-fetch';
import { WebSocket } from 'ws';

async function main() {
  console.log('🚀 [E2E] Starting Codex Bridge Verification...');

  // Start the gateway
  const gateway = spawn('node', ['dist/index.js'], {
    env: { ...process.env, SIMULATE_BRIDGES: 'true', PORT: '18799' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let token = '';
  let serverReady = false;

  gateway.stdout.on('data', (data) => {
    const output = data.toString();
    // process.stdout.write(output); // Uncomment for full logs
    
    // Extract token
    const tokenMatch = output.match(/Authorization: Bearer ([a-zA-Z0-9_\-\.]+)/);
    if (tokenMatch) {
      token = tokenMatch[1];
    }

    if (output.includes('Gateway ready')) {
      serverReady = true;
    }
  });

  gateway.stderr.on('data', (data) => {
    console.error(`[Gateway Error] ${data.toString()}`);
  });

  // Wait for server to start
  console.log('⏳ Waiting for Gateway to start...');
  for (let i = 0; i < 20; i++) {
    if (serverReady && token) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!serverReady || !token) {
    console.error('❌ Failed to start gateway or retrieve token.');
    gateway.kill();
    process.exit(1);
  }

  console.log('✅ Gateway started! Token retrieved.');
  const baseUrl = 'http://127.0.0.1:18799';

  try {
    // 1. Test GET /api/bridges
    console.log('\n🧪 Test 1: Fetching simulated bridges...');
    let res = await fetch(`${baseUrl}/api/bridges`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    let bridges = await res.json() as any[];
    
    if (bridges.length !== 2) throw new Error(`Expected 2 simulated bridges, got ${bridges.length}`);
    console.log(`✅ Success: Found ${bridges.length} simulated bridges.`);
    console.log(`   -> ${bridges.map(b => b.title).join(', ')}`);

    // 2. Setup WebSocket to listen for bridge_session_new
    console.log('\n🧪 Test 2: Connecting WebSocket to verify real-time events...');
    const scheme = 'ws';
    const wsUrl = `${scheme}://127.0.0.1:18799/ws?tkn=${token}`.replace('tkn=', 'token=');
    const ws = new WebSocket(wsUrl);
    
    let wsConnected = false;
    let newBridgeEventReceived = false;

    ws.on('error', (err) => {
      console.error(`[WebSocket Error] ${err.message}`);
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'connected') {
        wsConnected = true;
      }
      if (msg.type === 'bridge_session_new') {
        newBridgeEventReceived = true;
        console.log(`✅ Success: Received WS event 'bridge_session_new' for: ${msg.payload.title}`);
      }
    });

    // Wait for WS connect
    for (let i = 0; i < 10; i++) {
      if (wsConnected) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!wsConnected) throw new Error('WebSocket failed to connect');
    console.log('✅ WebSocket connected.');

    // 3. Test POST /api/bridges/upsert
    console.log('\n🧪 Test 3: Upserting a new Codex session...');
    res = await fetch(`${baseUrl}/api/bridges/upsert`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        id: 'bridge-test-123',
        agent_id: 'agent-ops',
        type: 'codex',
        title: 'Codex: e2e-test',
        cwd: '/Users/test/e2e-test',
        closed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {}
      })
    });
    
    if (!res.ok) throw new Error(`Upsert failed: ${res.status}`);
    const newBridge = await res.json();
    console.log(`✅ Success: Upserted bridge '${newBridge.id}'`);

    // Wait for WS event
    console.log('⏳ Waiting for WebSocket broadcast...');
    for (let i = 0; i < 10; i++) {
      if (newBridgeEventReceived) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!newBridgeEventReceived) throw new Error('Did not receive bridge_session_new WS event');

    // 4. Verify count is now 3
    console.log('\n🧪 Test 4: Verifying total bridges is 3...');
    res = await fetch(`${baseUrl}/api/bridges`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    bridges = await res.json() as any[];
    if (bridges.length !== 3) throw new Error(`Expected 3 bridges, got ${bridges.length}`);
    console.log('✅ Success: Total bridges is 3.');

    console.log('\n🎉 ALL TESTS PASSED! The Codex Bridge (acpx) integration works flawlessly end-to-end.');
    
    ws.close();
  } catch (err: any) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    gateway.kill();
  }
}

main();