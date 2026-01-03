'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getSuperAdminEmail, determineUserRole } from '@/lib/roleUtils';

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextType {
  user: User | null;
  userEmail: string | null;
  role: string | null; // Changed from userRole to role
  superAdminEmail: string | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthContextProvider');
  }
  return context;
};

interface AuthContextProviderProps {
  children: ReactNode;
}

export const AuthContextProvider = ({ children }: AuthContextProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [superAdminEmail, setSuperAdminEmail] = useState<string | null>(null);

  // Fetch SuperAdmin email on mount
  useEffect(() => {
    const fetchSuperAdminEmail = async () => {
      const email = await getSuperAdminEmail();
      setSuperAdminEmail(email);
      console.log('SuperAdmin email fetched:', email);
    };
    fetchSuperAdminEmail();
  }, []);

  // Main auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (firebaseUser) {
          console.log('User signed in:', firebaseUser.uid);
          console.log('User email:', firebaseUser.email);

          // Save user to Firestore if new
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            // New user - create document with default role
            console.log('Creating new user document...');
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || 'User',
              photoURL: firebaseUser.photoURL || '',
              role: 'player', // Default role (will be overridden if SuperAdmin)
              appointedBy: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            // Existing user - update timestamp
            console.log('User already exists, updating timestamp...');
            await setDoc(
              userRef,
              {
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          // Determine role based on email + role field
          const role = await determineUserRole(
  firebaseUser.email || '',
  firebaseUser.uid,
  superAdminEmail
);


          console.log('Final determined role:', role);

          // Set state
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });
          setUserEmail(firebaseUser.email);
          setUserRole(role);
        } else {
          // User signed out
          console.log('User signed out');
          setUser(null);
          setUserEmail(null);
          setUserRole(null);
        }
      } catch (error) {
        console.error('Error in onAuthStateChanged:', error);
        setUser(null);
        setUserEmail(null);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [superAdminEmail]);

  const signInWithGoogle = async () => {
  try {
    console.log('Starting Google sign-in...');
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    console.log('Sign-in completed:', result.user.uid);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'auth/popup-closed-by-user') {
      console.log('Sign-in popup was closed by user');
      return;
    }
    if (err.code === 'auth/cancelled-popup-request') {
      console.log('Sign-in was cancelled');
      return;
    }
    console.error('Sign-in error:', err.code, err.message);
  }
};


  const logout = async () => {
    try {
      console.log('Logging out...');
      await signOut(auth);
      setUser(null);
      setUserEmail(null);
      setUserRole(null);
      console.log('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value: AuthContextType = {
    user,
    userEmail,
    role: userRole, // Expose as 'role' not 'userRole'
    superAdminEmail,
    loading,
    signInWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            backgroundColor: '#f0f0f0',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#333' }}>
              Loading your session...
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
};
