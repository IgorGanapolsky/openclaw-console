#!/usr/bin/env node

/**
 * Quick Validation Script for OpenClaw + Multica Integration
 * Tests core functionality without requiring full Docker setup
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Configuration
const CONFIG = {
  gateway: {
    url: process.env.GATEWAY_URL || 'http://localhost:18789',
    token: process.env.OPENCLAW_DEV_TOKEN || 'test-token'
  },
  multica: {
    url: process.env.MULTICA_API_URL || 'http://localhost:8080',
    token: process.env.MULTICA_API_TOKEN || 'test-token'
  }
};

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'OpenClaw-Validator/1.0',
        ...options.headers
      }
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            data: jsonData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Test functions
async function testGatewayHealth() {
  try {
    const response = await makeRequest(`${CONFIG.gateway.url}/api/health`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.gateway.token}`
      }
    });

    if (response.status === 200) {
      log('✅ Gateway Health: OK', 'green');
      return true;
    } else {
      log(`❌ Gateway Health: HTTP ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Gateway Health: ${error.message}`, 'red');
    return false;
  }
}

async function testMulticaHealth() {
  try {
    const response = await makeRequest(`${CONFIG.multica.url}/api/health`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.multica.token}`
      }
    });

    if (response.status === 200) {
      log('✅ Multica Health: OK', 'green');
      return true;
    } else {
      log(`❌ Multica Health: HTTP ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Multica Health: ${error.message}`, 'red');
    return false;
  }
}

async function testMulticaEndpoint() {
  try {
    const response = await makeRequest(`${CONFIG.gateway.url}/api/multica/issues`, {
      method: 'OPTIONS',
      headers: {
        'Authorization': `Bearer ${CONFIG.gateway.token}`
      }
    });

    if (response.status === 200 || response.status === 404) {
      log('✅ Multica Bridge Endpoint: Available', 'green');
      return true;
    } else {
      log(`❌ Multica Bridge Endpoint: HTTP ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Multica Bridge Endpoint: ${error.message}`, 'red');
    return false;
  }
}

async function testWebhookEndpoint() {
  try {
    const response = await makeRequest(`${CONFIG.gateway.url}/api/webhooks/multica`, {
      method: 'OPTIONS'
    });

    if (response.status === 200 || response.status === 405) {
      log('✅ Webhook Endpoint: Available', 'green');
      return true;
    } else {
      log(`❌ Webhook Endpoint: HTTP ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Webhook Endpoint: ${error.message}`, 'red');
    return false;
  }
}

async function testAgentsAPI() {
  try {
    const response = await makeRequest(`${CONFIG.gateway.url}/api/agents`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.gateway.token}`
      }
    });

    if (response.status === 200 && Array.isArray(response.data)) {
      log(`✅ Agents API: ${response.data.length} agents available`, 'green');
      return true;
    } else {
      log(`❌ Agents API: HTTP ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Agents API: ${error.message}`, 'red');
    return false;
  }
}

async function testStructuredPromptCreation() {
  try {
    const prompt = {
      title: "Integration Test Prompt",
      prompt: "This is a test prompt to validate the integration",
      agent_id: "test-agent",
      priority: "Medium",
      tags: ["validation-test"]
    };

    const response = await makeRequest(`${CONFIG.gateway.url}/api/multica/issues`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.gateway.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(prompt)
    });

    if (response.status === 200) {
      log('✅ Structured Prompt Creation: Working', 'green');
      return true;
    } else if (response.status === 503) {
      log('⚠️  Structured Prompt Creation: Multica integration not enabled', 'yellow');
      return false;
    } else {
      log(`❌ Structured Prompt Creation: HTTP ${response.status}`, 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Structured Prompt Creation: ${error.message}`, 'red');
    return false;
  }
}

// Main validation function
async function runValidation() {
  log('🧪 OpenClaw + Multica Integration Validation', 'blue');
  log('='.repeat(50), 'blue');

  const tests = [
    { name: 'Gateway Health', fn: testGatewayHealth },
    { name: 'Multica Health', fn: testMulticaHealth },
    { name: 'Multica Bridge Endpoint', fn: testMulticaEndpoint },
    { name: 'Webhook Endpoint', fn: testWebhookEndpoint },
    { name: 'Agents API', fn: testAgentsAPI },
    { name: 'Structured Prompt Creation', fn: testStructuredPromptCreation }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    log(`\nTesting ${test.name}...`, 'yellow');
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      log(`❌ ${test.name}: Unexpected error - ${error.message}`, 'red');
      failed++;
    }
  }

  // Summary
  log('\n' + '='.repeat(50), 'blue');
  log('Validation Summary:', 'blue');
  log(`Tests Passed: ${passed}`, passed > 0 ? 'green' : 'red');
  log(`Tests Failed: ${failed}`, failed > 0 ? 'red' : 'green');

  if (failed === 0) {
    log('\n🎉 All validation tests passed!', 'green');
    log('OpenClaw + Multica integration is ready to use.', 'green');
    process.exit(0);
  } else {
    log('\n❌ Some validation tests failed.', 'red');
    log('Please check the configuration and try again.', 'yellow');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runValidation().catch((error) => {
    log(`💥 Validation failed with error: ${error.message}`, 'red');
    process.exit(1);
  });
}

module.exports = { runValidation, CONFIG };