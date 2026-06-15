// src/services/embedder.js
import { pipeline } from "@xenova/transformers";

let localEmbedder = null;

export async function initEmbedder() {
  if (!localEmbedder) {
    console.log("⏳ Loading embedding model...");
    localEmbedder = await pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    );
    console.log("✅ Embedding model loaded.");
  }
}

export async function embedText(textArray) {
  if (!localEmbedder) await initEmbedder();

  const embeddings = [];

  for (const text of textArray) {
    const output = await localEmbedder(text, {
      pooling: "mean",
      normalize: true
    });

    const embedding = Array.from(output.data);

    embeddings.push(embedding);
  }

  return embeddings;
}
