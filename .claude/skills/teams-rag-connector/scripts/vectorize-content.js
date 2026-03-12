#!/usr/bin/env node
/**
 * Vectorization Pipeline for Teams Content → LanceDB
 *
 * Takes formatted Teams messages/transcripts and:
 * 1. Generates embeddings via Anthropic or OpenAI
 * 2. Stores vectors + metadata in LanceDB
 * 3. Supports both batch and streaming ingestion
 *
 * Uses the same LanceDB infrastructure as the existing RLHF system
 * (~/.shieldcortex/lancedb/) but in a separate table.
 */

const path = require('path');
const fs = require('fs');

const LANCEDB_PATH = path.join(process.env.HOME, '.shieldcortex', 'lancedb');
const TABLE_NAME = 'teams_messages';

// Chunking config — Teams messages are usually short, but transcripts can be long
const MAX_CHUNK_LENGTH = 1500; // chars per chunk
const CHUNK_OVERLAP = 200;

/**
 * Chunk long text (meeting transcripts) into overlapping segments.
 */
function chunkText(text, maxLength = MAX_CHUNK_LENGTH, overlap = CHUNK_OVERLAP) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxLength, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start + overlap >= text.length) break;
  }

  return chunks;
}

/**
 * Generate embeddings using available provider.
 * Priority: 1) OpenAI 2) Voyage 3) Local hash-based (zero-config, always works)
 */
async function generateEmbeddings(texts) {
  // Try OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      return await openAIEmbeddings(texts);
    } catch (err) {
      console.warn('OpenAI embeddings failed:', err.message);
    }
  }

  // Try Voyage (needs VOYAGE_API_KEY, separate from ANTHROPIC_API_KEY)
  if (process.env.VOYAGE_API_KEY) {
    try {
      return await voyageEmbeddings(texts);
    } catch (err) {
      console.warn('Voyage embeddings failed:', err.message);
    }
  }

  // Fallback: local deterministic embeddings (no API key needed)
  // Uses simple TF-IDF-style hashing for reasonable semantic similarity
  return texts.map((text) => localEmbedding(text));
}

/**
 * Local embedding: deterministic hash-based vector.
 * Not as good as neural embeddings but works immediately with zero config.
 * Produces 384-dim vectors using character n-gram hashing.
 */
function localEmbedding(text, dims = 384) {
  const vector = new Float32Array(dims);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = normalized.split(/\s+/).filter(Boolean);

  // Character trigram hashing
  for (const word of words) {
    for (let i = 0; i <= word.length - 3; i++) {
      const trigram = word.slice(i, i + 3);
      let hash = 0;
      for (let j = 0; j < trigram.length; j++) {
        hash = ((hash << 5) - hash + trigram.charCodeAt(j)) | 0;
      }
      const idx = Math.abs(hash) % dims;
      vector[idx] += 1.0;
    }
    // Also hash full words
    let wordHash = 0;
    for (let j = 0; j < word.length; j++) {
      wordHash = ((wordHash << 5) - wordHash + word.charCodeAt(j)) | 0;
    }
    vector[Math.abs(wordHash) % dims] += 2.0;
  }

  // L2 normalize
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dims; i++) vector[i] /= norm;

  return Array.from(vector);
}

async function voyageEmbeddings(texts) {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-3',
      input: texts,
      input_type: 'document',
    }),
  });

  if (!response.ok) throw new Error(`Voyage API ${response.status}`);
  const data = await response.json();
  return data.data.map((d) => d.embedding);
}

async function openAIEmbeddings(texts) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });

  if (!response.ok) throw new Error(`OpenAI API ${response.status}`);
  const data = await response.json();
  return data.data.map((d) => d.embedding);
}

/**
 * Store vectorized content in LanceDB.
 * Creates table if it doesn't exist, appends otherwise.
 */
