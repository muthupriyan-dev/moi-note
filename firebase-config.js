// ==========================================================================
// உறவுசுவடி — Firebase config
// இங்க உங்க Firebase project-ன் config keys-ஐ paste பண்ணுங்க.
// (Firebase Console > Project Settings > General > Your apps > SDK setup)
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp, runTransaction,
  arrayUnion, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 👇👇👇 இங்க உங்க Firebase project config-ஐ வச்சுக்கோங்க 👇👇👇
const firebaseConfig = {
  apiKey: "AIzaSyCVnmtf3ygg5kFp9qi8-TMFrU_XOs94WoE",
  authDomain: "uravu-suvaadi.firebaseapp.com",
  projectId: "uravu-suvaadi",
  storageBucket: "uravu-suvaadi.firebasestorage.app",
  messagingSenderId: "102261914295",
  appId: "1:102261914295:web:fef9b404613fc5a3a72b32"
};
// 👆👆👆 ==========================================

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail,
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp, runTransaction,
  arrayUnion, increment
};
