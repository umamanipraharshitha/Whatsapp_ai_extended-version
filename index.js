import "dotenv/config";

import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

import { embedText } from "./src/services/embedder.js";
import { searchCollection, getOrCreateCollectionDocs, addToCollection } from "./src/services/vectorStore.js";
import { callGemini } from "./src/services/geminiClient.js";

import { parseMedicationRequest, buildCronFromParts } from "./src/services/nlpHelpers.js";
import { startReminderWorker, scheduleMedicationReminder, cancelReminder } from "./src/services/remainders.js";
import {
  getUserData,
  upsertMed,
  addReminder,
  listReminders,
  removeReminder,
  setUserMode,
  incrementMessageCount
} from "./src/services/medstore.js";
import { sendWhatsApp } from "./src/services/whatsapp.js";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Initialize Gemini SDK client for Vision/OCR ingestion
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Start reminder worker
 */
startReminderWorker();

// --- Chunking helper ---
function chunkText(text, chunkSize = 200) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }
  return chunks;
}

// --- Gemini Reranking helper ---
async function rerankDocuments(query, docs) {
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
      .map(x => parseInt(x.trim(), 10) - 1)
      .filter(idx => !isNaN(idx) && idx >= 0 && idx < docs.length);
    
    if (indices.length > 0) {
      return indices.map(idx => docs[idx]);
    }
  } catch (err) {
    console.warn("[WARN] Gemini rerank failed:", err);
  }
  return docs;
}

// --- Image/File text extraction helper using Gemini ---
async function extractTextFromMedia(url, contentType) {
  try {
    console.log(`📥 Downloading media from ${url} (${contentType})...`);
    const resp = await fetch(url);
    const buffer = await resp.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");

    console.log("🧬 Sending media to Gemini Vision model for text extraction...");
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: base64,
                mimeType: contentType
              }
            },
            { text: "Extract and transcribe all the textual details, instructions, data, or notes in this file/image accurately. Output only the extracted text." }
          ]
        }
      ]
    });
    return response.text || "";
  } catch (err) {
    console.error("❌ Failed to extract text from media:", err);
    throw err;
  }
}

/**
 * WhatsApp webhook
 */
