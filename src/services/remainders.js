import schedule from "node-schedule";
import fs from "fs";
import path from "path";
import { listReminders, removeReminder } from "./medStore.js";
import { sendWhatsApp } from "./whatsapp.js";

// In-memory jobs
const jobs = {};

const STORE_PATH = path.resolve("./src/meds.json");

/**
 * Start reminder worker
 */
export async function startReminderWorker() {
  console.log("⏳ Starting reminder worker...");

  let store = { users: {} };
  try {
    if (fs.existsSync(STORE_PATH)) {
      const data = fs.readFileSync(STORE_PATH, "utf-8");
      store = JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load meds store:", e);
  }

  const users = Object.keys(store.users || {});

  for (const userId of users) {
    const reminders = listReminders(userId);
    for (const r of reminders) {
      if (r.scheduled?.sendAt) {
        const sendAt = new Date(r.scheduled.sendAt);
        if (sendAt > new Date()) {
          scheduleReminderJob(r.jobId, userId, r.text, sendAt);
        } else {
          removeReminder(userId, r.id);
        }
      } else if (r.scheduled?.cron) {
        scheduleReminderCron(r.jobId, userId, r.text, r.scheduled.cron);
      }
    }
  }

  console.log("✅ Reminder worker ready.");
}

/**
 * One-time reminder
 */
export async function scheduleMedicationReminder({ to, text, sendAt, cron, meta }) {
  const jobId = `${to}-${Date.now()}`;

  if (sendAt) {
    scheduleReminderJob(jobId, to, text, new Date(sendAt));
    return { jobId, type: "once", sendAt };
  }

  if (cron) {
    scheduleReminderCron(jobId, to, text, cron);
    return { jobId, type: "cron", cron };
  }

  throw new Error("Must provide sendAt or cron");
}

/**
 * Cancel a reminder
 */
export async function cancelReminder(jobId) {
  if (jobs[jobId]) {
    jobs[jobId].cancel();
    delete jobs[jobId];
    return true;
  }
  return false;
}

/**
 * Internal helpers
 */
function scheduleReminderJob(jobId, userId, text, date) {
  const job = schedule.scheduleJob(jobId, date, async () => {
    console.log(`💊 Reminder fired for ${userId}: ${text}`);
    await sendWhatsApp({ to: userId, text });
    removeReminder(userId, jobId);
    delete jobs[jobId];
  });
  jobs[jobId] = job;
}

function scheduleReminderCron(jobId, userId, text, cron) {
  const job = schedule.scheduleJob(jobId, cron, async () => {
    console.log(`💊 [CRON] Reminder fired for ${userId}: ${text}`);
    await sendWhatsApp({ to: userId, text });
  });
  jobs[jobId] = job;
}
