import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyD5lB2RyH33351oWbTkUw9y8AKUzrL3fdY",
    authDomain: "aplora-c82d6.firebaseapp.com",
    projectId: "aplora-c82d6",
    storageBucket: "aplora-c82d6.firebasestorage.app",
    messagingSenderId: "695834838262",
    appId: "1:695834838262:web:4b93af5f05fe3cdd7758d7",
    measurementId: "G-NMQB864GBT"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
