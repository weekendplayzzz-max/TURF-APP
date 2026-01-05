import { doc, getDoc, collection, query, where, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const SUPER_ADMIN_EMAIL = 'weekendplayzzz@gmail.com';

export const getSuperAdminEmail = () => {
  return SUPER_ADMIN_EMAIL;
};

/**
 * Check if email is authorized in BOTH users and authorizedUsers collections
 */
export const isEmailAuthorized = async (userEmail) => {
  if (!userEmail) return false;

  try {
    // SuperAdmin is always authorized (hardcoded)
    if (userEmail === SUPER_ADMIN_EMAIL) {
      return true;
    }

    // Check in users collection (existing users who have logged in)
    const usersRef = collection(db, 'users');
    const usersQuery = query(usersRef, where('email', '==', userEmail), where('isAuthorized', '==', true));
    const usersSnapshot = await getDocs(usersQuery);

    if (!usersSnapshot.empty) {
      console.log('User found in users collection');
      return true;
    }

    // Check in authorizedUsers collection (newly added users who haven't logged in yet)
    const authUsersRef = collection(db, 'authorizedUsers');
    const authQuery = query(authUsersRef, where('email', '==', userEmail), where('isAuthorized', '==', true));
    const authSnapshot = await getDocs(authQuery);

    if (!authSnapshot.empty) {
      console.log('User found in authorizedUsers collection');
      return true;
    }

    console.log('User not found in either collection');
    return false;
  } catch (error) {
    console.error('Error checking email authorization:', error);
    return false;
  }
};

/**
 * Get user role from authorizedUsers collection (for first-time login)
 */
const getRoleFromAuthorizedUsers = async (userEmail) => {
  try {
    const authRef = collection(db, 'authorizedUsers');
    const q = query(authRef, where('email', '==', userEmail));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      return userData.role || 'player';
    }
    return null;
  } catch (error) {
    console.error('Error fetching role from authorizedUsers:', error);
    return null;
  }
};

/**
 * Determine user role with hybrid authorization check
 */
export const determineUserRole = async (userEmail, userUid) => {
  try {
    // Check SuperAdmin first
    if (userEmail && userEmail === SUPER_ADMIN_EMAIL) {
      console.log('User is SuperAdmin (email-based)');
      return { role: 'superadmin', isAuthorized: true };
    }

    // Check if email is authorized (checks both collections)
    const authorized = await isEmailAuthorized(userEmail);
    
    if (!authorized) {
      console.log('User email not authorized');
      return { role: 'unauthorized', isAuthorized: false };
    }

    // Try to get role from users collection first
    const userRef = doc(db, 'users', userUid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const role = userData?.role || 'player';
      console.log('User role from users collection:', role);
      return { role, isAuthorized: true };
    }

    // If not in users collection, check authorizedUsers collection
    const roleFromAuth = await getRoleFromAuthorizedUsers(userEmail);
    if (roleFromAuth) {
      console.log('User role from authorizedUsers collection:', roleFromAuth);
      return { role: roleFromAuth, isAuthorized: true };
    }

    // Default fallback
    return { role: 'player', isAuthorized: true };
  } catch (error) {
    console.error('Error determining user role:', error);
    return { role: 'unauthorized', isAuthorized: false };
  }
};

/**
 * Add authorized user (called by SuperAdmin/Secretary)
 */
export const addAuthorizedUser = async (
  email,
  role,
  appointedBy,
  appointedByRole
) => {
  try {
    // Validate permissions
    if (role === 'secretary' || role === 'treasurer') {
      if (appointedByRole !== 'superadmin') {
        return { success: false, message: 'Only SuperAdmin can add Secretary/Treasurer' };
      }
    } else if (role === 'player') {
      if (appointedByRole !== 'secretary') {
        return { success: false, message: 'Only Secretary can add Players' };
      }
    }

    // Check if user already exists in users collection
    const usersRef = collection(db, 'users');
    const usersQuery = query(usersRef, where('email', '==', email));
    const existingUsers = await getDocs(usersQuery);

    if (!existingUsers.empty) {
      return { success: false, message: 'User already exists in the system' };
    }

    // Check if email exists in authorizedUsers
    const authRef = collection(db, 'authorizedUsers');
    const authQuery = query(authRef, where('email', '==', email));
    const existingAuth = await getDocs(authQuery);

    if (!existingAuth.empty) {
      return { success: false, message: 'User already authorized' };
    }

    // Add to authorized users collection
    const newUserRef = doc(collection(db, 'authorizedUsers'));
    await setDoc(newUserRef, {
      email,
      role,
      isAuthorized: true,
      appointedBy,
      appointedByRole,
      createdAt: serverTimestamp(),
    });

    return { success: true, message: 'User authorized successfully' };
  } catch (error) {
    console.error('Error adding authorized user:', error);
    return { success: false, message: 'Failed to authorize user' };
  }
};
