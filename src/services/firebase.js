// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyAzti1xpHJ-ppUNc4llnsp8301FckyU7Vo",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "chatbot-d7c86.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "chatbot-d7c86",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "chatbot-d7c86.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "906537789585",
    appId: process.env.FIREBASE_APP_ID || "1:906537789585:web:f7b674d19367760e427730",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-36JTJ81498"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
