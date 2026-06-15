// src/services/remainders.js
import { Queue, Worker } from "bullmq";
import Redis from "ioredis";
import { removeReminder } from "./medstore.js";
import { sendWhatsApp } from "./whatsapp.js";
const redisUrl = String(process.env.REDIS_URL).trim();

// Initialize connection with appropriate configuration for BullMQ
const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// Create Queue
const reminderQueue = new Queue("whatsapp-reminders", { connection });

/**
 * Start reminder worker listener
 */
export async function startReminderWorker() {
  console.log("⏳ Starting BullMQ reminder worker...");

  const worker = new Worker(
    "whatsapp-reminders",
    async (job) => {
      const { to, text } = job.data;
      console.log(`⏰ [BullMQ] Reminder fired for ${to}: "${text}"`);
      
      // Send message
      await sendWhatsApp({ to, text });

      // Clean up Firestore record for one-time reminders
      if (job.opts?.delay) {
        await removeReminder(to, job.id);
      }
    },
    { connection }
  );

  worker.on("ready", () => {
    console.log("✅ BullMQ reminder worker is ready and listening to Redis.");
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ BullMQ job ${job?.id} failed:`, err);
  });
}

/**
 * Schedule a one-off or recurring reminder job
 */
export async function scheduleMedicationReminder({ to, text, sendAt, cron, meta }) {
  const jobId = `${to}-${Date.now()}`;

  try {
    if (sendAt) {
      const delay = Math.max(0, new Date(sendAt).getTime() - Date.now());
      console.log(`⏱️ Queuing delayed job for ${to} in ${delay}ms`);
      
      const job = await reminderQueue.add(
        "reminder-job",
        { to, text },
        { delay, jobId }
      );
      
      return { jobId: job.id, type: "once", sendAt };
    }

    if (cron) {
      console.log(`⏱️ Queuing repeatable cron job for ${to}: "${cron}"`);
      
      const job = await reminderQueue.add(
        "reminder-job",
        { to, text },
        {
          repeat: { pattern: cron },
          jobId
        }
      );
      
      return { jobId: job.id, type: "cron", cron };
    }
  } catch (err) {
    console.error("❌ Failed to add job to BullMQ queue:", err);
    throw err;
  }

  throw new Error("Must provide sendAt or cron");
}

/**
 * Cancel a reminder from the queue (both standard and repeatable)
 */
export async function cancelReminder(jobId) {
  try {
    let canceled = false;

    // 1. Try to delete one-off delayed job
    const job = await reminderQueue.getJob(jobId);
    if (job) {
      await job.remove();
      canceled = true;
      console.log(`🗑️ Removed one-off job ${jobId} from queue.`);
    }

    // 2. Clear repeatable cron rules matching the ID
    const repeatableJobs = await reminderQueue.getRepeatableJobs();
    for (const rj of repeatableJobs) {
      if (rj.id === jobId || rj.key.includes(jobId)) {
        await reminderQueue.removeRepeatableByKey(rj.key);
        canceled = true;
        console.log(`🗑️ Removed repeatable cron rule ${rj.key}`);
      }
    }

    return canceled;
  } catch (err) {
    console.error(`❌ Failed to cancel reminder ${jobId}:`, err);
    return false;
  }
}
