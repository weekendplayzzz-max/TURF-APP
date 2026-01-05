'use client';

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCefnR_BsrChBF5Me-t6AlBt1eGrl58oqg",
  authDomain: "weekend-playzz.firebaseapp.com",
  projectId: "weekend-playzz",
  storageBucket: "weekend-playzz.firebasestorage.app",
  messagingSenderId: "1021367626438",
  appId: "1:1021367626438:web:0bd4b4fb297989579205c7"
};

// Initialize Firebase only if it hasn't been initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize services
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export default app;

if (typeof window !== 'undefined') {
  console.log('✅ Firebase Auth object:', auth);
  console.log('✅ Firestore object:', db);
}
