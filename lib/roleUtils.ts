import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Fetch the SUPERADMIN_EMAIL from Firestore config
 */
export const getSuperAdminEmail = async (): Promise<string | null> => {
  try {
    const configRef = doc(db, 'config', 'superadminSettings');
    const configSnap = await getDoc(configRef);

    if (configSnap.exists()) {
      const data = configSnap.data();
      return data.SUPERADMIN_EMAIL || null;
    }
    return null;
  } catch (error) {
    console.error('Error fetching SuperAdmin email:', error);
    return null;
  }
};

/**
 * Determine user role based on email and database
 */
export const determineUserRole = async (
  userEmail: string | null,
  userUid: string,
  superAdminEmail: string | null
): Promise<string> => {
  try {
    // Check if user is SuperAdmin (email-based)
    if (superAdminEmail && userEmail === superAdminEmail) {
      console.log('User is SuperAdmin (email-based)');
      return 'superadmin';
    }

    // Check user.role field in Firestore
    const userRef = doc(db, 'users', userUid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const role = userSnap.data().role || 'player';
      console.log('User role from Firestore:', role);
      return role;
    }

    // Default role
    console.log('User role not found, setting default: player');
    return 'player';
  } catch (error) {
    console.error('Error determining user role:', error);
    return 'player'; // Safe default
  }
};
