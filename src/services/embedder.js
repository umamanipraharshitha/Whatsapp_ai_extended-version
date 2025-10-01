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

// Function to compute sentence embeddings with mean pooling
export async function embedText(textArray) {
  if (!localEmbedder) await initEmbedder();
  const embeddings = [];

  for (const text of textArray) {
    const output = await localEmbedder(text);

    let embedding;

    if (Array.isArray(output)) {
      // Case: direct JS array [[..],[..],...]
      const numTokens = output.length;
      const dim = output[0].length;
      embedding = Array(dim).fill(0);
      for (let t = 0; t < numTokens; t++) {
        for (let d = 0; d < dim; d++) {
          embedding[d] += output[t][d];
        }
      }
      embedding = embedding.map(v => v / numTokens);

    } else if (output?.data && output?.dims) {
      // Case: tensor-like { data: Float32Array, dims: [num_tokens, dim] }
      const arr = Array.from(output.data);
      const numTokens = output.dims[0];
      const dim = output.dims[1];

      embedding = Array(dim).fill(0);
      for (let t = 0; t < numTokens; t++) {
        for (let d = 0; d < dim; d++) {
          embedding[d] += arr[t * dim + d];
        }
      }
      embedding = embedding.map(v => v / numTokens);

    } else {
      console.error("⚠️ Unexpected output:", output);
      throw new Error("Unsupported embedding output format");
    }

    embeddings.push(embedding);
  }

  return embeddings;
}
