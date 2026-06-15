import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAzti1xpHJ-ppUNc4llnsp8301FckyU7Vo",
    authDomain: "chatbot-d7c86.firebaseapp.com",
    projectId: "chatbot-d7c86",
    storageBucket: "chatbot-d7c86.firebasestorage.app",
    messagingSenderId: "906537789585",
    appId: "1:906537789585:web:f7b674d19367760e427730",
    measurementId: "G-36JTJ81498"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
