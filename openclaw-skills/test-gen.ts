import fetch from 'node-fetch';

async function testSkillGen() {
  const res = await fetch('http://localhost:18789/api/skills/generate', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer test', // Mock or bypass for local test
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt: 'Check AWS spend every hour',
      agentId: 'agent-ops'
    })
  });
  console.log(await res.text());
}
testSkillGen().catch(console.error);
