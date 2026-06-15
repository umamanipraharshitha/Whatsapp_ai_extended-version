// src/services/vectorStore.js

import { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";

const client = new QdrantClient({
  url: process.env.QDRANT_URL?.trim(),
  apiKey: process.env.QDRANT_API_KEY?.trim(),
});

const UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

// 🔥 FIXED VECTOR SIZE (MiniLM = 384)
const VECTOR_SIZE = 384;

async function ensureCollection(collectionName) {
  try {
    const collections = await client.getCollections();

    const exists = collections.collections.some(
      (c) => c.name === collectionName
    );

    if (!exists) {
      console.log(`🆕 Creating Qdrant collection: ${collectionName}`);

      await client.createCollection(collectionName, {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
      });

      console.log(`✅ Collection created: ${collectionName}`);
    }

    // userId index
    try {
      await client.createPayloadIndex(collectionName, {
        field_name: "userId",
        field_schema: "keyword",
      });

      console.log(`✅ userId payload index ensured`);
    } catch {
      console.log(`ℹ️ userId index already exists`);
    }
  } catch (err) {
    console.error(`❌ Error ensuring collection:`, err);
    throw err;
  }
}

export async function addToCollection(collectionName, item, userId) {
  try {
    const flatEmbedding = Array.isArray(item.embedding)
      ? item.embedding.map(Number)
      : [];

    if (!flatEmbedding.length) {
      throw new Error("❌ Empty embedding received");
    }

    // safety check
    if (flatEmbedding.length !== VECTOR_SIZE) {
      throw new Error(
        `❌ Vector size mismatch. Expected ${VECTOR_SIZE}, got ${flatEmbedding.length}`
      );
    }

    await ensureCollection(collectionName);

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
  } catch (err) {
    console.error("❌ Error adding to collection:", err);
    throw err;
  }
}