async function vectorizeAndStore(items) {
  if (items.length === 0) return;

  // Prepare chunks — short messages stay as-is, long transcripts get chunked
  const records = [];
  for (const item of items) {
    const chunks = chunkText(item.text);
    for (let i = 0; i < chunks.length; i++) {
      // LanceDB requires non-null values for all columns — default empty strings
      const meta = item.metadata || {};
      records.push({
        text: chunks[i],
        id: `${item.id}_chunk${i}`,
        source: item.source || '',
        sender: item.sender || '',
        timestamp: item.timestamp || new Date().toISOString(),
        chunk_index: i,
        total_chunks: chunks.length,
        teamName: meta.teamName || '',
        channelName: meta.channelName || '',
        chatTopic: meta.chatTopic || '',
        chatType: meta.chatType || '',
        participants: meta.participants || '',
        subject: meta.subject || '',
        importance: meta.importance || 'normal',
        hasAttachments: meta.hasAttachments || false,
        replyCount: meta.replyCount || 0,
      });
    }
  }

  // Batch embeddings (max 96 per batch for Voyage, 2048 for OpenAI)
  const BATCH_SIZE = 96;
  const allEmbeddings = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r) => r.text);
    const embeddings = await generateEmbeddings(texts);
    allEmbeddings.push(...embeddings);
  }

  // Write to LanceDB
  // Using dynamic import for ES module compatibility
  const lancedb = await importLanceDB();
  const db = await lancedb.connect(LANCEDB_PATH);

  const tableData = records.map((record, idx) => ({
    ...record,
    vector: allEmbeddings[idx],
  }));

  try {
    const table = await db.openTable(TABLE_NAME);
    await table.add(tableData);
    console.log(`  Appended ${tableData.length} vectors to ${TABLE_NAME}`);
  } catch {
    // Table doesn't exist — create it
    await db.createTable(TABLE_NAME, tableData);
    console.log(`  Created ${TABLE_NAME} with ${tableData.length} vectors`);
  }

  return tableData.length;
}

/**
 * Query the Teams RAG vector store.
 */
async function queryTeamsRAG(question, topK = 10) {
  const embeddings = await generateEmbeddings([question]);
  const queryVector = embeddings[0];

  const lancedb = await importLanceDB();
  const db = await lancedb.connect(LANCEDB_PATH);

  try {
    const table = await db.openTable(TABLE_NAME);
    const results = await table.search(queryVector).limit(topK).toArray();

    return results.map((r) => ({
      text: r.text,
      sender: r.sender,
      timestamp: r.timestamp,
      source: r.source,
      teamName: r.teamName,
      channelName: r.channelName,
      chatTopic: r.chatTopic,
      score: r._distance,
    }));
  } catch (err) {
    console.error(`RAG query failed: ${err.message}`);
    return [];
  }
}

async function importLanceDB() {
  // LanceDB is an ES module — handle both import styles
  try {
    return require('vectordb');
  } catch {
    try {
      return require('@lancedb/lancedb');
    } catch {
      // Dynamic import for ES module
      return await import('@lancedb/lancedb');
    }
  }
}

/**
 * Get stats about the Teams vector store.
 */
async function getStats() {
  try {
    const lancedb = await importLanceDB();
    const db = await lancedb.connect(LANCEDB_PATH);
    const table = await db.openTable(TABLE_NAME);
    const count = await table.countRows();

    const stateFile = path.join(
      process.env.HOME,
      '.shieldcortex',
      'teams_sync_state.json'
    );
    let state = {};
    try {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
      // no state file
    }

    return {
      vectorCount: count,
      lastSync: state.lastSync || 'never',
      totalMessages: state.totalMessages || 0,
      teamsIndexed: state.teamsIndexed || [],
    };
  } catch {
    return {
      vectorCount: 0,
      lastSync: 'never',
      totalMessages: 0,
      teamsIndexed: [],
    };
  }
}

module.exports = { vectorizeAndStore, queryTeamsRAG, getStats, chunkText };
