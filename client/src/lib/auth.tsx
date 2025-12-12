import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { 
  signInWithPopup, 
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  type User as FirebaseUser
} from "firebase/auth";
import { auth, googleProvider, getRedirectResult } from "./firebase";
import type { User, PatientProfile, DoctorProfile } from "@shared/schema";

interface AuthUser extends User {
  patientProfile?: PatientProfile | null;
  doctorProfile?: DoctorProfile | null;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (role: "PATIENT" | "DOCTOR") => Promise<void>;
  signupWithGoogle: (role: "PATIENT" | "DOCTOR") => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  firebaseUser: FirebaseUser | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get API base URL from environment or use relative path
  const getApiBaseUrl = (): string => {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      return apiUrl.replace(/\/$/, "");
    }
    return "";
  };

  const refreshUser = async () => {
    try {
      const url = `${getApiBaseUrl()}/api/auth/me`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuthSuccess = async (firebaseUser: FirebaseUser, role: "PATIENT" | "DOCTOR", action: "login" | "signup") => {
    // Sync with backend
    const url = `${getApiBaseUrl()}/api/auth/firebase/${action}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        firebaseUid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || "",
        photoURL: firebaseUser.photoURL,
        role,
      }),
    });
    
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || `${action} failed`);
    }
    
    // Wait a bit for session to be established, then refresh user
    // Retry a few times in case session isn't ready immediately
    let retries = 3;
    while (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        await refreshUser();
        break; // Success, exit retry loop
      } catch (error) {
        retries--;
        if (retries === 0) {
          // Last retry failed, but login was successful, so just log the error
          console.warn(`Failed to refresh user after ${action}, but ${action} was successful:`, error);
        }
      }
    }
  };

  // Listen to Firebase auth state changes and handle redirect
  useEffect(() => {
    // Check for redirect result on mount
    getRedirectResult(auth)
      .then(async (result) => {
        if (result) {
          const role = sessionStorage.getItem("googleAuthRole") as "PATIENT" | "DOCTOR" | null;
          const action = sessionStorage.getItem("googleAuthAction") as "login" | "signup" | null;
          
          if (role && action) {
            sessionStorage.removeItem("googleAuthRole");
            sessionStorage.removeItem("googleAuthAction");
            await handleGoogleAuthSuccess(result.user, role, action);
          }
        }
      })
      .catch((error) => {
        console.error("Redirect result error:", error);
        sessionStorage.removeItem("googleAuthRole");
        sessionStorage.removeItem("googleAuthAction");
      });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setFirebaseUser(firebaseUser);
      if (firebaseUser) {
        // If Firebase user exists, sync with backend
        await refreshUser();
      } else {
        setUser(null);
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      // Try Firebase login first
      await signInWithEmailAndPassword(auth, email, password);
      // Then sync with backend
    const url = `${getApiBaseUrl()}/api/auth/login`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || "Login failed");
    }
    await refreshUser();
    } catch (error: any) {
      // If Firebase login fails, try backend login (for existing users)
      const url = `${getApiBaseUrl()}/api/auth/login`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || error.message || "Login failed");
      }
      await refreshUser();
    }
  };

  const loginWithGoogle = async (role: "PATIENT" | "DOCTOR") => {
    try {
      // Store role in sessionStorage for redirect callback
      sessionStorage.setItem("googleAuthRole", role);
      sessionStorage.setItem("googleAuthAction", "login");
      
      // Try popup first, fallback to redirect if it fails
      try {
        const result = await signInWithPopup(auth, googleProvider);
        await handleGoogleAuthSuccess(result.user, role, "login");
      } catch (popupError: any) {
        // If popup is blocked or fails, use redirect
        if (popupError.code === "auth/popup-blocked" || popupError.code === "auth/popup-closed-by-user" || popupError.message?.includes("Cross-Origin-Opener-Policy")) {
          await signInWithRedirect(auth, googleProvider);
          // Redirect will happen, function won't return
          return;
        }
        throw popupError;
      }
    } catch (error: any) {
      sessionStorage.removeItem("googleAuthRole");
      sessionStorage.removeItem("googleAuthAction");
      throw new Error(error.message || "Google login failed");
    }
  };

  const signupWithGoogle = async (role: "PATIENT" | "DOCTOR") => {
    try {
      // Store role in sessionStorage for redirect callback
      sessionStorage.setItem("googleAuthRole", role);
      sessionStorage.setItem("googleAuthAction", "signup");
      
      // Try popup first, fallback to redirect if it fails
      try {
        const result = await signInWithPopup(auth, googleProvider);
        await handleGoogleAuthSuccess(result.user, role, "signup");
      } catch (popupError: any) {
        // If popup is blocked or fails, use redirect
        if (popupError.code === "auth/popup-blocked" || popupError.code === "auth/popup-closed-by-user" || popupError.message?.includes("Cross-Origin-Opener-Policy")) {
          await signInWithRedirect(auth, googleProvider);
          // Redirect will happen, function won't return
          return;
        }
        throw popupError;
      }
    } catch (error: any) {
      sessionStorage.removeItem("googleAuthRole");
      sessionStorage.removeItem("googleAuthAction");
      throw new Error(error.message || "Google signup failed");
    }
  };

  const logout = async () => {
    try {
      // Logout from Firebase
      await auth.signOut();
    } catch (error) {
      console.error("Firebase logout error:", error);
    }
    
    // Logout from backend
    try {
    const url = `${getApiBaseUrl()}/api/auth/logout`;
    await fetch(url, { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Backend logout error:", error);
    }
    
    setUser(null);
    setFirebaseUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      login, 
      loginWithGoogle,
      signupWithGoogle,
      logout, 
      refreshUser,
      firebaseUser 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
