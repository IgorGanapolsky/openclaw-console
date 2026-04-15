// Simple test for ThumbGate functionality
import { readThumbGateData, incrementThumbsUp, incrementThumbsDown } from './openclaw-skills/src/utils/thumbgate.js';

async function testThumbGate() {
  console.log('Testing ThumbGate functionality...');

  // Read initial data
  const initial = await readThumbGateData();
  console.log('Initial data:', initial);

  // Test thumbs up
  const afterUp = await incrementThumbsUp();
  console.log('After thumbs up:', afterUp);

  // Test thumbs down
  const afterDown = await incrementThumbsDown();
  console.log('After thumbs down:', afterDown);

  console.log('ThumbGate test completed successfully!');
}

testThumbGate().catch(console.error);