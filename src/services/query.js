// src/services/query.js
import { embedText } from "./embedder.js";
import { searchCollection } from "./vectorStore.js";

const queryText = process.argv[2] || "Hello world";

async function query() {
  console.log("🔎 Query:", queryText);

  const [queryEmbedding] = await embedText([queryText]);
  const results = await searchCollection("medical_docs", queryEmbedding);

  console.log("\n💡 Top Matches:");
  results.forEach((r, i) => {
    console.log(`\n#${i + 1}`);
    console.log(`📄 ID: ${r.id}`);
    console.log(`📝 Text: ${r.text}`);
    console.log(`🎯 Score: ${r.score}`);
  });
}

await query();
