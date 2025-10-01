// testReminder.js
import { scheduleMedicationReminder, startReminderWorker } from "./src/services/remainders.js";

// 1. Start the worker to listen for jobs
startReminderWorker();

// 2. Schedule a one-off reminder for 1 minute from now
(async () => {
  console.log("⏳ Scheduling test reminder for 1 minute from now...");

  const result = await scheduleMedicationReminder({
    to: "whatsapp:+918374675522",   // your WhatsApp number
    text: "💊 Test reminder: Take your medicine!",
    sendAt: new Date(Date.now() + 60000).toISOString() // 1 minute later
  });

  console.log("📌 Reminder scheduled:", result);
})();
