'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import { collection, getDocs, query, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'player' | 'secretary' | 'treasurer' | 'guest';
  status: 'Active' | 'Pending';
  userDocId?: string;
  authDocId?: string;
  parentEmails?: string[]; // For guests: linked parent emails
  parentIds?: string[]; // For guests: linked parent UIDs
  isGuest?: boolean;
}

export default function ViewPlayers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [message, setMessage] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  
  // Dialog states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletedUserEmail, setDeletedUserEmail] = useState('');
  const [deletedUserRole, setDeletedUserRole] = useState('');

  useEffect(() => {
    if (loading) return;

    if (!user || role !== 'secretary') {
      router.push('/login');
      return;
    }

    fetchUsers();
  }, [loading, role, user]);

  const getNameFromEmail = (email: string): string => {
    return email.split('@')[0];
  };

  const fetchUsers = async () => {
    try {
      const usersList: User[] = [];
      const emailToUserMap = new Map<string, User>();
      const uidToEmailMap = new Map<string, string>(); // Map UID to email

      // Step 1: Get all users from users collection and build UID->email map
      const usersSnapshot = await getDocs(collection(db, 'users'));

      usersSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const userRole = data.role;
        
        // Build UID to email mapping
        uidToEmailMap.set(docSnap.id, data.email);
        
        // Include only players, secretary, and treasurer
        if (!['player', 'secretary', 'treasurer'].includes(userRole)) {
          return;
        }
        
        const userItem: User = {
          id: docSnap.id,
          email: data.email,
          displayName: data.displayName || getNameFromEmail(data.email),
          role: userRole,
          status: 'Active',
          userDocId: docSnap.id,
          isGuest: false,
        };

        emailToUserMap.set(data.email, userItem);
        usersList.push(userItem);
      });

      // Step 2: Get all authorized users (players, secretary, treasurer who haven't logged in)
      const authSnapshot = await getDocs(collection(db, 'authorizedUsers'));

      authSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const userRole = data.role;
        
        // Include only players, secretary, and treasurer
        if (!['player', 'secretary', 'treasurer'].includes(userRole)) {
          return;
        }
        
        if (emailToUserMap.has(data.email)) {
          const existingUser = emailToUserMap.get(data.email);
          if (existingUser) {
            existingUser.authDocId = docSnap.id;
          }
        } else {
          const userItem: User = {
            id: docSnap.id,
            email: data.email,
            displayName: data.displayName || getNameFromEmail(data.email),
            role: userRole,
            status: 'Pending',
            authDocId: docSnap.id,
            isGuest: false,
          };
          usersList.push(userItem);
        }
      });

      // Step 3: Get all active guest players
      const guestsRef = collection(db, 'guestPlayers');
      const guestsQuery = query(guestsRef, where('isActive', '==', true));
      const guestsSnapshot = await getDocs(guestsQuery);

      guestsSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const parentIds = data.parentIds || [];
        
        // Convert parent UIDs to emails
        const parentEmails = parentIds
          .map((uid: string) => uidToEmailMap.get(uid))
          .filter((email: string | undefined) => email !== undefined) as string[];

        const guestItem: User = {
          id: docSnap.id,
          email: parentEmails.length > 0 
            ? `Linked to: ${parentEmails.join(', ')}` 
            : 'No linked parents',
          displayName: data.guestName,
          role: 'guest',
          status: 'Active',
          userDocId: docSnap.id,
          isGuest: true,
          parentEmails: parentEmails,
          parentIds: parentIds,
        };

        usersList.push(guestItem);
      });

      // Sort by role (secretary, treasurer, players, then guests), then by status, then by name
      usersList.sort((a, b) => {
        const roleOrder: { [key: string]: number } = { 
          secretary: 1, 
          treasurer: 2, 
          player: 3,
          guest: 4
        };
        const roleCompare = (roleOrder[a.role] || 5) - (roleOrder[b.role] || 5);
        if (roleCompare !== 0) return roleCompare;
        
        if (a.status !== b.status) {
          return a.status === 'Active' ? -1 : 1;
        }
        
        return a.displayName.localeCompare(b.displayName);
      });

      setUsers(usersList);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const openDeleteDialog = (userItem: User) => {
    setUserToDelete(userItem);
    setShowDeleteDialog(true);
  };

  const closeDeleteDialog = () => {
    setShowDeleteDialog(false);
    setUserToDelete(null);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    try {
      setDeletingUserId(userToDelete.id);
      setShowDeleteDialog(false);

      if (userToDelete.isGuest) {
        // Delete ONLY from guestPlayers collection
        await deleteDoc(doc(db, 'guestPlayers', userToDelete.id));
        console.log(`Deleted guest from guestPlayers: ${userToDelete.id}`);
        
        setDeletedUserEmail(userToDelete.displayName);
        setDeletedUserRole('Guest Player');
      } else {
        // Delete regular user from users and authorizedUsers
        if (userToDelete.userDocId) {
          await deleteDoc(doc(db, 'users', userToDelete.userDocId));
          console.log(`Deleted from users collection: ${userToDelete.userDocId}`);
        }

        if (userToDelete.authDocId) {
          await deleteDoc(doc(db, 'authorizedUsers', userToDelete.authDocId));
          console.log(`Deleted from authorizedUsers collection: ${userToDelete.authDocId}`);
        }

        const roleLabel = userToDelete.role.charAt(0).toUpperCase() + userToDelete.role.slice(1);
        setDeletedUserEmail(userToDelete.email);
        setDeletedUserRole(roleLabel);
      }
      
      // Refresh user list
      await fetchUsers();
      
      // Show success dialog
      setShowSuccessDialog(true);
      
    } catch (error: any) {
      console.error('Error deleting user:', error);
      setMessage(`Failed to delete user: ${error.message || 'Unknown error'}`);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setDeletingUserId(null);
      setUserToDelete(null);
    }
  };

  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setDeletedUserEmail('');
    setDeletedUserRole('');
  };

  if (loading || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-base text-gray-700 font-medium">Loading users...</p>
        </div>
      </div>
    );
  }

  const activeUsers = users.filter((u) => u.status === 'Active');
  const pendingUsers = users.filter((u) => u.status === 'Pending');
  const players = users.filter((u) => u.role === 'player');
  const guests = users.filter((u) => u.role === 'guest');
  const activePlayers = players.filter((u) => u.status === 'Active');
  const pendingPlayers = players.filter((u) => u.status === 'Pending');

  // Helper function to get role badge
  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'secretary':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-50 text-purple-700 border border-purple-200">
            Secretary
          </span>
        );
      case 'treasurer':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-50 text-orange-700 border border-orange-200">
            Treasurer
          </span>
        );
      case 'guest':
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-50 text-green-700 border border-green-200">
            Guest
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            Player
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                title="Go Back"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="w-9 h-9 sm:w-12 sm:h-12 flex-shrink-0">
                <Image
                  src="/logo.png"
                  alt="Art of War Logo"
                  width={48}
                  height={48}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base sm:text-xl md:text-2xl font-bold text-gray-900">
                  View Users
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                  Manage players, guests, and staff
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/secretary/add-players')}
              className="px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors text-xs sm:text-sm flex-shrink-0 flex items-center gap-1 sm:gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden xs:inline">Add Player</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* Message */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border-l-4 ${
              message.includes('Successfully')
                ? 'bg-green-50 border-green-500 text-green-800'
                : 'bg-red-50 border-red-500 text-red-800'
            }`}
          >
            <p className="text-sm font-medium">{message}</p>
          </div>
        )}

        {/* Stats - NOW INCLUDES GUESTS */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-xs text-gray-600 font-semibold mb-1 sm:mb-2">Total Players</p>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{players.length}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-xs text-gray-600 font-semibold mb-1 sm:mb-2">Guest Players</p>
            <p className="text-2xl sm:text-3xl font-bold text-green-600">{guests.length}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-xs text-gray-600 font-semibold mb-1 sm:mb-2">Active</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600">{activePlayers.length}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-xs text-gray-600 font-semibold mb-1 sm:mb-2">Pending</p>
            <p className="text-2xl sm:text-3xl font-bold text-orange-600">{pendingPlayers.length}</p>
          </div>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 sm:p-4">
            <p className="text-xs text-gray-600 font-semibold mb-1 sm:mb-2">All Users</p>
            <p className="text-2xl sm:text-3xl font-bold text-purple-600">{users.length}</p>
          </div>
        </div>

        {users.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-lg sm:text-xl font-bold text-gray-900 mb-2">No users added yet</p>
            <p className="text-sm sm:text-base text-gray-600 mb-6">Start by adding user emails to the system</p>
            <button
              onClick={() => router.push('/secretary/add-players')}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Add Player
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Mobile Card View */}
            <div className="block lg:hidden">
              <div className="divide-y divide-gray-200">
                {users.map((u) => (
                  <div key={u.id} className="p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-bold text-gray-900 break-words">{u.displayName}</p>
                        <p className="text-xs text-gray-500 italic break-words mt-1">
                          {u.isGuest ? u.email : `Email: ${u.email}`}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full flex-shrink-0 ${
                          u.status === 'Active'
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-orange-50 text-orange-700 border border-orange-200'
                        }`}
                      >
                        {u.status === 'Active' ? 'Active' : 'Pending'}
                      </span>
                    </div>
                    <div className="mb-3">
                      {getRoleBadge(u.role)}
                    </div>
                    <button
                      onClick={() => openDeleteDialog(u)}
                      disabled={deletingUserId === u.id}
                      className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                    >
                      {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">Email / Linked To</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900">Role</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900">Status</th>
                    <th className="px-6 py-4 text-center text-sm font-bold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u, i) => (
                    <tr
                      key={u.id}
                      className={`${i % 2 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition`}
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-semibold text-gray-900">{u.displayName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-md">
                          {u.isGuest ? (
                            <div>
                              <p className="text-xs text-gray-500 font-semibold mb-1">Linked Parents:</p>
                              {u.parentEmails && u.parentEmails.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {u.parentEmails.map((email, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-block px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200"
                                    >
                                      {email}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 italic">No linked parents</p>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-600 break-words">{u.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getRoleBadge(u.role)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                            u.status === 'Active'
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-orange-50 text-orange-700 border border-orange-200'
                          }`}
                        >
                          {u.status === 'Active' ? '✓ Active' : '⏳ Pending Login'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => openDeleteDialog(u)}
                          disabled={deletingUserId === u.id}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && userToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-lg w-full p-6 sm:p-8 animate-scale-in">
            {/* Warning Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Title */}
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              Delete {userToDelete.isGuest ? 'Guest' : userToDelete.role.charAt(0).toUpperCase() + userToDelete.role.slice(1)}?
            </h3>
            
            {/* Name/Email */}
            <p className="text-sm text-gray-600 text-center mb-4 font-medium">
              {userToDelete.displayName}
            </p>

            {/* Warning Message */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 font-semibold mb-2">⚠️ This action will:</p>
              {userToDelete.isGuest ? (
                <ul className="text-xs text-red-700 space-y-1 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span>Remove guest player from system</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span className="font-bold text-green-700">Linked parent accounts remain untouched</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span>Guest payment history preserved</span>
                  </li>
                </ul>
              ) : (
                <ul className="text-xs text-red-700 space-y-1 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span>Delete user profile data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span>Remove system access (cannot log in)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold flex-shrink-0">•</span>
                    <span>Turf history preserved</span>
                  </li>
                </ul>
              )}
            </div>

            <p className="text-xs text-gray-500 text-center mb-6 italic">
              This action cannot be undone!
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={confirmDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                Yes, Delete {userToDelete.isGuest ? 'Guest' : 'User'}
              </button>
              <button
                onClick={closeDeleteDialog}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Dialog */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-md w-full p-6 sm:p-8 animate-scale-in">
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Success Message */}
            <h3 className="text-xl sm:text-2xl font-bold text-gray-900 text-center mb-2">
              {deletedUserRole} Deleted Successfully!
            </h3>
            <p className="text-sm text-gray-600 text-center mb-2 font-medium break-words">
              {deletedUserEmail}
            </p>
            <p className="text-xs text-gray-500 text-center mb-6">
              {deletedUserRole === 'Guest Player' 
                ? 'Guest removed. Parent accounts unaffected.' 
                : 'System access revoked. History preserved.'}
            </p>

            {/* Close Button */}
            <button
              onClick={closeSuccessDialog}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Add animation keyframe */}
      <style jsx>{`
        @keyframes scale-in {
          0% {
            opacity: 0;
            transform: scale(0.9);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
