// src/services/vectorStore.js
import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";
import {
  localAddToCollection,
  localSearchCollection,
  localGetDocs,
} from "./localVectorStore.js";

// all-MiniLM-L6-v2 produces 384-dimensional vectors
export const EMBEDDING_DIM = 384;

const useLocalOnly = process.env.USE_LOCAL_VECTOR_STORE === "true" || !process.env.QDRANT_URL?.trim();
let qdrantAvailable = !useLocalOnly;

const client = useLocalOnly
  ? null
  : new QdrantClient({
      url: process.env.QDRANT_URL?.trim(),
      apiKey: process.env.QDRANT_API_KEY?.trim(),
      checkCompatibility: false,
    });

if (useLocalOnly) {
  console.log("📁 Using local file-based vector store (no Qdrant).");
}

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

async function ensureCollection(collectionName, vectorSize = EMBEDDING_DIM) {
  const collections = await client.getCollections();
  const exists = collections.collections.some((c) => c.name === collectionName);

  if (!exists) {
    console.log(`Creating Qdrant collection: "${collectionName}" with vector size ${vectorSize}...`);
    await client.createCollection(collectionName, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
    return;
  }

  const info = await client.getCollection(collectionName);
  const existingSize = info?.config?.params?.vectors?.size;
  if (existingSize && existingSize !== vectorSize) {
    console.warn(
      `⚠️ Collection "${collectionName}" has size ${existingSize}, expected ${vectorSize}. Recreating...`
    );
    await client.deleteCollection(collectionName);
    await client.createCollection(collectionName, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
  }
}

export async function addToCollection(collectionName, item, userId) {
  const flatEmbedding = Array.isArray(item.embedding)
    ? item.embedding.map(Number)
    : [];

  if (!qdrantAvailable) {
    return localAddToCollection(collectionName, { ...item, embedding: flatEmbedding }, userId);
  }

  try {
    await ensureCollection(collectionName, flatEmbedding.length || EMBEDDING_DIM);
    const qdrantId = uuidv5(item.id, UUID_NAMESPACE);

    await client.upsert(collectionName, {
      wait: true,
      points: [
        {
          id: qdrantId,
          vector: flatEmbedding,
          payload: { originalId: item.id, text: item.text, userId },
        },
      ],
    });
  } catch (err) {
    console.warn(`⚠️ Qdrant unavailable, falling back to local store:`, err.message);
    qdrantAvailable = false;
    return localAddToCollection(collectionName, { ...item, embedding: flatEmbedding }, userId);
  }
}

export async function searchCollection(collectionName, queryEmbedding, topK = 3, userId) {
  const flatQueryEmbedding = Array.isArray(queryEmbedding)
    ? queryEmbedding.map(Number)
    : [];

  if (!qdrantAvailable) {
    return localSearchCollection(collectionName, flatQueryEmbedding, topK, userId);
  }

  try {
    await ensureCollection(collectionName, flatQueryEmbedding.length || EMBEDDING_DIM);

    const searchParams = {
      vector: flatQueryEmbedding,
      limit: topK,
    };

    if (userId) {
      searchParams.filter = {
        must: [{ key: "userId", match: { value: userId } }],
      };
    }

    const results = await client.search(collectionName, searchParams);
    if (!results || results.length === 0) return [];

    return results.map((r) => ({
      id: r.payload?.originalId || r.id.toString(),
      text: r.payload?.text || "",
      score: r.score ? r.score.toFixed(3) : "1.000",
    }));
  } catch (err) {
    console.warn(`⚠️ Qdrant search failed, using local store:`, err.message);
    qdrantAvailable = false;
    return localSearchCollection(collectionName, flatQueryEmbedding, topK, userId);
  }
}

export async function getOrCreateCollectionDocs(collectionName, userId) {
  if (!qdrantAvailable) {
    return localGetDocs(collectionName, userId);
  }

  try {
    await ensureCollection(collectionName, EMBEDDING_DIM);

    const scrollParams = { limit: 100, with_payload: true };
    if (userId) {
      scrollParams.filter = {
        must: [{ key: "userId", match: { value: userId } }],
      };
    }

    const response = await client.scroll(collectionName, scrollParams);
    if (!response || !response.points) return [];

    return response.points.map((p) => ({
      id: p.payload?.originalId || p.id.toString(),
      text: p.payload?.text || "",
    }));
  } catch (err) {
    console.warn(`⚠️ Qdrant scroll failed, using local store:`, err.message);
    qdrantAvailable = false;
    return localGetDocs(collectionName, userId);
  }
}
