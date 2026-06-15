// src/services/vectorStore.js

import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";

const client = new QdrantClient({
  url: process.env.QDRANT_URL?.trim(),
  apiKey: process.env.QDRANT_API_KEY?.trim(),
});

// Fixed UUID namespace
const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Ensures collection and payload index exist
 */
async function ensureCollection(collectionName, vectorSize = 768) {
  try {
    const collections = await client.getCollections();

    const exists = collections.collections.some(
      (c) => c.name === collectionName
    );

    if (!exists) {
      console.log(`🆕 Creating Qdrant collection: ${collectionName}`);

      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: "Cosine",
        },
      });

      console.log(`✅ Collection created: ${collectionName}`);
    }

    // Always try to create index
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: "userId",
        field_schema: "keyword",
      });

      console.log(`✅ userId payload index ensured`);
    } catch (indexErr) {
      console.log(
        `ℹ️ userId index already exists or could not be recreated`
      );
    }
  } catch (err) {
    console.error(
      `❌ Error ensuring collection ${collectionName}:`,
      err
    );
    throw err;
  }
}

/**
 * Add document
 */
export async function addToCollection(
  collectionName,
  item,
  userId
) {
  try {
    const flatEmbedding = Array.isArray(item.embedding)
      ? item.embedding.map(Number)
      : [];

    await ensureCollection(
      collectionName,
      flatEmbedding.length || 768
    );

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
            userId: userId || "default",
          },
        },
      ],
    });

    console.log(
      `✅ Added document ${item.id} to ${collectionName}`
    );
  } catch (err) {
    console.error(
      `❌ Error adding document ${item.id} to Qdrant:`,
      err
    );
    throw err;
  }
}

/**
 * Search collection
 */
export async function searchCollection(
  collectionName,
  queryEmbedding,
  topK = 3,
  userId
) {
  try {
    const flatQueryEmbedding = Array.isArray(queryEmbedding)
      ? queryEmbedding.map(Number)
      : [];

    await ensureCollection(
      collectionName,
      flatQueryEmbedding.length || 768
    );

    const searchParams = {
      vector: flatQueryEmbedding,
      limit: topK,
      with_payload: true,
    };

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

    const results = await client.search(
      collectionName,
      searchParams
    );

    if (!results?.length) {
      return [];
    }

    return results.map((r) => ({
      id: r.payload?.originalId || String(r.id),
      text: r.payload?.text || "",
      score: r.score || 0,
    }));
  } catch (err) {
    console.error(
      `❌ Error querying collection ${collectionName} in Qdrant:`,
      err
    );
    return [];
  }
}

/**
 * Get all docs
 */
export async function getOrCreateCollectionDocs(
  collectionName,
  userId
) {
  try {
    await ensureCollection(collectionName);

    const scrollParams = {
      limit: 100,
      with_payload: true,
      with_vector: false,
    };

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

    const response = await client.scroll(
      collectionName,
      scrollParams
    );

    if (!response?.points?.length) {
      return [];
    }

    return response.points.map((p) => ({
      id: p.payload?.originalId || String(p.id),
      text: p.payload?.text || "",
    }));
  } catch (err) {
    console.error(
      `❌ Error getting docs for collection ${collectionName} in Qdrant:`,
      err
    );
    return [];
  }
}
