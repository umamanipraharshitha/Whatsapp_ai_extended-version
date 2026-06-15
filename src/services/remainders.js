// src/services/remainders.js
import { Redis } from "@upstash/redis";
import schedule from "node-schedule";
import { removeReminder } from "./medstore.js";
import { sendWhatsApp } from "./whatsapp.js";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL?.trim(),
  token: process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
});

const activeJobs = new Map();

/**
 * Start reminder worker listener / rescheduler
 */
export async function startReminderWorker() {
  console.log("⏳ Starting Node-Schedule reminder worker...");

  try {
    const allJobs = await redis.hgetall("whatsapp_active_reminders");
    if (allJobs) {
      console.log(`📋 Found ${Object.keys(allJobs).length} reminders in Upstash Redis. Rescheduling...`);
      for (const [jobId, jobDataStr] of Object.entries(allJobs)) {
        try {
          const jobData = typeof jobDataStr === "string" ? JSON.parse(jobDataStr) : jobDataStr;
          await scheduleJobInMemory(jobData);
        } catch (err) {
          console.error(`❌ Failed to reschedule job ${jobId}:`, err);
        }
      }
    }
    console.log("✅ Node-Schedule reminder worker is ready and initialized.");
  } catch (err) {
    console.error("❌ Failed to initialize reminders from Upstash Redis:", err);
  }
}

/**
 * Helper to schedule a job in memory using node-schedule
 */
async function scheduleJobInMemory(jobData) {
  const { to, text, sendAt, cron, jobId } = jobData;

  // If there's an existing job, cancel it first
  if (activeJobs.has(jobId)) {
    activeJobs.get(jobId).cancel();
  }

  if (sendAt) {
    const runDate = new Date(sendAt);
    if (runDate.getTime() <= Date.now()) {
      // Run immediately if it was missed
      console.log(`⏱️ Job ${jobId} was scheduled in the past (${sendAt}). Running immediately.`);
      executeJob(jobData);
    } else {
      const job = schedule.scheduleJob(runDate, () => executeJob(jobData));
      if (job) {
        activeJobs.set(jobId, job);
      }
    }
  } else if (cron) {
    const job = schedule.scheduleJob(cron, () => executeJob(jobData));
    if (job) {
      activeJobs.set(jobId, job);
    }
  }
}

async function executeJob(jobData) {
  const { to, text, sendAt, jobId } = jobData;
  console.log(`⏰ [Node-Schedule] Reminder fired for ${to}: "${text}"`);
  try {
    await sendWhatsApp({ to, text });
    if (sendAt) {
      // Clean up one-time reminder
      await cancelReminder(jobId);
      await removeReminder(to, jobId);
    }
  } catch (err) {
    console.error(`❌ Failed to execute scheduled reminder ${jobId}:`, err);
  }
}

/**
 * Schedule a one-off or recurring reminder job
 */
export async function scheduleMedicationReminder({ to, text, sendAt, cron, meta }) {
  const jobId = `${to}-${Date.now()}`;
  const jobData = { to, text, sendAt, cron, meta, jobId };

  try {
    // Save to Upstash Redis for persistence
    await redis.hset("whatsapp_active_reminders", { [jobId]: JSON.stringify(jobData) });

    // Schedule in memory
    await scheduleJobInMemory(jobData);

    if (sendAt) {
      return { jobId, type: "once", sendAt };
    }
    if (cron) {
      return { jobId, type: "cron", cron };
    }
  } catch (err) {
    console.error("❌ Failed to schedule reminder:", err);
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

    // Remove from node-schedule in memory
    const job = activeJobs.get(jobId);
    if (job) {
      job.cancel();
      activeJobs.delete(jobId);
      canceled = true;
    }

    // Remove from Upstash Redis
    const deletedCount = await redis.hdel("whatsapp_active_reminders", jobId);
    if (deletedCount > 0) {
      canceled = true;
    }

    // Also support repeatable jobs check
    const allJobs = await redis.hgetall("whatsapp_active_reminders");
    if (allJobs) {
      for (const [existingJobId, jobDataStr] of Object.entries(allJobs)) {
        if (existingJobId === jobId || existingJobId.includes(jobId)) {
          const inMemJob = activeJobs.get(existingJobId);
          if (inMemJob) {
            inMemJob.cancel();
            activeJobs.delete(existingJobId);
          }
          await redis.hdel("whatsapp_active_reminders", existingJobId);
          canceled = true;
          console.log(`🗑️ Removed repeatable cron rule ${existingJobId}`);
        }
      }
    }

    return canceled;
  } catch (err) {
    console.error(`❌ Failed to cancel reminder ${jobId}:`, err);
    return false;
  }
}