app.post("/whatsapp", async (req, res) => {
  try {
    const { Body, From, MediaUrl0, MediaContentType0 } = req.body;
    const text = (Body || "").trim();
    const hasMedia = !!MediaUrl0;

    // Retrieve or initialize user document
    const userData = await getUserData(From);

    // --- Message usage limits check ---
    if (userData.tier === "free" && (userData.messageCount || 0) >= 10) {
      await sendWhatsApp({
        to: From,
        text: "⚠️ You have reached your limit of 10 free messages. To upgrade to the premium version and get unlimited access, please send an email to contact@aplora.xyz.",
      });
      return res.sendStatus(200);
    }

    // Increment message count
    await incrementMessageCount(From);

    // --- Command: Menu reset ---
    if (/^menu$|^mode$/i.test(text)) {
      await setUserMode(From, null);
      await sendWhatsApp({
        to: From,
        text: "Please choose a mode by replying with the number:\n\n1️⃣ Ingest document/images\n2️⃣ Ask questions based on document\n3️⃣ General questions (Gemini API)\n4️⃣ Setting reminders",
      });
      return res.sendStatus(200);
    }

    // --- Mode selection logic ---
    if (userData.mode === null || userData.mode === undefined) {
      if (["1", "2", "3", "4"].includes(text)) {
        await setUserMode(From, text);
        let welcomeMsg = "";
        switch (text) {
          case "1":
            welcomeMsg = "📂 You are now in Mode 1: Ingest document/images. Send any text block or upload an image, and I will index it into the vector database.";
            break;
          case "2":
            welcomeMsg = "🔍 You are now in Mode 2: Ask questions based on document. Send your question, and I will retrieve matching contexts and answer.";
            break;
          case "3":
            welcomeMsg = "💬 You are now in Mode 3: General questions. Feel free to ask anything, and I will answer directly.";
            break;
          case "4":
            welcomeMsg = "⏱️ You are now in Mode 4: Setting reminders. You can schedule medications or setup any reminders.";
            break;
        }
        await sendWhatsApp({ to: From, text: welcomeMsg });
        return res.sendStatus(200);
      } else {
        await sendWhatsApp({
          to: From,
          text: "Welcome! Please choose a mode by replying with the number:\n\n1️⃣ Ingest document/images\n2️⃣ Ask questions based on document\n3️⃣ General questions (Gemini API)\n4️⃣ Setting reminders\n\n(You can reply 'menu' at any time to return to this selection).",
        });
        return res.sendStatus(200);
      }
    }

    // --- Execute active mode ---
    switch (String(userData.mode)) {
      case "1": {
        // Mode 1: Ingest document/images
        let textToIngest = "";

        if (hasMedia) {
          try {
            await sendWhatsApp({ to: From, text: "⏳ Processing image/document. Extracting text..." });
            textToIngest = await extractTextFromMedia(MediaUrl0, MediaContentType0);
          } catch (err) {
            await sendWhatsApp({ to: From, text: "❌ Failed to extract text from your media. Please try again." });
            return res.sendStatus(200);
          }
        } else {
          textToIngest = text;
        }

        if (!textToIngest.trim()) {
          await sendWhatsApp({ to: From, text: "⚠️ Nothing found to ingest. Please send text or upload an image." });
          return res.sendStatus(200);
        }

        // Chunk and embed
        const chunks = chunkText(textToIngest);
        const docId = `doc_${Date.now()}`;
        for (let i = 0; i < chunks.length; i++) {
          const [embedding] = await embedText([chunks[i]]);
          await addToCollection("medical_docs", {
            id: `${docId}_${i}`,
            text: chunks[i],
            embedding
          });
        }

        await sendWhatsApp({
          to: From,
          text: `✅ Ingestion successful! Document chunked into ${chunks.length} segments and saved in ChromaDB.`,
        });
        break;
      }

      case "2": {
        // Mode 2: RAG Q&A
        if (!text) {
          await sendWhatsApp({ to: From, text: "Please send a text question." });
          return res.sendStatus(200);
        }

        const [queryEmbedding] = await embedText([text]);
        
        // Hybrid retrieval: Semantic + Keyword
        const semResults = await searchCollection("medical_docs", queryEmbedding, 5);
        const col = await getOrCreateCollectionDocs("medical_docs");
        const keywordDocs = col.filter(item => item.text.toLowerCase().includes(text.toLowerCase()));
        
        // Merge & deduplicate
        const merged = [...semResults];
        const semIds = new Set(semResults.map(item => item.id));
        for (const item of keywordDocs) {
          if (!semIds.has(item.id)) {
            merged.push({ ...item, score: "1.000" });
          }
        }

        const finalDocs = merged.slice(0, 5);

        if (finalDocs.length === 0) {
          await sendWhatsApp({
            to: From,
            text: "⚠️ No documents found in ChromaDB. Switch to Mode 1 to ingest some knowledge first.",
          });
          return res.sendStatus(200);
        }

        // Reranking
        const reranked = await rerankDocuments(text, finalDocs);
        const context = reranked.map(d => d.text).join("\n\n");

        const prompt = `Use the following context to answer the question:\n\nContext:\n${context}\n\nQuestion: ${text}\nAnswer:`;
        const answer = await callGemini(prompt);

        await sendWhatsApp({ to: From, text: answer });
        break;
      }

      case "3": {
        // Mode 3: General QA
        if (!text) {
          await sendWhatsApp({ to: From, text: "Please send a text question." });
          return res.sendStatus(200);
        }
        const answer = await callGemini(text);
        await sendWhatsApp({ to: From, text: answer });
        break;
      }

      case "4": {
        // Mode 4: Setting Reminders & Scheduling
        if (/stop reminders|unsubscribe|stop$/i.test(text)) {
          const reminders = await listReminders(From);
          for (const r of reminders) {
            if (r.jobId) await cancelReminder(r.jobId).catch(() => null);
            await removeReminder(From, r.id);
          }
          await sendWhatsApp({
            to: From,
            text: "You have been unsubscribed from reminders.",
          });
          return res.sendStatus(200);
        }

        if (/list reminders/i.test(text)) {
          const reminders = await listReminders(From);
          if (!reminders.length) {
            await sendWhatsApp({ to: From, text: "You have no scheduled reminders." });
            return res.sendStatus(200);
          }
          const summary = reminders
            .map(
              (r, i) =>
                `${i + 1}. ${r.text} (${r.scheduled.type} - ${r.scheduled.cron || r.scheduled.sendAt})\nID: ${r.id}`
            )
            .join("\n\n");
          await sendWhatsApp({ to: From, text: `Your Reminders:\n\n${summary}` });
          return res.sendStatus(200);
        }

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
          const reminders = await listReminders(From);
          const rem = reminders.find((r) => r.id === id || r.jobId === id);
          if (!rem) {
            await sendWhatsApp({
              to: From,
              text: "Couldn't find that reminder. Send 'list reminders' to check IDs.",
            });
            return res.sendStatus(200);
          }
          await cancelReminder(rem.jobId).catch(() => null);
          await removeReminder(From, rem.id);
          await sendWhatsApp({ to: From, text: `✅ Canceled reminder ${rem.id}` });
          return res.sendStatus(200);
        }

        // Parse medication/reminder request
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
          await upsertMed(From, {
            id: medId,
            name: medReq.medName || "medication",
            dose: medReq.dose,
            createdAt: new Date().toISOString(),
          });
          await addReminder(From, {
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
          break;
        } else {
          // General reminder fallback
          const sendAt = new Date(Date.now() + 60 * 1000); // 1 minute default
          const scheduled = await scheduleMedicationReminder({
            to: From,
            text: `Reminder: ${text}`,
            sendAt: sendAt.toISOString(),
            meta: { med: "general" }
          });

          await addReminder(From, {
            id: scheduled.jobId,
            jobId: scheduled.jobId,
            medId: `${From}::general`,
            text: `Reminder: ${text}`,
            scheduled
          });

          await sendWhatsApp({
            to: From,
            text: `✅ Reminder scheduled in 1 minute: "${text}".`,
          });
          break;
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in WhatsApp webhook:", err);
    res.sendStatus(500);
  }
});

/**
 * Start server
 */
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp AI multi-mode backend running on port ${PORT}`)
);
