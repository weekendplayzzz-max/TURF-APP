'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { getSuperAdminEmail, determineUserRole } from '@/lib/roleUtils';
import { checkProfileComplete } from '@/lib/profileManagement';
import ProfileCompleteModal from '@/components/ProfileCompleteModal';

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
  refreshProfileStatus: () => Promise<void>; // NEW: To refresh after profile completion
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
  const [showProfileModal, setShowProfileModal] = useState(false); // NEW: Control modal visibility
  
  const superAdminEmail = getSuperAdminEmail();

  // NEW: Function to check profile status from userProfiles collection
  const checkUserProfileStatus = async (userId: string) => {
    try {
      const profileCheck = await checkProfileComplete(userId);
      console.log('Profile check result:', profileCheck);
      return profileCheck.isComplete;
    } catch (error) {
      console.error('Error checking profile status:', error);
      return false;
    }
  };

  // NEW: Function to refresh profile status (called after profile completion)
  const refreshProfileStatus = async () => {
    if (!user) return;
    
    try {
      const isComplete = await checkUserProfileStatus(user.uid);
      setProfileCompleted(isComplete);
      
      // Also update in users collection
      const userRef = doc(db, 'users', user.uid);
      await setDoc(
        userRef,
        { profileCompleted: isComplete, updatedAt: serverTimestamp() },
        { merge: true }
      );
      
      // Hide modal if complete
      if (isComplete) {
        setShowProfileModal(false);
      }
    } catch (error) {
      console.error('Error refreshing profile status:', error);
    }
  };

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
            setShowProfileModal(false); // NEW
            setLoading(false);
            return;
          }

          // Check if user exists in users collection
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);

          let isProfileComplete = false; // NEW: Will be determined from userProfiles collection

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
            // OLD LOGIC KEPT FOR BACKWARD COMPATIBILITY
            const oldProfileComplete = role !== 'player' || (displayNameFromAuth !== null);

            // Create user document in users collection
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: initialDisplayName,
              photoURL: firebaseUser.photoURL || '',
              role: role,
              isAuthorized: true,
              profileCompleted: oldProfileComplete, // Keep old field
              appointedBy: appointedBy,
              appointedByRole: appointedByRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });

            console.log('Created new user document with role:', role);
            
            // NEW: Check userProfiles collection
            isProfileComplete = await checkUserProfileStatus(firebaseUser.uid);
          } else {
            // Existing user - update timestamp and get profile status
            const userData = userSnap.data();
            
            await setDoc(
              userRef,
              {
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
            
            console.log('Updated existing user timestamp');
            
            // NEW: Check userProfiles collection (this is the source of truth now)
            isProfileComplete = await checkUserProfileStatus(firebaseUser.uid);
            
            // Update users collection if status changed
            if (userData.profileCompleted !== isProfileComplete) {
              await setDoc(
                userRef,
                { profileCompleted: isProfileComplete },
                { merge: true }
              );
            }
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
          setProfileCompleted(isProfileComplete);
          
          // NEW: Show profile modal if profile is incomplete
          if (!isProfileComplete) {
            console.log('Profile incomplete - showing modal');
            setShowProfileModal(true);
          } else {
            setShowProfileModal(false);
          }
        } else {
          // User signed out
          setUser(null);
          setUserEmail(null);
          setUserRole(null);
          setIsAuthorized(false);
          setProfileCompleted(false);
          setShowProfileModal(false); // NEW
        }
      } catch (error) {
        console.error('Error in onAuthStateChanged:', error);
        setUser(null);
        setUserEmail(null);
        setUserRole(null);
        setIsAuthorized(false);
        setProfileCompleted(false);
        setShowProfileModal(false); // NEW
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
      setShowProfileModal(false); // NEW
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
    refreshProfileStatus, // NEW
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
        <>
          {children}
          
          {/* NEW: Profile completion modal - blocks entire app */}
          {showProfileModal && user && userEmail && (
            <ProfileCompleteModal
              userId={user.uid}
              email={userEmail}
              onComplete={refreshProfileStatus}
            />
          )}
        </>
      )}
    </AuthContext.Provider>
  );
};
