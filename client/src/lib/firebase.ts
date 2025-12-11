import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  type Auth,
  sendPasswordResetEmail,
  sendEmailVerification,
  verifyPasswordResetCode,
  confirmPasswordReset,
  getRedirectResult,
  type User as FirebaseUser
} from "firebase/auth";

// Firebase configuration with fallback values
// These will be used if environment variables are not loaded (e.g., dev server not restarted)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBC9KuPM9Mvy88FhIaz5KB3nJtpTUv3gIQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "carebridge-b9084.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "carebridge-b9084",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "carebridge-b9084.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "341729315712",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:341729315712:web:0d1ebdfb3b8235f7cf8f65",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-G18MCL06JY"
};

// Validate that environment variables are being loaded (warn only, don't throw)
if (import.meta.env.DEV) {
  const usingFallback = !import.meta.env.VITE_FIREBASE_API_KEY;
  if (usingFallback) {
    console.warn(
      "⚠️ Firebase environment variables not loaded from .env file.\n" +
      "Using fallback values. Please restart your dev server to load from .env file."
    );
  }
}

// Initialize Firebase
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account"
});

// Export Firebase functions
export { sendPasswordResetEmail, sendEmailVerification, verifyPasswordResetCode, confirmPasswordReset, getRedirectResult };
export type { FirebaseUser };

