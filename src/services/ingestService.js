import { embedText } from "./embedder.js";
import { searchCollection, getOrCreateCollectionDocs, addToCollection } from "./vectorStore.js";
import { callGemini } from "./geminiClient.js";

const COLLECTION = "medical_docs";

export function chunkText(text, chunkSize = 200) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

export async function ingestDocument(text, userId = "web_user") {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    throw new Error("Nothing to ingest. Provide text content.");
  }

  const chunks = chunkText(trimmed);
  const docId = `doc_${Date.now()}`;

  for (let i = 0; i < chunks.length; i++) {
    const [embedding] = await embedText([chunks[i]]);
    await addToCollection(COLLECTION, {
      id: `${docId}_${i}`,
      text: chunks[i],
      embedding,
    }, userId);
  }

  return { docId, chunkCount: chunks.length };
}

export async function rerankDocuments(query, docs) {
  if (!docs || docs.length === 0) return [];

  let prompt = `Rank the following documents by relevance to the query:\nQuery: ${query}\nDocuments:\n`;
  docs.forEach((doc, i) => {
    prompt += `${i + 1}. ${doc.text}\n`;
  });
  prompt += "Return the indices of the most relevant documents first, separated by commas (e.g., 1, 2, 3). Do not include any other text.";

  try {
    const ranking = await callGemini(prompt);
    const indices = ranking
      .split(",")
      .map((x) => parseInt(x.trim(), 10) - 1)
      .filter((idx) => !isNaN(idx) && idx >= 0 && idx < docs.length);

    if (indices.length > 0) {
      return indices.map((idx) => docs[idx]);
    }
  } catch (err) {
    console.warn("[WARN] Gemini rerank failed:", err);
  }
  return docs;
}

export async function queryDocuments(question, userId = "web_user") {
  const text = (question || "").trim();
  if (!text) {
    throw new Error("Please provide a question.");
  }

  const [queryEmbedding] = await embedText([text]);

  const semResults = await searchCollection(COLLECTION, queryEmbedding, 5, userId);
  const col = await getOrCreateCollectionDocs(COLLECTION, userId);
  const keywordDocs = col.filter((item) => item.text.toLowerCase().includes(text.toLowerCase()));

  const merged = [...semResults];
  const semIds = new Set(semResults.map((item) => item.id));
  for (const item of keywordDocs) {
    if (!semIds.has(item.id)) {
      merged.push({ ...item, score: "1.000" });
    }
  }

  const finalDocs = merged.slice(0, 5);
  if (finalDocs.length === 0) {
    return { answer: null, message: "No documents found. Ingest some knowledge first." };
  }

  const reranked = await rerankDocuments(text, finalDocs);
  const context = reranked.map((d) => d.text).join("\n\n");
  const prompt = `Use the following context to answer the question:\n\nContext:\n${context}\n\nQuestion: ${text}\nAnswer:`;
  const answer = await callGemini(prompt);

  return { answer, sources: finalDocs.length };
}

export async function generalChat(message) {
  const text = (message || "").trim();
  if (!text) {
    throw new Error("Please provide a message.");
  }
  const answer = await callGemini(text);
  return { answer };
}
