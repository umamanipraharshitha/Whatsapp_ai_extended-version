// src/services/vectorStore.js
import { ChromaClient } from "chromadb";

let clientOptions = {};
const chromaUrlStr = process.env.CHROMA_URL;

if (chromaUrlStr) {
  try {
    const parsed = new URL(chromaUrlStr);
    clientOptions.host = parsed.hostname;
    clientOptions.port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
    if (parsed.protocol === "https:") {
      clientOptions.ssl = true;
    }
  } catch (err) {
    clientOptions.path = chromaUrlStr;
  }
} else {
  clientOptions.host = "localhost";
  clientOptions.port = 8000;
}

const client = new ChromaClient(clientOptions);

export async function addToCollection(collectionName, item) {
  try {
    const collection = await client.getOrCreateCollection({
      name: collectionName,
    });
    
    // Ensure embedding is a 1D array of numbers
    const flatEmbedding = Array.isArray(item.embedding)
      ? item.embedding.map(Number)
      : [];

    await collection.add({
      ids: [item.id],
      embeddings: [flatEmbedding],
      documents: [item.text]
    });
  } catch (err) {
    console.error(`❌ Error adding document ${item.id} to ChromaDB:`, err);
    throw err;
  }
}

export async function searchCollection(collectionName, queryEmbedding, topK = 3) {
  try {
    const collection = await client.getOrCreateCollection({
      name: collectionName,
    });

    const flatQueryEmbedding = Array.isArray(queryEmbedding)
      ? queryEmbedding.map(Number)
      : [];

    const results = await collection.query({
      queryEmbeddings: [flatQueryEmbedding],
      nResults: topK
    });

    if (!results || !results.ids || !results.ids[0] || results.ids[0].length === 0) {
      return [];
    }

    const formatted = [];
    for (let i = 0; i < results.ids[0].length; i++) {
      formatted.push({
        id: results.ids[0][i],
        text: results.documents[0][i] || "",
        score: results.distances ? (1 - results.distances[0][i]).toFixed(3) : "1.000"
      });
    }

    return formatted;
  } catch (err) {
    console.error(`❌ Error querying collection ${collectionName} in ChromaDB:`, err);
    return [];
  }
}

export async function getOrCreateCollectionDocs(collectionName) {
  try {
    const collection = await client.getOrCreateCollection({
      name: collectionName,
    });
    const all = await collection.get();
    if (!all || !all.ids) return [];
    
    return all.ids.map((id, index) => ({
      id,
      text: all.documents[index] || ""
    }));
  } catch (err) {
    console.error(`❌ Error getting docs for collection ${collectionName} in ChromaDB:`, err);
    return [];
  }
}
