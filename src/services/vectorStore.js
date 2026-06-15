// src/services/vectorStore.js
import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";

const client = new QdrantClient({
  url: process.env.QDRANT_URL?.trim(),
  apiKey: process.env.QDRANT_API_KEY?.trim(),
});

// A fixed UUID namespace to deterministically generate UUIDs from Chroma-style string IDs.
const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Ensures the specified Qdrant collection exists.
 */
async function ensureCollection(collectionName, vectorSize = 768) {
  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);
    if (!exists) {
      console.log(`Creating Qdrant collection: "${collectionName}" with vector size ${vectorSize}...`);
      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });
    }
  } catch (err) {
    console.error(`❌ Error ensuring collection ${collectionName} in Qdrant:`, err);
    throw err;
  }
}

export async function addToCollection(collectionName, item, userId) {
  try {
    // Ensure embedding is a 1D array of numbers
    const flatEmbedding = Array.isArray(item.embedding)
      ? item.embedding.map(Number)
      : [];

    await ensureCollection(collectionName, flatEmbedding.length || 768);

    // Convert string ID to UUID v5 consistently
    const qdrantId = uuidv5(item.id, UUID_NAMESPACE);

    await client.upsert(collectionName, {
      wait: true,
      points: [
        {
          id: qdrantId,
          vector: flatEmbedding,
          payload: {
            originalId: item.id,
            text: item.text,
            userId: userId
          }
        }
      ]
    });
  } catch (err) {
    console.error(`❌ Error adding document ${item.id} to Qdrant:`, err);
    throw err;
  }
}

export async function searchCollection(collectionName, queryEmbedding, topK = 3, userId) {
  try {
    const flatQueryEmbedding = Array.isArray(queryEmbedding)
      ? queryEmbedding.map(Number)
      : [];

    await ensureCollection(collectionName, flatQueryEmbedding.length || 768);

    const searchParams = {
      vector: flatQueryEmbedding,
      limit: topK,
    };

    // Apply strict user filtration if userId is provided
    if (userId) {
      searchParams.filter = {
        must: [
          {
            key: "userId",
            match: {
              value: userId,
            },
          },
        ],
      };
    }

    const results = await client.search(collectionName, searchParams);

    if (!results || results.length === 0) {
      return [];
    }

    return results.map(r => ({
      id: r.payload?.originalId || r.id.toString(),
      text: r.payload?.text || "",
      score: r.score ? r.score.toFixed(3) : "1.000"
    }));
  } catch (err) {
    console.error(`❌ Error querying collection ${collectionName} in Qdrant:`, err);
    return [];
  }
}

export async function getOrCreateCollectionDocs(collectionName, userId) {
  try {
    await ensureCollection(collectionName, 768);

    const scrollParams = {
      limit: 100,
      with_payload: true,
    };

    // Apply strict user filtration if userId is provided
    if (userId) {
      scrollParams.filter = {
        must: [
          {
            key: "userId",
            match: {
              value: userId,
            },
          },
        ],
      };
    }

    const response = await client.scroll(collectionName, scrollParams);

    if (!response || !response.points) return [];

    return response.points.map(p => ({
      id: p.payload?.originalId || p.id.toString(),
      text: p.payload?.text || ""
    }));
  } catch (err) {
    console.error(`❌ Error getting docs for collection ${collectionName} in Qdrant:`, err);
    return [];
  }
}
