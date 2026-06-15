import fs from "fs/promises";
import path from "path";

const DATA_FILE = path.resolve(process.env.LOCAL_VECTOR_PATH || "./local-vector-data.json");

let cache = null;

async function loadStore() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    cache = JSON.parse(raw);
  } catch {
    cache = {};
  }
  return cache;
}

async function saveStore() {
  await fs.writeFile(DATA_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function localAddToCollection(collectionName, item, userId) {
  const store = await loadStore();
  if (!store[collectionName]) store[collectionName] = [];

  const existing = store[collectionName].findIndex((d) => d.id === item.id);
  const entry = {
    id: item.id,
    text: item.text,
    embedding: item.embedding,
    userId,
  };

  if (existing >= 0) store[collectionName][existing] = entry;
  else store[collectionName].push(entry);

  await saveStore();
}

export async function localSearchCollection(collectionName, queryEmbedding, topK = 3, userId) {
  const store = await loadStore();
  const docs = (store[collectionName] || []).filter(
    (d) => !userId || d.userId === userId
  );

  if (docs.length === 0) return [];

  const scored = docs.map((d) => ({
    id: d.id,
    text: d.text,
    score: cosineSimilarity(queryEmbedding, d.embedding).toFixed(3),
  }));

  scored.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
  return scored.slice(0, topK);
}

export async function localGetDocs(collectionName, userId) {
  const store = await loadStore();
  return (store[collectionName] || [])
    .filter((d) => !userId || d.userId === userId)
    .map((d) => ({ id: d.id, text: d.text }));
}

export function resetLocalCache() {
  cache = null;
}
