'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export default function ManageRoles() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!loading && role !== 'superadmin') {
      router.push('/login');
    }
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'superadmin') {
      fetchAllUsers();
    }
  }, [role]);

  const fetchAllUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersList: User[] = [];
      snapshot.forEach((doc) => {
        usersList.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersList.sort((a) => (a.role === 'superadmin' ? -1 : 1)));
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      setUpdating(userId);

      // Remove role from previous holder
      if (newRole === 'treasurer' || newRole === 'secretary') {
        const query_result = query(collection(db, 'users'), where('role', '==', newRole));
        const snap = await getDocs(query_result);
        if (!snap.empty) {
          await updateDoc(doc(db, 'users', snap.docs[0].id), { role: 'player' });
        }
      }

      // Update new role
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
        appointedBy: user?.uid || null,
      });

      setMessage(`✅ Role updated to ${newRole}`);
      setTimeout(() => {
        fetchAllUsers();
        setMessage('');
      }, 1500);
    } catch (error) {
      console.error('Error:', error);
      setMessage('❌ Failed to update role');
    } finally {
      setUpdating(null);
    }
  };

  if (loading) return null;
  if (!user || role !== 'superadmin') return null;

  const treasurer = users.find((u) => u.role === 'treasurer');
  const secretary = users.find((u) => u.role === 'secretary');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">👔 Manage Roles</h1>
              <p className="text-blue-100 text-sm mt-1">Assign Treasurer & Secretary</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Message */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg text-center font-semibold ${
            message.includes('✅')
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}>
            {message}
          </div>
        )}

        {/* Current Assignments */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-orange-500">
            <h3 className="font-bold text-gray-900 text-lg mb-3">💰 Treasurer</h3>
            <div className="bg-orange-50 p-4 rounded">
              <p className="font-semibold text-gray-900">{treasurer?.displayName || 'Not Assigned'}</p>
              {treasurer && <p className="text-xs text-gray-600 mt-1">{treasurer.email}</p>}
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-purple-500">
            <h3 className="font-bold text-gray-900 text-lg mb-3">📋 Secretary</h3>
            <div className="bg-purple-50 p-4 rounded">
              <p className="font-semibold text-gray-900">{secretary?.displayName || 'Not Assigned'}</p>
              {secretary && <p className="text-xs text-gray-600 mt-1">{secretary.email}</p>}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h2 className="text-xl font-bold text-gray-900">👥 All Users ({users.length})</h2>
          </div>

          {loadingUsers ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-600">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Name</th>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Email</th>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Current Role</th>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => (
                    <tr key={u.id} className={`border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-gray-100 transition`}>
                      <td className="px-6 py-4 font-semibold text-gray-900">{u.displayName}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">{u.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                          u.role === 'superadmin'
                            ? 'bg-red-100 text-red-800'
                            : u.role === 'treasurer'
                            ? 'bg-orange-100 text-orange-800'
                            : u.role === 'secretary'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {u.role !== 'superadmin' ? (
                          <div className="flex gap-2 flex-wrap">
                            <button
                              onClick={() => updateUserRole(u.id, 'treasurer')}
                              disabled={updating === u.id || u.role === 'treasurer'}
                              className="px-3 py-1 text-sm font-semibold bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {updating === u.id ? '⏳' : '💰'}
                            </button>
                            <button
                              onClick={() => updateUserRole(u.id, 'secretary')}
                              disabled={updating === u.id || u.role === 'secretary'}
                              className="px-3 py-1 text-sm font-semibold bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {updating === u.id ? '⏳' : '📋'}
                            </button>
                            <button
                              onClick={() => updateUserRole(u.id, 'player')}
                              disabled={updating === u.id || u.role === 'player'}
                              className="px-3 py-1 text-sm font-semibold bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {updating === u.id ? '⏳' : '⚽'}
                            </button>
                          </div>
                        ) : (
                          <span className="px-3 py-1 text-xs font-bold bg-red-100 text-red-800 rounded">SuperAdmin</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
