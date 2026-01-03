'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';

export default function SecretaryDashboard() {
  const { role, loading, user } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState({
    totalPlayers: 0,
    appointedPlayers: 0,
    availableUsers: 0,
  });

  const [pageLoading, setPageLoading] = useState(true);

  /* 🔐 Role protection */
  useEffect(() => {
    if (loading) return;
    if (!user || role !== 'secretary') {
      router.push('/login');
    }
  }, [loading, user, role, router]);

  /* 📊 Fetch all dashboard stats */
  const fetchStats = useCallback(async () => {
    try {
      setPageLoading(true);

      /** Users collection */
      const usersRef = collection(db, 'users');

      // Total players
      const playersQuery = query(usersRef, where('role', '==', 'player'));
      const playersSnap = await getDocs(playersQuery);

      // Available users (exclude secretary & superadmin)
      const allUsersSnap = await getDocs(usersRef);
      const availableUsers = allUsersSnap.docs.filter(
        (doc) =>
          !['secretary', 'superadmin'].includes(doc.data().role)
      ).length;

      /** Appointed players collection */
      const appointedRef = collection(db, 'appointedPlayers');
      const appointedSnap = await getDocs(appointedRef);

      setStats({
        totalPlayers: playersSnap.size,
        appointedPlayers: appointedSnap.size,
        availableUsers,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'secretary') {
      fetchStats();
    }
  }, [role, fetchStats]);

  /* 🚪 Logout */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading || !user || role !== 'secretary') return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-8 flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold mb-2">📋 Secretary Dashboard</h1>
            <p className="text-purple-100">
              Welcome,{' '}
              <span className="font-semibold">
                {user.displayName || user.email}
              </span>
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-6 py-3 bg-white text-purple-700 font-bold rounded-lg hover:bg-purple-100 transition shadow-md"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {pageLoading ? (
          <div className="flex justify-center py-24">
            <div className="animate-spin h-16 w-16 border-4 border-purple-600 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <StatCard
                title="Total Players"
                value={stats.totalPlayers}
                color="purple"
              />
              <StatCard
                title="Appointed Players"
                value={stats.appointedPlayers}
                color="indigo"
              />
              <StatCard
                title="Available Users"
                value={stats.availableUsers}
                color="blue"
              />
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-lg p-8 border">
              <h2 className="text-2xl font-bold mb-6">⚡ Quick Actions</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <ActionButton
                  label="Create Event"
                  icon="🏆"
                  path="/secretary/create-event"
                  color="green"
                />
                <ActionButton
                  label="Manage Events"
                  icon="📊"
                  path="/secretary/manage-events"
                  color="blue"
                />
                <ActionButton
                  label="Appoint Players"
                  icon="👥"
                  path="/secretary/appoint-players"
                  color="purple"
                />
                <ActionButton
                  label="View Players"
                  icon="📋"
                  path="/secretary/view-players"
                  color="indigo"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Reusable Components ---------- */

function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: string;
}) {
  return (
    <div className={`bg-white border-t-4 border-${color}-600 shadow rounded-xl p-6`}>
      <p className="text-sm font-semibold text-gray-600">{title}</p>
      <p className="text-4xl font-black text-gray-900 mt-2">{value}</p>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  path,
  color,
}: {
  label: string;
  icon: string;
  path: string;
  color: string;
}) {
  return (
    <Link href={path}>
      <div
        className={`cursor-pointer p-6 rounded-xl bg-gradient-to-r from-${color}-600 to-${color}-700 text-white text-center font-bold shadow-md hover:shadow-xl hover:scale-105 transition`}
      >
        <div className="text-4xl mb-3">{icon}</div>
        {label}
      </div>
    </Link>
  );
}
