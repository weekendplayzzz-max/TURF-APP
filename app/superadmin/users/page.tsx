'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export default function ViewUsers() {
  const { role, loading, user } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => {
    if (!loading && role !== 'superadmin') router.push('/login');
  }, [role, loading, router]);

  useEffect(() => {
    if (role === 'superadmin') fetchUsers();
  }, [role]);

  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersList: User[] = [];
      snapshot.forEach((doc) => {
        usersList.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersList);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  if (loading || !user || role !== 'superadmin') return null;

  const stats = {
    superadmins: users.filter((u) => u.role === 'superadmin').length,
    treasurers: users.filter((u) => u.role === 'treasurer').length,
    secretaries: users.filter((u) => u.role === 'secretary').length,
    players: users.filter((u) => u.role === 'player').length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-green-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">👥 All Users</h1>
              <p className="text-green-100 text-sm mt-1">Total: {users.length} users registered</p>
            </div>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-white text-green-600 font-semibold rounded-lg hover:bg-gray-100 transition"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-red-600">
            <p className="text-gray-600 text-sm font-semibold">SuperAdmins</p>
            <p className="text-4xl font-bold text-red-600 mt-2">{stats.superadmins}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-orange-600">
            <p className="text-gray-600 text-sm font-semibold">Treasurers</p>
            <p className="text-4xl font-bold text-orange-600 mt-2">{stats.treasurers}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-purple-600">
            <p className="text-gray-600 text-sm font-semibold">Secretaries</p>
            <p className="text-4xl font-bold text-purple-600 mt-2">{stats.secretaries}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-green-600">
            <p className="text-gray-600 text-sm font-semibold">Players</p>
            <p className="text-4xl font-bold text-green-600 mt-2">{stats.players}</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h2 className="text-2xl font-bold text-gray-900">All Registered Users</h2>
            <p className="text-gray-600 text-sm mt-1">Showing {users.length} total users</p>
          </div>

          {loadingUsers ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-600 border-t-transparent mx-auto mb-4"></div>
              <p className="text-gray-600 font-semibold">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600 text-lg">No users found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b border-gray-300">
                  <tr>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Name</th>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Email</th>
                    <th className="px-6 py-4 text-left font-bold text-gray-900">Role</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => (
                    <tr
                      key={u.id}
                      className={`border-b border-gray-200 hover:bg-blue-50 transition ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <td className="px-6 py-4 font-semibold text-gray-900">{u.displayName}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">{u.email}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 text-xs font-bold rounded-full ${
                            u.role === 'superadmin'
                              ? 'bg-red-100 text-red-800'
                              : u.role === 'treasurer'
                              ? 'bg-orange-100 text-orange-800'
                              : u.role === 'secretary'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
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
