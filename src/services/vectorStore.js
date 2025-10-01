// src/services/vectorStore.js
import fs from "fs";
const STORE_FILE = "./store.json";

let store = new Map();

// Load existing store safely
try {
  const data = JSON.parse(fs.readFileSync(STORE_FILE, "utf-8"));
  for (const [k, v] of Object.entries(data)) {
    store.set(k, v);
  }
} catch {
  console.log("ℹ️ No existing store found, starting fresh.");
}

function saveStore() {
  // Ensure embeddings are plain arrays of numbers
  const serializable = {};
  for (const [k, v] of store.entries()) {
    serializable[k] = v.map(item => ({
      ...item,
      embedding: Array.isArray(item.embedding)
        ? item.embedding.map(Number) // force to number array
        : []
    }));
  }
  fs.writeFileSync(STORE_FILE, JSON.stringify(serializable, null, 2), "utf-8");
}

export function getOrCreateCollection(name) {
  if (!store.has(name)) store.set(name, []);
  return store.get(name);
}

export function addToCollection(collectionName, item) {
  const col = getOrCreateCollection(collectionName);
  const existingIndex = col.findIndex(d => d.id === item.id);

  if (existingIndex >= 0) {
    col[existingIndex] = item; // replace old entry
  } else {
    col.push(item); // add new entry
  }

  saveStore();
}

export function searchCollection(collectionName, queryEmbedding, topK = 3) {
  const col = getOrCreateCollection(collectionName);
  if (!col.length) return [];

  function cosine(a, b) {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (magA * magB);
  }

  // Score items
  const scored = col.map(item => ({
    ...item,
    score: cosine(queryEmbedding, item.embedding)
  }));

  // Remove duplicates by ID
  const seen = new Set();
  const unique = scored.filter(d => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  return unique
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(d => ({ ...d, score: d.score.toFixed(3) }));
}
