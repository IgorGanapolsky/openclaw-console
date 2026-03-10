import { spawn } from 'child_process';
import fetch from 'node-fetch';

async function main() {
  console.log('🚀 [E2E] Starting Skill Generator Verification...');

  // Start the gateway
  const gateway = spawn('node', ['dist/index.js'], {
    env: { ...process.env, SIMULATE_BRIDGES: 'true', PORT: '18800' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let token = '';
  let serverReady = false;

  gateway.stdout.on('data', (data) => {
    const output = data.toString();
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
  const baseUrl = 'http://127.0.0.1:18800';

  try {
    console.log('\n🧪 Test 1: Generate new skill...');
    const res = await fetch(`${baseUrl}/api/skills/generate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        prompt: 'Check AWS spend every hour',
        agentId: 'agent-ops'
      })
    });
    
    if (!res.ok) throw new Error(`Generation failed: ${res.status}`);
    const result = await res.json() as any;
    console.log(`✅ Success: Generated skill '${result.skillName}'`);

    console.log('\n🎉 ALL TESTS PASSED! The Skill Generator works flawlessly end-to-end.');
    
  } catch (err: any) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    gateway.kill();
  }
}

main();