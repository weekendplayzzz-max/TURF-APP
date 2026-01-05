'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
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
  role: string | null;
  isAuthorized: boolean;
  profileCompleted: boolean;
  superAdminEmail: string;
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
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);
  const [profileCompleted, setProfileCompleted] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  
  const superAdminEmail = getSuperAdminEmail();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
      try {
        if (firebaseUser) {
          console.log('User signed in:', firebaseUser.uid);
          console.log('User email:', firebaseUser.email);

          // Determine role and authorization status (checks both users & authorizedUsers collections)
          const { role, isAuthorized: authorized } = await determineUserRole(
            firebaseUser.email || '',
            firebaseUser.uid
          );

          console.log('Determined role:', role, 'Authorized:', authorized);

          // If not authorized, sign out immediately
          if (!authorized || role === 'unauthorized') {
            console.log('Unauthorized user detected, signing out...');
            await signOut(auth);
            setUser(null);
            setUserEmail(null);
            setUserRole(null);
            setIsAuthorized(false);
            setProfileCompleted(false);
            setLoading(false);
            return;
          }

          // Check if user exists in users collection
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            // First-time login - check if user data exists in authorizedUsers collection
            const authRef = collection(db, 'authorizedUsers');
            const authQuery = query(authRef, where('email', '==', firebaseUser.email));
            const authSnap = await getDocs(authQuery);

            let appointedBy = null;
            let appointedByRole = null;
            let displayNameFromAuth = null;
            let profileCompletedStatus = false;

            if (!authSnap.empty) {
              const authData = authSnap.docs[0].data();
              appointedBy = authData.appointedBy || null;
              appointedByRole = authData.appointedByRole || null;
              displayNameFromAuth = authData.displayName || null;
              profileCompletedStatus = authData.profileCompleted || false;
              console.log('Found user in authorizedUsers, migrating to users collection');
            }

            // For players, displayName is null until they complete their profile
            // For superadmin/secretary/treasurer, use their Google display name
            const initialDisplayName = role === 'player' 
              ? displayNameFromAuth 
              : (firebaseUser.displayName || null);

            // Profile is considered complete for non-players or if displayName exists for players
            const isProfileComplete = role !== 'player' || (displayNameFromAuth !== null);

            // Create user document in users collection
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: initialDisplayName,
              photoURL: firebaseUser.photoURL || '',
              role: role,
              isAuthorized: true,
              profileCompleted: isProfileComplete,
              appointedBy: appointedBy,
              appointedByRole: appointedByRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            console.log('Created new user document with role:', role);
            setProfileCompleted(isProfileComplete);
          } else {
            // Existing user - update timestamp and get profile status
            const userData = userSnap.data();
            const isProfileComplete = userData.profileCompleted || false;
            
            await setDoc(
              userRef,
              {
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            
            console.log('Updated existing user timestamp');
            setProfileCompleted(isProfileComplete);
          }

          // Set authorized user state
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          });
          setUserEmail(firebaseUser.email);
          setUserRole(role);
          setIsAuthorized(true);
        } else {
          // User signed out
          setUser(null);
          setUserEmail(null);
          setUserRole(null);
          setIsAuthorized(false);
          setProfileCompleted(false);
        }
      } catch (error) {
        console.error('Error in onAuthStateChanged:', error);
        setUser(null);
        setUserEmail(null);
        setUserRole(null);
        setIsAuthorized(false);
        setProfileCompleted(false);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      console.log('Starting Google sign-in...');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // Authorization check happens automatically in onAuthStateChanged
    } catch (error) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        console.log('Sign-in cancelled by user');
        return;
      }
      console.error('Sign-in error:', err.code, err.message);
      throw error;
    }
  };

  const logout = async () => {
    try {
      console.log('Logging out...');
      await signOut(auth);
      setUser(null);
      setUserEmail(null);
      setUserRole(null);
      setIsAuthorized(false);
      setProfileCompleted(false);
      console.log('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value: AuthContextType = {
    user,
    userEmail,
    role: userRole,
    isAuthorized,
    profileCompleted,
    superAdminEmail,
    loading,
    signInWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh', 
          backgroundColor: '#f0f0f0' 
        }}>
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
