import twilio from "twilio";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendWhatsApp({ to, text }) {
  try {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to,
      body: text,
    });
    console.log(`📩 WhatsApp sent to ${to}: ${text}`);
  } catch (err) {
    console.error("❌ Failed to send WhatsApp:", err.message);
  }
}
