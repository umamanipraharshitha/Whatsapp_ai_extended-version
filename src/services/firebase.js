// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY || "AIzaSyD5lB2RyH33351oWbTkUw9y8AKUzrL3fdY",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "aplora-c82d6.firebaseapp.com",
    projectId: process.env.FIREBASE_PROJECT_ID || "aplora-c82d6",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "aplora-c82d6.firebasestorage.app",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "695834838262",
    appId: process.env.FIREBASE_APP_ID || "1:695834838262:web:4b93af5f05fe3cdd7758d7",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID || "G-NMQB864GBT"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
