// src/services/medstore.js
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

const useLocalStore = process.env.MOCK_WHATSAPP === "true";
const localUsers = new Map();

if (useLocalStore) {
  console.log("🧪 MOCK_WHATSAPP — using in-memory user store (Firebase skipped).");
}

function defaultUser(userId) {
  return {
    id: userId,
    tier: "paid",
    messageCount: 0,
    mode: null,
    meds: [],
    reminders: [],
    updatedAt: new Date().toISOString(),
  };
}

function localGet(userId) {
  if (!localUsers.has(userId)) {
    localUsers.set(userId, defaultUser(userId));
  }
  return { ...localUsers.get(userId) };
}

function localSave(userId, data) {
  const current = localGet(userId);
  localUsers.set(userId, { ...current, ...data, updatedAt: new Date().toISOString() });
}

export async function getUserData(userId) {
  if (useLocalStore) return localGet(userId);

  try {
    const userDocRef = doc(db, "whatsapp_users", userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      return userDoc.data();
    }
    const defaultData = defaultUser(userId);
    defaultData.tier = "free";
    await setDoc(userDocRef, defaultData);
    return defaultData;
  } catch (err) {
    console.error(`Error in getUserData for ${userId}:`, err.message);
    return defaultUser(userId);
  }
}

export async function saveUserData(userId, data) {
  if (useLocalStore) {
    localSave(userId, data);
    return;
  }

  try {
    const userDocRef = doc(db, "whatsapp_users", userId);
    await setDoc(userDocRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error(`Error saving user data for ${userId}:`, err.message);
  }
}

export async function upsertMed(userId, med) {
  const user = await getUserData(userId);
  const meds = user.meds || [];
  const idx = meds.findIndex((m) => m.id === med.id);
  if (idx >= 0) meds[idx] = med;
  else meds.push(med);
  await saveUserData(userId, { meds });
}

export async function addReminder(userId, reminder) {
  const user = await getUserData(userId);
  const reminders = user.reminders || [];
  reminders.push(reminder);
  await saveUserData(userId, { reminders });
}

export async function removeReminder(userId, reminderId) {
  const user = await getUserData(userId);
  const reminders = (user.reminders || []).filter((r) => r.id !== reminderId);
  await saveUserData(userId, { reminders });
}

export async function listReminders(userId) {
  const user = await getUserData(userId);
  return user.reminders || [];
}

export async function listMeds(userId) {
  const user = await getUserData(userId);
  return user.meds || [];
}

export async function clearAllUserData(userId) {
  if (useLocalStore) {
    localUsers.delete(userId);
    return;
  }

  try {
    const userDocRef = doc(db, "whatsapp_users", userId);
    await deleteDoc(userDocRef);
  } catch (err) {
    console.error(`Error clearing user data for ${userId}:`, err.message);
  }
}

export async function setUserMode(userId, mode) {
  await saveUserData(userId, { mode });
}

export async function incrementMessageCount(userId) {
  const user = await getUserData(userId);
  const newCount = (user.messageCount || 0) + 1;
  await saveUserData(userId, { messageCount: newCount });
  return newCount;
}

export async function setTier(userId, tier) {
  await saveUserData(userId, { tier });
}
