// firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "",
  authDomain: "varsity-majisty.firebaseapp.com",
  projectId: "varsity-majisty",
  storageBucket: "varsity-majisty.firebasestorage.app",
  messagingSenderId: "438882953423",
  appId: "1:438882953423:web:4b8c282d7719d3a4e36fba",
  measurementId: "G-QLBK1QFT74",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
