import "dotenv/config";
import { initEmbedder } from "./embedder.js";
import { ingestDocument } from "./ingestService.js";

const text = process.argv.slice(2).join(" ") || "Sample medical text for testing ingestion.";

await initEmbedder();
const result = await ingestDocument(text, "cli_user");
console.log(`✅ Ingested ${result.chunkCount} chunks (docId: ${result.docId})`);
