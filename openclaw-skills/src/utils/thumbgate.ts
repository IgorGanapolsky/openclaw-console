/**
 * ThumbGate utilities for managing thumbs up/down data
 * Reads and writes to ~/.openclaw/thumbgate.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface ThumbGateData {
  thumbs_up: number;
  thumbs_down: number;
}

const DEFAULT_DATA: ThumbGateData = {
  thumbs_up: 0,
  thumbs_down: 0,
};

/**
 * Get the path to the ThumbGate data file
 */
function getThumbGateFilePath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.openclaw', 'thumbgate.json');
}

/**
 * Ensure the .openclaw directory exists
 */
async function ensureOpenclawDir(): Promise<void> {
  const homeDir = os.homedir();
  const openclawDir = path.join(homeDir, '.openclaw');

  try {
    await fs.access(openclawDir);
  } catch {
    await fs.mkdir(openclawDir, { recursive: true });
  }
}

/**
 * Read ThumbGate data from file, creating it if it doesn't exist
 */
export async function readThumbGateData(): Promise<ThumbGateData> {
  try {
    const filePath = getThumbGateFilePath();
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as ThumbGateData;
  } catch (error) {
    // File doesn't exist or is invalid, create with default data
    await writeThumbGateData(DEFAULT_DATA);
    return DEFAULT_DATA;
  }
}

/**
 * Write ThumbGate data to file
 */
export async function writeThumbGateData(data: ThumbGateData): Promise<void> {
  await ensureOpenclawDir();
  const filePath = getThumbGateFilePath();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Increment thumbs up counter
 */
export async function incrementThumbsUp(): Promise<ThumbGateData> {
  const data = await readThumbGateData();
  data.thumbs_up += 1;
  await writeThumbGateData(data);
  return data;
}

/**
 * Increment thumbs down counter
 */
export async function incrementThumbsDown(): Promise<ThumbGateData> {
  const data = await readThumbGateData();
  data.thumbs_down += 1;
  await writeThumbGateData(data);
  return data;
}

/**
 * Reset all counters to zero
 */
export async function resetThumbGateData(): Promise<ThumbGateData> {
  const resetData = { thumbs_up: 0, thumbs_down: 0 };
  await writeThumbGateData(resetData);
  return resetData;
}