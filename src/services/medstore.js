// src/services/medstore.js
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";

export async function getUserData(userId) {
  try {
    const userDocRef = doc(db, "whatsapp_users", userId);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      return userDoc.data();
    } else {
      const defaultData = {
        id: userId,
        tier: "free",
        messageCount: 0,
        mode: null,
        meds: [],
        reminders: [],
        updatedAt: new Date().toISOString()
      };
      await setDoc(userDocRef, defaultData);
      return defaultData;
    }
  } catch (err) {
    console.error(`Error in getUserData for ${userId}:`, err);
    return { id: userId, tier: "free", messageCount: 0, mode: null, meds: [], reminders: [] };
  }
}

export async function saveUserData(userId, data) {
  try {
    const userDocRef = doc(db, "whatsapp_users", userId);
    await setDoc(userDocRef, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    console.error(`Error saving user data for ${userId}:`, err);
  }
}

export async function upsertMed(userId, med) {
  const user = await getUserData(userId);
  const idx = user.meds.findIndex(m => m.id === med.id);
  if (idx >= 0) user.meds[idx] = med;
  else user.meds.push(med);
  await saveUserData(userId, { meds: user.meds });
}

export async function addReminder(userId, reminder) {
  const user = await getUserData(userId);
  const reminders = user.reminders || [];
  reminders.push(reminder);
  await saveUserData(userId, { reminders });
}

export async function removeReminder(userId, reminderId) {
  const user = await getUserData(userId);
  const reminders = (user.reminders || []).filter(r => r.id !== reminderId);
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
  try {
    const userDocRef = doc(db, "whatsapp_users", userId);
    await deleteDoc(userDocRef);
  } catch (err) {
    console.error(`Error clearing user data for ${userId}:`, err);
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
