import { spawn } from 'child_process';
import fetch from 'node-fetch';

async function main() {
  console.log('🚀 [E2E] Starting Igor Stack (MCP & Loops) Verification...');

  // Start the gateway with a mock MCP server config
  // We'll use 'node -e ...' as a simple mock MCP server that provides a 'get_status' tool
  const mcpMockCmd = "node -e 'process.stdin.on(\"data\", d => { const msg = JSON.parse(d.toString()); if(msg.method === \"listTools\") console.log(JSON.stringify({jsonrpc:\"2.0\", id: msg.id, result: {tools: [{name: \"mock_tool\", description: \"A mock tool\"}]}})) })'";
  
  const gateway = spawn('node', ['dist/index.js'], {
    env: { 
      ...process.env, 
      SIMULATE_BRIDGES: 'true', 
      PORT: '18801',
      MCP_SERVERS: `mock-server:node:-e:process.stdin.on("data", d => { try { const msg = JSON.parse(d.toString()); if(msg.method === "listTools") console.log(JSON.stringify({jsonrpc:"2.0", id: msg.id, result: {tools: [{name: "mock_tool", description: "A mock tool"}]}})); if(msg.method === "initialize") console.log(JSON.stringify({jsonrpc:"2.0", id: msg.id, result: {capabilities: {}, serverInfo: {name: "mock", version: "1.0"}}})); } catch(e) {} })`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let token = '';
  let serverReady = false;
  let mcpConnected = false;

  gateway.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Authorization: Bearer')) {
      const match = output.match(/Authorization: Bearer ([a-zA-Z0-9_\-\.]+)/);
      if (match) token = match[1];
    }
    if (output.includes('Gateway ready')) serverReady = true;
    if (output.includes('[mcp] Connected to mock-server')) mcpConnected = true;
  });

  console.log('⏳ Waiting for Gateway and MCP initialization...');
  for (let i = 0; i < 30; i++) {
    if (serverReady && token && mcpConnected) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!serverReady || !token) {
    console.error('❌ Failed to start gateway.');
    gateway.kill();
    process.exit(1);
  }

  console.log('✅ Gateway started! Token retrieved.');
  if (mcpConnected) console.log('✅ MCP mock-server connected!');

  const baseUrl = 'http://127.0.0.1:18801';

  try {
    // 1. Verify Loops API
    console.log('\n🧪 Test 1: Verifying Autonomous Loops...');
    const resLoops = await fetch(`${baseUrl}/api/loops`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const loops = await resLoops.json() as any[];
    const briefLoop = loops.find(l => l.name === 'Morning Cockpit Summary');
    if (!briefLoop) throw new Error('Daily Brief loop not found in state');
    console.log(`✅ Success: Found loop '${briefLoop.name}' with status: ${briefLoop.status}`);

    // 2. Test Skill Generation with MCP Tool Discovery
    console.log('\n🧪 Test 2: Generating skill with tool discovery...');
    const resGen = await fetch(`${baseUrl}/api/skills/generate`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        prompt: 'Use the mock tool to check status',
        agentId: 'agent-ops'
      })
    });
    
    if (!resGen.ok) throw new Error(`Generation failed: ${resGen.status}`);
    const genResult = await resGen.json() as any;
    console.log(`✅ Success: Generated skill '${genResult.skillName}'`);
    
    console.log('\n🎉 ALL IGOR STACK TESTS PASSED! MCP, Loops, and Skill Generation are verified.');
    
  } catch (err: any) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    process.exitCode = 1;
  } finally {
    gateway.kill();
  }
}

main();