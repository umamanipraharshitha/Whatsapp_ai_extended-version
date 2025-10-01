// src/services/medStore.js
import fs from "fs";
import path from "path";

const STORE_PATH = path.resolve("./meds.json");

let store = { users: {} };

// Load existing
try {
  if (fs.existsSync(STORE_PATH)) {
    store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  }
} catch (e) {
  console.error("Failed to load meds store:", e);
}

function save() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save meds store:", e);
  }
}

export function getUserData(userId) {
  if (!store.users[userId]) store.users[userId] = { meds: [], reminders: [] };
  return store.users[userId];
}

export function upsertMed(userId, med) {
  const user = getUserData(userId);
  const idx = user.meds.findIndex(m => m.id === med.id);
  if (idx >= 0) user.meds[idx] = med;
  else user.meds.push(med);
  save();
}

export function addReminder(userId, reminder) {
  const user = getUserData(userId);
  user.reminders.push(reminder);
  save();
}

export function removeReminder(userId, reminderId) {
  const user = getUserData(userId);
  user.reminders = user.reminders.filter(r => r.id !== reminderId);
  save();
}

export function listReminders(userId) {
  const user = getUserData(userId);
  return user.reminders || [];
}

export function listMeds(userId) {
  const user = getUserData(userId);
  return user.meds || [];
}

export function clearAllUserData(userId) {
  delete store.users[userId];
  save();
}
