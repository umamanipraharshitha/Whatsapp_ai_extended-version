import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let client = null;
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
} else {
  console.warn("⚠️ Twilio credentials missing. WhatsApp messages will only be logged to console.");
}

export async function sendWhatsApp({ to, text }) {
  try {
    if (client) {
      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        to,
        body: text,
      });
      console.log(`📩 WhatsApp sent to ${to}: ${text}`);
    } else {
      console.log(`[MOCK WHATSAPP] to ${to}: ${text}`);
    }
  } catch (err) {
    console.error("❌ Failed to send WhatsApp:", err.message);
  }
}

