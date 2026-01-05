'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import Link from 'next/link';

interface UserData {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export default function SuperAdminDashboard() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    totalUsers: 0,
    treasurer: null as UserData | null,
    secretary: null as UserData | null,
    playersCount: 0,
  });
  const [pageLoading, setPageLoading] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user || role !== 'superadmin') {
      router.push('/login');
      return;
    }

    fetchStats();
  }, [loading, user?.uid, role, router]);

  const fetchStats = async () => {
    try {
      setPageLoading(true);
      const usersRef = collection(db, 'users');

      const allUsers = await getDocs(usersRef);
      const totalUsers = allUsers.size;

      const treasurerQ = query(usersRef, where('role', '==', 'treasurer'));
      const treasurerSnap = await getDocs(treasurerQ);
      const treasurer = treasurerSnap.empty
        ? null
        : ({
            id: treasurerSnap.docs[0].id,
            ...treasurerSnap.docs[0].data(),
          } as UserData);

      const secretaryQ = query(usersRef, where('role', '==', 'secretary'));
      const secretarySnap = await getDocs(secretaryQ);
      const secretary = secretarySnap.empty
        ? null
        : ({
            id: secretarySnap.docs[0].id,
            ...secretarySnap.docs[0].data(),
          } as UserData);

      const playersQ = query(usersRef, where('role', '==', 'player'));
      const playersSnap = await getDocs(playersQ);
      const playersCount = playersSnap.size;

      setStats({ totalUsers, treasurer, secretary, playersCount });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setPageLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { signOut } = await import('firebase/auth');
      const { auth } = await import('@/lib/firebase');
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-blue-900 text-lg font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || role !== 'superadmin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold mb-2">🎯 SuperAdmin Dashboard</h1>
              <p className="text-blue-100">Welcome, <span className="font-semibold">{user.displayName || user.email}</span></p>
            </div>
            <button
              onClick={handleLogout}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow-md transition-all duration-200 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {pageLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
            <p className="text-gray-600 text-lg">Loading dashboard data...</p>
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
              {/* Total Users */}
              <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-t-4 border-blue-600">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-600 text-sm font-semibold">Total Users</p>
                  <div className="text-2xl">👥</div>
                </div>
                <p className="text-4xl font-bold text-gray-900">{stats.totalUsers}</p>
                <p className="text-xs text-gray-500 mt-2">All registered users</p>
              </div>

              {/* Players */}
              <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-t-4 border-green-600">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-600 text-sm font-semibold">Players</p>
                  <div className="text-2xl">⚽</div>
                </div>
                <p className="text-4xl font-bold text-gray-900">{stats.playersCount}</p>
                <p className="text-xs text-gray-500 mt-2">Active players</p>
              </div>

              {/* Treasurer */}
              <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-t-4 border-orange-600">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-600 text-sm font-semibold">Treasurer</p>
                  <div className="text-2xl">💰</div>
                </div>
                <p className="text-lg font-bold text-gray-900 truncate">
                  {stats.treasurer ? stats.treasurer.displayName : 'Not Assigned'}
                </p>
                {stats.treasurer && (
                  <p className="text-xs text-gray-500 mt-2 truncate">{stats.treasurer.email}</p>
                )}
                {!stats.treasurer && (
                  <p className="text-xs text-orange-600 mt-2">Assign a treasurer</p>
                )}
              </div>

              {/* Secretary */}
              <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-6 border-t-4 border-purple-600">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-600 text-sm font-semibold">Secretary</p>
                  <div className="text-2xl">📋</div>
                </div>
                <p className="text-lg font-bold text-gray-900 truncate">
                  {stats.secretary ? stats.secretary.displayName : 'Not Assigned'}
                </p>
                {stats.secretary && (
                  <p className="text-xs text-gray-500 mt-2 truncate">{stats.secretary.email}</p>
                )}
                {!stats.secretary && (
                  <p className="text-xs text-purple-600 mt-2">Assign a secretary</p>
                )}
              </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Manage Roles Card */}
              <Link href="/superadmin/add-secretary">
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 p-6 cursor-pointer transform hover:scale-105">
      <div className="flex items-start justify-between mb-4">
        <div className="text-4xl">📋</div>
        <span className="bg-purple-100 text-purple-800 text-xs font-semibold px-2 py-1 rounded-full">
          Add
        </span>
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">Add Secretary</h3>
      <p className="text-gray-600 text-sm mb-4">Authorize a new Secretary</p>
      <div className="flex items-center text-purple-600 font-semibold text-sm">
        Add now
        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  </Link>

  <Link href="/superadmin/add-treasurer">
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 p-6 cursor-pointer transform hover:scale-105">
      <div className="flex items-start justify-between mb-4">
        <div className="text-4xl">💰</div>
        <span className="bg-orange-100 text-orange-800 text-xs font-semibold px-2 py-1 rounded-full">
          Add
        </span>
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">Add Treasurer</h3>
      <p className="text-gray-600 text-sm mb-4">Authorize a new Treasurer</p>
      <div className="flex items-center text-orange-600 font-semibold text-sm">
        Add now
        <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  </Link>
              <Link href="/superadmin/manage-roles">
                <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 p-8 cursor-pointer transform hover:scale-105">
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-5xl">👔</div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full">
                      Management
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Manage Roles</h3>
                  <p className="text-gray-600 mb-4">Assign and manage Treasurer and Secretary roles</p>
                  <div className="flex items-center text-blue-600 font-semibold">
                    Go to page
                    <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>

              {/* View All Users Card */}
              <Link href="/superadmin/users">
                <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 p-8 cursor-pointer transform hover:scale-105">
                  <div className="flex items-start justify-between mb-4">
                    <div className="text-5xl">📊</div>
                    <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-full">
                      View All
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">View All Users</h3>
                  <p className="text-gray-600 mb-4">See all registered users and their assigned roles</p>
                  <div className="flex items-center text-green-600 font-semibold">
                    Go to page
                    <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
