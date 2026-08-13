import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import firebaseConfigData from "../../firebase-applet-config.json";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (getApps().length > 0) {
      app = getApp();
    } else {
      app = initializeApp(firebaseConfigData);
    }
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
  }
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    const firestoreDbId = firebaseConfigData.firestoreDatabaseId;
    if (firestoreDbId) {
      db = getFirestore(getFirebaseApp(), firestoreDbId);
    } else {
      db = getFirestore(getFirebaseApp());
    }
  }
  return db;
}

export const googleProvider = new GoogleAuthProvider();
