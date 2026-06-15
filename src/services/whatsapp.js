import twilio from "twilio";

const mockMode = process.env.MOCK_WHATSAPP === "true";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

/** Captured outbound messages when MOCK_WHATSAPP=true (for local testing). */
export const mockOutbox = [];

let client = null;
if (!mockMode && accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else if (mockMode) {
  console.log("🧪 MOCK_WHATSAPP enabled — outbound messages are logged, not sent via Twilio.");
} else {
  console.warn("⚠️ Twilio credentials missing. WhatsApp messages will only be logged to console.");
}

export function clearMockOutbox() {
  mockOutbox.length = 0;
}

export function getLastMockReply(to) {
  const msgs = mockOutbox.filter((m) => m.to === to);
  return msgs.length ? msgs[msgs.length - 1].text : null;
}

export async function sendWhatsApp({ to, text }) {
  try {
    if (mockMode || !client) {
      console.log(`[MOCK WHATSAPP] to ${to}: ${text}`);
      mockOutbox.push({ to, text, at: new Date().toISOString() });
      return;
    }

    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
      body: text,
    });
    console.log(`📩 WhatsApp sent to ${to}: ${text}`);
  } catch (err) {
    console.error("❌ Failed to send WhatsApp:", err.message);
    if (mockMode) {
      mockOutbox.push({ to, text, at: new Date().toISOString(), error: err.message });
    }
  }
}
