/**
 * Simulates Twilio WhatsApp webhook POSTs against the local backend.
 * Usage: node src/simulate/whatsappSim.js
 *
 * Requires: backend running (node index.js) with MOCK_WHATSAPP=true in .env
 */
import "dotenv/config";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const FROM = process.env.SIMULATE_FROM || "whatsapp:+919999999999";

async function twilioPost(body) {
  const params = new URLSearchParams({ From: FROM, ...body });
  const res = await fetch(`${BASE}/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return res.status;
}

async function step(label, body) {
  process.stdout.write(`\n▶ ${label} ... `);
  const status = await twilioPost(body);
  console.log(status === 200 ? "OK (200)" : `FAILED (${status})`);
  if (status !== 200) throw new Error(`Step failed: ${label}`);
  // allow async handler to finish
  await new Promise((r) => setTimeout(r, 1500));
}

async function main() {
  console.log("🧪 Twilio WhatsApp simulation");
  console.log(`   Backend: ${BASE}/whatsapp`);
  console.log(`   Fake user: ${FROM}`);

  // health check first
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error("\n❌ Backend not running. Start it first: node index.js");
    process.exit(1);
  }
  console.log("✅ Backend is up");

  await step("Reset to menu", { Body: "menu" });
  await step("Select Mode 1 — Ingest", { Body: "1" });
  await step("Ingest medical text", {
    Body: "Paracetamol is used for pain and fever relief. Common side effects include nausea, rash, and liver damage at high doses. Maximum daily dose is 4000mg for adults.",
  });
  await step("Reset to menu", { Body: "menu" });
  await step("Select Mode 2 — Document Q&A", { Body: "2" });
  await step("Ask about side effects", { Body: "What are the side effects of Paracetamol?" });
  await step("Reset to menu", { Body: "menu" });
  await step("Select Mode 3 — General chat", { Body: "3" });
  await step("General health question", { Body: "What is a normal body temperature in Celsius?" });

  console.log("\n✅ Simulation complete.");
  console.log("   Check the backend terminal for [MOCK WHATSAPP] reply lines.");
}

main().catch((err) => {
  console.error("\n❌ Simulation error:", err.message);
  process.exit(1);
});
