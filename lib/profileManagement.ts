// lib/profileManagement.ts
import { db } from './firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  Timestamp,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';

export interface GuestProfile {
  guestId: string;
  guestName: string;
  fullName: string;
  jerseyNumber: number | null;
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD';
}

export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  jerseyNumber: number;
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD';
  playerType: 'regular';
  profileCompleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  guestProfiles: GuestProfile[];
}

/**
 * Check if user has completed their profile
 * Also checks if all linked guests have profiles
 */
export async function checkProfileComplete(userId: string): Promise<{
  isComplete: boolean;
  profile: UserProfile | null;
  missingGuestProfiles: string[];
}> {
  try {
    // Check if profile exists
    const profileRef = doc(db, 'userProfiles', userId);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      return {
        isComplete: false,
        profile: null,
        missingGuestProfiles: [],
      };
    }

    const profileData = profileSnap.data() as UserProfile;

    // Get user's current linked guests from users collection
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    const linkedGuests = userSnap.exists() 
      ? (userSnap.data().linkedGuests || [])
      : [];

    // Check if all linked guests have profiles
    const currentGuestIds = linkedGuests.map((g: any) => g.guestId);
    const profiledGuestIds = profileData.guestProfiles.map(g => g.guestId);
    
    const missingGuestIds = currentGuestIds.filter(
      (id: string) => !profiledGuestIds.includes(id)
    );

    return {
      isComplete: missingGuestIds.length === 0,
      profile: profileData,
      missingGuestProfiles: missingGuestIds,
    };
  } catch (error) {
    console.error('Error checking profile completion:', error);
    return {
      isComplete: false,
      profile: null,
      missingGuestProfiles: [],
    };
  }
}

/**
 * Get user's linked guests from users collection
 */
export async function getUserLinkedGuests(userId: string): Promise<Array<{
  guestId: string;
  guestName: string;
  linkedAt: Timestamp;
}>> {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return userSnap.data().linkedGuests || [];
    }
    return [];
  } catch (error) {
    console.error('Error getting linked guests:', error);
    return [];
  }
}

/**
 * Create or update user profile with guest profiles
 */
export async function saveUserProfile(
  userId: string,
  email: string,
  fullName: string,
  jerseyNumber: number,
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD',
  guestProfiles: GuestProfile[]
): Promise<{ success: boolean; message: string }> {
  try {
    const profileRef = doc(db, 'userProfiles', userId);
    const profileSnap = await getDoc(profileRef);

    const profileData: UserProfile = {
      userId,
      email,
      fullName,
      jerseyNumber,
      position,
      playerType: 'regular',
      profileCompleted: true,
      guestProfiles,
      createdAt: profileSnap.exists() 
        ? profileSnap.data().createdAt 
        : Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(profileRef, profileData);

    // Update profileCompleted flag in users collection
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      profileCompleted: true,
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      message: 'Profile saved successfully!',
    };
  } catch (error) {
    console.error('Error saving profile:', error);
    return {
      success: false,
      message: 'Failed to save profile. Please try again.',
    };
  }
}

/**
 * Get user profile
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const profileRef = doc(db, 'userProfiles', userId);
    const profileSnap = await getDoc(profileRef);
    
    if (profileSnap.exists()) {
      return profileSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Update existing profile
 */
export async function updateUserProfile(
  userId: string,
  fullName: string,
  jerseyNumber: number,
  position: 'GK' | 'DEF' | 'MID' | 'FORWARD',
  guestProfiles: GuestProfile[]
): Promise<{ success: boolean; message: string }> {
  try {
    const profileRef = doc(db, 'userProfiles', userId);
    
    await updateDoc(profileRef, {
      fullName,
      jerseyNumber,
      position,
      guestProfiles,
      updatedAt: Timestamp.now(),
    });

    return {
      success: true,
      message: 'Profile updated successfully!',
    };
  } catch (error) {
    console.error('Error updating profile:', error);
    return {
      success: false,
      message: 'Failed to update profile. Please try again.',
    };
  }
}
