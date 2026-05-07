'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import Image from 'next/image';
import {
  collection, getDocs, query, where,
  doc, deleteDoc, getDoc,
} from 'firebase/firestore';

// ─── Types ────────────────────────────────────────────────────────────────────
interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'player' | 'secretary' | 'treasurer' | 'guest';
  status: 'Active' | 'Pending';
  userDocId?: string;
  authDocId?: string;
  parentEmails?: string[];
  parentIds?: string[];
  isGuest?: boolean;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ViewPlayers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [users,           setUsers]           = useState<User[]>([]);
  const [loadingUsers,    setLoadingUsers]     = useState(true);
  const [message,         setMessage]         = useState('');
  const [deletingUserId,  setDeletingUserId]  = useState<string | null>(null);

  const [showDeleteDialog,  setShowDeleteDialog]  = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [userToDelete,      setUserToDelete]      = useState<User | null>(null);
  const [deletedUserEmail,  setDeletedUserEmail]  = useState('');
  const [deletedUserRole,   setDeletedUserRole]   = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'secretary') { router.push('/login'); return; }
    fetchUsers();
  }, [loading, role, user]);

  const getNameFromEmail = (email: string) => email.split('@')[0];

  const fetchUsers = async () => {
  try {
    const usersList: User[] = [];
    const uidToEmailMap = new Map<string, string>();
    const uidToNameMap  = new Map<string, string>();
    const emailToUserMap = new Map<string, User>();

    // ── Step 1: userProfiles collection → has fullName ──────────────────────
    // Doc ID = user UID, fields: fullName, email, jerseyNumber, position, etc.
    const profilesSnapshot = await getDocs(collection(db, 'userProfiles'));
    profilesSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const uid  = docSnap.id; // == userId == user.uid
      const email: string = data.email ?? '';
      uidToEmailMap.set(uid, email);
      // fullName is HERE — this is where profile modal saves it
      const bestName = data.fullName?.trim() || getNameFromEmail(email);
      uidToNameMap.set(uid, bestName);
    });

    // ── Step 2: users collection → has role, displayName (Google auth name) ─
    const usersSnapshot = await getDocs(collection(db, 'users'));
    usersSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const uid  = docSnap.id;
      const email: string = data.email ?? '';

      if (!['player', 'secretary', 'treasurer'].includes(data.role)) return;

      // Prefer fullName from userProfiles, fallback to Google displayName
      const bestName = uidToNameMap.get(uid)
        || data.displayName?.trim()
        || getNameFromEmail(email);

      uidToEmailMap.set(uid, email); // ensure populated
      uidToNameMap.set(uid, bestName);

      const item: User = {
        id:          uid,
        email,
        displayName: bestName,   // ← NOW correctly reads from userProfiles
        role:        data.role,
        status:      'Active',
        userDocId:   uid,
        isGuest:     false,
      };
      emailToUserMap.set(email, item);
      usersList.push(item);
    });

    // ── Step 3: authorizedUsers (pending) ────────────────────────────────────
    const authSnapshot = await getDocs(collection(db, 'authorizedUsers'));
    authSnapshot.forEach(docSnap => {
      const data  = docSnap.data();
      const email: string = data.email ?? '';
      if (!['player', 'secretary', 'treasurer'].includes(data.role)) return;

      if (emailToUserMap.has(email)) {
        const existing = emailToUserMap.get(email);
        if (existing) existing.authDocId = docSnap.id;
      } else {
        usersList.push({
          id:          docSnap.id,
          email,
          displayName: data.displayName?.trim() || getNameFromEmail(email),
          role:        data.role,
          status:      'Pending',
          authDocId:   docSnap.id,
          isGuest:     false,
        });
      }
    });

    // ── Step 4: guestPlayers ─────────────────────────────────────────────────
    const guestsSnap = await getDocs(
      query(collection(db, 'guestPlayers'), where('isActive', '==', true))
    );

    // On-demand fetch for any parentId uid missing from map
    const missingUids: string[] = [];
    guestsSnap.forEach(docSnap => {
      (docSnap.data().parentIds ?? []).forEach((uid: string) => {
        if (!uidToEmailMap.has(uid)) missingUids.push(uid);
      });
    });
    await Promise.all(
      [...new Set(missingUids)].map(async uid => {
        // Try userProfiles first (has fullName)
        const profileDoc = await getDoc(doc(db, 'userProfiles', uid));
        if (profileDoc.exists()) {
          const d = profileDoc.data();
          uidToEmailMap.set(uid, d.email ?? '');
          uidToNameMap.set(uid, d.fullName?.trim() || getNameFromEmail(d.email ?? ''));
        } else {
          // fallback to users doc
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const d = userDoc.data();
            uidToEmailMap.set(uid, d.email ?? '');
            uidToNameMap.set(uid, d.displayName?.trim() || getNameFromEmail(d.email ?? ''));
          }
        }
      })
    );

    guestsSnap.forEach(docSnap => {
      const data     = docSnap.data();
      const parentIds: string[] = data.parentIds ?? [];

      const parentEmails = parentIds
        .map((uid: string) => uidToEmailMap.get(uid))
        .filter(Boolean) as string[];

      usersList.push({
        id:           docSnap.id,
        email:        parentEmails.length > 0
          ? `Linked to: ${parentEmails.join(', ')}`
          : 'No linked parents',
        displayName:  data.fullName?.trim() || data.guestName?.trim() || 'Unknown Guest',
        role:         'guest',
        status:       'Active',
        userDocId:    docSnap.id,
        isGuest:      true,
        parentEmails,
        parentIds,
      });
    });

    // sort: secretary → treasurer → player → guest, Active first, then alpha
    const roleOrder: Record<string, number> = { secretary:1, treasurer:2, player:3, guest:4 };
    usersList.sort((a, b) => {
      const r = (roleOrder[a.role]??5) - (roleOrder[b.role]??5);
      if (r !== 0) return r;
      if (a.status !== b.status) return a.status === 'Active' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    setUsers(usersList);
  } catch (err) {
    console.error('fetchUsers error:', err);
  } finally {
    setLoadingUsers(false);
  }
};

  const openDeleteDialog   = (u: User) => { setUserToDelete(u); setShowDeleteDialog(true); };
  const closeDeleteDialog  = () => { setShowDeleteDialog(false); setUserToDelete(null); };
  const closeSuccessDialog = () => {
    setShowSuccessDialog(false);
    setDeletedUserEmail('');
    setDeletedUserRole('');
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      setDeletingUserId(userToDelete.id);
      setShowDeleteDialog(false);

      if (userToDelete.isGuest) {
        await deleteDoc(doc(db, 'guestPlayers', userToDelete.id));
        setDeletedUserEmail(userToDelete.displayName);
        setDeletedUserRole('Guest Player');
      } else {
        if (userToDelete.userDocId)
          await deleteDoc(doc(db, 'users', userToDelete.userDocId));
        if (userToDelete.authDocId)
          await deleteDoc(doc(db, 'authorizedUsers', userToDelete.authDocId));
        setDeletedUserEmail(userToDelete.email);
        setDeletedUserRole(
          userToDelete.role.charAt(0).toUpperCase() + userToDelete.role.slice(1)
        );
      }

      await fetchUsers();
      setShowSuccessDialog(true);
    } catch (error: any) {
      setMessage(`Failed to delete: ${error.message || 'Unknown error'}`);
      setTimeout(() => setMessage(''), 5000);
    } finally {
      setDeletingUserId(null);
      setUserToDelete(null);
    }
  };

  if (loading || loadingUsers) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-4 border-red-600/20 rounded-full" />
          <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const players        = users.filter(u => u.role === 'player');
  const guests         = users.filter(u => u.role === 'guest');
  const activePlayers  = players.filter(u => u.status === 'Active');
  const pendingPlayers = players.filter(u => u.status === 'Pending');

  const getRoleBadge = (r: string) => {
    const label = r.charAt(0).toUpperCase() + r.slice(1);
    return (
      <span className="px-2 py-0.5 text-[10px] font-black rounded-full border bg-gray-100 text-gray-600 border-gray-200">
        {label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ══ DELETE DIALOG ══════════════════════════════════════════════════════ */}
      {showDeleteDialog && userToDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slideUp px-5 pt-6 pb-5">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900 text-center">
              Delete {userToDelete.isGuest
                ? 'Guest'
                : userToDelete.role.charAt(0).toUpperCase() + userToDelete.role.slice(1)}?
            </h3>
            <p className="text-sm text-gray-500 text-center mt-1 font-semibold">
              {userToDelete.displayName}
            </p>

            <div className="mt-4 bg-gray-50 rounded-2xl p-3 border border-gray-100 space-y-1.5">
              {userToDelete.isGuest ? (
                <>
                  <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <span className="text-red-500 font-black flex-shrink-0">·</span>
                    Remove guest player from system
                  </p>
                  <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <span className="text-gray-400 font-black flex-shrink-0">·</span>
                    Linked parent accounts remain untouched
                  </p>
                  <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <span className="text-gray-400 font-black flex-shrink-0">·</span>
                    Payment history preserved
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <span className="text-red-500 font-black flex-shrink-0">·</span>
                    Delete user profile data
                  </p>
                  <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <span className="text-red-500 font-black flex-shrink-0">·</span>
                    Remove system access
                  </p>
                  <p className="text-[11px] text-gray-500 flex items-start gap-1.5">
                    <span className="text-gray-400 font-black flex-shrink-0">·</span>
                    Turf history preserved
                  </p>
                </>
              )}
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3 italic">
              This action cannot be undone
            </p>

            <div className="mt-4 space-y-2">
              <button onClick={confirmDelete}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                Yes, Delete {userToDelete.isGuest ? 'Guest' : 'User'}
              </button>
              <button onClick={closeDeleteDialog}
                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl transition-colors cursor-pointer text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SUCCESS DIALOG ═════════════════════════════════════════════════════ */}
      {showSuccessDialog && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 animate-fadeIn">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl animate-slideUp px-5 pt-6 pb-5 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-900">Deleted!</h3>
            <p className="text-sm font-bold text-gray-600 mt-1 break-words">{deletedUserEmail}</p>
            <p className="text-xs text-gray-400 mt-1">
              {deletedUserRole === 'Guest Player'
                ? 'Guest removed. Parent accounts unaffected.'
                : 'Access revoked. History preserved.'}
            </p>
            <button onClick={closeSuccessDialog}
              className="mt-5 w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
              Done
            </button>
          </div>
        </div>
      )}

      {/* ══ HEADER ═════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()}
            className="p-2.5 rounded-xl bg-gray-100 active:bg-gray-200 cursor-pointer flex-shrink-0">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="w-7 h-7 flex-shrink-0">
            <Image src="/logo.png" alt="Logo" width={28} height={28} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-gray-900 leading-tight">View Users</h1>
            <p className="text-xs text-gray-400">Manage players, guests &amp; staff</p>
          </div>
          <button onClick={() => router.push('/secretary/add-players')}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs flex-shrink-0">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        </div>
      </div>

      {/* ══ CONTENT ════════════════════════════════════════════════════════════ */}
      <div className="max-w-lg mx-auto px-3 py-4 pb-12 space-y-4">

        {message && (
          <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 animate-slideDown">
            <p className="text-xs font-semibold text-red-700">{message}</p>
          </div>
        )}

        {/* Stats dark card */}
        <div className="relative overflow-hidden bg-gray-900 rounded-2xl p-4 text-white">
          <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full border-[18px] border-red-600/20 pointer-events-none" />
          <div className="absolute right-2 -bottom-8 w-20 h-20 rounded-full border-[14px] border-red-600/10 pointer-events-none" />
          <div className="relative">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-1">
              Team Overview
            </p>
            <p className="text-3xl font-black text-white">
              {users.length}{' '}
              <span className="text-base font-semibold text-gray-400">total</span>
            </p>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {[
                { label: 'Players', value: String(players.length)        },
                { label: 'Guests',  value: String(guests.length)         },
                { label: 'Active',  value: String(activePlayers.length)  },
                { label: 'Pending', value: String(pendingPlayers.length) },
              ].map(({ label, value }) => (
                <div key={label}
                  className="bg-white/[0.07] rounded-xl px-2 py-2 border border-white/10 text-center">
                  <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                  <p className="text-xs font-black text-white mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* User list */}
        {users.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-10 text-center">
            <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-gray-900">No users added yet</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Start by adding player emails to the system
            </p>
            <button onClick={() => router.push('/secretary/add-players')}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl transition-colors cursor-pointer text-sm">
              Add Player
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">

                    {/* Avatar + info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                        <span className="text-sm font-black text-gray-500">
                          {u.displayName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-black text-gray-900 leading-tight">
                            {u.displayName}
                          </p>
                          {getRoleBadge(u.role)}
                          <span className={`px-2 py-0.5 text-[10px] font-black rounded-full border ${
                            u.status === 'Active'
                              ? 'bg-gray-100 text-gray-500 border-gray-200'
                              : 'bg-orange-50 text-orange-500 border-orange-200'
                          }`}>
                            {u.status === 'Active' ? 'Active' : 'Pending'}
                          </span>
                        </div>

                        {/* Email / parent info */}
                        {u.isGuest ? (
                          u.parentEmails && u.parentEmails.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {u.parentEmails.map((email, idx) => (
                                <span key={idx}
                                  className="text-[10px] text-gray-400 bg-gray-50 border border-gray-100 rounded-md px-1.5 py-0.5">
                                  {email}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-gray-400 mt-0.5">No linked parents</p>
                          )
                        ) : (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{u.email}</p>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => openDeleteDialog(u)}
                      disabled={deletingUserId === u.id}
                      className="flex-shrink-0 p-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer disabled:opacity-50 border border-red-100">
                      {deletingUserId === u.id ? (
                        <div className="w-4 h-4 border-2 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn    { from { opacity: 0 }                               to { opacity: 1 } }
        @keyframes slideUp   { from { opacity: 0; transform: translateY(20px) }  to { opacity: 1; transform: translateY(0) } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-8px) }  to { opacity: 1; transform: translateY(0) } }
        .animate-fadeIn    { animation: fadeIn    0.2s  ease-out; }
        .animate-slideUp   { animation: slideUp   0.25s ease-out; }
        .animate-slideDown { animation: slideDown 0.2s  ease-out; }
      `}</style>
    </div>
  );
}