import dotenv from "dotenv";
dotenv.config(); // Load .env first

import express from "express";
import bodyParser from "body-parser";

import { embedText } from "./src/services/embedder.js";
import { searchCollection } from "./src/services/vectorStore.js";
import { callGemini } from "./src/services/geminiClient.js";

import { parseMedicationRequest, buildCronFromParts } from "./src/services/nlpHelpers.js";
import { startReminderWorker, scheduleMedicationReminder, cancelReminder } from "./src/services/remainders.js";
import { upsertMed, addReminder, listReminders, removeReminder } from "./src/services/medStore.js";
import { sendWhatsApp } from "./src/services/whatsapp.js";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

/**
 * Start reminder worker
 */
startReminderWorker();

/**
 * WhatsApp webhook
 */
app.post("/whatsapp", async (req, res) => {
  try {
    const { Body, From } = req.body;
    const text = (Body || "").trim();

    // --- Quick opt-out ---
    if (/stop reminders|unsubscribe|stop$/i.test(text)) {
      const reminders = listReminders(From);
      for (const r of reminders) {
        if (r.jobId) await cancelReminder(r.jobId).catch(() => null);
        removeReminder(From, r.id);
      }
      await sendWhatsApp({
        to: From,
        text: "You have been unsubscribed from reminders. If this was a mistake, send 'start reminders'.",
      });
      return res.sendStatus(200);
    }

    // --- Parse medication request ---
    const medReq = parseMedicationRequest(text);

    if (medReq?.intent === "schedule_med") {
      const reminderText = medReq.medName
        ? `Reminder: take ${medReq.dose ? medReq.dose + " " : ""}${medReq.medName}`
        : "Reminder: take your medication";

      let sendAt = null;
      if (medReq.date && medReq.time) {
        sendAt = new Date(`${medReq.date}T${medReq.time}`);
      } else if (medReq.datetime) {
        sendAt = new Date(medReq.datetime);
      } else if (medReq.relativeMinutes) {
        sendAt = new Date(Date.now() + medReq.relativeMinutes * 60000);
      } else {
        sendAt = new Date(Date.now() + 60 * 1000); // default 1 min
      }

      console.log(`⏱️ Scheduling reminder for ${reminderText} at ${sendAt.toISOString()}`);

      let scheduled;
      if (medReq.freq === "once" || sendAt) {
        scheduled = await scheduleMedicationReminder({
          to: From,
          text: reminderText,
          sendAt: sendAt.toISOString(),
          meta: { med: medReq.medName || "medication" },
        });
      } else {
        const cron = buildCronFromParts({
          time: medReq.time || "09:00",
          tz: process.env.TIMEZONE || undefined,
          freq: medReq.freq,
        });
        scheduled = await scheduleMedicationReminder({
          to: From,
          text: reminderText,
          cron,
          meta: { med: medReq.medName || "medication" },
        });
      }

      // Persist med + reminder
      const medId = `${From}::${medReq.medName || "medication"}`;
      upsertMed(From, {
        id: medId,
        name: medReq.medName || "medication",
        dose: medReq.dose,
        createdAt: new Date().toISOString(),
      });
      addReminder(From, {
        id: scheduled.jobId,
        jobId: scheduled.jobId,
        medId,
        text: reminderText,
        scheduled,
      });

      await sendWhatsApp({
        to: From,
        text: `✅ Reminder scheduled for ${medReq.medName || "your medication"}.`,
      });
      await sendWhatsApp({
        to: From,
        text: `⚠️ Note: I provide reminders and general info, not medical advice. For urgent medical issues, consult a professional.`,
      });

      return res.sendStatus(200);
    }

    // --- List reminders ---
    if (/list reminders/i.test(text)) {
      const reminders = listReminders(From);
      if (!reminders.length) {
        await sendWhatsApp({ to: From, text: "You have no scheduled reminders." });
        return res.sendStatus(200);
      }
      const summary = reminders
        .map(
          (r, i) =>
            `${i + 1}. ${r.text} (${r.scheduled.type} - ${r.scheduled.cron || r.scheduled.sendAt})\nID:${r.id}`
        )
        .join("\n\n");
      await sendWhatsApp({ to: From, text: `Your Reminders:\n\n${summary}` });
      return res.sendStatus(200);
    }

    // --- Cancel reminder ---
    if (/cancel reminder\s*(\S+)?/i.test(text)) {
      const m = text.match(/cancel reminder\s*(\S+)?/i);
      const id = m?.[1];
      if (!id) {
        await sendWhatsApp({
          to: From,
          text: "Please provide the reminder ID to cancel. Send 'list reminders' first.",
        });
        return res.sendStatus(200);
      }
      const reminders = listReminders(From);
      const rem = reminders.find((r) => r.id === id || r.jobId === id);
      if (!rem) {
        await sendWhatsApp({
          to: From,
          text: "Couldn't find that reminder. Send 'list reminders' to check IDs.",
        });
        return res.sendStatus(200);
      }
      await cancelReminder(rem.jobId).catch(() => null);
      removeReminder(From, rem.id);
      await sendWhatsApp({ to: From, text: `✅ Canceled reminder ${rem.id}` });
      return res.sendStatus(200);
    }

    // --- Fallback: health Q/A ---
    const [queryEmbedding] = await embedText([text]);
    const docs = searchCollection("medical_docs", queryEmbedding, 3);
    const context = docs.map((d) => d.text).join("\n\n");

    const prompt = `You are a cautious medical assistant. Use the context to answer. Do NOT give medical diagnosis. Suggest consulting a doctor for urgent concerns.\nContext:\n${context}\nQuestion: ${text}`;
    const answer = await callGemini(prompt);

    const escalation = /emergency|urgent|call.*doctor|go to.*hospital/i.test(answer)
      ? "\n\nIf this is an emergency, please call local emergency services immediately."
      : "";

    await sendWhatsApp({ to: From, text: answer + escalation });
    return res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

/**
 * Start server
 */
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp AI backend running on port ${PORT}`)
);
